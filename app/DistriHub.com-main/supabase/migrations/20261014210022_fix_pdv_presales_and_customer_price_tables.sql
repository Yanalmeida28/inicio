ALTER TABLE public.partner_products ADD COLUMN IF NOT EXISTS premium_price numeric(10,2);
CREATE SCHEMA IF NOT EXISTS partner_pdv_fix_private;
GRANT USAGE ON SCHEMA partner_pdv_fix_private TO authenticated;
ALTER TABLE public.partner_customers ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.partner_products ADD CONSTRAINT partner_product_premium_price_valid CHECK(premium_price IS NULL OR (premium_price>=0 AND premium_price::text NOT IN ('NaN','Infinity','-Infinity')));
CREATE OR REPLACE FUNCTION partner_cash_private.validate_partner_pdv_negotiated_prices(p_company uuid, p_branch uuid, p_customer uuid, p_type text, p_items jsonb, p_total numeric, p_allow_override boolean)
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_item jsonb; v_product public.partner_products%ROWTYPE;
  v_type text; v_table text; v_qty numeric; v_price numeric; v_sum numeric := 0;
BEGIN
  IF p_type IS NULL OR p_type NOT IN ('varejo','atacado') THEN
    RAISE EXCEPTION 'Tipo de cliente invalido para precificacao';
  END IF;
  v_table := p_type;
  IF p_customer IS NOT NULL THEN
    SELECT CASE WHEN c.customer_type='atacado' THEN 'atacado' ELSE 'varejo' END, COALESCE(NULLIF(c.price_table,''),p_type) INTO v_type,v_table
    FROM public.partner_customers c WHERE c.id=p_customer AND c.user_id=p_company
      AND (c.branch_id IS NULL OR c.branch_id=p_branch) AND c.is_active IS DISTINCT FROM false;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cliente invalido para esta filial'; END IF;
    IF v_type<>p_type THEN RAISE EXCEPTION 'Tipo de cliente diverge do cadastro'; END IF;
  END IF;
  IF v_table NOT IN ('varejo','atacado','premium') THEN RAISE EXCEPTION 'Tabela de preços inválida'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN
    RAISE EXCEPTION 'Itens da venda invalidos ou vazios';
  END IF;
  -- Same product lock order as stock: also prevents catalog edits during price validation.
  PERFORM p.id FROM public.partner_products p
  WHERE p.id IN (SELECT (x->>'product_id')::uuid FROM jsonb_array_elements(p_items) x)
    AND p.user_id=p_company AND p.branch_id=p_branch ORDER BY p.id FOR UPDATE;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item)<>'object' THEN RAISE EXCEPTION 'Item invalido'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(v_item) k
      WHERE k NOT IN ('product_id','name','quantity','unit_price','subtotal')) THEN
      RAISE EXCEPTION 'Campo de item ou desconto nao suportado pelo PDV';
    END IF;
    IF jsonb_typeof(v_item->'quantity') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_item->'unit_price') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Quantidade ou preco unitario invalido';
    END IF;
    v_qty := (v_item->>'quantity')::numeric;
    IF v_qty<=0 OR v_qty<>trunc(v_qty) OR v_qty>2147483647 THEN
      RAISE EXCEPTION 'Quantidade invalida';
    END IF;
    SELECT p.* INTO v_product FROM public.partner_products p
    WHERE p.id=(v_item->>'product_id')::uuid AND p.user_id=p_company;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto invalido ou inexistente'; END IF;
    IF v_product.branch_id IS DISTINCT FROM p_branch THEN RAISE EXCEPTION 'Produto fora da filial da venda'; END IF;
    v_price := CASE WHEN v_table='premium' THEN v_product.premium_price WHEN v_table='atacado' AND v_product.wholesale_price>0
      THEN v_product.wholesale_price ELSE v_product.sale_price END;
    IF v_price IS NULL OR v_price::text IN ('NaN','Infinity','-Infinity')
      OR v_price<0 OR v_price<>round(v_price,2) THEN RAISE EXCEPTION 'Preco do cadastro invalido'; END IF;
    IF (v_item->>'unit_price')::numeric IS DISTINCT FROM v_price THEN
      IF NOT COALESCE(p_allow_override,false) THEN
        RAISE EXCEPTION 'Somente o gerente ou o dono da loja pode alterar o preco da venda';
      END IF;
      v_price := (v_item->>'unit_price')::numeric;
    END IF;
    IF v_price::text IN ('NaN','Infinity','-Infinity') OR v_price<0
      OR v_price<>round(v_price,2) OR v_price>99999999.99 THEN
      RAISE EXCEPTION 'Preco negociado invalido';
    END IF;
    IF v_item ? 'subtotal' THEN
      IF jsonb_typeof(v_item->'subtotal') IS DISTINCT FROM 'number'
        OR (v_item->>'subtotal')::numeric IS DISTINCT FROM v_price*v_qty THEN
        RAISE EXCEPTION 'Subtotal diverge do valor autorizado';
      END IF;
    END IF;
    v_sum := v_sum + v_price*v_qty;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x GROUP BY (x->>'product_id')::uuid
    HAVING SUM((x->>'quantity')::numeric)>2147483647) THEN RAISE EXCEPTION 'Quantidade agregada invalida'; END IF;
  IF v_sum>99999999.99 THEN RAISE EXCEPTION 'Total excede a precisao financeira'; END IF;
  IF p_total IS DISTINCT FROM v_sum THEN RAISE EXCEPTION 'Total diverge do total autorizado'; END IF;
  RETURN v_sum;
