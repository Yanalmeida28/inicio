CREATE OR REPLACE FUNCTION public.execute_partner_open_order_customer_mutation(
  p_salesperson_id uuid, p_pin text, p_sale_id uuid, p_customer_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_operator record;
  v_sale public.partner_sales%ROWTYPE;
  v_customer public.partner_customers%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO v_operator FROM public.resolve_partner_pdv_operator(p_salesperson_id,p_pin,NULL);
  IF v_operator.role NOT IN ('administrador','gerente','caixa','vendedor') THEN
    RAISE EXCEPTION 'Operador sem permissão para alterar o cliente.';
  END IF;
  -- Use the same lock order as sale checkout/deletion before locking the row.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_sale_id::text,0));
  SELECT * INTO v_sale FROM public.partner_sales
  WHERE id=p_sale_id AND user_id=v_operator.company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado nesta empresa.'; END IF;
  IF v_operator.salesperson_id IS NOT NULL AND v_operator.branch_id IS DISTINCT FROM v_sale.branch_id THEN
    RAISE EXCEPTION 'Acesso negado: pedido pertence a outra filial.';
  END IF;
  IF v_sale.status IS NULL OR v_sale.status NOT IN ('aberta','pre_venda') THEN
    RAISE EXCEPTION 'Somente pedidos abertos e pré-vendas podem alterar o cliente.';
  END IF;
  IF v_sale.payment_status IS DISTINCT FROM 'pendente' OR COALESCE(v_sale.online_payment,false)
    OR EXISTS (SELECT 1 FROM public.partner_invoices WHERE sale_id=v_sale.id)
    OR EXISTS (SELECT 1 FROM public.partner_cash_movements WHERE sale_id=v_sale.id) THEN
    RAISE EXCEPTION 'Pedido com pagamento ou lançamento financeiro não pode alterar o cliente.';
  END IF;
  SELECT * INTO v_customer FROM public.partner_customers
  WHERE id=p_customer_id AND user_id=v_operator.company_id
    AND (branch_id IS NULL OR branch_id=v_sale.branch_id) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente inválido para esta filial.'; END IF;
  IF v_sale.customer_id IS NOT DISTINCT FROM v_customer.id AND v_sale.customer_name IS NOT DISTINCT FROM v_customer.name THEN
    RETURN true;
  END IF;
  -- Preserve the already authorized quote. Never accept client-supplied prices here.
  IF COALESCE(v_sale.origin,'pdv')='pdv' THEN
    UPDATE public.partner_pdv_price_snapshots SET customer_id=v_customer.id
    WHERE sale_id=v_sale.id
      AND ROW(user_id,branch_id,customer_id,customer_type,items,total)
        IS NOT DISTINCT FROM ROW(v_sale.user_id,v_sale.branch_id,v_sale.customer_id,v_sale.customer_type,v_sale.items,v_sale.total);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Este pedido não possui preços autorizados. Edite e salve os produtos antes de alterar o cliente.';
    END IF;
  END IF;
  UPDATE public.partner_sales SET customer_id=v_customer.id,customer_name=v_customer.name
  WHERE id=v_sale.id AND user_id=v_operator.company_id;
  INSERT INTO public.partner_audit_logs(id,user_id,actor_name,actor_role,action,entity_type,entity_id,details)
  VALUES(pg_catalog.gen_random_uuid()::text,v_operator.company_id,
    COALESCE((SELECT name FROM public.partner_salespeople WHERE id=v_operator.salesperson_id),'Proprietário'),
    v_operator.role,'alteracao_cliente_pedido','partner_sale',v_sale.id::text,
    'Cliente: ' || COALESCE(v_sale.customer_id::text,'sem cliente') || ' → ' || v_customer.id::text || '; produtos e valores preservados');
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.execute_partner_open_order_customer_mutation(uuid,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.execute_partner_open_order_customer_mutation(uuid,text,uuid,uuid) TO authenticated;
