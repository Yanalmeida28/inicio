-- Controlled mutations for owners and authenticated employees.

CREATE OR REPLACE FUNCTION public.resolve_partner_operator(
  p_salesperson_id uuid,
  p_pin text,
  p_requested_branch_id uuid
)
RETURNS TABLE (user_id uuid, branch_id uuid, salesperson_id uuid, role text) AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_branch_id uuid;
  v_role text;
  v_pin text;
BEGIN
  IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;

  SELECT sp.user_id, sp.branch_id, sp.id, sp.role
    INTO user_id, v_branch_id, salesperson_id, v_role
  FROM public.partner_salespeople sp
  WHERE sp.auth_user_id = v_auth_user_id
    AND COALESCE(sp.active, sp.is_active, true) = true;

  IF FOUND THEN
    IF v_role <> 'administrador' AND v_branch_id IS NOT NULL THEN
      IF p_requested_branch_id IS NOT NULL AND p_requested_branch_id <> v_branch_id THEN
        RAISE EXCEPTION 'Acesso negado: funcionário vinculado a outra filial.';
      END IF;
      branch_id := v_branch_id;
    ELSE
      branch_id := p_requested_branch_id;
    END IF;
    role := v_role;
  ELSIF EXISTS (SELECT 1 FROM public.partner_profiles p WHERE p.id = v_auth_user_id) THEN
    user_id := v_auth_user_id;
    branch_id := p_requested_branch_id;
    salesperson_id := p_salesperson_id;
    role := 'administrador';
    IF p_salesperson_id IS NOT NULL THEN
      SELECT sp.branch_id, sp.role, sp.pin INTO v_branch_id, v_role, v_pin
      FROM public.partner_salespeople sp
      WHERE sp.id = p_salesperson_id AND sp.user_id = user_id
        AND COALESCE(sp.active, sp.is_active, true) = true;
      IF NOT FOUND THEN RAISE EXCEPTION 'Operador não encontrado nesta empresa.'; END IF;
      IF v_pin IS NOT NULL AND v_pin <> p_pin THEN RAISE EXCEPTION 'PIN incorreto.'; END IF;
      IF v_role <> 'administrador' AND v_branch_id IS NOT NULL THEN
        IF p_requested_branch_id IS NOT NULL AND p_requested_branch_id <> v_branch_id THEN
          RAISE EXCEPTION 'Acesso negado: operador vinculado a outra filial.';
        END IF;
        branch_id := v_branch_id;
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'Acesso negado: usuário não autorizado.';
  END IF;

  IF branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.partner_branches b WHERE b.id = branch_id AND b.user_id = user_id
  ) THEN
    RAISE EXCEPTION 'Filial informada não pertence a esta empresa.';
  END IF;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.execute_partner_product_mutation(
  p_salesperson_id uuid, p_pin text, p_product_id uuid, p_branch_id uuid, p_name text,
  p_cost_price numeric, p_sale_price numeric, p_wholesale_price numeric, p_stock integer,
  p_min_stock integer, p_category text, p_sku text, p_is_service boolean, p_image_url text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE v_operator record; v_existing_branch_id uuid; v_target_id uuid := COALESCE(p_product_id, gen_random_uuid());
BEGIN
  SELECT * INTO v_operator FROM public.resolve_partner_operator(p_salesperson_id, p_pin, p_branch_id);
  IF v_operator.branch_id IS NULL THEN RAISE EXCEPTION 'É necessário informar uma filial válida.'; END IF;
  SELECT branch_id INTO v_existing_branch_id FROM public.partner_products WHERE id = v_target_id AND user_id = v_operator.user_id;
  IF p_product_id IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado nesta empresa.'; END IF;
  IF v_operator.role <> 'administrador' AND v_existing_branch_id IS NOT NULL AND v_existing_branch_id <> v_operator.branch_id THEN
    RAISE EXCEPTION 'Acesso negado: você não pode alterar produtos de outra filial.';
  END IF;
  INSERT INTO public.partner_products (id, user_id, branch_id, name, cost_price, sale_price, wholesale_price, stock, min_stock, category, sku, is_service, image_url, updated_at)
  VALUES (v_target_id, v_operator.user_id, v_operator.branch_id, p_name, COALESCE(p_cost_price, 0), COALESCE(p_sale_price, 0), COALESCE(p_wholesale_price, 0), COALESCE(p_stock, 0), COALESCE(p_min_stock, 5), p_category, p_sku, COALESCE(p_is_service, false), p_image_url, now())
  ON CONFLICT (id) DO UPDATE SET branch_id = EXCLUDED.branch_id, name = EXCLUDED.name, cost_price = EXCLUDED.cost_price, sale_price = EXCLUDED.sale_price, wholesale_price = EXCLUDED.wholesale_price, stock = EXCLUDED.stock, min_stock = EXCLUDED.min_stock, category = EXCLUDED.category, sku = EXCLUDED.sku, is_service = EXCLUDED.is_service, image_url = COALESCE(EXCLUDED.image_url, partner_products.image_url), updated_at = now();
  RETURN v_target_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.execute_partner_product_delete(p_salesperson_id uuid, p_pin text, p_product_id uuid)
RETURNS boolean AS $$
DECLARE v_operator record; v_branch_id uuid;
BEGIN
  SELECT * INTO v_operator FROM public.resolve_partner_operator(p_salesperson_id, p_pin, NULL);
  SELECT branch_id INTO v_branch_id FROM public.partner_products WHERE id = p_product_id AND user_id = v_operator.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado.'; END IF;
  IF v_operator.role <> 'administrador' AND v_operator.branch_id IS NOT NULL AND v_branch_id IS NOT NULL AND v_branch_id <> v_operator.branch_id THEN RAISE EXCEPTION 'Acesso negado: você não pode excluir produtos de outra filial.'; END IF;
  DELETE FROM public.partner_products WHERE id = p_product_id AND user_id = v_operator.user_id;
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.execute_partner_customer_mutation(
  p_salesperson_id uuid, p_pin text, p_customer_id uuid, p_branch_id uuid, p_name text, p_document text,
  p_person_type text, p_phone text, p_email text, p_birthday date, p_address text, p_neighborhood text,
  p_city text, p_device_model text, p_notes text, p_customer_type text
) RETURNS uuid AS $$
DECLARE v_operator record; v_existing_branch_id uuid; v_target_id uuid := COALESCE(p_customer_id, gen_random_uuid());
BEGIN
  SELECT * INTO v_operator FROM public.resolve_partner_operator(p_salesperson_id, p_pin, p_branch_id);
  SELECT branch_id INTO v_existing_branch_id FROM public.partner_customers WHERE id = v_target_id AND user_id = v_operator.user_id;
  IF p_customer_id IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado nesta empresa.'; END IF;
  IF v_operator.role <> 'administrador' AND v_existing_branch_id IS NOT NULL AND v_operator.branch_id IS NOT NULL AND v_existing_branch_id <> v_operator.branch_id THEN RAISE EXCEPTION 'Acesso negado: você não pode alterar clientes de outra filial.'; END IF;
  INSERT INTO public.partner_customers (id, user_id, branch_id, name, document, person_type, phone, email, birthday, address, neighborhood, city, device_model, notes, customer_type)
  VALUES (v_target_id, v_operator.user_id, v_operator.branch_id, p_name, p_document, p_person_type, p_phone, p_email, p_birthday, p_address, p_neighborhood, p_city, p_device_model, p_notes, COALESCE(p_customer_type, 'varejo'))
  ON CONFLICT (id) DO UPDATE SET branch_id = EXCLUDED.branch_id, name = EXCLUDED.name, document = EXCLUDED.document, person_type = EXCLUDED.person_type, phone = EXCLUDED.phone, email = EXCLUDED.email, birthday = EXCLUDED.birthday, address = EXCLUDED.address, neighborhood = EXCLUDED.neighborhood, city = EXCLUDED.city, device_model = EXCLUDED.device_model, notes = EXCLUDED.notes, customer_type = EXCLUDED.customer_type;
  RETURN v_target_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.execute_partner_customer_delete(p_salesperson_id uuid, p_pin text, p_customer_id uuid)
RETURNS boolean AS $$
DECLARE v_operator record; v_branch_id uuid;
BEGIN
  SELECT * INTO v_operator FROM public.resolve_partner_operator(p_salesperson_id, p_pin, NULL);
  SELECT branch_id INTO v_branch_id FROM public.partner_customers WHERE id = p_customer_id AND user_id = v_operator.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado.'; END IF;
  IF v_operator.role <> 'administrador' AND v_operator.branch_id IS NOT NULL AND v_branch_id IS NOT NULL AND v_branch_id <> v_operator.branch_id THEN RAISE EXCEPTION 'Acesso negado: você não pode excluir clientes de outra filial.'; END IF;
  DELETE FROM public.partner_customers WHERE id = p_customer_id AND user_id = v_operator.user_id;
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.execute_partner_sale_mutation(
  p_salesperson_id uuid, p_pin text, p_sale_id uuid, p_customer_id uuid, p_customer_name text, p_items jsonb,
  p_total numeric, p_imei text, p_serial_number text, p_payment_method text, p_branch_id uuid, p_status text, p_origin text
) RETURNS uuid AS $$
DECLARE v_operator record; v_existing_branch_id uuid; v_target_id uuid := COALESCE(p_sale_id, gen_random_uuid());
BEGIN
  SELECT * INTO v_operator FROM public.resolve_partner_operator(p_salesperson_id, p_pin, p_branch_id);
  IF v_operator.branch_id IS NULL THEN RAISE EXCEPTION 'Filial inválida.'; END IF;
  SELECT branch_id INTO v_existing_branch_id FROM public.partner_sales WHERE id = v_target_id AND user_id = v_operator.user_id;
  IF p_sale_id IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada nesta empresa.'; END IF;
  IF v_operator.role <> 'administrador' AND v_existing_branch_id IS NOT NULL AND v_existing_branch_id <> v_operator.branch_id THEN RAISE EXCEPTION 'Acesso negado: você não pode alterar vendas de outra filial.'; END IF;
  INSERT INTO public.partner_sales (id, user_id, customer_id, customer_name, items, total, imei, serial_number, payment_method, branch_id, salesperson_id, status, origin, payment_status, created_at)
  VALUES (v_target_id, v_operator.user_id, p_customer_id, p_customer_name, COALESCE(p_items, '[]'::jsonb), COALESCE(p_total, 0), p_imei, p_serial_number, p_payment_method, v_operator.branch_id, v_operator.salesperson_id, COALESCE(p_status, 'concluida'), COALESCE(p_origin, 'pdv'), CASE WHEN p_status = 'pre_venda' THEN 'pendente' ELSE 'pago' END, now())
  ON CONFLICT (id) DO UPDATE SET customer_id = EXCLUDED.customer_id, customer_name = EXCLUDED.customer_name, items = EXCLUDED.items, total = EXCLUDED.total, imei = EXCLUDED.imei, serial_number = EXCLUDED.serial_number, payment_method = EXCLUDED.payment_method, branch_id = EXCLUDED.branch_id, salesperson_id = EXCLUDED.salesperson_id, status = EXCLUDED.status, origin = EXCLUDED.origin, payment_status = EXCLUDED.payment_status;
  RETURN v_target_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.execute_partner_sale_delete(p_salesperson_id uuid, p_pin text, p_sale_id uuid)
RETURNS boolean AS $$
DECLARE v_operator record; v_branch_id uuid;
BEGIN
  SELECT * INTO v_operator FROM public.resolve_partner_operator(p_salesperson_id, p_pin, NULL);
  SELECT branch_id INTO v_branch_id FROM public.partner_sales WHERE id = p_sale_id AND user_id = v_operator.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada.'; END IF;
  IF v_operator.role <> 'administrador' AND v_operator.branch_id IS NOT NULL AND v_branch_id IS NOT NULL AND v_branch_id <> v_operator.branch_id THEN RAISE EXCEPTION 'Acesso negado: você não pode excluir vendas de outra filial.'; END IF;
  DELETE FROM public.partner_sales WHERE id = p_sale_id AND user_id = v_operator.user_id;
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.resolve_partner_operator(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_partner_product_mutation(uuid, text, uuid, uuid, text, numeric, numeric, numeric, integer, integer, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_partner_product_delete(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_partner_customer_mutation(uuid, text, uuid, uuid, text, text, text, text, text, date, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_partner_customer_delete(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_partner_sale_mutation(uuid, text, uuid, uuid, text, jsonb, numeric, text, text, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_partner_sale_delete(uuid, text, uuid) TO authenticated;