BEGIN;
CREATE SCHEMA partner_history_private;
REVOKE ALL ON SCHEMA partner_history_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA partner_history_private TO authenticated;

-- Persist the business event independently of stock (services have no stock exit).
ALTER TABLE public.partner_sales ADD COLUMN completed_at timestamptz;
UPDATE public.partner_sales s SET completed_at=coalesce(
 (SELECT min(m.created_at) FROM public.stock_movements m WHERE m.user_id=s.user_id
  AND m.branch_id IS NOT DISTINCT FROM s.branch_id AND m.type='saida' AND m.quantity>0
  AND m.reason IN ('Saida por venda '||s.id::text,'Saída por venda '||s.id::text)),
 (SELECT min(m.created_at) FROM public.partner_cash_movements m JOIN public.partner_cash_sessions c ON c.id=m.session_id
  WHERE m.sale_id=s.id AND m.kind='venda' AND c.user_id=s.user_id AND c.branch_id IS NOT DISTINCT FROM s.branch_id))
WHERE s.status IN ('concluida','cancelada','devolucao');

CREATE FUNCTION partner_history_private.stamp_completion() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.completed_at:=CASE WHEN NEW.status='concluida' THEN statement_timestamp() ELSE NULL END;
 ELSIF NEW.status='concluida' AND OLD.status IN ('pre_venda','aberta') THEN
  NEW.completed_at:=statement_timestamp();
 ELSE
  NEW.completed_at:=OLD.completed_at;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION partner_history_private.stamp_completion() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER partner_sale_completion BEFORE INSERT OR UPDATE ON public.partner_sales
FOR EACH ROW EXECUTE FUNCTION partner_history_private.stamp_completion();

-- Keep the current search, pagination, subscription and branch authorization.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.read_partner_sales_history(uuid,uuid,date,date,text,text,integer)'::regprocedure) INTO definition;
 IF position('s.*,completion.completed_at,' IN definition)=0 OR position('coalesce(completion.completed_at,s.created_at)' IN definition)=0 THEN
  RAISE EXCEPTION 'History query changed; review completion integration';
 END IF;
 definition:=replace(definition,'s.*,completion.completed_at,','s.*,');
 definition:=replace(definition,'coalesce(completion.completed_at,s.created_at)','coalesce(s.completed_at,completion.completed_at,s.created_at)');
 EXECUTE definition;
END $migration$;

-- Authentication identifies the executor; the PIN approves only this cancellation.
CREATE FUNCTION partner_history_private.resolve_cancel_operator(
 p_salesperson_id uuid,p_pin text,p_branch_id uuid,p_supervisor_id uuid,p_supervisor_pin text
) RETURNS TABLE(company_id uuid,salesperson_id uuid,role text,branch_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op record; supervisor public.partner_salespeople%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
 PERFORM partner_subscription_private.require_actor('pdv');
 PERFORM partner_subscription_private.require_operator_module('pdv',p_salesperson_id);
 SELECT * INTO op FROM public.resolve_partner_pdv_operator(p_salesperson_id,p_pin,p_branch_id);
 IF op.role IS NULL OR op.role NOT IN ('administrador','gerente','caixa','vendedor') THEN RAISE EXCEPTION 'Operador sem permissão'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.partner_branches b WHERE b.id=p_branch_id AND b.user_id=op.company_id) THEN RAISE EXCEPTION 'Filial inválida'; END IF;
 IF p_supervisor_id IS NULL THEN
  IF op.role NOT IN ('administrador','gerente') THEN RAISE EXCEPTION 'Cancelamento exige autorização de gerente ou proprietário'; END IF;
 ELSE
  PERFORM partner_subscription_private.require_operator_module('pdv',p_supervisor_id);
  SELECT * INTO supervisor FROM public.partner_salespeople s
  WHERE s.id=p_supervisor_id AND s.user_id=op.company_id AND s.active=true
   AND s.role IN ('administrador','gerente') AND (s.role='administrador' OR s.branch_id=p_branch_id)
   AND public.verify_partner_salesperson_pin(p_supervisor_pin,s.pin_hash);
  IF NOT FOUND THEN RAISE EXCEPTION 'Responsável inválido ou PIN incorreto'; END IF;
 END IF;
 RETURN QUERY SELECT op.company_id,op.salesperson_id,
  CASE WHEN p_supervisor_id IS NULL THEN op.role ELSE 'gerente' END,p_branch_id;
