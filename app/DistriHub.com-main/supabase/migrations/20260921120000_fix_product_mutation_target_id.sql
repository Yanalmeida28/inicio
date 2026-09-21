-- Corrige SOMENTE o bug de criacao de produto novo em
-- public.execute_partner_product_mutation, conforme auditoria de producao.
--
-- Bug: na criacao, o frontend envia p_product_id = null. A funcao usava
-- p_product_id diretamente no INSERT de partner_products (id), no INSERT
-- inicial de stock_movements (product_id) e no RETURN, resultando em
-- id/product_id nulos e retorno nulo.
--
-- Correcao: gera um id interno v_target_id := COALESCE(p_product_id,
-- pg_catalog.gen_random_uuid()) e usa v_target_id em:
--   - INSERT de partner_products.id
--   - stock_movements.product_id do cadastro inicial
--   - RETURN final (RETURN v_target_id)
-- Na edicao de produto existente, o comportamento atual e preservado
-- usando o ID recebido (v_target_id = p_product_id nesse caso).
--
-- Nao altera: resolve_partner_operator(), RLS, Auth, politicas,
-- addCustomer/addSupplier/addSalesperson (frontend), logica de PIN,
-- regras de filial, regras de estoque, outras RPCs.

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
  p_image_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_operator record;
  v_existing_branch_id uuid;
  v_target_id uuid := COALESCE(p_product_id, pg_catalog.gen_random_uuid());
BEGIN
  SELECT * INTO v_operator FROM public.resolve_partner_operator(p_salesperson_id, p_pin, p_branch_id);
  IF v_operator.branch_id IS NULL THEN RAISE EXCEPTION 'E necessario informar uma filial valida.'; END IF;

  SELECT branch_id INTO v_existing_branch_id
  FROM public.partner_products
  WHERE id = v_target_id AND user_id = v_operator.user_id;

  IF p_product_id IS NOT NULL AND NOT FOUND THEN
    RAISE EXCEPTION 'Produto nao encontrado nesta empresa.';
  END IF;

  IF v_operator.role <> 'administrador'
     AND v_existing_branch_id IS NOT NULL
     AND v_existing_branch_id <> v_operator.branch_id THEN
    RAISE EXCEPTION 'Acesso negado: voce nao pode alterar produtos de outra filial.';
  END IF;

  IF p_product_id IS NULL THEN
    -- Criacao de produto novo: usa o id interno gerado (v_target_id).
    INSERT INTO public.partner_products (
      id, user_id, branch_id, name, cost_price, sale_price, wholesale_price,
      stock, min_stock, category, sku, is_service, image_url, updated_at
    ) VALUES (
      v_target_id, v_operator.user_id, v_operator.branch_id, p_name,
      COALESCE(p_cost_price, 0), COALESCE(p_sale_price, 0),
      COALESCE(p_wholesale_price, 0), COALESCE(p_stock, 0),
      COALESCE(p_min_stock, 5), p_category, p_sku,
      COALESCE(p_is_service, false), p_image_url, pg_catalog.now()
    );

    -- Movimentacao inicial de estoque do cadastro, referenciando o id interno.
    IF NOT COALESCE(p_is_service, false) AND COALESCE(p_stock, 0) > 0 THEN
      INSERT INTO public.stock_movements (
        user_id, product_id, product_name, type, quantity, reason
      ) VALUES (
        v_operator.user_id, v_target_id, p_name, 'entrada', p_stock, 'Cadastro inicial'
      );
    END IF;
  ELSE
    -- Edicao de produto existente: preserva o comportamento atual usando o ID recebido.
    UPDATE public.partner_products SET
      branch_id = v_operator.branch_id,
      name = p_name,
      cost_price = COALESCE(p_cost_price, cost_price),
      sale_price = COALESCE(p_sale_price, sale_price),
      wholesale_price = COALESCE(p_wholesale_price, wholesale_price),
      stock = COALESCE(p_stock, stock),
      min_stock = COALESCE(p_min_stock, min_stock),
      category = p_category,
      sku = p_sku,
      is_service = COALESCE(p_is_service, is_service),
      image_url = COALESCE(p_image_url, image_url),
      updated_at = pg_catalog.now()
    WHERE id = v_target_id AND user_id = v_operator.user_id;
  END IF;

  RETURN v_target_id;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_partner_product_mutation(uuid, text, uuid, uuid, text, numeric, numeric, numeric, integer, integer, text, text, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_partner_product_mutation(uuid, text, uuid, uuid, text, numeric, numeric, numeric, integer, integer, text, text, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.execute_partner_product_mutation(uuid, text, uuid, uuid, text, numeric, numeric, numeric, integer, integer, text, text, boolean, text) TO authenticated;
