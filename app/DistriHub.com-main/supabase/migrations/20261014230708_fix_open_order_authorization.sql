BEGIN;
CREATE SCHEMA partner_open_orders_private;
REVOKE ALL ON SCHEMA partner_open_orders_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA partner_open_orders_private TO authenticated;
CREATE FUNCTION partner_open_orders_private.mutate_order(
 p_sale_id uuid,p_branch_id uuid,p_action text,p_salesperson_id uuid DEFAULT NULL,p_pin text DEFAULT NULL,
 p_supervisor_id uuid DEFAULT NULL,p_supervisor_pin text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op record; supervisor public.partner_salespeople%ROWTYPE; sale public.partner_sales%ROWTYPE; authorizer uuid;
BEGIN
 PERFORM partner_subscription_private.require_actor('pedidos');
 PERFORM partner_subscription_private.require_operator_module('pedidos',p_salesperson_id);
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
 SELECT * INTO op FROM public.resolve_partner_pdv_operator(p_salesperson_id,p_pin,p_branch_id);
 IF op.role NOT IN ('administrador','gerente','caixa','vendedor') OR op.role IS NULL THEN RAISE EXCEPTION 'Operador sem permissão para pedidos'; END IF;
 IF p_action NOT IN ('cancel','delete') OR p_action IS NULL THEN RAISE EXCEPTION 'Ação inválida'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.partner_branches WHERE id=p_branch_id AND user_id=op.company_id) THEN RAISE EXCEPTION 'Filial inválida'; END IF;
 IF p_supervisor_id IS NULL THEN
  IF op.role NOT IN ('administrador','gerente') THEN RAISE EXCEPTION 'Esta operação exige autorização de gerente ou proprietário'; END IF;
  authorizer:=COALESCE(op.salesperson_id,op.company_id);
 ELSE
  PERFORM partner_subscription_private.require_operator_module('pedidos',p_supervisor_id);
  SELECT * INTO supervisor FROM public.partner_salespeople
  WHERE id=p_supervisor_id AND user_id=op.company_id AND active=true AND role IN ('administrador','gerente')
   AND (role='administrador' OR branch_id=p_branch_id) AND public.verify_partner_salesperson_pin(p_supervisor_pin,pin_hash);
  IF NOT FOUND THEN RAISE EXCEPTION 'Responsável inválido ou PIN incorreto'; END IF;
  authorizer:=supervisor.id;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_sale_id::text,0));
 SELECT * INTO sale FROM public.partner_sales WHERE id=p_sale_id AND user_id=op.company_id AND branch_id=p_branch_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado nesta empresa e filial. Atualize a lista.'; END IF;
 IF sale.status='cancelada' AND p_action='cancel' THEN RETURN sale.id; END IF;
 IF sale.status NOT IN ('aberta','pre_venda') OR sale.status IS NULL THEN RAISE EXCEPTION 'Somente pedidos em aberto podem usar esta operação'; END IF;
 IF sale.payment_status IS DISTINCT FROM 'pendente' OR COALESCE(sale.online_payment,false)
  OR EXISTS(SELECT 1 FROM public.partner_invoices WHERE sale_id=sale.id)
  OR EXISTS(SELECT 1 FROM public.partner_cash_movements WHERE sale_id=sale.id) THEN
  RAISE EXCEPTION 'Pedido com pagamento ou lançamento financeiro exige o fluxo de estorno';
 END IF;
 IF p_action='delete' THEN
  IF sale.status IS DISTINCT FROM 'pre_venda' THEN RAISE EXCEPTION 'Somente pré-vendas podem ser apagadas. Cancele o pedido para preservar seu histórico.'; END IF;
  DELETE FROM public.partner_sales WHERE id=sale.id AND user_id=op.company_id;
 ELSE
  UPDATE public.partner_sales SET status='cancelada',payment_status='cancelado' WHERE id=sale.id AND user_id=op.company_id;
 END IF;
 INSERT INTO public.partner_audit_logs(id,user_id,actor_name,actor_role,action,entity_type,entity_id,details)
 VALUES(gen_random_uuid()::text,op.company_id,COALESCE((SELECT name FROM public.partner_salespeople WHERE id=op.salesperson_id),'Proprietário'),op.role,
  CASE WHEN p_action='delete' THEN 'exclusao_pedido_aberto' ELSE 'cancelamento_pedido_aberto' END,'partner_sale',sale.id::text,
  'Operador: '||COALESCE(op.salesperson_id,op.company_id)::text||'; autorizado por: '||authorizer::text||'; filial: '||p_branch_id::text);
 RETURN sale.id;
END $$;
REVOKE ALL ON FUNCTION partner_open_orders_private.mutate_order(uuid,uuid,text,uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION partner_open_orders_private.mutate_order(uuid,uuid,text,uuid,text,uuid,text) TO authenticated;
CREATE FUNCTION public.mutate_partner_open_order(
 p_sale_id uuid,p_branch_id uuid,p_action text,p_salesperson_id uuid DEFAULT NULL,p_pin text DEFAULT NULL,
 p_supervisor_id uuid DEFAULT NULL,p_supervisor_pin text DEFAULT NULL
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT partner_open_orders_private.mutate_order(p_sale_id,p_branch_id,p_action,p_salesperson_id,p_pin,p_supervisor_id,p_supervisor_pin)
$$;
REVOKE ALL ON FUNCTION public.mutate_partner_open_order(uuid,uuid,text,uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mutate_partner_open_order(uuid,uuid,text,uuid,text,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
