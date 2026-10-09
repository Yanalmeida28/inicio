-- One immutable sale, with one cash movement for each payment method.
DO $guard$ BEGIN
 IF md5(pg_get_functiondef('public.record_partner_cash_refund(uuid,uuid,text,uuid,uuid,numeric,text,uuid,text,uuid)'::regprocedure))<>'f0965429a156994b79e029d5ba5ec9d0' THEN RAISE EXCEPTION 'Cash or sale function changed since split payment review'; END IF;
 IF md5(pg_get_functiondef('public.execute_partner_sale_mutation(uuid,text,uuid,uuid,text,jsonb,numeric,text,text,text,uuid,text,text,text,text,uuid,numeric)'::regprocedure))<>'0052b999990c7aa5bb4b953c529352dc' THEN RAISE EXCEPTION 'Cash or sale function changed since split payment review'; END IF;
 IF md5(pg_get_functiondef('partner_cash_private.reverse_sale()'::regprocedure))<>'5a25e5e30d2803b5a3273be10d2336e4' THEN RAISE EXCEPTION 'Cash or sale function changed since split payment review'; END IF;
 IF md5(pg_get_functiondef('partner_cash_private.execute_partner_sale_mutation(uuid,text,uuid,uuid,text,jsonb,numeric,text,text,text,uuid,text,text,text,text,uuid,numeric)'::regprocedure))<>'d5b7420b093224aeabb86c8d696e6a2e' THEN RAISE EXCEPTION 'Cash or sale function changed since split payment review'; END IF;
