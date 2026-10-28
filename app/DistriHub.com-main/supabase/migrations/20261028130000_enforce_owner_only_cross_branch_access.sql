BEGIN;

CREATE OR REPLACE FUNCTION public.partner_employee_can_access_branch(p_user_id uuid, p_branch_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT p_branch_id IS NOT NULL
    AND count(*) = 1
    AND COALESCE(bool_and(
      sp.user_id = p_user_id
      AND COALESCE(sp.active, true) = true
      AND sp.branch_id = p_branch_id
    ), false)
  FROM public.partner_salespeople sp
  WHERE sp.auth_user_id = (SELECT auth.uid())
$$;
REVOKE ALL ON FUNCTION public.partner_employee_can_access_branch(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.partner_employee_can_access_branch(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_partner_pdv_operator(
  p_salesperson_id uuid, p_pin text, p_requested_branch_id uuid
) RETURNS TABLE(company_id uuid, salesperson_id uuid, role text, branch_id uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $function$
DECLARE
  v_auth uuid := (SELECT auth.uid());
  v_operator public.partner_salespeople%ROWTYPE;
  v_count integer;
BEGIN
  IF v_auth IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF p_salesperson_id IS NULL THEN
    SELECT count(*) INTO v_count FROM public.partner_salespeople sp WHERE sp.auth_user_id=v_auth;
    IF v_count > 1 THEN RAISE EXCEPTION 'Identidade de funcionario ambigua'; END IF;
    SELECT sp.* INTO v_operator FROM public.partner_salespeople sp WHERE sp.auth_user_id=v_auth;
    IF FOUND THEN
      IF v_operator.active IS DISTINCT FROM true THEN RAISE EXCEPTION 'Funcionario inativo'; END IF;
    ELSE
      RETURN QUERY SELECT * FROM public.resolve_partner_operator(NULL,NULL,p_requested_branch_id);
      RETURN;
    END IF;
  ELSE
    SELECT sp.* INTO v_operator FROM public.partner_salespeople sp
    WHERE sp.id=p_salesperson_id AND sp.active=true
      AND (sp.user_id=v_auth OR sp.auth_user_id=v_auth)
      AND public.verify_partner_salesperson_pin(p_pin,sp.pin_hash);
    IF NOT FOUND THEN RAISE EXCEPTION 'Operador invalido ou PIN incorreto'; END IF;
  END IF;
  IF v_operator.role IS NULL THEN RAISE EXCEPTION 'Operador sem permissao'; END IF;
  IF v_operator.branch_id IS NULL
     OR (p_requested_branch_id IS NOT NULL AND v_operator.branch_id IS DISTINCT FROM p_requested_branch_id) THEN
    RAISE EXCEPTION 'Acesso negado a filial';
  END IF;
  RETURN QUERY SELECT v_operator.user_id,v_operator.id,v_operator.role,v_operator.branch_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.resolve_partner_pdv_operator(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_partner_pdv_operator(uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.require_partner_salesperson_branch()
RETURNS trigger
LANGUAGE plpgsql SET search_path=''
AS $$
BEGIN
  IF NEW.branch_id IS NULL THEN
    RAISE EXCEPTION 'Cada colaborador precisa estar vinculado a uma filial.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.require_partner_salesperson_branch() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS require_partner_salesperson_branch ON public.partner_salespeople;
CREATE TRIGGER require_partner_salesperson_branch
  BEFORE INSERT OR UPDATE OF branch_id ON public.partner_salespeople
  FOR EACH ROW EXECUTE FUNCTION public.require_partner_salesperson_branch();

DROP POLICY IF EXISTS select_authenticated_products ON public.partner_products;
CREATE POLICY select_authenticated_products ON public.partner_products
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.partner_employee_can_access_branch(user_id, branch_id));

DROP POLICY IF EXISTS select_authenticated_customers ON public.partner_customers;
CREATE POLICY select_authenticated_customers ON public.partner_customers
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.partner_employee_can_access_branch(user_id, branch_id));

DROP POLICY IF EXISTS select_authenticated_sales ON public.partner_sales;
CREATE POLICY select_authenticated_sales ON public.partner_sales
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.partner_employee_can_access_branch(user_id, branch_id));

DROP POLICY IF EXISTS select_authenticated_salespeople ON public.partner_salespeople;
CREATE POLICY select_authenticated_salespeople ON public.partner_salespeople
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id OR auth_user_id = auth.uid()
    OR public.partner_employee_can_access_branch(user_id, branch_id)
  );

DROP POLICY IF EXISTS select_authenticated_branches ON public.partner_branches;
CREATE POLICY select_authenticated_branches ON public.partner_branches
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.partner_employee_can_access_branch(user_id, id));

DROP POLICY IF EXISTS select_authorized_movements ON public.stock_movements;
CREATE POLICY select_authorized_movements ON public.stock_movements
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id OR EXISTS (
      SELECT 1
      FROM public.partner_products p
      WHERE p.id = stock_movements.product_id
        AND p.user_id = stock_movements.user_id
        AND public.partner_employee_can_access_branch(
          stock_movements.user_id, COALESCE(stock_movements.branch_id, p.branch_id)
        )
    )
  );

DROP POLICY IF EXISTS restrict_employee_products_to_branch ON public.partner_products;
CREATE POLICY restrict_employee_products_to_branch ON public.partner_products
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.partner_employee_can_access_branch(user_id, branch_id));

DROP POLICY IF EXISTS restrict_employee_customers_to_branch ON public.partner_customers;
CREATE POLICY restrict_employee_customers_to_branch ON public.partner_customers
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.partner_employee_can_access_branch(user_id, branch_id));

DROP POLICY IF EXISTS restrict_employee_sales_to_branch ON public.partner_sales;
CREATE POLICY restrict_employee_sales_to_branch ON public.partner_sales
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.partner_employee_can_access_branch(user_id, branch_id));

DROP POLICY IF EXISTS restrict_employee_salespeople_to_branch ON public.partner_salespeople;
CREATE POLICY restrict_employee_salespeople_to_branch ON public.partner_salespeople
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id OR auth_user_id = auth.uid()
    OR public.partner_employee_can_access_branch(user_id, branch_id)
  );

DROP POLICY IF EXISTS restrict_employee_branches_to_assigned_branch ON public.partner_branches;
CREATE POLICY restrict_employee_branches_to_assigned_branch ON public.partner_branches
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.partner_employee_can_access_branch(user_id, id));

DROP POLICY IF EXISTS restrict_employee_stock_movements_to_branch ON public.stock_movements;
CREATE POLICY restrict_employee_stock_movements_to_branch ON public.stock_movements
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id OR EXISTS (
      SELECT 1
      FROM public.partner_products p
      WHERE p.id = stock_movements.product_id
        AND p.user_id = stock_movements.user_id
        AND public.partner_employee_can_access_branch(
          stock_movements.user_id, COALESCE(stock_movements.branch_id, p.branch_id)
        )
    )
  );

COMMIT;
