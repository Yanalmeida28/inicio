-- One identity resolver for own-login staff, owner sessions and PIN operators.
-- Keep the established SECURITY DEFINER boundary; never trust caller-supplied company IDs.
CREATE OR REPLACE FUNCTION public.resolve_partner_operator(
  p_salesperson_id uuid, p_pin text, p_requested_branch_id uuid
) RETURNS TABLE(company_id uuid, salesperson_id uuid, role text, branch_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_auth uuid := (SELECT auth.uid());
  v_operator public.partner_salespeople%ROWTYPE;
  v_count integer;
BEGIN
  IF v_auth IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  IF p_salesperson_id IS NULL THEN
    SELECT count(*) INTO v_count FROM public.partner_salespeople sp WHERE sp.auth_user_id = v_auth;
    IF v_count > 1 THEN RAISE EXCEPTION 'Identidade de funcionario ambigua'; END IF;
    SELECT sp.* INTO v_operator FROM public.partner_salespeople sp WHERE sp.auth_user_id = v_auth;
    IF FOUND THEN
      IF v_operator.active IS DISTINCT FROM true THEN RAISE EXCEPTION 'Funcionario inativo'; END IF;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM public.partner_profiles pp WHERE pp.id = v_auth) THEN
        RAISE EXCEPTION 'Operador invalido';
      END IF;
      IF p_requested_branch_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.partner_branches b WHERE b.id = p_requested_branch_id AND b.user_id = v_auth
      ) THEN RAISE EXCEPTION 'Acesso negado a filial'; END IF;
      RETURN QUERY SELECT v_auth, NULL::uuid, 'administrador'::text, p_requested_branch_id;
      RETURN;
    END IF;
  ELSE
    SELECT sp.* INTO v_operator FROM public.partner_salespeople sp
    WHERE sp.id = p_salesperson_id AND sp.active = true
      AND (sp.auth_user_id = v_auth OR (sp.user_id = v_auth AND EXISTS (
        SELECT 1 FROM public.partner_profiles pp WHERE pp.id = v_auth
      )))
      AND public.verify_partner_salesperson_pin(p_pin, sp.pin_hash);
    IF NOT FOUND THEN RAISE EXCEPTION 'Operador invalido ou PIN incorreto'; END IF;
  END IF;

  IF v_operator.role IS NULL THEN RAISE EXCEPTION 'Operador sem permissao'; END IF;
  IF v_operator.role <> 'administrador' AND (
    v_operator.branch_id IS NULL OR
    (p_requested_branch_id IS NOT NULL AND v_operator.branch_id IS DISTINCT FROM p_requested_branch_id)
  ) THEN RAISE EXCEPTION 'Acesso negado a filial'; END IF;
  IF p_requested_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.partner_branches b
    WHERE b.id = p_requested_branch_id AND b.user_id = v_operator.user_id
  ) THEN RAISE EXCEPTION 'Acesso negado a filial'; END IF;

  RETURN QUERY SELECT v_operator.user_id, v_operator.id, v_operator.role, v_operator.branch_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_partner_pdv_operator(
  p_salesperson_id uuid, p_pin text, p_requested_branch_id uuid
) RETURNS TABLE(company_id uuid, salesperson_id uuid, role text, branch_id uuid)
LANGUAGE sql SET search_path = '' AS $$
  SELECT * FROM public.resolve_partner_operator(p_salesperson_id, p_pin, p_requested_branch_id);
$$;

CREATE OR REPLACE FUNCTION public.execute_partner_product_delete(
  p_salesperson_id uuid, p_pin text, p_product_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_operator record;
  v_product_branch uuid;
  v_stock integer;
BEGIN
  SELECT * INTO v_operator FROM public.resolve_partner_operator(p_salesperson_id, p_pin, NULL);
  PERFORM partner_subscription_private.require_operator_module('cadastros', v_operator.salesperson_id);

  SELECT branch_id, stock INTO v_product_branch, v_stock
  FROM public.partner_products WHERE id = p_product_id AND user_id = v_operator.company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto nao encontrado'; END IF;
  IF v_operator.role <> 'administrador' AND (
    v_operator.branch_id IS NULL OR v_operator.branch_id IS DISTINCT FROM v_product_branch
  ) THEN RAISE EXCEPTION 'Acesso negado a filial'; END IF;
  IF COALESCE(v_stock, 0) <> 0 THEN
    RAISE EXCEPTION 'Produto com estoque nao pode ser excluido. Zere ou transfira o estoque primeiro.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.service_order_items soi
             WHERE soi.product_id = p_product_id AND soi.user_id = v_operator.company_id) THEN
    RAISE EXCEPTION 'Produto possui historico em ordens de servico e nao pode ser excluido';
  END IF;
  DELETE FROM public.partner_products WHERE id = p_product_id AND user_id = v_operator.company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto nao encontrado'; END IF;
  RETURN p_product_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_partner_operator(uuid,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_partner_pdv_operator(uuid,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.execute_partner_product_delete(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_partner_operator(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_partner_pdv_operator(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_partner_product_delete(uuid,text,uuid) TO authenticated;
