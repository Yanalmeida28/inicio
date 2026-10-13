BEGIN;
LOCK TABLE public.rma_requests_v2, public.partner_cash_movements IN ACCESS EXCLUSIVE MODE NOWAIT;
ALTER TABLE public.rma_requests_v2
 ADD COLUMN refund_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0 AND refund_amount::text NOT IN ('NaN','Infinity','-Infinity')),
 ADD COLUMN refund_request_id uuid UNIQUE,
 ADD COLUMN refund_method text CHECK (refund_method IN ('dinheiro','pix','cartao')),
 ADD COLUMN refund_reason text,
 ADD COLUMN refunded_at timestamptz;
ALTER TABLE public.partner_cash_movements ADD COLUMN rma_id uuid REFERENCES public.rma_requests_v2(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX partner_cash_rma_refund_once ON public.partner_cash_movements(rma_id) WHERE rma_id IS NOT NULL;

-- Serialize both kinds of compensation against the sale, including refunds through Caixa.
CREATE FUNCTION partner_rma_private.guard_compensation_budget() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_sale_id uuid; maximum numeric; credits numeric; refunds numeric;
BEGIN
 IF TG_TABLE_NAME='rma_requests_v2' THEN
  IF NEW.credit_amount <= OLD.credit_amount THEN RETURN NEW; END IF;
  v_sale_id := NEW.sale_id;
 ELSE
  IF NEW.kind NOT IN ('devolucao','estorno') THEN RETURN NEW; END IF;
  v_sale_id := NEW.sale_id;
 END IF;
 SELECT total INTO maximum FROM public.partner_sales WHERE id=v_sale_id FOR UPDATE;
 SELECT COALESCE(sum(credit_amount),0) INTO credits FROM public.rma_requests_v2 WHERE rma_requests_v2.sale_id=v_sale_id;
 SELECT COALESCE(sum(amount),0) INTO refunds FROM public.partner_cash_movements WHERE partner_cash_movements.sale_id=v_sale_id AND kind IN ('devolucao','estorno');
 IF TG_TABLE_NAME='rma_requests_v2' THEN credits := credits - OLD.credit_amount + NEW.credit_amount;
 ELSE refunds := refunds + NEW.amount; END IF;
 -- Freight is refundable cash, but cannot be converted into product credit.
 SELECT maximum + COALESCE(freight_fee,0) INTO maximum FROM public.partner_sales WHERE id=v_sale_id;
 IF credits + refunds > maximum THEN RAISE EXCEPTION 'Credito e reembolso excedem o saldo da venda'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION partner_rma_private.guard_compensation_budget() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zzz_rma_compensation_budget BEFORE UPDATE ON public.rma_requests_v2 FOR EACH ROW EXECUTE FUNCTION partner_rma_private.guard_compensation_budget();
CREATE TRIGGER guard_cash_compensation_budget BEFORE INSERT ON public.partner_cash_movements FOR EACH ROW EXECUTE FUNCTION partner_rma_private.guard_compensation_budget();

CREATE FUNCTION partner_rma_private.guard_refund() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE maximum numeric;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.refund_amount <> 0 OR NEW.refund_request_id IS NOT NULL OR NEW.refunded_at IS NOT NULL OR NEW.refund_method IS NOT NULL OR NEW.refund_reason IS NOT NULL THEN RAISE EXCEPTION 'Reembolso exige registro financeiro'; END IF;
  RETURN NEW;
 END IF;
 IF ROW(NEW.refund_amount,NEW.refund_request_id,NEW.refund_method,NEW.refund_reason,NEW.refunded_at) IS NOT DISTINCT FROM ROW(OLD.refund_amount,OLD.refund_request_id,OLD.refund_method,OLD.refund_reason,OLD.refunded_at) THEN RETURN NEW; END IF;
 IF OLD.refund_amount > 0 THEN RAISE EXCEPTION 'Reembolso confirmado e imutavel'; END IF;
 IF NEW.credit_amount > 0 OR NEW.refund_amount <= 0 OR NEW.refunded_at IS NULL THEN RAISE EXCEPTION 'Escolha credito ou reembolso para esta devolucao'; END IF;
 SELECT round((items->NEW.sale_item_index->>'unit_price')::numeric * NEW.quantity,2) INTO maximum FROM public.partner_sales WHERE id=NEW.sale_id;
 IF maximum IS NULL OR NEW.refund_amount > maximum THEN RAISE EXCEPTION 'Reembolso excede o valor dos itens devolvidos'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.partner_cash_movements m JOIN public.partner_cash_sessions s ON s.id=m.session_id
   WHERE m.request_id=NEW.refund_request_id AND m.rma_id=NEW.id AND m.kind='devolucao' AND m.sale_id=NEW.sale_id AND m.amount=NEW.refund_amount
   AND m.payment_method=NEW.refund_method AND m.reason=NEW.refund_reason AND s.user_id=NEW.user_id AND s.branch_id=NEW.branch_id) THEN RAISE EXCEPTION 'Reembolso sem saida financeira confirmada'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION partner_rma_private.guard_refund() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zz_guard_rma_refund BEFORE INSERT OR UPDATE ON public.rma_requests_v2 FOR EACH ROW EXECUTE FUNCTION partner_rma_private.guard_refund();
