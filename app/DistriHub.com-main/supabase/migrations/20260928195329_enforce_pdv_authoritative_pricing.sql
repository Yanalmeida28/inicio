-- Apply only AFTER 20260928044542, after human review. No production execution here.
-- Preserve the already committed reconciliation migration and its production guard.
BEGIN;
DO $guard$ BEGIN
  IF md5(pg_get_functiondef('public.execute_partner_sale_mutation(uuid,text,uuid,uuid,text,jsonb,numeric,text,text,text,uuid,text,text,text,text,uuid)'::regprocedure)) IS DISTINCT FROM 'a73dc201a8af453d062a95f4953796c4' THEN
    RAISE EXCEPTION 'Aplicar a reconciliacao revisada antes do pricing; RPC base divergente';
  END IF;
END; $guard$;

CREATE TABLE public.partner_pdv_price_snapshots (
  sale_id uuid PRIMARY KEY REFERENCES public.partner_sales(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  user_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  customer_id uuid REFERENCES public.partner_customers(id) ON DELETE SET NULL,
  customer_type text NOT NULL,
  items jsonb NOT NULL,
  total numeric(10,2) NOT NULL
);
ALTER TABLE public.partner_pdv_price_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.partner_pdv_price_snapshots FROM PUBLIC,anon,authenticated;
-- Only the DEFINER sale RPC writes validated quotes. Never backfill untrusted legacy prices.

CREATE FUNCTION public.validate_partner_pdv_prices(
  p_company uuid,p_branch uuid,p_customer uuid,p_type text,p_items jsonb,p_total numeric
) RETURNS numeric LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $function$
DECLARE
  v_item jsonb; v_product public.partner_products%ROWTYPE;
  v_type text; v_qty numeric; v_price numeric; v_sum numeric := 0;
BEGIN
  IF p_type IS NULL OR p_type NOT IN ('varejo','atacado') THEN
    RAISE EXCEPTION 'Tipo de cliente invalido para precificacao';
  END IF;
  IF p_customer IS NOT NULL THEN
    SELECT CASE WHEN c.customer_type='atacado' THEN 'atacado' ELSE 'varejo' END INTO v_type
    FROM public.partner_customers c WHERE c.id=p_customer AND c.user_id=p_company
      AND (c.branch_id IS NULL OR c.branch_id=p_branch);
    IF NOT FOUND THEN RAISE EXCEPTION 'Cliente invalido para esta filial'; END IF;
    IF v_type<>p_type THEN RAISE EXCEPTION 'Tipo de cliente diverge do cadastro'; END IF;
  END IF;
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
    v_price := CASE WHEN p_type='atacado' AND v_product.wholesale_price>0
      THEN v_product.wholesale_price ELSE v_product.sale_price END;
    IF v_price IS NULL OR v_price::text IN ('NaN','Infinity','-Infinity')
      OR v_price<0 OR v_price<>round(v_price,2) THEN RAISE EXCEPTION 'Preco do cadastro invalido'; END IF;
    IF (v_item->>'unit_price')::numeric IS DISTINCT FROM v_price THEN
      RAISE EXCEPTION 'Preco unitario diverge do preco autorizado';
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
REVOKE ALL ON FUNCTION public.validate_partner_pdv_prices(uuid,uuid,uuid,text,jsonb,numeric) FROM PUBLIC,anon,authenticated;

-- Prevent direct table writes from forging a PDV quote that the RPC might later trust.
CREATE FUNCTION public.guard_partner_pdv_price_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  IF TG_OP='UPDATE' THEN
    -- Only an RI-triggered deletion may detach a customer without re-authorizing
    -- prices. The quote's own FK follows the same deletion; finance is untouched.
    IF OLD.customer_id IS NOT NULL AND NEW.customer_id IS NULL
      AND pg_catalog.pg_trigger_depth()>1
      AND NOT EXISTS (SELECT 1 FROM public.partner_customers c WHERE c.id=OLD.customer_id)
      AND (pg_catalog.to_jsonb(OLD)-'customer_id')=(pg_catalog.to_jsonb(NEW)-'customer_id') THEN
      RETURN NEW;
    END IF;
    IF ROW(OLD.id,OLD.user_id,OLD.branch_id,OLD.customer_id,OLD.customer_type,OLD.items,OLD.total,OLD.origin)
      IS NOT DISTINCT FROM ROW(NEW.id,NEW.user_id,NEW.branch_id,NEW.customer_id,NEW.customer_type,NEW.items,NEW.total,NEW.origin)
      AND NOT (OLD.status='pre_venda' AND NEW.status='concluida') THEN
      RETURN NEW; -- Includes financial receipts/cancellation of legacy sales, no repricing.
    END IF;
    IF COALESCE(OLD.origin,'pdv')<>'pdv' AND COALESCE(NEW.origin,'pdv')<>'pdv' THEN RETURN NEW; END IF;
  ELSIF COALESCE(NEW.origin,'pdv')<>'pdv' THEN RETURN NEW;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.partner_pdv_price_snapshots q WHERE q.sale_id=NEW.id
    AND ROW(q.user_id,q.branch_id,q.customer_id,q.customer_type,q.items,q.total)
      IS NOT DISTINCT FROM ROW(NEW.user_id,NEW.branch_id,NEW.customer_id,NEW.customer_type,NEW.items,NEW.total)) THEN
    RAISE EXCEPTION 'Precificacao do PDV exige a RPC autorizada';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_partner_pdv_price_snapshot() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_partner_pdv_price_snapshot BEFORE INSERT OR UPDATE ON public.partner_sales
