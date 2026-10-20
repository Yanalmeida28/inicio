BEGIN;
SET LOCAL lock_timeout = '3s';
ALTER TABLE public.partner_rma_credit_applications
 ALTER COLUMN invoice_id DROP NOT NULL,
 ADD COLUMN sale_id uuid REFERENCES public.partner_sales(id) DEFERRABLE INITIALLY DEFERRED,
 ADD CONSTRAINT rma_credit_one_destination CHECK ((invoice_id IS NULL) <> (sale_id IS NULL));
CREATE UNIQUE INDEX rma_credit_checkout_once ON public.partner_rma_credit_applications(sale_id) WHERE sale_id IS NOT NULL;
ALTER TABLE public.partner_cash_movements DROP CONSTRAINT partner_cash_movements_payment_method_check;
ALTER TABLE public.partner_cash_movements ADD CONSTRAINT partner_cash_movements_payment_method_check
 CHECK (payment_method IN ('dinheiro','pix','cartao','faturado','credito_rma'));

-- Keep the existing stock, pricing, operator, subscription, cash and retry checks.
-- Only a credit reserved by the new authenticated transaction may enter a sale.
DO $migration$
DECLARE definition text; original text;
BEGIN
 SELECT pg_get_functiondef('partner_cash_private.execute_partner_sale_mutation(uuid,text,uuid,uuid,text,jsonb,numeric,text,text,text,uuid,text,text,text,text,uuid,numeric,jsonb)'::regprocedure) INTO definition;
 original:=definition;
 IF position('IF jsonb_array_length(v_payments)<2 OR jsonb_array_length(v_payments)>3' IN definition)=0
  OR position('  v_commercial_id :=' IN definition)=0 THEN RAISE EXCEPTION 'Sale implementation changed before checkout credit migration'; END IF;
 definition:=replace(definition,'IF jsonb_array_length(v_payments)<2 OR jsonb_array_length(v_payments)>3',
  $replace$IF (jsonb_array_length(v_payments)<2 AND NOT (jsonb_array_length(v_payments)=1 AND v_payments->0->>'method'='credito_rma')) OR jsonb_array_length(v_payments)>4$replace$);
 definition:=replace(definition,$match$NOT IN ('dinheiro','pix','cartao')$match$,$replace$NOT IN ('dinheiro','pix','cartao','credito_rma')$replace$);
 definition:=replace(definition,'  v_commercial_id :=',$guard$
  IF p_status='cancelada' AND EXISTS(SELECT 1 FROM public.partner_rma_credit_applications WHERE sale_id=v_target_id) THEN
   RAISE EXCEPTION 'Venda com credito RMA deve preservar o historico; registre uma devolucao';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_payments) part WHERE part->>'method'='credito_rma') THEN
   IF p_status<>'concluida' OR p_customer_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.partner_rma_credit_applications a
    WHERE a.sale_id=v_target_id AND a.user_id=v_company_id AND a.branch_id=p_branch_id AND a.customer_id=p_customer_id
     AND a.amount=(SELECT sum((part->>'amount')::numeric) FROM jsonb_array_elements(v_payments) part WHERE part->>'method'='credito_rma')
   ) THEN RAISE EXCEPTION 'Credito RMA exige saldo reservado para esta venda e cliente'; END IF;
  ELSIF p_status<>'cancelada' AND EXISTS(SELECT 1 FROM public.partner_rma_credit_applications WHERE sale_id=v_target_id) THEN
   RAISE EXCEPTION 'Venda diverge do credito RMA reservado';
  END IF;
  v_commercial_id :=$guard$);
 IF original=definition THEN RAISE EXCEPTION 'Checkout credit guard not installed'; END IF;
 EXECUTE definition;
END $migration$;

