-- Corrige o ciclo de estoque das vendas sem alterar migrations históricas.
-- pre_venda -> concluida: baixa.
-- concluida -> cancelada: estorno.
-- Todas as alterações de estoque e movimentos ocorrem na mesma transação.

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
  v_existing_branch uuid;
  v_existing_items jsonb;
  v_should_decrement boolean := false;
  v_should_restore boolean := false;
  v_item jsonb;
  v_product_branch uuid;
  v_stock integer;
  v_is_service boolean;
  v_quantity integer;
  v_credit_limit numeric;
  v_allow_credit boolean;
  v_credit_used numeric;
  v_target_id uuid := COALESCE(p_sale_id, pg_catalog.gen_random_uuid());
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('pre_venda', 'concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Status de venda invalido';
  END IF;
  IF p_salesperson_id IS NULL THEN
    v_company_id := (SELECT auth.uid());
    v_role := 'administrador';
  ELSE
    SELECT sp.user_id, sp.role, sp.branch_id INTO v_company_id, v_role, v_branch
    FROM public.partner_salespeople sp
    WHERE sp.id = p_salesperson_id
      AND sp.active = true
      AND sp.pin = p_pin
      AND (sp.user_id = (SELECT auth.uid()) OR sp.auth_user_id = (SELECT auth.uid()));
    IF v_company_id IS NULL THEN RAISE EXCEPTION 'Operador invalido ou PIN incorreto'; END IF;
    IF v_role <> 'administrador' AND (v_branch IS NULL OR v_branch <> p_branch_id) THEN
      RAISE EXCEPTION 'Acesso negado a filial';
    END IF;
  END IF;
  IF p_branch_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.partner_branches b
    WHERE b.id = p_branch_id AND b.user_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Filial invalida';
  END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.partner_customers c
    WHERE c.id = p_customer_id AND c.user_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Cliente invalido';
  END IF;

  SELECT s.user_id, s.status, s.branch_id, s.items
    INTO v_existing_user, v_old_status, v_existing_branch, v_existing_items
  FROM public.partner_sales s
  WHERE s.id = v_target_id
  FOR UPDATE;

  IF v_existing_user IS NOT NULL AND v_existing_user <> v_company_id THEN
    RAISE EXCEPTION 'Venda nao pertence a empresa';
  END IF;
  IF v_existing_user IS NOT NULL AND v_existing_branch IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Venda nao pertence a filial informada';
  END IF;
  IF v_existing_user IS NOT NULL AND v_old_status = 'cancelada' AND p_status <> 'cancelada' THEN
    RAISE EXCEPTION 'Venda cancelada nao pode voltar a um estado ativo';
  END IF;
  IF v_existing_user IS NOT NULL AND v_old_status = 'concluida' AND p_status NOT IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Venda concluida nao pode voltar para pre-venda';
  END IF;

  v_should_decrement := p_status = 'concluida'
    AND (v_existing_user IS NULL OR v_old_status = 'pre_venda');
  v_should_restore := v_existing_user IS NOT NULL
    AND v_old_status = 'concluida'
    AND p_status = 'cancelada';

  IF p_payment_method = 'faturado' AND p_status = 'concluida' THEN
    IF p_customer_id IS NULL THEN RAISE EXCEPTION 'Faturado B2B exige cliente'; END IF;
    SELECT c.credit_limit, COALESCE(c.allow_credit, false)
      INTO v_credit_limit, v_allow_credit
    FROM public.partner_customers c
    WHERE c.id = p_customer_id AND c.user_id = v_company_id
    FOR UPDATE;
    IF NOT COALESCE(v_allow_credit, false) THEN RAISE EXCEPTION 'Cliente sem credito permitido'; END IF;
    SELECT COALESCE(SUM(i.amount - COALESCE(i.paid_amount, 0)), 0)
      INTO v_credit_used
    FROM public.partner_invoices i
    WHERE i.user_id = v_company_id AND i.customer_id = p_customer_id AND i.status = 'aberta';
    IF COALESCE(v_credit_used, 0) + COALESCE(p_total, 0) > COALESCE(v_credit_limit, 0) THEN
      RAISE EXCEPTION 'Credito insuficiente para a venda';
    END IF;
  END IF;

  IF v_should_decrement THEN
    FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
      v_quantity := COALESCE((v_item->>'quantity')::integer, 0);
      IF v_quantity <= 0 THEN RAISE EXCEPTION 'Quantidade invalida'; END IF;
      SELECT branch_id, stock, is_service INTO v_product_branch, v_stock, v_is_service
      FROM public.partner_products
      WHERE id = (v_item->>'product_id')::uuid AND user_id = v_company_id
      FOR UPDATE;
      IF v_product_branch IS NULL OR v_product_branch <> p_branch_id THEN
        RAISE EXCEPTION 'Produto fora da filial da venda';
      END IF;
      IF NOT COALESCE(v_is_service, false) AND v_stock < v_quantity THEN
        RAISE EXCEPTION 'Estoque insuficiente';
      END IF;
    END LOOP;
    FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
      UPDATE public.partner_products
      SET stock = stock - COALESCE((v_item->>'quantity')::integer, 0), updated_at = pg_catalog.now()
      WHERE id = (v_item->>'product_id')::uuid
        AND user_id = v_company_id
        AND branch_id = p_branch_id
        AND NOT is_service;
    END LOOP;
  END IF;

  IF v_should_restore THEN
    FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(COALESCE(v_existing_items, '[]'::jsonb)) LOOP
      v_quantity := COALESCE((v_item->>'quantity')::integer, 0);
      IF v_quantity <= 0 THEN RAISE EXCEPTION 'Quantidade invalida no historico da venda'; END IF;
      SELECT branch_id, stock, is_service INTO v_product_branch, v_stock, v_is_service
      FROM public.partner_products
      WHERE id = (v_item->>'product_id')::uuid AND user_id = v_company_id
      FOR UPDATE;
      IF v_product_branch IS NULL OR v_product_branch <> p_branch_id THEN
        RAISE EXCEPTION 'Produto fora da filial do estorno';
      END IF;
    END LOOP;
    FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(COALESCE(v_existing_items, '[]'::jsonb)) LOOP
      SELECT is_service INTO v_is_service
      FROM public.partner_products
      WHERE id = (v_item->>'product_id')::uuid
        AND user_id = v_company_id
        AND branch_id = p_branch_id
      FOR UPDATE;
      IF NOT COALESCE(v_is_service, false) THEN
        UPDATE public.partner_products
        SET stock = stock + COALESCE((v_item->>'quantity')::integer, 0), updated_at = pg_catalog.now()
        WHERE id = (v_item->>'product_id')::uuid
          AND user_id = v_company_id
          AND branch_id = p_branch_id;
        INSERT INTO public.stock_movements (
          user_id, product_id, product_name, type, quantity, reason, branch_id
        )
        SELECT v_company_id, p.id, p.name, 'entrada', COALESCE((v_item->>'quantity')::integer, 0),
          'Estorno por cancelamento da venda ' || v_target_id::text, p_branch_id
        FROM public.partner_products p
        WHERE p.id = (v_item->>'product_id')::uuid
          AND p.user_id = v_company_id
          AND p.branch_id = p_branch_id;
      END IF;
    END LOOP;
  END IF;

  IF v_existing_user IS NULL THEN
    IF p_status = 'cancelada' THEN RAISE EXCEPTION 'Nao e possivel criar venda cancelada'; END IF;
    INSERT INTO public.partner_sales (
      id, user_id, customer_id, customer_name, items, total, status, created_at, branch_id,
      salesperson_id, imei, serial_number, payment_method, origin, online_payment,
      payment_status, customer_type, delivery_type
    ) VALUES (
      v_target_id, v_company_id, p_customer_id, p_customer_name, COALESCE(p_items, '[]'::jsonb),
      COALESCE(p_total, 0), p_status, pg_catalog.now(), p_branch_id, p_salesperson_id,
      p_imei, p_serial_number, p_payment_method, COALESCE(p_origin, 'pdv'), false,
      CASE WHEN p_status = 'concluida' AND p_payment_method <> 'faturado' THEN 'pago' ELSE 'pendente' END,
      COALESCE(p_customer_type, 'varejo'), COALESCE(p_delivery_type, 'balcao')
    );
  ELSE
    UPDATE public.partner_sales SET
      customer_id = p_customer_id, customer_name = p_customer_name,
      items = CASE WHEN p_status = 'cancelada' THEN items ELSE COALESCE(p_items, items) END,
      total = COALESCE(p_total, total), status = p_status,
      branch_id = p_branch_id, salesperson_id = COALESCE(p_salesperson_id, salesperson_id),
      imei = p_imei, serial_number = p_serial_number, payment_method = p_payment_method,
      origin = COALESCE(p_origin, origin),
      payment_status = CASE WHEN p_status = 'concluida' AND p_payment_method <> 'faturado' THEN 'pago' ELSE payment_status END,
      customer_type = COALESCE(p_customer_type, customer_type), delivery_type = COALESCE(p_delivery_type, delivery_type)
    WHERE id = v_target_id AND user_id = v_company_id;
  END IF;

  IF p_payment_method = 'faturado' AND p_status = 'concluida' THEN
    INSERT INTO public.partner_invoices (
      user_id, number, sale_id, customer_id, customer_name, amount, paid_amount,
      status, due_date, branch_id, salesperson_id
    ) VALUES (
      v_company_id, 'B2B-' || v_target_id::text, v_target_id, p_customer_id, p_customer_name,
      COALESCE(p_total, 0), 0, 'aberta', pg_catalog.current_date + 30, p_branch_id, p_salesperson_id
    ) ON CONFLICT (sale_id) WHERE sale_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN v_target_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.execute_partner_sale_mutation(uuid, text, uuid, uuid, text, jsonb, numeric, text, text, text, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_partner_sale_mutation(uuid, text, uuid, uuid, text, jsonb, numeric, text, text, text, uuid, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.execute_partner_sale_mutation(uuid, text, uuid, uuid, text, jsonb, numeric, text, text, text, uuid, text, text, text, text) TO authenticated;
