-- Captured read-only from production on 2026-09-28. Baseline for review/tests only.
CREATE OR REPLACE FUNCTION public.execute_partner_sale_delete(p_salesperson_id uuid, p_pin text, p_sale_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company_id uuid;
  v_role text;
  v_branch uuid;
  v_sale_branch uuid;
  v_status text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado';
  END IF;

  IF p_salesperson_id IS NULL THEN
    v_company_id := (SELECT auth.uid());
    v_role := 'administrador';
  ELSE
    SELECT sp.user_id, sp.role, sp.branch_id
      INTO v_company_id, v_role, v_branch
    FROM public.partner_salespeople sp
    WHERE sp.id = p_salesperson_id
      AND sp.active = true
      AND public.verify_partner_salesperson_pin(p_pin, sp.pin_hash)
      AND (sp.user_id = (SELECT auth.uid()) OR sp.auth_user_id = (SELECT auth.uid()));

    IF v_company_id IS NULL THEN
      RAISE EXCEPTION 'Operador invalido ou PIN incorreto';
    END IF;
  END IF;

  -- Somente administrador ou gerente podem excluir vendas/pre-vendas.
  IF v_role NOT IN ('administrador','gerente') THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores ou gerentes podem excluir vendas.';
  END IF;

  SELECT s.branch_id, s.status
    INTO v_sale_branch, v_status
  FROM public.partner_sales s
  WHERE s.id = p_sale_id
    AND s.user_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda nao encontrada';
  END IF;

  IF v_role <> 'administrador'
     AND (v_branch IS NULL OR v_sale_branch IS DISTINCT FROM v_branch) THEN
    RAISE EXCEPTION 'Acesso negado a filial';
  END IF;

  IF v_status IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Vendas concluidas ou canceladas nao podem ser excluidas. Preserve o historico e utilize o cancelamento quando necessario.';
  END IF;

  IF v_status IS DISTINCT FROM 'pre_venda' THEN
    RAISE EXCEPTION 'Status da venda nao permite exclusao';
  END IF;

  DELETE FROM public.partner_sales
  WHERE id = p_sale_id
    AND user_id = v_company_id
    AND status = 'pre_venda';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda nao encontrada ou nao pode ser excluida';
  END IF;

  RETURN p_sale_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.execute_partner_sale_mutation(p_salesperson_id uuid, p_pin text, p_sale_id uuid, p_customer_id uuid, p_customer_name text, p_items jsonb, p_total numeric, p_imei text, p_serial_number text, p_payment_method text, p_branch_id uuid, p_status text, p_origin text, p_customer_type text, p_delivery_type text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company_id uuid; v_role text; v_branch uuid;
  v_existing_user uuid; v_old_status text; v_existing_branch uuid; v_existing_items jsonb;
  v_should_decrement boolean := false; v_should_restore boolean := false;
  v_item jsonb; v_product_branch uuid; v_stock integer; v_is_service boolean;
  v_quantity integer; v_credit_limit numeric; v_allow_credit boolean; v_credit_used numeric;
  v_target_id uuid := COALESCE(p_sale_id, pg_catalog.gen_random_uuid());
  v_actor_name text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('pre_venda','concluida','cancelada') THEN RAISE EXCEPTION 'Status de venda invalido'; END IF;
  IF p_total IS NULL OR p_total < 0 THEN RAISE EXCEPTION 'Total de venda invalido'; END IF;
  IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'Itens da venda invalidos'; END IF;

  IF p_salesperson_id IS NULL THEN
    v_company_id := (SELECT auth.uid()); v_role := 'administrador';
  ELSE
    SELECT sp.user_id,sp.role,sp.branch_id INTO v_company_id,v_role,v_branch
    FROM public.partner_salespeople sp
    WHERE sp.id=p_salesperson_id AND sp.active=true
      AND public.verify_partner_salesperson_pin(p_pin,sp.pin_hash)
      AND (sp.user_id=(SELECT auth.uid()) OR sp.auth_user_id=(SELECT auth.uid()));
    IF v_company_id IS NULL THEN RAISE EXCEPTION 'Operador invalido ou PIN incorreto'; END IF;
    IF v_role <> 'administrador' AND (v_branch IS NULL OR v_branch <> p_branch_id) THEN RAISE EXCEPTION 'Acesso negado a filial'; END IF;
  END IF;

  -- Cancelamento de venda e restrito a administrador ou gerente.
  IF p_status = 'cancelada' AND v_role NOT IN ('administrador','gerente') THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores ou gerentes podem cancelar vendas.';
  END IF;

  IF p_branch_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.partner_branches b WHERE b.id=p_branch_id AND b.user_id=v_company_id) THEN
    RAISE EXCEPTION 'Filial invalida';
  END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.partner_customers c WHERE c.id=p_customer_id AND c.user_id=v_company_id AND (c.branch_id IS NULL OR c.branch_id=p_branch_id)) THEN
    RAISE EXCEPTION 'Cliente invalido para esta filial';
  END IF;

  SELECT s.user_id,s.status,s.branch_id,s.items INTO v_existing_user,v_old_status,v_existing_branch,v_existing_items
  FROM public.partner_sales s WHERE s.id=v_target_id FOR UPDATE;
  IF v_existing_user IS NOT NULL AND v_existing_user<>v_company_id THEN RAISE EXCEPTION 'Venda nao pertence a empresa'; END IF;
  IF v_existing_user IS NOT NULL AND v_existing_branch IS DISTINCT FROM p_branch_id THEN RAISE EXCEPTION 'Venda nao pertence a filial informada'; END IF;
  IF v_existing_user IS NOT NULL AND v_old_status='cancelada' THEN RAISE EXCEPTION 'Venda cancelada e imutavel'; END IF;
  IF v_existing_user IS NOT NULL AND v_old_status='concluida' AND p_status<>'cancelada' THEN RAISE EXCEPTION 'Venda concluida nao pode ser editada'; END IF;

  v_should_decrement := p_status='concluida' AND (v_existing_user IS NULL OR v_old_status='pre_venda');
  v_should_restore := v_existing_user IS NOT NULL AND v_old_status='concluida' AND p_status='cancelada';

  IF v_should_decrement THEN
    FOR v_item IN
      SELECT pg_catalog.jsonb_build_object('product_id', product_id, 'quantity', total_qty)
      FROM (SELECT (x->>'product_id')::uuid AS product_id, SUM((x->>'quantity')::integer)::integer AS total_qty FROM pg_catalog.jsonb_array_elements(p_items) x GROUP BY (x->>'product_id')::uuid ORDER BY (x->>'product_id')::uuid) q
    LOOP
      v_quantity := (v_item->>'quantity')::integer;
      IF v_quantity <= 0 THEN RAISE EXCEPTION 'Quantidade invalida'; END IF;
      SELECT branch_id,stock,is_service INTO v_product_branch,v_stock,v_is_service FROM public.partner_products WHERE id=(v_item->>'product_id')::uuid AND user_id=v_company_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Produto invalido ou inexistente'; END IF;
      IF v_product_branch IS DISTINCT FROM p_branch_id THEN RAISE EXCEPTION 'Produto fora da filial da venda'; END IF;
      IF NOT COALESCE(v_is_service,false) AND v_stock < v_quantity THEN RAISE EXCEPTION 'Estoque insuficiente'; END IF;
    END LOOP;
  END IF;

  IF p_payment_method='faturado' AND p_status='concluida' THEN
    IF p_customer_id IS NULL THEN RAISE EXCEPTION 'Faturado B2B exige cliente'; END IF;
    SELECT c.credit_limit,COALESCE(c.allow_credit,false) INTO v_credit_limit,v_allow_credit FROM public.partner_customers c WHERE c.id=p_customer_id AND c.user_id=v_company_id FOR UPDATE;
    IF NOT COALESCE(v_allow_credit,false) THEN RAISE EXCEPTION 'Cliente sem credito permitido'; END IF;
    SELECT COALESCE(SUM(i.amount-COALESCE(i.paid_amount,0)),0) INTO v_credit_used FROM public.partner_invoices i WHERE i.user_id=v_company_id AND i.customer_id=p_customer_id AND i.status IN ('aberta','vencida','parcial','pending');
    IF COALESCE(v_credit_used,0)+p_total>COALESCE(v_credit_limit,0) THEN RAISE EXCEPTION 'Credito insuficiente para a venda'; END IF;
  END IF;

  IF v_should_decrement THEN
    FOR v_item IN
      SELECT pg_catalog.jsonb_build_object('product_id', product_id, 'quantity', total_qty)
      FROM (SELECT (x->>'product_id')::uuid AS product_id, SUM((x->>'quantity')::integer)::integer AS total_qty FROM pg_catalog.jsonb_array_elements(p_items) x GROUP BY (x->>'product_id')::uuid ORDER BY (x->>'product_id')::uuid) q
    LOOP
      v_quantity := (v_item->>'quantity')::integer;
      UPDATE public.partner_products SET stock=stock-v_quantity,updated_at=pg_catalog.now() WHERE id=(v_item->>'product_id')::uuid AND user_id=v_company_id AND branch_id=p_branch_id AND NOT is_service AND stock>=v_quantity;
      IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM public.partner_products WHERE id=(v_item->>'product_id')::uuid AND user_id=v_company_id AND branch_id=p_branch_id AND COALESCE(is_service,false)) THEN RAISE EXCEPTION 'Estoque insuficiente durante a baixa'; END IF;
      INSERT INTO public.stock_movements(user_id,product_id,product_name,type,quantity,reason,branch_id)
      SELECT v_company_id,p.id,p.name,'saida',v_quantity,'Saida por venda '||v_target_id::text,p_branch_id FROM public.partner_products p WHERE p.id=(v_item->>'product_id')::uuid AND p.user_id=v_company_id AND p.branch_id=p_branch_id AND NOT COALESCE(p.is_service,false);
    END LOOP;
  END IF;

  IF v_should_restore THEN
    FOR v_item IN SELECT pg_catalog.jsonb_build_object('product_id', product_id, 'quantity', total_qty) FROM (SELECT (x->>'product_id')::uuid AS product_id, SUM((x->>'quantity')::integer)::integer AS total_qty FROM pg_catalog.jsonb_array_elements(COALESCE(v_existing_items,'[]'::jsonb)) x GROUP BY (x->>'product_id')::uuid ORDER BY (x->>'product_id')::uuid) q LOOP
      v_quantity := (v_item->>'quantity')::integer;
      IF v_quantity <= 0 THEN RAISE EXCEPTION 'Quantidade invalida no historico da venda'; END IF;
      SELECT branch_id,is_service INTO v_product_branch,v_is_service FROM public.partner_products WHERE id=(v_item->>'product_id')::uuid AND user_id=v_company_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Produto do historico nao existe; cancelamento bloqueado'; END IF;
      IF v_product_branch IS DISTINCT FROM p_branch_id THEN RAISE EXCEPTION 'Produto fora da filial do estorno'; END IF;
      IF NOT COALESCE(v_is_service,false) THEN
        UPDATE public.partner_products SET stock=stock+v_quantity,updated_at=pg_catalog.now() WHERE id=(v_item->>'product_id')::uuid AND user_id=v_company_id AND branch_id=p_branch_id;
        INSERT INTO public.stock_movements(user_id,product_id,product_name,type,quantity,reason,branch_id) SELECT v_company_id,p.id,p.name,'entrada',v_quantity,'Estorno por cancelamento da venda '||v_target_id::text,p_branch_id FROM public.partner_products p WHERE p.id=(v_item->>'product_id')::uuid AND p.user_id=v_company_id AND p.branch_id=p_branch_id;
      END IF;
    END LOOP;
  END IF;

  IF v_existing_user IS NULL THEN
    IF p_status='cancelada' THEN RAISE EXCEPTION 'Nao e possivel criar venda cancelada'; END IF;
    INSERT INTO public.partner_sales(id,user_id,customer_id,customer_name,items,total,status,created_at,branch_id,salesperson_id,imei,serial_number,payment_method,origin,online_payment,payment_status,customer_type,delivery_type)
    VALUES(v_target_id,v_company_id,p_customer_id,p_customer_name,p_items,p_total,p_status,pg_catalog.now(),p_branch_id,p_salesperson_id,p_imei,p_serial_number,p_payment_method,COALESCE(p_origin,'pdv'),false,CASE WHEN p_status='concluida' AND p_payment_method<>'faturado' THEN 'pago' ELSE 'pendente' END,COALESCE(p_customer_type,'varejo'),COALESCE(p_delivery_type,'balcao'));
  ELSIF v_should_restore THEN
    UPDATE public.partner_sales SET status='cancelada' WHERE id=v_target_id AND user_id=v_company_id AND status='concluida';
    IF NOT FOUND THEN RAISE EXCEPTION 'Venda nao pode ser cancelada'; END IF;
  ELSE
    UPDATE public.partner_sales SET customer_id=p_customer_id,customer_name=p_customer_name,items=p_items,total=p_total,status=p_status,branch_id=p_branch_id,salesperson_id=COALESCE(p_salesperson_id,salesperson_id),imei=p_imei,serial_number=p_serial_number,payment_method=p_payment_method,origin=COALESCE(p_origin,origin),payment_status=CASE WHEN p_status='concluida' AND p_payment_method<>'faturado' THEN 'pago' ELSE payment_status END,customer_type=COALESCE(p_customer_type,customer_type),delivery_type=COALESCE(p_delivery_type,delivery_type) WHERE id=v_target_id AND user_id=v_company_id AND status='pre_venda';
    IF NOT FOUND THEN RAISE EXCEPTION 'Somente pre-vendas podem ser editadas'; END IF;
  END IF;

  IF p_payment_method='faturado' AND p_status='concluida' AND NOT v_should_restore THEN
    INSERT INTO public.partner_invoices(user_id,number,sale_id,customer_id,customer_name,amount,paid_amount,status,due_date,branch_id,salesperson_id)
    VALUES(v_company_id,'B2B-'||v_target_id::text,v_target_id,p_customer_id,p_customer_name,p_total,0,'aberta',CURRENT_DATE + 30,p_branch_id,p_salesperson_id)
    ON CONFLICT(sale_id) WHERE sale_id IS NOT NULL DO NOTHING;
  END IF;

  SELECT COALESCE(NULLIF(pg_catalog.btrim(pp.account_name),''),NULLIF(pg_catalog.btrim(pp.business_name),''),'Administrador') INTO v_actor_name
  FROM public.partner_profiles pp WHERE pp.id=v_company_id;
  INSERT INTO public.partner_audit_logs(id,user_id,actor_name,actor_role,action,entity_type,entity_id,details)
  VALUES(pg_catalog.gen_random_uuid()::text,v_company_id,COALESCE(v_actor_name,'Administrador'),COALESCE(v_role,'administrador'),CASE WHEN v_should_restore THEN 'cancelamento_venda' WHEN v_should_decrement THEN 'conclusao_venda' ELSE 'alteracao_pre_venda' END,'partner_sale',v_target_id::text,'Operacao de venda executada atomicamente com protecao de estoque e controle de transicao de status');

  RETURN v_target_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_partner_operator(p_salesperson_id uuid, p_pin text, p_requested_branch_id uuid)
 RETURNS TABLE(company_id uuid, salesperson_id uuid, role text, branch_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_auth_user uuid := (select auth.uid());
  v_company_id uuid;
  v_branch_id uuid;
  v_role text;
  v_pin_hash text;
begin
  if v_auth_user is null then
    raise exception 'Nao autenticado';
  end if;

  if p_salesperson_id is null then
    if not exists (
      select 1 from public.partner_profiles pp where pp.id = v_auth_user
    ) then
      raise exception 'Operador invalido';
    end if;
    return query select v_auth_user, null::uuid, 'administrador'::text, p_requested_branch_id;
    return;
  end if;

  select sp.user_id, sp.branch_id, sp.role, sp.pin_hash
    into v_company_id, v_branch_id, v_role, v_pin_hash
  from public.partner_salespeople sp
  where sp.id = p_salesperson_id
    and coalesce(sp.active, true) = true
    and (
      sp.auth_user_id = v_auth_user
      or (
        sp.auth_user_id is null
        and exists (
          select 1
          from public.partner_profiles pp
          where pp.id = v_auth_user
            and pp.id = sp.user_id
        )
      )
    );

  if v_company_id is null then
    raise exception 'Operador invalido ou PIN incorreto';
  end if;

  if v_pin_hash is null or not public.verify_partner_salesperson_pin(p_pin, v_pin_hash) then
    raise exception 'Operador invalido ou PIN incorreto';
  end if;

  if v_role <> 'administrador'
     and v_branch_id is not null
     and v_branch_id is distinct from p_requested_branch_id then
    raise exception 'Acesso negado a filial';
  end if;

  return query select v_company_id, p_salesperson_id, v_role, v_branch_id;
end;
$function$;