-- Credit is tracked separately from cash, PIX, card and accounts receivable.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('partner_cash_private.totals(uuid)'::regprocedure) INTO definition;
 IF position('jsonb_build_object(' IN definition)=0 THEN RAISE EXCEPTION 'Cash totals implementation changed'; END IF;
 definition:=replace(definition,'jsonb_build_object(', $totals$jsonb_build_object(
 'credito_rma',COALESCE(sum(CASE WHEN payment_method='credito_rma' THEN amount * CASE WHEN kind IN ('estorno','devolucao') THEN -1 ELSE 1 END ELSE 0 END),0),$totals$);
 EXECUTE definition;
END $migration$;

CREATE SCHEMA partner_checkout_credit_private;
REVOKE ALL ON SCHEMA partner_checkout_credit_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA partner_checkout_credit_private TO authenticated;
CREATE FUNCTION partner_checkout_credit_private.execute_sale(p_sale jsonb,p_rma_id uuid,p_operator_id uuid,p_pin text,p_cash_session_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op record; r public.rma_requests_v2%ROWTYPE; a public.partner_rma_credit_applications%ROWTYPE;
 v_sale_id uuid:=(p_sale->>'id')::uuid; v_branch_id uuid:=(p_sale->>'branch_id')::uuid; v_customer_id uuid:=(p_sale->>'customer_id')::uuid;
 v_amount numeric; used numeric; result uuid; v_cash_actor uuid;
BEGIN
 PERFORM partner_subscription_private.require_actor('pdv');
 PERFORM partner_subscription_private.require_operator_module('pdv',p_operator_id);
 SELECT * INTO op FROM public.resolve_partner_pdv_operator(p_operator_id,p_pin,v_branch_id);
 IF op.company_id IS NULL OR op.role NOT IN ('administrador','gerente','caixa','vendedor') THEN RAISE EXCEPTION 'Sem permissao para usar credito no PDV'; END IF;
 IF v_sale_id IS NULL OR v_branch_id IS NULL OR v_customer_id IS NULL OR p_rma_id IS NULL
  OR p_sale->>'status' IS DISTINCT FROM 'concluida' OR p_sale->>'origin' IS DISTINCT FROM 'pdv'
  OR p_sale->>'payment_method' IS DISTINCT FROM 'misto' THEN RAISE EXCEPTION 'Dados da venda com credito invalidos'; END IF;
 IF jsonb_typeof(p_sale->'payment_splits') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Pagamentos invalidos'; END IF;
 SELECT sum((part->>'amount')::numeric) INTO v_amount FROM jsonb_array_elements(p_sale->'payment_splits') part WHERE part->>'method'='credito_rma';
 IF v_amount IS NULL OR v_amount<=0 OR v_amount::text IN ('NaN','Infinity','-Infinity') OR v_amount<>round(v_amount,2) THEN RAISE EXCEPTION 'Valor de credito invalido'; END IF;
 v_cash_actor:=COALESCE(op.salesperson_id,op.company_id);
 IF p_cash_session_id IS NOT NULL THEN
  IF op.role NOT IN ('administrador','gerente') THEN RAISE EXCEPTION 'Somente gerente ou proprietario pode operar outro caixa'; END IF;
  SELECT actor_key INTO v_cash_actor FROM public.partner_cash_sessions WHERE id=p_cash_session_id AND user_id=op.company_id AND branch_id=v_branch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caixa invalido para esta empresa e filial'; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(op.company_id::text||v_branch_id::text||v_cash_actor::text,1));
 PERFORM pg_advisory_xact_lock(hashtextextended(v_sale_id::text,7));
 PERFORM pg_advisory_xact_lock(hashtextextended(v_sale_id::text,0));
 SELECT * INTO r FROM public.rma_requests_v2 WHERE id=p_rma_id FOR UPDATE;
 IF NOT FOUND OR r.user_id IS DISTINCT FROM op.company_id OR r.branch_id IS DISTINCT FROM v_branch_id
  OR r.customer_id IS DISTINCT FROM v_customer_id THEN RAISE EXCEPTION 'Credito deve pertencer ao mesmo cliente e filial'; END IF;
 SELECT * INTO a FROM public.partner_rma_credit_applications ca WHERE ca.sale_id=v_sale_id;
 IF FOUND THEN
  IF a.rma_id IS DISTINCT FROM p_rma_id OR a.amount IS DISTINCT FROM v_amount THEN RAISE EXCEPTION 'Tentativa diverge do credito original'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM public.partner_sales s WHERE s.id=v_sale_id) THEN RAISE EXCEPTION 'Credito exige uma nova venda'; END IF;
  SELECT COALESCE(sum(ca.amount),0) INTO used FROM public.partner_rma_credit_applications ca WHERE ca.rma_id=r.id;
  IF r.status<>'credito_gerado' OR v_amount>r.credit_amount-used THEN RAISE EXCEPTION 'Saldo de credito insuficiente'; END IF;
  INSERT INTO public.partner_rma_credit_applications(id,user_id,branch_id,customer_id,rma_id,sale_id,amount)
   VALUES(gen_random_uuid(),r.user_id,r.branch_id,r.customer_id,r.id,v_sale_id,v_amount);
 END IF;
 IF p_cash_session_id IS NULL THEN
  result:=public.execute_partner_sale_mutation(p_operator_id,p_pin,v_sale_id,v_customer_id,p_sale->>'customer_name',p_sale->'items',(p_sale->>'total')::numeric,
   p_sale->>'imei',p_sale->>'serial_number','misto',v_branch_id,'concluida','pdv',p_sale->>'customer_type',p_sale->>'delivery_type',(p_sale->>'salesperson_id')::uuid,
   COALESCE((p_sale->>'freight_fee')::numeric,0),p_sale->'payment_splits');
 ELSE
  result:=public.supervised_execute_partner_sale_mutation(p_cash_session_id,p_operator_id,p_pin,v_sale_id,v_customer_id,p_sale->>'customer_name',p_sale->'items',(p_sale->>'total')::numeric,
   p_sale->>'imei',p_sale->>'serial_number','misto',v_branch_id,'concluida','pdv',p_sale->>'customer_type',p_sale->>'delivery_type',(p_sale->>'salesperson_id')::uuid,
   COALESCE((p_sale->>'freight_fee')::numeric,0),p_sale->'payment_splits');
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION partner_checkout_credit_private.execute_sale(jsonb,uuid,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION partner_checkout_credit_private.execute_sale(jsonb,uuid,uuid,text,uuid) TO authenticated;
CREATE FUNCTION public.execute_partner_sale_with_rma_credit(p_sale jsonb,p_rma_id uuid,p_operator_id uuid DEFAULT NULL,p_pin text DEFAULT NULL,p_cash_session_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT partner_checkout_credit_private.execute_sale(p_sale,p_rma_id,p_operator_id,p_pin,p_cash_session_id)
$$;
REVOKE ALL ON FUNCTION public.execute_partner_sale_with_rma_credit(jsonb,uuid,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.execute_partner_sale_with_rma_credit(jsonb,uuid,uuid,text,uuid) TO authenticated;

CREATE FUNCTION partner_checkout_credit_private.protect_sale() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.partner_rma_credit_applications a WHERE a.sale_id=OLD.id) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Venda com credito RMA deve preservar o historico; registre uma devolucao'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status OR ROW(NEW.user_id,NEW.branch_id,NEW.customer_id,NEW.items,NEW.total,NEW.freight_fee,NEW.payment_method,NEW.payment_splits)
   IS DISTINCT FROM ROW(OLD.user_id,OLD.branch_id,OLD.customer_id,OLD.items,OLD.total,OLD.freight_fee,OLD.payment_method,OLD.payment_splits)
  THEN RAISE EXCEPTION 'Venda com credito RMA deve preservar o historico; registre uma devolucao'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION partner_checkout_credit_private.protect_sale() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER protect_checkout_rma_credit BEFORE UPDATE OR DELETE ON public.partner_sales FOR EACH ROW EXECUTE FUNCTION partner_checkout_credit_private.protect_sale();

-- PDV operators read only the balance metadata, without requiring RMA management access.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.get_partner_pdv_snapshot(uuid)'::regprocedure) INTO definition;
 IF position('  RETURN v_result;' IN definition)=0 THEN RAISE EXCEPTION 'PDV snapshot implementation changed'; END IF;
 definition:=replace(definition,'  RETURN v_result;', $credits$
  v_result:=v_result||jsonb_build_object('return_credits',COALESCE((
   SELECT jsonb_agg(jsonb_build_object('id',r.id,'customer_id',r.customer_id,'branch_id',r.branch_id,'product_name',r.product_name,
    'status',r.status,'credit_amount',r.credit_amount,'credit_used_amount',COALESCE(used.amount,0)))
   FROM public.rma_requests_v2 r LEFT JOIN LATERAL (
    SELECT sum(a.amount) amount FROM public.partner_rma_credit_applications a WHERE a.rma_id=r.id
   ) used ON true
   WHERE r.user_id=v_company AND r.branch_id=p_branch_id AND r.status='credito_gerado'
    AND r.credit_amount>COALESCE(used.amount,0)
  ),'[]'::jsonb));
  RETURN v_result;$credits$);
 EXECUTE definition;
END $migration$;
COMMIT;