END $guard$;
ALTER TABLE public.partner_sales ADD COLUMN payment_splits jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(payment_splits)='array');
DROP INDEX public.partner_cash_sale_once;
CREATE UNIQUE INDEX partner_cash_sale_once ON public.partner_cash_movements(sale_id,kind,payment_method) WHERE sale_id IS NOT NULL AND kind IN ('venda','estorno');
DROP FUNCTION public.execute_partner_sale_mutation(uuid,text,uuid,uuid,text,jsonb,numeric,text,text,text,uuid,text,text,text,text,uuid,numeric);
DROP FUNCTION partner_cash_private.execute_partner_sale_mutation(uuid,text,uuid,uuid,text,jsonb,numeric,text,text,text,uuid,text,text,text,text,uuid,numeric);
DROP FUNCTION public.record_partner_cash_refund(uuid,uuid,text,uuid,uuid,numeric,text,uuid,text,uuid);
CREATE OR REPLACE FUNCTION partner_cash_private.execute_partner_sale_mutation(p_salesperson_id uuid, p_pin text, p_sale_id uuid, p_customer_id uuid, p_customer_name text, p_items jsonb, p_total numeric, p_imei text, p_serial_number text, p_payment_method text, p_branch_id uuid, p_status text, p_origin text, p_customer_type text, p_delivery_type text, p_commercial_salesperson_id uuid DEFAULT NULL::uuid, p_freight_fee numeric DEFAULT NULL::numeric, p_payment_splits jsonb DEFAULT NULL)
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
  v_operator_id uuid; v_commercial_id uuid;
  v_existing_sale public.partner_sales%ROWTYPE;
  v_invoice public.partner_invoices%ROWTYPE;
  v_authorized_total numeric;
  v_freight_fee numeric;
  v_payments jsonb; v_split_item jsonb; v_split_amount numeric; v_split_sum numeric:=0;
  v_quote public.partner_pdv_price_snapshots%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('pre_venda','concluida','cancelada') THEN RAISE EXCEPTION 'Status de venda invalido'; END IF;
  IF p_total IS NULL OR p_total < 0 THEN RAISE EXCEPTION 'Total de venda invalido'; END IF;
  IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'Itens da venda invalidos'; END IF;

  SELECT op.company_id,op.salesperson_id,op.role,op.branch_id
    INTO v_company_id,v_operator_id,v_role,v_branch
  FROM public.resolve_partner_pdv_operator(p_salesperson_id,p_pin,p_branch_id) op;
  IF p_status='concluida' AND v_role NOT IN ('administrador','gerente','caixa','vendedor') THEN
    RAISE EXCEPTION 'Acesso negado para concluir vendas';
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

  -- Serializes retries even before the sale row exists.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_target_id::text,0));
  SELECT s.* INTO v_existing_sale FROM public.partner_sales s WHERE s.id=v_target_id FOR UPDATE;
  v_existing_user := v_existing_sale.user_id;
  v_old_status := v_existing_sale.status;
  v_existing_branch := v_existing_sale.branch_id;
  v_existing_items := v_existing_sale.items;
  v_freight_fee := COALESCE(p_freight_fee, v_existing_sale.freight_fee, 0);
  IF v_freight_fee < 0 OR v_freight_fee > 99999999.99 OR v_freight_fee <> round(v_freight_fee,2) OR v_freight_fee::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Frete invalido'; END IF;
  IF v_old_status='pre_venda' AND p_status='concluida' AND v_freight_fee IS DISTINCT FROM v_existing_sale.freight_fee THEN RAISE EXCEPTION 'Finalizacao nao pode alterar o frete da pre-venda'; END IF;
  IF v_existing_user IS NOT NULL AND v_existing_user<>v_company_id THEN RAISE EXCEPTION 'Venda nao pertence a empresa'; END IF;
  IF v_existing_user IS NOT NULL AND v_existing_branch IS DISTINCT FROM p_branch_id THEN RAISE EXCEPTION 'Venda nao pertence a filial informada'; END IF;
  IF v_existing_user IS NOT NULL AND v_old_status='cancelada' THEN RAISE EXCEPTION 'Venda cancelada e imutavel'; END IF;
  IF p_status='cancelada' THEN
    v_payments:=COALESCE(v_existing_sale.payment_splits,'[]'::jsonb);
  ELSIF p_payment_method='misto' THEN
    IF p_status<>'concluida' THEN RAISE EXCEPTION 'Pagamento dividido deve ser informado ao finalizar a venda'; END IF;
    v_payments:=COALESCE(p_payment_splits,CASE WHEN v_existing_sale.payment_method='misto' THEN v_existing_sale.payment_splits END,'[]'::jsonb);
    IF jsonb_typeof(v_payments) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Pagamentos invalidos'; END IF;
    IF jsonb_array_length(v_payments)<2 OR jsonb_array_length(v_payments)>3 THEN RAISE EXCEPTION 'Informe duas ou tres formas de pagamento'; END IF;
    FOR v_split_item IN SELECT value FROM jsonb_array_elements(v_payments) LOOP
      IF jsonb_typeof(v_split_item) IS DISTINCT FROM 'object' OR COALESCE(v_split_item->>'method','') NOT IN ('dinheiro','pix','cartao') OR jsonb_typeof(v_split_item->'amount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Forma ou valor de pagamento invalido'; END IF;
      v_split_amount:=(v_split_item->>'amount')::numeric;
      IF v_split_amount<=0 OR v_split_amount>99999999.99 OR round(v_split_amount,2)<>v_split_amount THEN RAISE EXCEPTION 'Valor de pagamento invalido'; END IF;
      v_split_sum:=v_split_sum+v_split_amount;
    END LOOP;
    IF (SELECT count(DISTINCT value->>'method') FROM jsonb_array_elements(v_payments))<>jsonb_array_length(v_payments) THEN RAISE EXCEPTION 'Formas de pagamento repetidas'; END IF;
    IF v_split_sum IS DISTINCT FROM p_total+v_freight_fee THEN RAISE EXCEPTION 'Soma dos pagamentos diverge do total incluindo frete'; END IF;
    SELECT jsonb_agg(jsonb_build_object('method',value->>'method','amount',(value->>'amount')::numeric) ORDER BY value->>'method') INTO v_payments FROM jsonb_array_elements(v_payments);
  ELSE
    IF COALESCE(p_payment_splits,'[]'::jsonb) IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'Pagamento unico nao pode conter divisao'; END IF;
    v_payments:='[]'::jsonb;
  END IF;
  v_commercial_id := CASE WHEN v_existing_user IS NOT NULL
    THEN COALESCE(p_commercial_salesperson_id,v_existing_sale.salesperson_id)
    ELSE COALESCE(p_commercial_salesperson_id,v_operator_id) END;
  IF p_status <> 'cancelada' AND (v_existing_user IS NULL OR v_old_status='pre_venda')
     AND v_commercial_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.partner_salespeople sp WHERE sp.id=v_commercial_id
      AND sp.user_id=v_company_id AND (sp.branch_id IS NULL OR sp.branch_id=p_branch_id)
  ) THEN RAISE EXCEPTION 'Vendedor comercial invalido para esta filial'; END IF;

  IF v_existing_user IS NOT NULL AND p_status<>'cancelada' AND (
    v_old_status='concluida' OR (v_old_status='pre_venda' AND p_status='pre_venda' AND EXISTS (
      SELECT 1 FROM public.partner_pdv_price_snapshots q WHERE q.sale_id=v_target_id
        AND ROW(q.user_id,q.branch_id,q.customer_id,q.customer_type,q.items,q.total)
          IS NOT DISTINCT FROM ROW(v_company_id,p_branch_id,p_customer_id,COALESCE(p_customer_type,'varejo'),p_items,p_total)
    ))
  ) THEN
    -- Retry is a read of the same operation, never an edit or another stock/invoice write.
    IF p_status=v_old_status
      AND v_existing_sale.customer_id IS NOT DISTINCT FROM p_customer_id
      AND v_existing_sale.customer_name IS NOT DISTINCT FROM p_customer_name
      AND v_existing_sale.items IS NOT DISTINCT FROM p_items
      AND v_existing_sale.total IS NOT DISTINCT FROM p_total
      AND v_existing_sale.freight_fee IS NOT DISTINCT FROM v_freight_fee
      AND v_existing_sale.payment_method IS NOT DISTINCT FROM p_payment_method
      AND v_existing_sale.payment_splits IS NOT DISTINCT FROM v_payments
      AND v_existing_sale.imei IS NOT DISTINCT FROM p_imei
      AND v_existing_sale.serial_number IS NOT DISTINCT FROM p_serial_number
      AND v_existing_sale.origin IS NOT DISTINCT FROM COALESCE(p_origin,'pdv')
      AND v_existing_sale.customer_type IS NOT DISTINCT FROM COALESCE(p_customer_type,'varejo')
      AND v_existing_sale.delivery_type IS NOT DISTINCT FROM COALESCE(p_delivery_type,'balcao')
      AND v_existing_sale.salesperson_id IS NOT DISTINCT FROM v_commercial_id
    THEN RETURN v_target_id; END IF;
    IF v_old_status='concluida' THEN
      RAISE EXCEPTION 'Venda concluida nao pode ser editada; tentativa com dados diferentes';
    END IF;
  END IF;

  -- Validate finance before credit and physical stock. Historical exact retries returned above.
  IF p_status<>'cancelada' THEN
    IF v_old_status='pre_venda' AND p_status='concluida' THEN
      IF ROW(p_customer_id,COALESCE(p_customer_type,'varejo'),p_items,p_total)
        IS DISTINCT FROM ROW(v_existing_sale.customer_id,v_existing_sale.customer_type,v_existing_sale.items,v_existing_sale.total) THEN
        RAISE EXCEPTION 'Finalizacao nao pode alterar os dados financeiros da pre-venda';
      END IF;
      SELECT q.* INTO v_quote FROM public.partner_pdv_price_snapshots q WHERE q.sale_id=v_target_id;
      IF FOUND THEN
        IF ROW(v_quote.user_id,v_quote.branch_id,v_quote.customer_id,v_quote.customer_type,v_quote.items,v_quote.total)
          IS DISTINCT FROM ROW(v_company_id,p_branch_id,p_customer_id,COALESCE(p_customer_type,'varejo'),p_items,p_total) THEN
          RAISE EXCEPTION 'Pre-venda diverge da precificacao autorizada';
        END IF;
        v_authorized_total := v_quote.total;
      ELSE
        -- Legacy prices were client supplied: accept only if still provable against the catalog.
        -- No silent repricing or blanket approval of historical quotes.
        v_authorized_total := partner_cash_private.validate_partner_pdv_negotiated_prices(v_company_id,p_branch_id,p_customer_id,COALESCE(p_customer_type,'varejo'),p_items,p_total,
    (v_role='gerente' OR (v_role='administrador' AND (SELECT auth.uid())=v_company_id))
    AND NOT COALESCE(v_old_status='pre_venda' AND p_status='concluida',false));
      END IF;
    ELSE
      v_authorized_total := partner_cash_private.validate_partner_pdv_negotiated_prices(v_company_id,p_branch_id,p_customer_id,COALESCE(p_customer_type,'varejo'),p_items,p_total,
    (v_role='gerente' OR (v_role='administrador' AND (SELECT auth.uid())=v_company_id))
    AND NOT COALESCE(v_old_status='pre_venda' AND p_status='concluida',false));
    END IF;
    INSERT INTO public.partner_pdv_price_snapshots(sale_id,user_id,branch_id,customer_id,customer_type,items,total)
    VALUES(v_target_id,v_company_id,p_branch_id,p_customer_id,COALESCE(p_customer_type,'varejo'),p_items,v_authorized_total)
    ON CONFLICT(sale_id) DO UPDATE SET user_id=EXCLUDED.user_id,branch_id=EXCLUDED.branch_id,
      customer_id=EXCLUDED.customer_id,customer_type=EXCLUDED.customer_type,items=EXCLUDED.items,total=EXCLUDED.total;
  ELSE
    v_authorized_total := v_existing_sale.total;
  END IF;

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
    IF COALESCE(v_credit_used,0)+v_authorized_total+v_freight_fee>COALESCE(v_credit_limit,0) THEN RAISE EXCEPTION 'Credito insuficiente para a venda'; END IF;
  END IF;

  IF v_should_decrement THEN
    FOR v_item IN
      SELECT pg_catalog.jsonb_build_object('product_id', product_id, 'quantity', total_qty)
      FROM (SELECT (x->>'product_id')::uuid AS product_id, SUM((x->>'quantity')::integer)::integer AS total_qty FROM pg_catalog.jsonb_array_elements(p_items) x GROUP BY (x->>'product_id')::uuid ORDER BY (x->>'product_id')::uuid) q
    LOOP
      v_quantity := (v_item->>'quantity')::integer;
      UPDATE public.partner_products SET stock=stock-v_quantity,updated_at=pg_catalog.now() WHERE id=(v_item->>'product_id')::uuid AND user_id=v_company_id AND branch_id=p_branch_id AND NOT COALESCE(is_service,false) AND stock>=v_quantity;
      IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM public.partner_products WHERE id=(v_item->>'product_id')::uuid AND user_id=v_company_id AND branch_id=p_branch_id AND COALESCE(is_service,false)) THEN RAISE EXCEPTION 'Estoque insuficiente durante a baixa'; END IF;
      INSERT INTO public.stock_movements(user_id,product_id,product_name,type,quantity,reason,branch_id)
      SELECT v_company_id,p.id,p.name,'saida',v_quantity,'Saida por venda '||v_target_id::text,p_branch_id FROM public.partner_products p WHERE p.id=(v_item->>'product_id')::uuid AND p.user_id=v_company_id AND p.branch_id=p_branch_id AND NOT COALESCE(p.is_service,false);
    END LOOP;
  END IF;

  IF v_should_restore THEN
    SELECT i.* INTO v_invoice FROM public.partner_invoices i
    WHERE i.sale_id=v_target_id AND i.user_id=v_company_id FOR UPDATE;
    IF FOUND THEN
      IF COALESCE(v_invoice.paid_amount,0)>0 OR v_invoice.status IN ('parcial','paga') THEN
        RAISE EXCEPTION 'Cancelamento bloqueado: a fatura possui recebimentos. E necessario um fluxo de estorno financeiro antes de cancelar a venda.';
      END IF;
      IF v_invoice.status NOT IN ('aberta','cancelada') THEN
        RAISE EXCEPTION 'Cancelamento bloqueado: status da fatura requer revisao financeira';
      END IF;
    ELSIF v_existing_sale.payment_method='faturado' THEN
      RAISE EXCEPTION 'Cancelamento bloqueado: fatura da venda nao localizada para conciliacao';
    END IF;
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
    INSERT INTO public.partner_sales(id,user_id,customer_id,customer_name,items,total,status,created_at,branch_id,salesperson_id,imei,serial_number,payment_method,origin,online_payment,payment_status,customer_type,delivery_type,freight_fee,payment_splits)
    VALUES(v_target_id,v_company_id,p_customer_id,p_customer_name,p_items,v_authorized_total,p_status,pg_catalog.now(),p_branch_id,v_commercial_id,p_imei,p_serial_number,p_payment_method,COALESCE(p_origin,'pdv'),false,CASE WHEN p_status='concluida' AND p_payment_method<>'faturado' THEN 'pago' ELSE 'pendente' END,COALESCE(p_customer_type,'varejo'),COALESCE(p_delivery_type,'balcao'),v_freight_fee,v_payments);
  ELSIF v_should_restore THEN
    UPDATE public.partner_sales SET status='cancelada',payment_status=CASE WHEN payment_method='faturado' THEN 'cancelado' ELSE payment_status END WHERE id=v_target_id AND user_id=v_company_id AND status='concluida';
    IF NOT FOUND THEN RAISE EXCEPTION 'Venda nao pode ser cancelada'; END IF;
    UPDATE public.partner_invoices SET status='cancelada'
    WHERE id=v_invoice.id AND user_id=v_company_id AND status='aberta' AND paid_amount=0;
  ELSE
    UPDATE public.partner_sales SET customer_id=p_customer_id,customer_name=p_customer_name,items=p_items,total=v_authorized_total,freight_fee=v_freight_fee,payment_splits=v_payments,status=p_status,branch_id=p_branch_id,salesperson_id=v_commercial_id,imei=p_imei,serial_number=p_serial_number,payment_method=p_payment_method,origin=COALESCE(p_origin,origin),payment_status=CASE WHEN p_status='concluida' AND p_payment_method<>'faturado' THEN 'pago' ELSE payment_status END,customer_type=COALESCE(p_customer_type,customer_type),delivery_type=COALESCE(p_delivery_type,delivery_type) WHERE id=v_target_id AND user_id=v_company_id AND status='pre_venda';
    IF NOT FOUND THEN RAISE EXCEPTION 'Somente pre-vendas podem ser editadas'; END IF;
  END IF;

  IF p_payment_method='faturado' AND p_status='concluida' AND NOT v_should_restore THEN
    INSERT INTO public.partner_invoices(user_id,number,sale_id,customer_id,customer_name,amount,paid_amount,status,due_date,branch_id,salesperson_id)
    VALUES(v_company_id,'B2B-'||v_target_id::text,v_target_id,p_customer_id,p_customer_name,v_authorized_total+v_freight_fee,0,'aberta',CURRENT_DATE + 30,p_branch_id,v_commercial_id)
    ON CONFLICT(sale_id) WHERE sale_id IS NOT NULL DO NOTHING;
  END IF;

  SELECT COALESCE(NULLIF(pg_catalog.btrim(pp.account_name),''),NULLIF(pg_catalog.btrim(pp.business_name),''),'Administrador') INTO v_actor_name
  FROM public.partner_profiles pp WHERE pp.id=v_company_id;
  INSERT INTO public.partner_audit_logs(id,user_id,actor_name,actor_role,action,entity_type,entity_id,details)
  VALUES(pg_catalog.gen_random_uuid()::text,v_company_id,COALESCE(v_actor_name,'Administrador'),COALESCE(v_role,'administrador'),CASE WHEN v_should_restore THEN 'cancelamento_venda' WHEN v_should_decrement THEN 'conclusao_venda' ELSE 'alteracao_pre_venda' END,'partner_sale',v_target_id::text,'Operacao de venda executada atomicamente com protecao de estoque e controle de transicao de status');

  RETURN v_target_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.execute_partner_sale_mutation(p_salesperson_id uuid, p_pin text, p_sale_id uuid, p_customer_id uuid, p_customer_name text, p_items jsonb, p_total numeric, p_imei text, p_serial_number text, p_payment_method text, p_branch_id uuid, p_status text, p_origin text, p_customer_type text, p_delivery_type text, p_commercial_salesperson_id uuid DEFAULT NULL::uuid, p_freight_fee numeric DEFAULT NULL::numeric, p_payment_splits jsonb DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE op record; s public.partner_cash_sessions%ROWTYPE; v_id uuid; v_old_status text; v_actor uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
 SELECT * INTO op FROM public.resolve_partner_pdv_operator(p_salesperson_id,p_pin,p_branch_id);
 v_actor:=COALESCE(op.salesperson_id,op.company_id);
 PERFORM pg_advisory_xact_lock(hashtextextended(op.company_id::text||p_branch_id::text||v_actor::text,1));
 -- Coordinate with existing idempotent sale/delete locks before reading status.
 IF p_sale_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(p_sale_id::text,0)); END IF;
 SELECT status INTO v_old_status FROM public.partner_sales WHERE id=p_sale_id;
 IF p_status='cancelada' THEN
   -- Same order as checkout: cash session before the authoritative stock locks.
   -- Otherwise a cancellation could hold stock while waiting for a checkout's cash row.
   PERFORM 1 FROM public.partner_cash_sessions cs JOIN public.partner_cash_movements cm ON cm.session_id=cs.id
   WHERE cm.sale_id=p_sale_id AND cm.kind='venda' FOR UPDATE OF cs;
 END IF;
 IF p_status='concluida' AND v_old_status IS DISTINCT FROM 'concluida' THEN
   SELECT * INTO s FROM public.partner_cash_sessions WHERE user_id=op.company_id AND branch_id=p_branch_id AND actor_key=v_actor AND closed_at IS NULL FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Abra o caixa desta filial e operador antes de finalizar a venda'; END IF;
   IF p_payment_method IS NULL OR p_payment_method NOT IN ('dinheiro','pix','cartao','faturado','misto') THEN RAISE EXCEPTION 'Forma de pagamento inválida'; END IF;
 END IF;
 v_id:=partner_cash_private.execute_partner_sale_mutation(p_salesperson_id,p_pin,p_sale_id,p_customer_id,p_customer_name,p_items,p_total,
   p_imei,p_serial_number,p_payment_method,p_branch_id,p_status,p_origin,p_customer_type,p_delivery_type,p_commercial_salesperson_id,p_freight_fee,p_payment_splits);
 IF s.id IS NOT NULL THEN
   IF p_payment_method='misto' THEN
    INSERT INTO public.partner_cash_movements(session_id,kind,payment_method,amount,reason,sale_id)
    SELECT s.id,'venda',part->>'method',(part->>'amount')::numeric,'Pagamento dividido da venda (inclui frete)',v_id
    FROM public.partner_sales ps CROSS JOIN LATERAL jsonb_array_elements(ps.payment_splits) part WHERE ps.id=v_id;
   ELSE
    INSERT INTO public.partner_cash_movements(session_id,kind,payment_method,amount,reason,sale_id)
    SELECT s.id,'venda',p_payment_method,ps.total+ps.freight_fee,'Venda finalizada (inclui frete para repasse)',v_id FROM public.partner_sales ps WHERE ps.id=v_id;
   END IF;
 END IF;
 RETURN v_id;
