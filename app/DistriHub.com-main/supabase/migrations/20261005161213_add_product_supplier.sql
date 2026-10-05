-- Keep the existing 14-argument RPC for callers that do not edit suppliers.
ALTER TABLE public.partner_products
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.partner_suppliers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS partner_products_supplier_id_idx ON public.partner_products(supplier_id);

CREATE OR REPLACE FUNCTION public.execute_partner_product_mutation(
  p_salesperson_id uuid,
  p_pin text,
  p_product_id uuid,
  p_branch_id uuid,
  p_name text,
  p_cost_price numeric,
  p_sale_price numeric,
  p_wholesale_price numeric,
  p_stock integer,
  p_min_stock integer,
  p_category text,
  p_sku text,
  p_is_service boolean,
  p_image_url text,
  p_supplier_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_user uuid := (SELECT auth.uid());
  v_company_id uuid;
  v_role text;
  v_branch uuid;
  v_existing_user uuid;
  v_existing_branch uuid;
  v_old_stock integer;
  v_old_is_service boolean;
  v_new_stock integer := COALESCE(p_stock, 0);
  v_new_is_service boolean := COALESCE(p_is_service, false);
  v_delta integer;
  v_target_id uuid := COALESCE(p_product_id, pg_catalog.gen_random_uuid());
BEGIN
  IF v_auth_user IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF v_new_stock < 0 THEN RAISE EXCEPTION 'Estoque não pode ser negativo'; END IF;
  IF p_min_stock IS NOT NULL AND p_min_stock < 0 THEN RAISE EXCEPTION 'Estoque mínimo não pode ser negativo'; END IF;

  v_company_id := v_auth_user;
  IF p_salesperson_id IS NOT NULL THEN
    SELECT sp.user_id, sp.role, sp.branch_id
      INTO v_company_id, v_role, v_branch
    FROM public.partner_salespeople sp
    WHERE sp.id = p_salesperson_id
      AND sp.active = true
      AND public.verify_partner_salesperson_pin(p_pin, sp.pin_hash)
      AND (sp.user_id = v_auth_user OR sp.auth_user_id = v_auth_user);
    IF v_company_id IS NULL THEN RAISE EXCEPTION 'Operador inválido ou PIN incorreto'; END IF;
    IF v_role <> 'administrador' AND (v_branch IS NULL OR v_branch <> p_branch_id) THEN
      RAISE EXCEPTION 'Acesso negado à filial';
    END IF;
  ELSE
    v_role := 'administrador';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.partner_branches b
    WHERE b.id = p_branch_id AND b.user_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Filial inválida';
  END IF;

  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.partner_suppliers s
    WHERE s.id = p_supplier_id AND s.user_id = v_company_id
    FOR KEY SHARE
  ) THEN
    RAISE EXCEPTION 'Fornecedor nao pertence a empresa';
  END IF;

  SELECT pp.user_id, pp.branch_id, pp.stock, pp.is_service
    INTO v_existing_user, v_existing_branch, v_old_stock, v_old_is_service
  FROM public.partner_products pp
  WHERE pp.id = p_product_id
  FOR UPDATE;

  IF v_existing_user IS NOT NULL AND v_existing_user <> v_company_id THEN
    RAISE EXCEPTION 'Produto não pertence à empresa';
  END IF;
  IF v_existing_user IS NOT NULL AND v_existing_branch IS DISTINCT FROM p_branch_id AND COALESCE(v_old_stock, 0) <> 0 THEN
    RAISE EXCEPTION 'Não é permitido trocar a filial de um produto com estoque. Faça uma transferência de estoque.';
  END IF;
  IF v_existing_user IS NOT NULL AND COALESCE(v_old_is_service, false) = false AND v_new_is_service = true AND COALESCE(v_old_stock, 0) <> 0 THEN
    RAISE EXCEPTION 'Não é permitido converter produto com estoque físico em serviço. Baixe ou transfira o estoque primeiro.';
  END IF;
  IF v_new_is_service AND v_new_stock <> 0 THEN
    RAISE EXCEPTION 'Produto de serviço não pode possuir estoque físico';
  END IF;

  IF v_existing_user IS NULL THEN
    INSERT INTO public.partner_products (
      id, user_id, branch_id, name, cost_price, sale_price, wholesale_price,
      stock, min_stock, category, sku, is_service, image_url, supplier_id
    ) VALUES (
      v_target_id, v_company_id, p_branch_id, p_name,
      COALESCE(p_cost_price, 0), COALESCE(p_sale_price, 0),
      COALESCE(p_wholesale_price, 0), v_new_stock,
      COALESCE(p_min_stock, 5), p_category, p_sku,
      v_new_is_service, p_image_url, p_supplier_id
    );

    IF v_new_stock > 0 AND NOT v_new_is_service THEN
      INSERT INTO public.stock_movements (
        user_id, product_id, product_name, type, quantity, reason, branch_id
      ) VALUES (
        v_company_id, v_target_id, p_name, 'entrada', v_new_stock, 'Cadastro inicial', p_branch_id
      );
    END IF;
  ELSE
    v_delta := v_new_stock - COALESCE(v_old_stock, 0);
    UPDATE public.partner_products SET
      branch_id = p_branch_id,
      name = p_name,
      cost_price = COALESCE(p_cost_price, 0),
      sale_price = COALESCE(p_sale_price, 0),
      wholesale_price = COALESCE(p_wholesale_price, 0),
      stock = v_new_stock,
      min_stock = COALESCE(p_min_stock, 5),
      category = p_category,
      sku = p_sku,
      is_service = v_new_is_service,
      image_url = p_image_url,
      supplier_id = p_supplier_id,
      updated_at = pg_catalog.now()
    WHERE id = p_product_id AND user_id = v_company_id;

    IF NOT v_new_is_service AND NOT COALESCE(v_old_is_service, false) AND v_delta <> 0 THEN
      INSERT INTO public.stock_movements (
        user_id, product_id, product_name, type, quantity, reason, branch_id
      ) VALUES (
        v_company_id, p_product_id, p_name,
        CASE WHEN v_delta > 0 THEN 'entrada' ELSE 'saida' END,
        abs(v_delta), 'Ajuste de estoque por edição do produto', p_branch_id
      );
    ELSIF NOT COALESCE(v_old_is_service, false) AND v_new_is_service THEN
      RAISE EXCEPTION 'Conversão inválida de produto para serviço';
    END IF;
  END IF;

  RETURN v_target_id;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_partner_product_mutation(uuid, text, uuid, uuid, text, numeric, numeric, numeric, integer, integer, text, text, boolean, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_partner_product_mutation(uuid, text, uuid, uuid, text, numeric, numeric, numeric, integer, integer, text, text, boolean, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.execute_partner_product_mutation(uuid, text, uuid, uuid, text, numeric, numeric, numeric, integer, integer, text, text, boolean, text, uuid) TO authenticated;