CREATE OR REPLACE FUNCTION partner_rma_private.guard_credit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op record; sold public.partner_sales%ROWTYPE; maximum numeric;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.credit_amount <> 0 OR NEW.credited_at IS NOT NULL THEN RAISE EXCEPTION 'Credito deve ser gerado depois da reintegracao'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.credit_amount > 0 THEN
  IF NEW.credit_amount IS DISTINCT FROM OLD.credit_amount OR NEW.credited_at IS DISTINCT FROM OLD.credited_at
  THEN RAISE EXCEPTION 'Credito ja gerado e imutavel'; END IF;
 ELSIF NEW.credit_amount > 0 THEN
  IF NEW.refund_amount > 0 THEN RAISE EXCEPTION 'Devolucao ja reembolsada; nao pode gerar credito'; END IF;
  PERFORM partner_subscription_private.require_actor('rma');
  SELECT * INTO op FROM public.resolve_partner_pdv_operator(NULL,NULL,NEW.branch_id);
  IF op.company_id IS DISTINCT FROM NEW.user_id OR op.role NOT IN ('administrador','gerente') THEN RAISE EXCEPTION 'Sem permissao para gerar credito'; END IF;
  IF NEW.status <> 'credito_gerado'
   OR NEW.sale_id IS NULL OR NEW.customer_id IS NULL THEN RAISE EXCEPTION 'Credito exige devolucao vinculada a venda e cliente'; END IF;
  SELECT * INTO sold FROM public.partner_sales WHERE id=NEW.sale_id;
  maximum := round((sold.items->NEW.sale_item_index->>'unit_price')::numeric * NEW.quantity,2);
  IF maximum IS NULL OR NEW.credit_amount > maximum THEN RAISE EXCEPTION 'Credito excede o valor dos itens devolvidos'; END IF;
  NEW.credited_at := now();
 ELSIF NEW.credited_at IS NOT NULL OR (NEW.status='credito_gerado' AND OLD.status IS DISTINCT FROM NEW.status) THEN
  RAISE EXCEPTION 'Informe o valor do credito antes de finalizar';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION partner_rma_private.guard_credit() FROM PUBLIC,anon,authenticated;


