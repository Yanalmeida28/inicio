ALTER TABLE public.partner_customers
  ADD COLUMN IF NOT EXISTS credit_limit numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.partner_sales
  ADD COLUMN IF NOT EXISTS customer_type text NOT NULL DEFAULT 'varejo',
  ADD COLUMN IF NOT EXISTS delivery_type text NOT NULL DEFAULT 'balcao';

ALTER TABLE public.partner_sales
  DROP CONSTRAINT IF EXISTS partner_sales_customer_type_check,
  ADD CONSTRAINT partner_sales_customer_type_check CHECK (customer_type IN ('varejo', 'atacado'));

ALTER TABLE public.partner_sales
  DROP CONSTRAINT IF EXISTS partner_sales_delivery_type_check,
  ADD CONSTRAINT partner_sales_delivery_type_check CHECK (delivery_type IN ('balcao', 'entrega', 'retirada'));

DROP FUNCTION IF EXISTS public.execute_partner_customer_mutation(uuid, text, uuid, uuid, text, text, text, text, text, date, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.execute_partner_customer_mutation(
  p_salesperson_id uuid, p_pin text, p_customer_id uuid, p_branch_id uuid,
  p_name text, p_document text, p_person_type text, p_phone text, p_email text,
  p_birthday date, p_address text, p_neighborhood text, p_city text,
  p_device_model text, p_notes text, p_customer_type text, p_credit_limit numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_company_id uuid;
  v_role text;
  v_branch uuid;
  v_existing uuid;
  v_target_id uuid := COALESCE(p_customer_id, gen_random_uuid());
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_salesperson_id IS NULL THEN
    v_company_id := (SELECT auth.uid());
  ELSE
    SELECT sp.user_id, sp.role, sp.branch_id INTO v_company_id, v_role, v_branch
    FROM public.partner_salespeople sp
    WHERE sp.id = p_salesperson_id AND sp.active = true AND sp.pin = p_pin
      AND (sp.user_id = (SELECT auth.uid()) OR sp.auth_user_id = (SELECT auth.uid()));
    IF v_company_id IS NULL THEN RAISE EXCEPTION 'Operador inválido ou PIN incorreto'; END IF;
    IF v_role <> 'administrador' AND (v_branch IS NULL OR v_branch <> p_branch_id) THEN
      RAISE EXCEPTION 'Acesso negado à filial';
    END IF;
  END IF;
  IF p_branch_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.partner_branches b WHERE b.id = p_branch_id AND b.user_id = v_company_id
  ) THEN RAISE EXCEPTION 'Filial inválida'; END IF;
  SELECT c.user_id INTO v_existing FROM public.partner_customers c WHERE c.id = v_target_id FOR UPDATE;
  IF v_existing IS NOT NULL AND v_existing <> v_company_id THEN RAISE EXCEPTION 'Cliente não pertence à empresa'; END IF;
  IF v_existing IS NULL THEN
    INSERT INTO public.partner_customers (
      id, user_id, branch_id, name, document, person_type, phone, email, birthday, address,
      neighborhood, city, device_model, notes, customer_type, credit_limit
    ) VALUES (
      v_target_id, v_company_id, p_branch_id, p_name, p_document, p_person_type, p_phone, p_email,
      p_birthday, p_address, p_neighborhood, p_city, p_device_model, p_notes,
      COALESCE(p_customer_type, 'varejo'), GREATEST(COALESCE(p_credit_limit, 0), 0)
    );
  ELSE
    UPDATE public.partner_customers SET
      branch_id = p_branch_id, name = p_name, document = p_document, person_type = p_person_type,
      phone = p_phone, email = p_email, birthday = p_birthday, address = p_address,
      neighborhood = p_neighborhood, city = p_city, device_model = p_device_model, notes = p_notes,
      customer_type = COALESCE(p_customer_type, 'varejo'),
      credit_limit = GREATEST(COALESCE(p_credit_limit, 0), 0)
    WHERE id = v_target_id AND user_id = v_company_id;
  END IF;
  RETURN v_target_id;
END;
$function$;

DROP FUNCTION IF EXISTS public.execute_partner_sale_mutation(uuid, text, uuid, uuid, text, jsonb, numeric, text, text, text, uuid, text, text);

CREATE OR REPLACE FUNCTION public.execute_partner_sale_mutation(
  p_salesperson_id uuid, p_pin text, p_sale_id uuid, p_customer_id uuid,
  p_customer_name text, p_items jsonb, p_total numeric, p_imei text,
  p_serial_number text, p_payment_method text, p_branch_id uuid, p_status text,
  p_origin text, p_customer_type text, p_delivery_type text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_company_id uuid;
  v_role text;
  v_branch uuid;
  v_existing_user uuid;
  v_old_status text;
  v_should_decrement boolean;
  v_item jsonb;
  v_product_branch uuid;
  v_stock integer;
  v_qty integer;
  v_is_service boolean;
  v_target_id uuid := COALESCE(p_sale_id, gen_random_uuid());
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_salesperson_id IS NULL THEN
    v_company_id := (SELECT auth.uid());
  ELSE
    SELECT sp.user_id, sp.role, sp.branch_id INTO v_company_id, v_role, v_branch
    FROM public.partner_salespeople sp
    WHERE sp.id = p_salesperson_id AND sp.active = true AND sp.pin = p_pin
      AND (sp.user_id = (SELECT auth.uid()) OR sp.auth_user_id = (SELECT auth.uid()));
    IF v_company_id IS NULL THEN RAISE EXCEPTION 'Operador inválido ou PIN incorreto'; END IF;
    IF v_role <> 'administrador' AND (v_branch IS NULL OR v_branch <> p_branch_id) THEN
      RAISE EXCEPTION 'Acesso negado à filial';
    END IF;
  END IF;
  IF p_branch_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.partner_branches b WHERE b.id = p_branch_id AND b.user_id = v_company_id
  ) THEN RAISE EXCEPTION 'Filial inválida'; END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.partner_customers c WHERE c.id = p_customer_id AND c.user_id = v_company_id
  ) THEN RAISE EXCEPTION 'Cliente inválido'; END IF;
  SELECT s.user_id, s.status INTO v_existing_user, v_old_status
  FROM public.partner_sales s WHERE s.id = v_target_id FOR UPDATE;
  IF v_existing_user IS NOT NULL AND v_existing_user <> v_company_id THEN RAISE EXCEPTION 'Venda não pertence à empresa'; END IF;
  v_should_decrement := p_status = 'concluida' AND (v_existing_user IS NULL OR COALESCE(v_old_status, '') = 'pre_venda');
  IF v_should_decrement THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
      v_qty := COALESCE((v_item->>'quantity')::integer, 0);
      IF v_qty <= 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
      SELECT branch_id, stock, is_service INTO v_product_branch, v_stock, v_is_service
      FROM public.partner_products
      WHERE id = (v_item->>'product_id')::uuid AND user_id = v_company_id
      FOR UPDATE;
      IF v_product_branch IS NULL OR v_product_branch <> p_branch_id THEN RAISE EXCEPTION 'Produto fora da filial da venda'; END IF;
      IF NOT COALESCE(v_is_service, false) AND v_stock < v_qty THEN RAISE EXCEPTION 'Estoque insuficiente'; END IF;
    END LOOP;
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
      v_qty := COALESCE((v_item->>'quantity')::integer, 0);
      UPDATE public.partner_products
      SET stock = stock - v_qty, updated_at = now()
      WHERE id = (v_item->>'product_id')::uuid AND user_id = v_company_id AND NOT is_service;
    END LOOP;
  END IF;
  IF v_existing_user IS NULL THEN
    INSERT INTO public.partner_sales (
      id, user_id, customer_id, customer_name, items, total, status, created_at, branch_id,
      salesperson_id, imei, serial_number, payment_method, origin, online_payment,
      payment_status, customer_type, delivery_type
    ) VALUES (
      v_target_id, v_company_id, p_customer_id, p_customer_name, COALESCE(p_items, '[]'::jsonb),
      COALESCE(p_total, 0), COALESCE(p_status, 'concluida'), now(), p_branch_id, p_salesperson_id,
      p_imei, p_serial_number, p_payment_method, COALESCE(p_origin, 'pdv'), false,
      CASE WHEN p_status = 'concluida' THEN 'pago' ELSE 'pendente' END,
      COALESCE(p_customer_type, 'varejo'), COALESCE(p_delivery_type, 'balcao')
    );
  ELSE
    UPDATE public.partner_sales SET
      customer_id = p_customer_id, customer_name = p_customer_name,
      items = COALESCE(p_items, '[]'::jsonb), total = COALESCE(p_total, 0), status = p_status,
      branch_id = p_branch_id, salesperson_id = COALESCE(p_salesperson_id, salesperson_id),
      imei = p_imei, serial_number = p_serial_number, payment_method = p_payment_method,
      origin = COALESCE(p_origin, 'pdv'),
      payment_status = CASE WHEN p_status = 'concluida' THEN 'pago' ELSE payment_status END,
      customer_type = COALESCE(p_customer_type, 'varejo'),
      delivery_type = COALESCE(p_delivery_type, 'balcao')
    WHERE id = v_target_id AND user_id = v_company_id;
  END IF;
  RETURN v_target_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.execute_partner_customer_mutation(uuid, text, uuid, uuid, text, text, text, text, text, date, text, text, text, text, text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_partner_sale_mutation(uuid, text, uuid, uuid, text, jsonb, numeric, text, text, text, uuid, text, text, text, text) TO authenticated;