END;
$function$;


CREATE OR REPLACE FUNCTION public.validate_partner_pdv_prices(p_company uuid,p_branch uuid,p_customer uuid,p_type text,p_items jsonb,p_total numeric)
RETURNS numeric LANGUAGE sql SET search_path='' AS $$
 SELECT partner_cash_private.validate_partner_pdv_negotiated_prices(p_company,p_branch,p_customer,p_type,p_items,p_total,false);
$$;
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

REVOKE ALL ON FUNCTION partner_pdv_fix_private.mutate_priced_product(uuid,text,uuid,uuid,text,numeric,numeric,numeric,integer,integer,text,text,boolean,text,uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION partner_pdv_fix_private.mutate_priced_product(uuid,text,uuid,uuid,text,numeric,numeric,numeric,integer,integer,text,text,boolean,text,uuid,numeric) TO authenticated;
CREATE OR REPLACE FUNCTION public.execute_partner_product_priced_mutation(p_salesperson_id uuid,p_pin text,p_product_id uuid,p_branch_id uuid,p_name text,p_cost_price numeric,p_sale_price numeric,p_wholesale_price numeric,p_stock integer,p_min_stock integer,p_category text,p_sku text,p_is_service boolean,p_image_url text,p_supplier_id uuid,p_premium_price numeric)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT partner_pdv_fix_private.mutate_priced_product(p_salesperson_id,p_pin,p_product_id,p_branch_id,p_name,p_cost_price,p_sale_price,p_wholesale_price,p_stock,p_min_stock,p_category,p_sku,p_is_service,p_image_url,p_supplier_id,p_premium_price);
$$;
REVOKE ALL ON FUNCTION public.execute_partner_product_priced_mutation(uuid,text,uuid,uuid,text,numeric,numeric,numeric,integer,integer,text,text,boolean,text,uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.execute_partner_product_priced_mutation(uuid,text,uuid,uuid,text,numeric,numeric,numeric,integer,integer,text,text,boolean,text,uuid,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION partner_cash_private.guard_active_sale_customer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='cancelada' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND ROW(NEW.customer_id,NEW.items,NEW.status) IS NOT DISTINCT FROM ROW(OLD.customer_id,OLD.items,OLD.status) THEN RETURN NEW; END IF;
 IF NEW.customer_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.partner_customers c WHERE c.id=NEW.customer_id AND c.is_active=false)
 THEN RAISE EXCEPTION 'Cliente inativo. Reative o cadastro ou selecione outro cliente antes de vender ou finalizar a pré-venda.'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION partner_cash_private.guard_active_sale_customer() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_active_sale_customer BEFORE INSERT OR UPDATE ON public.partner_sales FOR EACH ROW EXECUTE FUNCTION partner_cash_private.guard_active_sale_customer();
NOTIFY pgrst,'reload schema';