END $$;
REVOKE ALL ON FUNCTION partner_history_private.resolve_cancel_operator(uuid,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;

-- Reuse the authoritative reversal of stock and invoices. This copy is private,
-- cancellation-only, and validates the executor and supervisor on every call.
DO $migration$
DECLARE fn record; definition text; needle text:='public.resolve_partner_pdv_operator(p_salesperson_id,p_pin,p_branch_id)';
BEGIN
 SELECT p.oid,pg_get_function_arguments(p.oid) args,pg_get_function_identity_arguments(p.oid) identity_args
 INTO STRICT fn FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='partner_cash_private' AND p.proname='execute_partner_sale_mutation';
 definition:=pg_get_functiondef(fn.oid);
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Sale reversal changed; review cancellation authorization'; END IF;
 definition:=replace(definition,'partner_cash_private.execute_partner_sale_mutation(', 'partner_history_private.execute_cancel(');
 definition:=replace(definition,'('||fn.args||')','(p_supervisor_id uuid, p_supervisor_pin text, '||fn.args||')');
 definition:=replace(definition,needle,'partner_history_private.resolve_cancel_operator(p_salesperson_id,p_pin,p_branch_id,p_supervisor_id,p_supervisor_pin)');
 definition:=replace(definition,E'BEGIN\n',E'BEGIN\n IF p_status IS DISTINCT FROM ''cancelada'' THEN RAISE EXCEPTION ''Esta função permite somente cancelamento''; END IF;\n');
 EXECUTE definition;
 EXECUTE 'REVOKE ALL ON FUNCTION partner_history_private.execute_cancel(uuid,text,'||fn.identity_args||') FROM PUBLIC,anon,authenticated';
END $migration$;

CREATE FUNCTION partner_history_private.cancel_sale(p_sale_id uuid,p_branch_id uuid,
 p_salesperson_id uuid DEFAULT NULL,p_pin text DEFAULT NULL,p_supervisor_id uuid DEFAULT NULL,p_supervisor_pin text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op record; sale public.partner_sales%ROWTYPE; result uuid;
BEGIN
 SELECT * INTO op FROM partner_history_private.resolve_cancel_operator(p_salesperson_id,p_pin,p_branch_id,p_supervisor_id,p_supervisor_pin);
 PERFORM pg_advisory_xact_lock(hashtextextended(op.company_id::text||p_branch_id::text||coalesce(op.salesperson_id,op.company_id)::text,1));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_sale_id::text,0));
 SELECT * INTO sale FROM public.partner_sales WHERE id=p_sale_id AND user_id=op.company_id AND branch_id=p_branch_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada nesta empresa e filial. Atualize o Histórico.'; END IF;
 IF sale.status='cancelada' THEN RETURN sale.id; END IF;
 IF sale.status NOT IN ('concluida','aberta') OR sale.status IS NULL THEN RAISE EXCEPTION 'Status não permite cancelamento pelo Histórico'; END IF;
 IF EXISTS(SELECT 1 FROM public.rma_requests_v2 r WHERE r.sale_id=sale.id AND r.user_id=op.company_id AND r.sale_item_index>=0
  AND r.sale_item_index<jsonb_array_length(coalesce(sale.items,'[]'::jsonb)) AND coalesce(r.quantity,1)>0) THEN
  RAISE EXCEPTION 'Venda com devolução exige o fluxo de estorno; preserve o histórico';
 END IF;
 -- Same lock order as checkout: sale advisory, original cash session, sale row/stock.
 PERFORM 1 FROM public.partner_cash_sessions c JOIN public.partner_cash_movements m ON m.session_id=c.id
 WHERE m.sale_id=sale.id AND m.kind='venda' ORDER BY c.id FOR UPDATE OF c;
 IF sale.status='aberta' THEN
  IF sale.payment_status IS DISTINCT FROM 'pendente' OR coalesce(sale.online_payment,false)
   OR EXISTS(SELECT 1 FROM public.partner_invoices WHERE sale_id=sale.id)
   OR EXISTS(SELECT 1 FROM public.partner_cash_movements WHERE sale_id=sale.id) THEN
   RAISE EXCEPTION 'Pedido com lançamento financeiro exige o fluxo de estorno';
  END IF;
  UPDATE public.partner_sales SET status='cancelada',payment_status='cancelado' WHERE id=sale.id;
  result:=sale.id;
 ELSE
  result:=partner_history_private.execute_cancel(p_supervisor_id,p_supervisor_pin,p_salesperson_id,p_pin,sale.id,
   sale.customer_id,sale.customer_name,sale.items,sale.total,sale.imei,sale.serial_number,sale.payment_method,
   sale.branch_id,'cancelada',sale.origin,sale.customer_type,sale.delivery_type,sale.salesperson_id,sale.freight_fee,sale.payment_splits);
 END IF;
 INSERT INTO public.partner_audit_logs(id,user_id,actor_name,actor_role,action,entity_type,entity_id,details)
 VALUES(gen_random_uuid()::text,op.company_id,coalesce(p_salesperson_id,op.salesperson_id,op.company_id)::text,
  (SELECT r.role FROM public.resolve_partner_pdv_operator(p_salesperson_id,p_pin,p_branch_id) r),
  'cancelamento_historico_autorizado','partner_sale',sale.id::text,
  'Executado por: '||coalesce(op.salesperson_id,op.company_id)::text||'; autorizado por: '||coalesce(p_supervisor_id,op.salesperson_id,op.company_id)::text||'; filial: '||p_branch_id::text);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION partner_history_private.cancel_sale(uuid,uuid,uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION partner_history_private.cancel_sale(uuid,uuid,uuid,text,uuid,text) TO authenticated;
CREATE FUNCTION public.cancel_partner_history_sale(p_sale_id uuid,p_branch_id uuid,
 p_salesperson_id uuid DEFAULT NULL,p_pin text DEFAULT NULL,p_supervisor_id uuid DEFAULT NULL,p_supervisor_pin text DEFAULT NULL)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT partner_history_private.cancel_sale(p_sale_id,p_branch_id,p_salesperson_id,p_pin,p_supervisor_id,p_supervisor_pin)
$$;
REVOKE ALL ON FUNCTION public.cancel_partner_history_sale(uuid,uuid,uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_partner_history_sale(uuid,uuid,uuid,text,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