FOR EACH ROW EXECUTE FUNCTION public.guard_partner_pdv_price_snapshot();
CREATE OR REPLACE FUNCTION public.execute_partner_sale_mutation(p_salesperson_id uuid, p_pin text, p_sale_id uuid, p_customer_id uuid, p_customer_name text, p_items jsonb, p_total numeric, p_imei text, p_serial_number text, p_payment_method text, p_branch_id uuid, p_status text, p_origin text, p_customer_type text, p_delivery_type text, p_commercial_salesperson_id uuid DEFAULT NULL)
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
  IF v_existing_user IS NOT NULL AND v_existing_user<>v_company_id THEN RAISE EXCEPTION 'Venda nao pertence a empresa'; END IF;
  IF v_existing_user IS NOT NULL AND v_existing_branch IS DISTINCT FROM p_branch_id THEN RAISE EXCEPTION 'Venda nao pertence a filial informada'; END IF;
  IF v_existing_user IS NOT NULL AND v_old_status='cancelada' THEN RAISE EXCEPTION 'Venda cancelada e imutavel'; END IF;
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
      AND v_existing_sale.payment_method IS NOT DISTINCT FROM p_payment_method
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
        v_authorized_total := public.validate_partner_pdv_prices(v_company_id,p_branch_id,p_customer_id,COALESCE(p_customer_type,'varejo'),p_items,p_total);
      END IF;
    ELSE
      v_authorized_total := public.validate_partner_pdv_prices(v_company_id,p_branch_id,p_customer_id,COALESCE(p_customer_type,'varejo'),p_items,p_total);
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
    IF COALESCE(v_credit_used,0)+v_authorized_total>COALESCE(v_credit_limit,0) THEN RAISE EXCEPTION 'Credito insuficiente para a venda'; END IF;
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
    INSERT INTO public.partner_sales(id,user_id,customer_id,customer_name,items,total,status,created_at,branch_id,salesperson_id,imei,serial_number,payment_method,origin,online_payment,payment_status,customer_type,delivery_type)
    VALUES(v_target_id,v_company_id,p_customer_id,p_customer_name,p_items,v_authorized_total,p_status,pg_catalog.now(),p_branch_id,v_commercial_id,p_imei,p_serial_number,p_payment_method,COALESCE(p_origin,'pdv'),false,CASE WHEN p_status='concluida' AND p_payment_method<>'faturado' THEN 'pago' ELSE 'pendente' END,COALESCE(p_customer_type,'varejo'),COALESCE(p_delivery_type,'balcao'));
  ELSIF v_should_restore THEN
    UPDATE public.partner_sales SET status='cancelada',payment_status=CASE WHEN payment_method='faturado' THEN 'cancelado' ELSE payment_status END WHERE id=v_target_id AND user_id=v_company_id AND status='concluida';
    IF NOT FOUND THEN RAISE EXCEPTION 'Venda nao pode ser cancelada'; END IF;
    UPDATE public.partner_invoices SET status='cancelada'
    WHERE id=v_invoice.id AND user_id=v_company_id AND status='aberta' AND paid_amount=0;
  ELSE
    UPDATE public.partner_sales SET customer_id=p_customer_id,customer_name=p_customer_name,items=p_items,total=v_authorized_total,status=p_status,branch_id=p_branch_id,salesperson_id=v_commercial_id,imei=p_imei,serial_number=p_serial_number,payment_method=p_payment_method,origin=COALESCE(p_origin,origin),payment_status=CASE WHEN p_status='concluida' AND p_payment_method<>'faturado' THEN 'pago' ELSE payment_status END,customer_type=COALESCE(p_customer_type,customer_type),delivery_type=COALESCE(p_delivery_type,delivery_type) WHERE id=v_target_id AND user_id=v_company_id AND status='pre_venda';
    IF NOT FOUND THEN RAISE EXCEPTION 'Somente pre-vendas podem ser editadas'; END IF;
  END IF;

  IF p_payment_method='faturado' AND p_status='concluida' AND NOT v_should_restore THEN
    INSERT INTO public.partner_invoices(user_id,number,sale_id,customer_id,customer_name,amount,paid_amount,status,due_date,branch_id,salesperson_id)
    VALUES(v_company_id,'B2B-'||v_target_id::text,v_target_id,p_customer_id,p_customer_name,v_authorized_total,0,'aberta',CURRENT_DATE + 30,p_branch_id,v_commercial_id)
    ON CONFLICT(sale_id) WHERE sale_id IS NOT NULL DO NOTHING;
  END IF;

  SELECT COALESCE(NULLIF(pg_catalog.btrim(pp.account_name),''),NULLIF(pg_catalog.btrim(pp.business_name),''),'Administrador') INTO v_actor_name
  FROM public.partner_profiles pp WHERE pp.id=v_company_id;
  INSERT INTO public.partner_audit_logs(id,user_id,actor_name,actor_role,action,entity_type,entity_id,details)
  VALUES(pg_catalog.gen_random_uuid()::text,v_company_id,COALESCE(v_actor_name,'Administrador'),COALESCE(v_role,'administrador'),CASE WHEN v_should_restore THEN 'cancelamento_venda' WHEN v_should_decrement THEN 'conclusao_venda' ELSE 'alteracao_pre_venda' END,'partner_sale',v_target_id::text,'Operacao de venda executada atomicamente com protecao de estoque e controle de transicao de status');

  RETURN v_target_id;
END;
$function$;

-- CREATE OR REPLACE preserves the reviewed RPC grants and signature.
COMMIT;
