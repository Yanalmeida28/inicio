-- Persist POS price table, service type, and customer credit without changing RLS.

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

CREATE FUNCTION public.execute_partner_customer_mutation(
  p_salesperson_id uuid, p_pin text, p_customer_id uuid, p_branch_id uuid, p_name text, p_document text,
  p_person_type text, p_phone text, p_email text, p_birthday date, p_address text, p_neighborhood text,
  p_city text, p_device_model text, p_notes text, p_customer_type text, p_credit_limit numeric
) RETURNS uuid AS $$
DECLARE v_operator record; v_existing_branch_id uuid; v_target_id uuid := COALESCE(p_customer_id, gen_random_uuid());
BEGIN
  SELECT * INTO v_operator FROM public.resolve_partner_operator(p_salesperson_id, p_pin, p_branch_id);
  SELECT branch_id INTO v_existing_branch_id FROM public.partner_customers WHERE id = v_target_id AND user_id = v_operator.user_id;
  IF p_customer_id IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado nesta empresa.'; END IF;
  IF v_operator.role <> 'administrador' AND v_existing_branch_id IS NOT NULL AND v_operator.branch_id IS NOT NULL AND v_existing_branch_id <> v_operator.branch_id THEN
    RAISE EXCEPTION 'Acesso negado: você não pode alterar clientes de outra filial.';
  END IF;
  INSERT INTO public.partner_customers (id, user_id, branch_id, name, document, person_type, phone, email, birthday, address, neighborhood, city, device_model, notes, customer_type, credit_limit)
  VALUES (v_target_id, v_operator.user_id, v_operator.branch_id, p_name, p_document, p_person_type, p_phone, p_email, p_birthday, p_address, p_neighborhood, p_city, p_device_model, p_notes, COALESCE(p_customer_type, 'varejo'), GREATEST(COALESCE(p_credit_limit, 0), 0))
  ON CONFLICT (id) DO UPDATE SET branch_id = EXCLUDED.branch_id, name = EXCLUDED.name, document = EXCLUDED.document, person_type = EXCLUDED.person_type, phone = EXCLUDED.phone, email = EXCLUDED.email, birthday = EXCLUDED.birthday, address = EXCLUDED.address, neighborhood = EXCLUDED.neighborhood, city = EXCLUDED.city, device_model = EXCLUDED.device_model, notes = EXCLUDED.notes, customer_type = EXCLUDED.customer_type, credit_limit = EXCLUDED.credit_limit;
  RETURN v_target_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP FUNCTION IF EXISTS public.execute_partner_sale_mutation(uuid, text, uuid, uuid, text, jsonb, numeric, text, text, text, uuid, text, text);

CREATE FUNCTION public.execute_partner_sale_mutation(
  p_salesperson_id uuid, p_pin text, p_sale_id uuid, p_customer_id uuid, p_customer_name text, p_items jsonb,
  p_total numeric, p_imei text, p_serial_number text, p_payment_method text, p_branch_id uuid, p_status text,
  p_origin text, p_customer_type text, p_delivery_type text
) RETURNS uuid AS $$
DECLARE v_operator record; v_existing_branch_id uuid; v_target_id uuid := COALESCE(p_sale_id, gen_random_uuid());
BEGIN
  SELECT * INTO v_operator FROM public.resolve_partner_operator(p_salesperson_id, p_pin, p_branch_id);
  IF v_operator.branch_id IS NULL THEN RAISE EXCEPTION 'Filial inválida.'; END IF;
  SELECT branch_id INTO v_existing_branch_id FROM public.partner_sales WHERE id = v_target_id AND user_id = v_operator.user_id;
  IF p_sale_id IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada nesta empresa.'; END IF;
  IF v_operator.role <> 'administrador' AND v_existing_branch_id IS NOT NULL AND v_existing_branch_id <> v_operator.branch_id THEN RAISE EXCEPTION 'Acesso negado: você não pode alterar vendas de outra filial.'; END IF;
  INSERT INTO public.partner_sales (id, user_id, customer_id, customer_name, items, total, imei, serial_number, payment_method, branch_id, salesperson_id, status, origin, payment_status, customer_type, delivery_type, created_at)
  VALUES (v_target_id, v_operator.user_id, p_customer_id, p_customer_name, COALESCE(p_items, '[]'::jsonb), COALESCE(p_total, 0), p_imei, p_serial_number, p_payment_method, v_operator.branch_id, v_operator.salesperson_id, COALESCE(p_status, 'concluida'), COALESCE(p_origin, 'pdv'), CASE WHEN p_status = 'pre_venda' THEN 'pendente' ELSE 'pago' END, COALESCE(p_customer_type, 'varejo'), COALESCE(p_delivery_type, 'balcao'), now())
  ON CONFLICT (id) DO UPDATE SET customer_id = EXCLUDED.customer_id, customer_name = EXCLUDED.customer_name, items = EXCLUDED.items, total = EXCLUDED.total, imei = EXCLUDED.imei, serial_number = EXCLUDED.serial_number, payment_method = EXCLUDED.payment_method, branch_id = EXCLUDED.branch_id, salesperson_id = EXCLUDED.salesperson_id, status = EXCLUDED.status, origin = EXCLUDED.origin, payment_status = EXCLUDED.payment_status, customer_type = EXCLUDED.customer_type, delivery_type = EXCLUDED.delivery_type;
  RETURN v_target_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.execute_partner_customer_mutation(uuid, text, uuid, uuid, text, text, text, text, text, date, text, text, text, text, text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_partner_sale_mutation(uuid, text, uuid, uuid, text, jsonb, numeric, text, text, text, uuid, text, text, text, text) TO authenticated;