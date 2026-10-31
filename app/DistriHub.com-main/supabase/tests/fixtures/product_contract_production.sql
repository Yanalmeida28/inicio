CREATE OR REPLACE FUNCTION partner_pdv_fix_private.mutate_barcode_product(p_salesperson_id uuid, p_pin text, p_product_id uuid, p_branch_id uuid, p_name text, p_cost_price numeric, p_sale_price numeric, p_wholesale_price numeric, p_stock integer, p_min_stock integer, p_category text, p_sku text, p_is_service boolean, p_image_url text, p_supplier_id uuid, p_premium_price numeric, p_barcode text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_id := partner_pdv_fix_private.mutate_priced_product(
    p_salesperson_id,p_pin,p_product_id,p_branch_id,p_name,p_cost_price,p_sale_price,
    p_wholesale_price,p_stock,p_min_stock,p_category,p_sku,p_is_service,p_image_url,
    p_supplier_id,p_premium_price
  );
  UPDATE public.partner_products SET barcode = NULLIF(pg_catalog.btrim(p_barcode), '') WHERE id = v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION partner_pdv_fix_private.mutate_priced_product(p_salesperson_id uuid, p_pin text, p_product_id uuid, p_branch_id uuid, p_name text, p_cost_price numeric, p_sale_price numeric, p_wholesale_price numeric, p_stock integer, p_min_stock integer, p_category text, p_sku text, p_is_service boolean, p_image_url text, p_supplier_id uuid, p_premium_price numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  PERFORM partner_subscription_private.require_actor('cadastros');
  PERFORM partner_subscription_private.require_operator_module('cadastros',p_salesperson_id);
  IF p_premium_price IS NOT NULL AND (p_premium_price<0 OR p_premium_price>99999999.99 OR p_premium_price<>round(p_premium_price,2) OR p_premium_price::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Preço Premium inválido'; END IF;
  SELECT op.company_id,op.role,op.branch_id INTO v_company_id,v_role,v_branch FROM public.resolve_partner_pdv_operator(p_salesperson_id,p_pin,p_branch_id) op;
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

  UPDATE public.partner_products SET premium_price=p_premium_price WHERE id=v_target_id AND user_id=v_company_id;
  RETURN v_target_id;
END;
$function$;