END $function$
;
CREATE OR REPLACE FUNCTION partner_cash_private.reverse_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $reverse$
DECLARE s public.partner_cash_sessions%ROWTYPE; m public.partner_cash_movements%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' AND NOT (OLD.status='concluida' AND NEW.status='cancelada') THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_cash_movements WHERE sale_id=OLD.id AND kind='devolucao') THEN RAISE EXCEPTION 'Venda com devolução financeira não pode ser cancelada ou excluída; preserve o histórico'; END IF;
 FOR m IN SELECT * FROM public.partner_cash_movements WHERE sale_id=OLD.id AND kind='venda' ORDER BY payment_method LOOP
  IF NOT EXISTS(SELECT 1 FROM public.partner_cash_movements WHERE sale_id=OLD.id AND kind='estorno' AND payment_method=m.payment_method) THEN
   SELECT * INTO s FROM public.partner_cash_sessions WHERE id=m.session_id FOR UPDATE;
   IF s.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Venda vinculada a caixa fechado. O fechamento e imutavel; nao e possivel cancelar ou apagar esta venda'; END IF;
   INSERT INTO public.partner_cash_movements(session_id,kind,payment_method,amount,reason,sale_id) VALUES(m.session_id,'estorno',m.payment_method,m.amount,'Cancelamento ou exclusao de venda',OLD.id);
  END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $reverse$;

