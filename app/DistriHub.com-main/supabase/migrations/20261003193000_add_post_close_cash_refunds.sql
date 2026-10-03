BEGIN;

DO $$
DECLARE
  v_constraint record;
BEGIN
  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.partner_cash_movements'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) LIKE '%sale_id%'
        OR pg_get_constraintdef(oid) LIKE '%kind%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.partner_cash_movements DROP CONSTRAINT %I', v_constraint.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.partner_cash_movements
  ADD CONSTRAINT partner_cash_movements_kind_check
    CHECK (kind IN ('venda', 'estorno', 'devolucao', 'sangria', 'suprimento')),
  ADD CONSTRAINT partner_cash_movements_sale_link_check
    CHECK (
      (kind IN ('venda', 'estorno', 'devolucao') AND sale_id IS NOT NULL)
      OR (kind IN ('sangria', 'suprimento') AND sale_id IS NULL)
    );
DROP INDEX IF EXISTS public.partner_cash_sale_once;
CREATE UNIQUE INDEX partner_cash_sale_once
  ON public.partner_cash_movements(sale_id, kind)
  WHERE sale_id IS NOT NULL AND kind IN ('venda', 'estorno');

CREATE OR REPLACE FUNCTION partner_cash_private.totals(p_session uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'dinheiro', COALESCE(sum(CASE WHEN payment_method = 'dinheiro'
      THEN amount * CASE WHEN kind IN ('estorno', 'devolucao', 'sangria') THEN -1 ELSE 1 END ELSE 0 END), 0),
    'pix', COALESCE(sum(CASE WHEN payment_method = 'pix'
      THEN amount * CASE WHEN kind IN ('estorno', 'devolucao') THEN -1 ELSE 1 END ELSE 0 END), 0),
    'cartao', COALESCE(sum(CASE WHEN payment_method = 'cartao'
      THEN amount * CASE WHEN kind IN ('estorno', 'devolucao') THEN -1 ELSE 1 END ELSE 0 END), 0),
    'faturado', COALESCE(sum(CASE WHEN payment_method = 'faturado'
      THEN amount * CASE WHEN kind IN ('estorno', 'devolucao') THEN -1 ELSE 1 END ELSE 0 END), 0)
  )
  FROM public.partner_cash_movements
  WHERE session_id = p_session
$$;

CREATE OR REPLACE FUNCTION public.record_partner_cash_refund(
  p_branch_id uuid,
  p_salesperson_id uuid,
  p_pin text,
  p_session_id uuid,
  p_sale_id uuid,
  p_amount numeric,
  p_reason text,
  p_supervisor_id uuid,
  p_supervisor_pin text,
  p_request_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
BEGIN
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

  SELECT * INTO v_original
  FROM public.partner_cash_movements
  WHERE sale_id = p_sale_id AND kind = 'venda'
  FOR UPDATE;
  IF NOT FOUND OR v_original.payment_method NOT IN ('dinheiro', 'pix', 'cartao') THEN
    RAISE EXCEPTION 'A venda não possui recebimento elegível para devolução pelo Caixa';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.partner_cash_sessions original_session
    WHERE original_session.id = v_original.session_id
      AND original_session.user_id = v_operator.company_id
      AND original_session.branch_id = p_branch_id
      AND original_session.closed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Devoluções financeiras pelo Caixa são permitidas somente após o fechamento da sessão original';
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO v_refunded
  FROM public.partner_cash_movements
  WHERE sale_id = p_sale_id AND kind IN ('estorno', 'devolucao');
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
$$;

CREATE OR REPLACE FUNCTION partner_cash_private.reverse_sale() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.partner_cash_sessions%ROWTYPE; m public.partner_cash_movements%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' AND NOT (OLD.status='concluida' AND NEW.status='cancelada') THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.partner_cash_movements
    WHERE sale_id = OLD.id AND kind = 'devolucao'
  ) THEN
    RAISE EXCEPTION 'Venda com devolução financeira não pode ser cancelada ou excluída; preserve o histórico';
  END IF;
  SELECT * INTO m FROM public.partner_cash_movements WHERE sale_id=OLD.id AND kind='venda';
  IF FOUND AND NOT EXISTS(SELECT 1 FROM public.partner_cash_movements WHERE sale_id=OLD.id AND kind='estorno') THEN
    SELECT * INTO s FROM public.partner_cash_sessions WHERE id=m.session_id FOR UPDATE;
    IF s.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Venda vinculada a caixa fechado. O fechamento é imutável; não é possível cancelar ou apagar esta venda'; END IF;
    INSERT INTO public.partner_cash_movements(session_id,kind,payment_method,amount,reason,sale_id)
    VALUES(m.session_id,'estorno',m.payment_method,m.amount,'Cancelamento ou exclusão de venda',OLD.id);
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION partner_cash_private.reverse_sale() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.record_partner_cash_refund(uuid, uuid, text, uuid, uuid, numeric, text, uuid, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_partner_cash_refund(uuid, uuid, text, uuid, uuid, numeric, text, uuid, text, uuid)
  TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