CREATE OR REPLACE FUNCTION partner_rma_private.record_cash_refund(p_branch_id uuid, p_salesperson_id uuid, p_pin text, p_session_id uuid, p_sale_id uuid, p_amount numeric, p_reason text, p_supervisor_id uuid, p_supervisor_pin text, p_request_id uuid, p_refund_method text DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_operator record;
  v_supervisor record;
  v_session public.partner_cash_sessions%ROWTYPE;
  v_sale public.partner_sales%ROWTYPE;
  v_original public.partner_cash_movements%ROWTYPE;
  v_existing public.partner_cash_movements%ROWTYPE;
  v_existing_user uuid;
  v_existing_branch uuid;
  v_existing_actor uuid;
  v_refunded numeric;
  v_authorizer uuid;
BEGIN PERFORM partner_subscription_private.require_operator_module('caixa',p_salesperson_id); PERFORM partner_subscription_private.require_actor('caixa');
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_request_id IS NULL OR p_sale_id IS NULL OR p_session_id IS NULL THEN
    RAISE EXCEPTION 'Dados obrigatórios da devolução ausentes';
  END IF;
  IF p_amount IS NULL OR p_amount::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_amount <= 0 OR p_amount > 99999999.99 OR round(p_amount, 2) <> p_amount THEN
    RAISE EXCEPTION 'Valor de devolução inválido';
  END IF;
  IF length(trim(COALESCE(p_reason, ''))) = 0 OR length(p_reason) > 500 THEN
    RAISE EXCEPTION 'Informe um motivo válido para a devolução';
  END IF;

  SELECT * INTO v_operator
  FROM public.resolve_partner_pdv_operator(p_salesperson_id, p_pin, p_branch_id);
  IF v_operator.role NOT IN ('administrador', 'gerente', 'caixa') THEN
    RAISE EXCEPTION 'Sem permissão para registrar devoluções';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.partner_branches b
    WHERE b.id = p_branch_id AND b.user_id = v_operator.company_id
  ) THEN RAISE EXCEPTION 'Filial inválida'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_operator.company_id::text || p_branch_id::text ||
      COALESCE(v_operator.salesperson_id, v_operator.company_id)::text, 1
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 9));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_sale_id::text, 7));

  SELECT m.*
  INTO v_existing
  FROM public.partner_cash_movements m
  JOIN public.partner_cash_sessions s ON s.id = m.session_id
  WHERE m.request_id = p_request_id
  FOR UPDATE OF m, s;
  IF FOUND THEN
    SELECT s.user_id, s.branch_id, s.actor_key
    INTO v_existing_user, v_existing_branch, v_existing_actor
    FROM public.partner_cash_sessions s
    WHERE s.id = v_existing.session_id;
    IF v_existing_user <> v_operator.company_id
      OR v_existing_branch <> p_branch_id
      OR v_existing_actor <> COALESCE(v_operator.salesperson_id, v_operator.company_id) THEN
      RAISE EXCEPTION 'Operação não pertence a este operador ou filial';
    END IF;
    IF ROW(v_existing.session_id, v_existing.sale_id, v_existing.kind, v_existing.amount, v_existing.reason)
      IS DISTINCT FROM ROW(p_session_id, p_sale_id, 'devolucao', p_amount, trim(p_reason)) THEN
      RAISE EXCEPTION 'Operação repetida com dados diferentes';
    END IF;
    IF p_refund_method IS NOT NULL AND v_existing.payment_method IS DISTINCT FROM p_refund_method THEN RAISE EXCEPTION 'Operacao repetida com dados diferentes'; END IF;
    RETURN v_existing.session_id;
  END IF;

  SELECT * INTO v_session
  FROM public.partner_cash_sessions
  WHERE id = p_session_id AND user_id = v_operator.company_id
    AND branch_id = p_branch_id
    AND actor_key = COALESCE(v_operator.salesperson_id, v_operator.company_id)
  FOR UPDATE;
  IF NOT FOUND OR v_session.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'A devolução exige um caixa aberto do operador nesta filial';
  END IF;

  IF p_supervisor_id IS NULL AND v_operator.role IN ('administrador', 'gerente') THEN
    v_authorizer := COALESCE(v_operator.salesperson_id, v_operator.company_id);
  ELSE
    SELECT sp.id, sp.user_id, sp.role, sp.branch_id
    INTO v_supervisor
    FROM public.partner_salespeople sp
    WHERE sp.id = p_supervisor_id AND sp.user_id = v_operator.company_id
      AND sp.active = true
      AND sp.role IN ('administrador', 'gerente')
      AND (sp.role = 'administrador' OR sp.branch_id = p_branch_id)
      AND public.verify_partner_salesperson_pin(p_supervisor_pin, sp.pin_hash);
    IF NOT FOUND THEN RAISE EXCEPTION 'Responsável inválido ou PIN incorreto'; END IF;
    v_authorizer := v_supervisor.id;
  END IF;

  SELECT * INTO v_sale
  FROM public.partner_sales
  WHERE id = p_sale_id AND user_id = v_operator.company_id
    AND branch_id = p_branch_id AND status = 'concluida'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda concluída não encontrada nesta filial'; END IF;

  IF p_refund_method IS NULL AND (SELECT count(DISTINCT payment_method) FROM public.partner_cash_movements WHERE sale_id=p_sale_id AND kind='venda')>1 THEN RAISE EXCEPTION 'Selecione a forma de pagamento da devolucao'; END IF;
  SELECT * INTO v_original
  FROM public.partner_cash_movements
  WHERE sale_id = p_sale_id AND kind = 'venda' AND (p_refund_method IS NULL OR payment_method=p_refund_method)
  FOR UPDATE;
  IF NOT FOUND OR v_original.payment_method NOT IN ('dinheiro', 'pix', 'cartao') THEN
    RAISE EXCEPTION 'A venda não possui recebimento elegível para devolução pelo Caixa';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.partner_cash_sessions original_session
    WHERE original_session.id = v_original.session_id
      AND original_session.user_id = v_operator.company_id
      AND original_session.branch_id = p_branch_id

  ) THEN
    RAISE EXCEPTION 'Recebimento original fora da empresa ou filial';
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO v_refunded
  FROM public.partner_cash_movements
  WHERE sale_id = p_sale_id AND kind IN ('estorno', 'devolucao') AND payment_method=v_original.payment_method;
  IF v_refunded + p_amount > v_original.amount THEN
    RAISE EXCEPTION 'O valor da devolução excede o saldo disponível da venda';
  END IF;

  INSERT INTO public.partner_cash_movements(
    session_id, kind, payment_method, amount, reason, sale_id, request_id, authorized_by
  )
  VALUES (
    p_session_id, 'devolucao', v_original.payment_method, p_amount,
    trim(p_reason), p_sale_id, p_request_id, v_authorizer
  );
  RETURN p_session_id;