CREATE OR REPLACE FUNCTION public.record_partner_cash_refund(p_branch_id uuid, p_salesperson_id uuid, p_pin text, p_session_id uuid, p_sale_id uuid, p_amount numeric, p_reason text, p_supervisor_id uuid, p_supervisor_pin text, p_request_id uuid, p_refund_method text DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_operator record;
  v_supervisor record;
  v_session public.partner_cash_sessions%ROWTYPE;
  v_sale public.partner_sales%ROWTYPE;
  v_original public.partner_cash_movements%ROWTYPE;
  v_existing public.partner_cash_movements%ROWTYPE;
  v_existing_user uuid;
  v_existing_branch uuid;
  v_existing_actor uuid;
  v_refunded numeric;
  v_authorizer uuid;
BEGIN PERFORM partner_subscription_private.require_operator_module('caixa',p_salesperson_id); PERFORM partner_subscription_private.require_actor('caixa');
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_request_id IS NULL OR p_sale_id IS NULL OR p_session_id IS NULL THEN
    RAISE EXCEPTION 'Dados obrigatórios da devolução ausentes';
  END IF;
  IF p_amount IS NULL OR p_amount::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_amount <= 0 OR p_amount > 99999999.99 OR round(p_amount, 2) <> p_amount THEN
    RAISE EXCEPTION 'Valor de devolução inválido';
  END IF;
  IF length(trim(COALESCE(p_reason, ''))) = 0 OR length(p_reason) > 500 THEN
    RAISE EXCEPTION 'Informe um motivo válido para a devolução';
  END IF;

  SELECT * INTO v_operator
  FROM public.resolve_partner_pdv_operator(p_salesperson_id, p_pin, p_branch_id);
  IF v_operator.role NOT IN ('administrador', 'gerente', 'caixa') THEN
    RAISE EXCEPTION 'Sem permissão para registrar devoluções';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.partner_branches b
    WHERE b.id = p_branch_id AND b.user_id = v_operator.company_id
  ) THEN RAISE EXCEPTION 'Filial inválida'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_operator.company_id::text || p_branch_id::text ||
      COALESCE(v_operator.salesperson_id, v_operator.company_id)::text, 1
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 9));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_sale_id::text, 7));

  SELECT m.*
  INTO v_existing
  FROM public.partner_cash_movements m
  JOIN public.partner_cash_sessions s ON s.id = m.session_id
  WHERE m.request_id = p_request_id
  FOR UPDATE OF m, s;
  IF FOUND THEN
    SELECT s.user_id, s.branch_id, s.actor_key
    INTO v_existing_user, v_existing_branch, v_existing_actor
    FROM public.partner_cash_sessions s
    WHERE s.id = v_existing.session_id;
    IF v_existing_user <> v_operator.company_id
      OR v_existing_branch <> p_branch_id
      OR v_existing_actor <> COALESCE(v_operator.salesperson_id, v_operator.company_id) THEN
      RAISE EXCEPTION 'Operação não pertence a este operador ou filial';
    END IF;
    IF ROW(v_existing.session_id, v_existing.sale_id, v_existing.kind, v_existing.amount, v_existing.reason)
      IS DISTINCT FROM ROW(p_session_id, p_sale_id, 'devolucao', p_amount, trim(p_reason)) THEN
      RAISE EXCEPTION 'Operação repetida com dados diferentes';
    END IF;
    IF p_refund_method IS NOT NULL AND v_existing.payment_method IS DISTINCT FROM p_refund_method THEN RAISE EXCEPTION 'Operacao repetida com dados diferentes'; END IF;
    RETURN v_existing.session_id;
  END IF;

  SELECT * INTO v_session
  FROM public.partner_cash_sessions
  WHERE id = p_session_id AND user_id = v_operator.company_id
    AND branch_id = p_branch_id
    AND actor_key = COALESCE(v_operator.salesperson_id, v_operator.company_id)
  FOR UPDATE;
  IF NOT FOUND OR v_session.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'A devolução exige um caixa aberto do operador nesta filial';
  END IF;

  IF p_supervisor_id IS NULL AND v_operator.role IN ('administrador', 'gerente') THEN
    v_authorizer := COALESCE(v_operator.salesperson_id, v_operator.company_id);
  ELSE
    SELECT sp.id, sp.user_id, sp.role, sp.branch_id
    INTO v_supervisor
    FROM public.partner_salespeople sp
    WHERE sp.id = p_supervisor_id AND sp.user_id = v_operator.company_id
      AND sp.active = true
      AND sp.role IN ('administrador', 'gerente')
      AND (sp.role = 'administrador' OR sp.branch_id = p_branch_id)
      AND public.verify_partner_salesperson_pin(p_supervisor_pin, sp.pin_hash);
    IF NOT FOUND THEN RAISE EXCEPTION 'Responsável inválido ou PIN incorreto'; END IF;
    v_authorizer := v_supervisor.id;
  END IF;

  SELECT * INTO v_sale
  FROM public.partner_sales
  WHERE id = p_sale_id AND user_id = v_operator.company_id
    AND branch_id = p_branch_id AND status = 'concluida'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda concluída não encontrada nesta filial'; END IF;

  IF p_refund_method IS NULL AND (SELECT count(DISTINCT payment_method) FROM public.partner_cash_movements WHERE sale_id=p_sale_id AND kind='venda')>1 THEN RAISE EXCEPTION 'Selecione a forma de pagamento da devolucao'; END IF;
  SELECT * INTO v_original
  FROM public.partner_cash_movements
  WHERE sale_id = p_sale_id AND kind = 'venda' AND (p_refund_method IS NULL OR payment_method=p_refund_method)
  FOR UPDATE;
  IF NOT FOUND OR v_original.payment_method NOT IN ('dinheiro', 'pix', 'cartao') THEN
    RAISE EXCEPTION 'A venda não possui recebimento elegível para devolução pelo Caixa';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.partner_cash_sessions original_session
    WHERE original_session.id = v_original.session_id
      AND original_session.user_id = v_operator.company_id
      AND original_session.branch_id = p_branch_id
      AND original_session.closed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Devoluções financeiras pelo Caixa são permitidas somente após o fechamento da sessão original';
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO v_refunded
  FROM public.partner_cash_movements
  WHERE sale_id = p_sale_id AND kind IN ('estorno', 'devolucao') AND payment_method=v_original.payment_method;
  IF v_refunded + p_amount > v_original.amount THEN
    RAISE EXCEPTION 'O valor da devolução excede o saldo disponível da venda';
  END IF;

  INSERT INTO public.partner_cash_movements(
    session_id, kind, payment_method, amount, reason, sale_id, request_id, authorized_by
  )
  VALUES (
    p_session_id, 'devolucao', v_original.payment_method, p_amount,
    trim(p_reason), p_sale_id, p_request_id, v_authorizer
  );
  RETURN p_session_id;
END;
$function$
;
REVOKE ALL ON FUNCTION partner_cash_private.execute_partner_sale_mutation(uuid,text,uuid,uuid,text,jsonb,numeric,text,text,text,uuid,text,text,text,text,uuid,numeric,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.execute_partner_sale_mutation(uuid,text,uuid,uuid,text,jsonb,numeric,text,text,text,uuid,text,text,text,text,uuid,numeric,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.execute_partner_sale_mutation(uuid,text,uuid,uuid,text,jsonb,numeric,text,text,text,uuid,text,text,text,text,uuid,numeric,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION partner_cash_private.reverse_sale() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_partner_cash_refund(uuid,uuid,text,uuid,uuid,numeric,text,uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_partner_cash_refund(uuid,uuid,text,uuid,uuid,numeric,text,uuid,text,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
