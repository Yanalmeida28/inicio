-- Minimal stand-ins for the already-deployed SECURITY DEFINER functions that the owner-branch migration patches.
-- The supervisor lookups below copy the audited guard text from the original migrations verbatim
-- (20261003182612, 20261003193000, 20261013190858, 20261014230708, 20261015013718, 20261014201623).
CREATE SCHEMA IF NOT EXISTS partner_cash_supervision_private;
CREATE SCHEMA IF NOT EXISTS partner_rma_private;
CREATE SCHEMA IF NOT EXISTS partner_cadastros_private;
GRANT USAGE ON SCHEMA partner_cash_supervision_private, partner_rma_private, partner_cadastros_private TO authenticated;
-- Stand-in for public.is_super_admin(): the caller is the uid held in test.super_admin_uid.
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT auth.uid() IS NOT NULL AND auth.uid()::text = current_setting('test.super_admin_uid', true)
$$;

CREATE FUNCTION public.mutate_partner_cash_register(
  p_action text, p_operator_id uuid, p_branch_id uuid, p_t1 text, p_supervisor_id uuid,
  p_amount numeric, p_t2 text, p_supervisor_pin text, p_u1 uuid, p_t3 text, p_u2 uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE op record; v_supervisor record;
BEGIN
  SELECT s.user_id AS company_id INTO op FROM public.partner_salespeople s WHERE s.id = p_operator_id;
    SELECT sp.id, sp.user_id, sp.role, sp.branch_id
    INTO v_supervisor
    FROM public.partner_salespeople sp
    WHERE sp.id = p_supervisor_id AND sp.user_id = op.company_id AND sp.active = true
       AND sp.role IN ('administrador','gerente') AND (sp.role='administrador' OR sp.branch_id=p_branch_id)
       AND public.verify_partner_salesperson_pin(p_supervisor_pin, sp.pin_hash);
  RETURN FOUND;
END $$;

CREATE FUNCTION partner_cash_supervision_private.mutate_partner_cash_register(
  p_action text, p_operator_id uuid, p_branch_id uuid, p_t1 text, p_supervisor_id uuid,
  p_amount numeric, p_t2 text, p_supervisor_pin text, p_u1 uuid, p_t3 text, p_u2 uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE op record; v_supervisor record;
BEGIN
  SELECT s.user_id AS company_id INTO op FROM public.partner_salespeople s WHERE s.id = p_operator_id;
    SELECT sp.id, sp.user_id, sp.role, sp.branch_id
    INTO v_supervisor
    FROM public.partner_salespeople sp
    WHERE sp.id = p_supervisor_id AND sp.user_id = op.company_id AND sp.active = true
       AND sp.role IN ('administrador','gerente') AND (sp.role='administrador' OR sp.branch_id=p_branch_id)
       AND public.verify_partner_salesperson_pin(p_supervisor_pin, sp.pin_hash);
  RETURN FOUND;
END $$;

-- Refund flow (spaced guard text, as in 20261003193000 / 20261009211459 / 20261013190858).
CREATE FUNCTION partner_rma_private.record_cash_refund(
  p_company uuid, p_branch_id uuid, p_supervisor_id uuid, p_supervisor_pin text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_supervisor record;
BEGIN
    SELECT sp.id, sp.user_id, sp.role, sp.branch_id
    INTO v_supervisor
    FROM public.partner_salespeople sp
    WHERE sp.id = p_supervisor_id AND sp.user_id = p_company
      AND sp.active = true
      AND sp.role IN ('administrador', 'gerente')
      AND (sp.role = 'administrador' OR sp.branch_id = p_branch_id)
      AND public.verify_partner_salesperson_pin(p_supervisor_pin, sp.pin_hash);
  RETURN FOUND;
END $$;

-- Open order cancellation (unaliased guard, 20261014230708).
CREATE FUNCTION public.authorize_open_order_stub(
  p_company uuid, p_branch_id uuid, p_supervisor_id uuid, p_supervisor_pin text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE supervisor public.partner_salespeople;
BEGIN
   SELECT * INTO supervisor FROM public.partner_salespeople
   WHERE id=p_supervisor_id AND user_id=p_company AND active=true AND role IN ('administrador','gerente')
    AND (role='administrador' OR branch_id=p_branch_id) AND public.verify_partner_salesperson_pin(p_supervisor_pin,pin_hash);
  RETURN FOUND;
END $$;

-- Sales history cancellation (alias s, 20261015013718).
CREATE FUNCTION public.authorize_history_cancel_stub(
  p_company uuid, p_branch_id uuid, p_supervisor_id uuid, p_supervisor_pin text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE supervisor public.partner_salespeople;
BEGIN
   SELECT * INTO supervisor FROM public.partner_salespeople s
   WHERE s.id=p_supervisor_id AND s.user_id=p_company AND s.active=true
    AND s.role IN ('administrador','gerente') AND (s.role='administrador' OR s.branch_id=p_branch_id)
    AND public.verify_partner_salesperson_pin(p_supervisor_pin,s.pin_hash);
  RETURN FOUND;
END $$;

-- Cadastros permission helper (20261014201623).
CREATE FUNCTION partner_cadastros_private.can_manage(company uuid, branch uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND (company=auth.uid() OR EXISTS (
  SELECT 1 FROM public.partner_salespeople sp WHERE sp.user_id=company AND sp.auth_user_id=auth.uid()
   AND sp.active=true AND NOT ('cadastros'=ANY(coalesce(sp.blocked_modules,'{}'::text[])))
   AND (branch IS NULL OR sp.role='administrador' OR sp.branch_id=branch)
 ));
$$;