END;
$function$
;

REVOKE ALL ON FUNCTION partner_rma_private.record_cash_refund(uuid,uuid,text,uuid,uuid,numeric,text,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.record_partner_rma_refund(p_rma_id uuid,p_amount numeric,p_method text,p_reason text,p_request_id uuid,p_salesperson_id uuid DEFAULT NULL,p_pin text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.rma_requests_v2%ROWTYPE; op record; session_id uuid; maximum numeric;
BEGIN
 PERFORM partner_subscription_private.require_actor('rma');
 PERFORM partner_subscription_private.require_operator_module('rma',p_salesperson_id);
 IF auth.uid() IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Operacao nao autenticada ou sem identificacao'; END IF;
 IF p_amount IS NULL OR p_amount <= 0 OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_amount <> round(p_amount,2) OR p_method IS NULL OR p_method NOT IN ('dinheiro','pix','cartao') OR length(trim(COALESCE(p_reason,'')))=0 OR length(p_reason)>500 THEN RAISE EXCEPTION 'Informe valor, forma e motivo validos'; END IF;
 SELECT * INTO r FROM public.rma_requests_v2 WHERE id=p_rma_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Devolucao nao encontrada'; END IF;
 SELECT * INTO op FROM public.resolve_partner_pdv_operator(p_salesperson_id,p_pin,r.branch_id);
 IF op.company_id IS DISTINCT FROM r.user_id OR op.role NOT IN ('administrador','gerente') THEN RAISE EXCEPTION 'Sem permissao para reembolsar'; END IF;
 IF r.refund_amount > 0 THEN
  IF ROW(r.refund_request_id,r.refund_amount,r.refund_method,r.refund_reason) IS DISTINCT FROM ROW(p_request_id,p_amount,p_method,trim(p_reason)) THEN RAISE EXCEPTION 'Reembolso ja registrado com outra operacao ou dados'; END IF;
  RETURN r.refund_request_id;
 END IF;
 IF r.credit_amount>0 OR r.sale_id IS NULL OR r.customer_id IS NULL THEN RAISE EXCEPTION 'Reembolso exige devolucao vinculada sem credito gerado'; END IF;
 SELECT round((items->r.sale_item_index->>'unit_price')::numeric * r.quantity,2) INTO maximum FROM public.partner_sales WHERE id=r.sale_id FOR UPDATE;
 IF maximum IS NULL OR p_amount>maximum THEN RAISE EXCEPTION 'Reembolso excede o valor dos itens devolvidos'; END IF;
 SELECT id INTO session_id FROM public.partner_cash_sessions WHERE user_id=r.user_id AND branch_id=r.branch_id AND actor_key=COALESCE(op.salesperson_id,op.company_id) AND closed_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Abra o caixa do operador nesta filial antes de registrar o reembolso'; END IF;
 PERFORM partner_rma_private.record_cash_refund(r.branch_id,p_salesperson_id,p_pin,session_id,r.sale_id,p_amount,trim(p_reason),NULL,NULL,p_request_id,p_method);
 UPDATE public.partner_cash_movements SET rma_id=r.id WHERE request_id=p_request_id AND rma_id IS NULL;
 UPDATE public.rma_requests_v2 SET refund_amount=p_amount,refund_request_id=p_request_id,refund_method=p_method,refund_reason=trim(p_reason),refunded_at=now(),updated_at=now() WHERE id=r.id;
 RETURN p_request_id;
END; $$;
REVOKE ALL ON FUNCTION public.record_partner_rma_refund(uuid,numeric,text,text,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_partner_rma_refund(uuid,numeric,text,text,uuid,uuid,text) TO authenticated;
COMMIT;
