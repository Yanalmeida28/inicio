BEGIN;
CREATE SCHEMA IF NOT EXISTS partner_operations_private;
REVOKE ALL ON SCHEMA partner_operations_private FROM PUBLIC,anon,authenticated;
CREATE TABLE partner_operations_private.operation_requests (
  actor_id uuid NOT NULL, kind text NOT NULL, request_id uuid NOT NULL,
  payload jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,kind,request_id)
);
ALTER TABLE partner_operations_private.operation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON partner_operations_private.operation_requests FROM PUBLIC,anon,authenticated;

CREATE FUNCTION partner_operations_private.authorize_branch(p_branch uuid,p_feature text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE company uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
 SELECT user_id INTO company FROM public.partner_branches WHERE id=p_branch AND is_active;
 IF company IS NULL OR NOT (company=auth.uid() OR public.partner_employee_can_access_branch(company,p_branch) OR public.is_super_admin()) THEN
  RAISE EXCEPTION 'Filial não autorizada.';
 END IF;
 PERFORM partner_subscription_private.require_actor(p_feature);
 PERFORM partner_subscription_private.require_access(company,p_feature);
 RETURN company;
END $fn$;
REVOKE ALL ON FUNCTION partner_operations_private.authorize_branch(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.execute_partner_stock_replenishment_once(p_request_id uuid,p_salesperson_id uuid,p_pin text,
 p_product_id uuid,p_branch_id uuid,p_quantity integer,p_unit_cost numeric DEFAULT NULL,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=auth.uid(); request partner_operations_private.operation_requests%ROWTYPE; payload jsonb; result jsonb;
BEGIN
 IF actor IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Reposição sem identificação.'; END IF;
 PERFORM partner_subscription_private.require_actor('estoque');
 PERFORM public.resolve_partner_operator(p_salesperson_id,p_pin,p_branch_id);
 IF p_unit_cost IS NOT NULL AND (p_unit_cost::text IN ('NaN','Infinity','-Infinity') OR p_unit_cost<0 OR p_unit_cost<>round(p_unit_cost,2)) THEN RAISE EXCEPTION 'Custo inválido.'; END IF;
 payload:=jsonb_build_object('product',p_product_id,'branch',p_branch_id,'quantity',p_quantity,'cost',p_unit_cost,'reason',coalesce(trim(p_reason),''),'operator',p_salesperson_id);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||':replenishment:'||p_request_id::text,0));
 SELECT * INTO request FROM partner_operations_private.operation_requests WHERE actor_id=actor AND kind='replenishment' AND request_id=p_request_id;
 IF FOUND THEN
  IF request.payload<>payload THEN RAISE EXCEPTION 'Esta tentativa já identifica outra reposição.'; END IF;
  RETURN request.result;
 END IF;
 result:=public.execute_partner_stock_replenishment(p_salesperson_id,p_pin,p_product_id,p_branch_id,p_quantity,p_unit_cost,p_reason);
 INSERT INTO partner_operations_private.operation_requests VALUES(actor,'replenishment',p_request_id,payload,result,now());
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.execute_partner_stock_replenishment_once(uuid,uuid,text,uuid,uuid,integer,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.execute_partner_stock_replenishment_once(uuid,uuid,text,uuid,uuid,integer,numeric,text) TO authenticated;

ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS technician_name text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'aguardando_aprovacao' CHECK(approval_status IN ('aguardando_aprovacao','aprovado','reprovado'));
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS approval_notes text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS forecast_delivery date;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS status_history jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.service_order_items ADD COLUMN IF NOT EXISTS stock_consumed boolean;
ALTER TABLE public.partner_invoices ADD COLUMN IF NOT EXISTS service_order_id uuid REFERENCES public.service_orders(id);
CREATE UNIQUE INDEX partner_invoice_service_order_unique ON public.partner_invoices(service_order_id) WHERE service_order_id IS NOT NULL;

CREATE FUNCTION public.create_service_order_once(p_request_id uuid,p_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=auth.uid(); branch uuid:=(p_payload->>'branch_id')::uuid; company uuid;
 request partner_operations_private.operation_requests%ROWTYPE; customer uuid:=(p_payload->>'customer_id')::uuid;
 customer_name text; labor numeric:=(p_payload->>'labor_total')::numeric; total_parts numeric:=0;
 item jsonb; product public.partner_products%ROWTYPE; qty integer; price numeric;
BEGIN
 company:=partner_operations_private.authorize_branch(branch,'os');
 IF p_request_id IS NULL OR p_payload IS NULL THEN RAISE EXCEPTION 'OS sem identificação.'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||':service-order:'||p_request_id::text,0));
 SELECT * INTO request FROM partner_operations_private.operation_requests WHERE actor_id=actor AND kind='service-order' AND request_id=p_request_id;
 IF FOUND THEN
  IF request.payload<>p_payload THEN RAISE EXCEPTION 'Esta tentativa já identifica outra OS.'; END IF;
  RETURN (request.result->>'id')::uuid;
 END IF;
 IF labor IS NULL OR labor::text IN ('NaN','Infinity','-Infinity') OR labor<0 OR labor<>round(labor,2) THEN RAISE EXCEPTION 'Mão de obra inválida.'; END IF;
 IF coalesce(length(trim(p_payload->>'equipment_type')),0)=0 AND coalesce(length(trim(p_payload->>'identification')),0)=0 AND coalesce(length(trim(p_payload->>'serial')),0)=0 THEN RAISE EXCEPTION 'Informe o equipamento.'; END IF;
 IF customer IS NOT NULL THEN
  SELECT name INTO customer_name FROM public.partner_customers WHERE id=customer AND user_id=company AND (branch_id IS NULL OR branch_id=branch);
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não autorizado nesta filial.'; END IF;
 END IF;
 IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items')>100 THEN RAISE EXCEPTION 'Peças inválidas.'; END IF;
 INSERT INTO public.service_orders(id,user_id,branch_id,customer_id,customer_name,service_segment,equipment_type,equipment_identification,serial_number,accessories_left,physical_condition,entry_damage,entry_notes,labor_total,total,status_history)
 VALUES(p_request_id,company,branch,customer,coalesce(customer_name,''),coalesce(p_payload->>'segment','assistencia'),p_payload->>'equipment_type',p_payload->>'identification',p_payload->>'serial',p_payload->>'accessories',p_payload->>'condition',p_payload->>'damage',p_payload->>'notes',labor,labor,jsonb_build_array(jsonb_build_object('status','aberta','actor',actor,'at',now())));
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') ORDER BY value->>'product_id' LOOP
  IF (item->>'quantity')::numeric<>trunc((item->>'quantity')::numeric) THEN RAISE EXCEPTION 'Quantidade deve ser inteira.'; END IF;
  qty:=(item->>'quantity')::integer; price:=(item->>'unit_price')::numeric;
  IF qty IS NULL OR qty<=0 OR price IS NULL OR price::text IN ('NaN','Infinity','-Infinity') OR price<0 OR price<>round(price,2) THEN RAISE EXCEPTION 'Peça com valor inválido.'; END IF;
  SELECT * INTO product FROM public.partner_products WHERE id=(item->>'product_id')::uuid AND user_id=company AND branch_id=branch FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto não autorizado nesta filial.'; END IF;
  IF NOT coalesce(product.is_service,false) AND product.stock<qty THEN RAISE EXCEPTION 'Estoque insuficiente para %.',product.name; END IF;
  INSERT INTO public.service_order_items(service_order_id,user_id,product_id,branch_id,product_name,quantity,unit_cost,unit_price,stock_consumed)
   VALUES(p_request_id,company,product.id,branch,product.name,qty,product.cost_price,price,NOT coalesce(product.is_service,false));
  total_parts:=total_parts+price*qty;
  IF NOT coalesce(product.is_service,false) THEN
   UPDATE public.partner_products SET stock=stock-qty,updated_at=now() WHERE id=product.id;
   INSERT INTO public.stock_movements(user_id,product_id,product_name,type,quantity,reason,branch_id) VALUES(company,product.id,product.name,'saida',qty,'Uso em OS '||p_request_id::text,branch);
  END IF;
 END LOOP;
 UPDATE public.service_orders SET parts_total=total_parts,total=total_parts+labor,updated_at=now() WHERE id=p_request_id;
 INSERT INTO partner_operations_private.operation_requests VALUES(actor,'service-order',p_request_id,p_payload,jsonb_build_object('id',p_request_id),now());
 RETURN p_request_id;
END $fn$;
REVOKE ALL ON FUNCTION public.create_service_order_once(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_service_order_once(uuid,jsonb) TO authenticated;

CREATE FUNCTION partner_operations_private.can_access_os_file(p_path text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE folder text[]:=string_to_array(p_path,'/'); o public.service_orders%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR coalesce(folder[1],'') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' OR coalesce(folder[2],'') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RETURN false; END IF;
 SELECT * INTO o FROM public.service_orders WHERE id=folder[2]::uuid AND user_id=folder[1]::uuid;
 RETURN FOUND AND public.partner_has_saas_access(o.user_id,'os') AND (o.user_id=auth.uid() OR public.partner_employee_can_access_branch(o.user_id,o.branch_id));
END $fn$;
REVOKE ALL ON FUNCTION partner_operations_private.can_access_os_file(text) FROM PUBLIC,anon;
-- Exposed only as a boolean predicate for RLS; callers cannot read private operation data.
GRANT USAGE ON SCHEMA partner_operations_private TO authenticated;
GRANT EXECUTE ON FUNCTION partner_operations_private.can_access_os_file(text) TO authenticated;
CREATE POLICY os_attachment_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='service-order-photos' AND partner_operations_private.can_access_os_file(name));
CREATE POLICY os_attachment_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='service-order-photos' AND partner_operations_private.can_access_os_file(name));
CREATE POLICY os_attachment_update ON storage.objects FOR UPDATE TO authenticated USING(bucket_id='service-order-photos' AND partner_operations_private.can_access_os_file(name)) WITH CHECK(bucket_id='service-order-photos' AND partner_operations_private.can_access_os_file(name));

CREATE FUNCTION public.save_service_order_photo(p_order_id uuid,p_photo_id uuid,p_path text,p_type text,p_label text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE o public.service_orders%ROWTYPE; existing public.service_order_photos%ROWTYPE;
BEGIN
 SELECT * INTO o FROM public.service_orders WHERE id=p_order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'OS não encontrada.'; END IF;
 IF o.user_id IS DISTINCT FROM partner_operations_private.authorize_branch(o.branch_id,'os') THEN RAISE EXCEPTION 'OS n?o autorizada.'; END IF;
 IF p_photo_id IS NULL OR p_type NOT IN ('entry','exit') OR NOT partner_operations_private.can_access_os_file(p_path) OR split_part(p_path,'/',2)<>o.id::text THEN RAISE EXCEPTION 'Anexo inválido para esta OS.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='service-order-photos' AND name=p_path) THEN RAISE EXCEPTION 'Arquivo ainda não foi enviado.'; END IF;
 INSERT INTO public.service_order_photos(id,service_order_id,user_id,branch_id,photo_type,operation_type,label,storage_path)
 VALUES(p_photo_id,o.id,o.user_id,o.branch_id,p_type,'service_order',left(p_label,200),p_path) ON CONFLICT(id) DO NOTHING;
 SELECT * INTO existing FROM public.service_order_photos WHERE id=p_photo_id;
 IF existing.service_order_id<>o.id OR existing.storage_path<>p_path OR existing.photo_type<>p_type THEN RAISE EXCEPTION 'Identificador de foto já utilizado.'; END IF;
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.save_service_order_photo(uuid,uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_service_order_photo(uuid,uuid,text,text,text) TO authenticated;

CREATE FUNCTION public.update_service_order_workflow(p_order_id uuid,p_status text,p_technician text,p_approval text,p_reason text,p_customer_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE o public.service_orders%ROWTYPE; item public.service_order_items%ROWTYPE; name text;
BEGIN
 SELECT * INTO o FROM public.service_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OS não encontrada.'; END IF;
 IF o.user_id IS DISTINCT FROM partner_operations_private.authorize_branch(o.branch_id,'os') THEN RAISE EXCEPTION 'OS n?o autorizada.'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('aberta','em_andamento','aguardando_peca','aguardando_cliente','pronta','finalizada','cancelada') OR p_approval IS NULL OR p_approval NOT IN ('aguardando_aprovacao','aprovado','reprovado') THEN RAISE EXCEPTION 'Situação inválida.'; END IF;
 IF o.status IN ('cancelada','finalizada') THEN
  IF p_status=o.status AND coalesce(p_customer_id,o.customer_id) IS NOT DISTINCT FROM o.customer_id AND p_approval=o.approval_status AND coalesce(p_technician,'')=coalesce(o.technician_name,'') AND coalesce(p_reason,'')=coalesce(o.approval_notes,'') THEN RETURN to_jsonb(o); END IF;
  RAISE EXCEPTION 'Esta OS já foi encerrada.';
 END IF;
 IF p_status IN ('em_andamento','pronta','finalizada') AND p_approval<>'aprovado' THEN RAISE EXCEPTION 'Aprove o orçamento antes de avançar.'; END IF;
 IF p_status='finalizada' AND o.status<>'pronta' THEN RAISE EXCEPTION 'Marque a OS como pronta antes de finalizar.'; END IF;
 IF p_customer_id IS NOT NULL THEN
  SELECT c.name INTO name FROM public.partner_customers c WHERE c.id=p_customer_id AND c.user_id=o.user_id AND (c.branch_id IS NULL OR c.branch_id=o.branch_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não autorizado nesta filial.'; END IF;
 END IF;
 IF p_status='cancelada' THEN
  IF coalesce(length(trim(p_reason)),0)<5 THEN RAISE EXCEPTION 'Informe o motivo do cancelamento.'; END IF;
  IF EXISTS(SELECT 1 FROM public.partner_invoices WHERE service_order_id=o.id AND paid_amount>0) THEN RAISE EXCEPTION 'Há recebimentos vinculados. Concilie o financeiro antes de cancelar.'; END IF;
  IF EXISTS(SELECT 1 FROM public.service_order_items WHERE service_order_id=o.id AND stock_consumed IS NULL) THEN RAISE EXCEPTION 'OS antiga sem identificação da baixa: confira o estoque antes de cancelar.'; END IF;
  FOR item IN SELECT * FROM public.service_order_items WHERE service_order_id=o.id AND stock_consumed ORDER BY product_id LOOP
   UPDATE public.partner_products SET stock=stock+item.quantity,updated_at=now() WHERE id=item.product_id AND user_id=o.user_id AND branch_id=o.branch_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Produto da OS não está mais nesta filial.'; END IF;
   INSERT INTO public.stock_movements(user_id,product_id,product_name,type,quantity,reason,branch_id) VALUES(o.user_id,item.product_id,item.product_name,'entrada',item.quantity,'Cancelamento de OS '||o.id::text,o.branch_id);
  END LOOP;
  UPDATE public.partner_invoices SET status='cancelada' WHERE service_order_id=o.id AND status IN ('aberta','parcial');
 END IF;
 UPDATE public.service_orders SET status=p_status,technician_name=nullif(trim(p_technician),''),approval_status=p_approval,approval_notes=left(p_reason,4000),customer_id=coalesce(p_customer_id,customer_id),customer_name=coalesce(name,customer_name),updated_at=now(),
 status_history=status_history||jsonb_build_array(jsonb_build_object('status',p_status,'approval',p_approval,'reason',left(p_reason,4000),'actor',auth.uid(),'at',now())) WHERE id=o.id RETURNING * INTO o;
 RETURN to_jsonb(o);
END $fn$;
REVOKE ALL ON FUNCTION public.update_service_order_workflow(uuid,text,text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_service_order_workflow(uuid,text,text,text,text,uuid) TO authenticated;

CREATE FUNCTION public.bill_service_order_once(p_order_id uuid,p_due_date date) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE o public.service_orders%ROWTYPE; invoice uuid;
BEGIN
 SELECT * INTO o FROM public.service_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OS não encontrada.'; END IF;
 IF o.user_id IS DISTINCT FROM partner_operations_private.authorize_branch(o.branch_id,'os') THEN RAISE EXCEPTION 'OS n?o autorizada.'; END IF;
 PERFORM partner_subscription_private.require_access(o.user_id,'financeiro');
 SELECT id INTO invoice FROM public.partner_invoices WHERE service_order_id=o.id;
 IF FOUND THEN RETURN invoice; END IF;
 IF o.status NOT IN ('pronta','finalizada') OR o.approval_status<>'aprovado' OR o.customer_id IS NULL OR o.total<=0 OR p_due_date IS NULL THEN RAISE EXCEPTION 'Informe cliente e vencimento; a OS deve estar pronta ou finalizada e aprovada.'; END IF;
 INSERT INTO public.partner_invoices(id,user_id,branch_id,customer_id,customer_name,amount,status,due_date,number,service_order_id)
 VALUES(o.id,o.user_id,o.branch_id,o.customer_id,o.customer_name,o.total,'aberta',p_due_date,'OS-'||o.id::text,o.id) RETURNING id INTO invoice;
 RETURN invoice;
END $fn$;
REVOKE ALL ON FUNCTION public.bill_service_order_once(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bill_service_order_once(uuid,date) TO authenticated;

REVOKE INSERT,UPDATE,DELETE ON public.service_orders,public.service_order_items,public.service_order_photos FROM anon,authenticated;
-- Add a restrictive branch gate; permissive subscription policies must not expand employee access.
CREATE POLICY os_branch_gate ON public.service_orders AS RESTRICTIVE FOR ALL TO authenticated
 USING(public.partner_has_saas_access(user_id,'os') AND (user_id=auth.uid() OR public.partner_employee_can_access_branch(user_id,branch_id) OR public.is_super_admin()))
 WITH CHECK(public.partner_has_saas_access(user_id,'os') AND (user_id=auth.uid() OR public.partner_employee_can_access_branch(user_id,branch_id) OR public.is_super_admin()));
CREATE POLICY os_items_branch_gate ON public.service_order_items AS RESTRICTIVE FOR ALL TO authenticated
 USING(public.partner_has_saas_access(user_id,'os') AND (user_id=auth.uid() OR public.partner_employee_can_access_branch(user_id,branch_id) OR public.is_super_admin()))
 WITH CHECK(public.partner_has_saas_access(user_id,'os') AND (user_id=auth.uid() OR public.partner_employee_can_access_branch(user_id,branch_id) OR public.is_super_admin()));
CREATE POLICY os_photos_branch_gate ON public.service_order_photos AS RESTRICTIVE FOR ALL TO authenticated
 USING(public.partner_has_saas_access(user_id,'os') AND (user_id=auth.uid() OR public.partner_employee_can_access_branch(user_id,branch_id) OR public.is_super_admin()))
 WITH CHECK(public.partner_has_saas_access(user_id,'os') AND (user_id=auth.uid() OR public.partner_employee_can_access_branch(user_id,branch_id) OR public.is_super_admin()));

CREATE TABLE public.catalog_orders (
 id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES public.partner_profiles(id),
 branch_id uuid NOT NULL REFERENCES public.partner_branches(id), buyer_id uuid NOT NULL REFERENCES auth.users(id),
 business_name text NOT NULL, contact text NOT NULL, delivery_address text,
 items jsonb NOT NULL, total numeric(12,2) NOT NULL CHECK(total>0),
 payment_method text NOT NULL CHECK(payment_method IN ('pix','cartao')),
 delivery_method text NOT NULL CHECK(delivery_method IN ('balcao','entrega')),
 status text NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','confirmado','cancelado')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX catalog_orders_company_branch_created ON public.catalog_orders(company_id,branch_id,created_at DESC,id);
CREATE INDEX catalog_orders_buyer_created ON public.catalog_orders(buyer_id,created_at DESC);
ALTER TABLE public.catalog_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalog_orders FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.catalog_orders TO authenticated;
GRANT ALL ON public.catalog_orders TO service_role;
CREATE POLICY catalog_orders_read ON public.catalog_orders FOR SELECT TO authenticated USING(
 buyer_id=(SELECT auth.uid()) OR (public.partner_has_saas_access(company_id,'pedidos') AND (company_id=(SELECT auth.uid()) OR public.partner_employee_can_access_branch(company_id,branch_id))) OR public.is_super_admin());

CREATE FUNCTION public.place_catalog_order(p_request_id uuid,p_slug text,p_branch_id uuid,p_items jsonb,
 p_business_name text,p_contact text,p_delivery_address text,p_payment_method text,p_delivery_method text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=auth.uid(); company uuid; payload jsonb; request partner_operations_private.operation_requests%ROWTYPE;
 item jsonb; product public.partner_products%ROWTYPE; quantity integer; canonical_items jsonb:='[]'::jsonb; amount numeric:=0; result jsonb;
BEGIN
 IF actor IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Entre na conta para enviar o pedido.'; END IF;
 IF coalesce(length(trim(p_business_name)),0)<2 OR length(p_business_name)>200 OR coalesce(length(trim(p_contact)),0)<5 OR length(p_contact)>100 OR p_payment_method IS NULL OR p_payment_method NOT IN ('pix','cartao') OR p_delivery_method IS NULL OR p_delivery_method NOT IN ('balcao','entrega') THEN RAISE EXCEPTION 'Dados do pedido inválidos.'; END IF;
 IF p_delivery_method='entrega' AND coalesce(length(trim(p_delivery_address)),0)<5 THEN RAISE EXCEPTION 'Informe o endereço de entrega.'; END IF;
 IF coalesce(length(p_delivery_address),0)>1500 THEN RAISE EXCEPTION 'Endereço muito longo.'; END IF;
 SELECT s.user_id INTO company FROM public.store_settings_v2 s JOIN public.partner_branches b ON b.user_id=s.user_id AND b.id=p_branch_id AND b.is_active
  WHERE s.catalog_enabled AND lower(s.catalog_slug)=lower(trim(p_slug));
 IF NOT FOUND THEN RAISE EXCEPTION 'Catálogo ou filial indisponível.'; END IF;
 PERFORM partner_subscription_private.require_access(company,'pedidos');
 payload:=jsonb_build_object('company',company,'branch',p_branch_id,'items',p_items,'name',trim(p_business_name),'contact',trim(p_contact),'address',trim(p_delivery_address),'payment',p_payment_method,'delivery',p_delivery_method);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||':catalog-order:'||p_request_id::text,0));
 SELECT * INTO request FROM partner_operations_private.operation_requests WHERE actor_id=actor AND kind='catalog-order' AND request_id=p_request_id;
 IF FOUND THEN
  IF request.payload<>payload THEN RAISE EXCEPTION 'Esta tentativa já identifica outro pedido.'; END IF;
  RETURN request.result;
 END IF;
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Selecione os produtos.'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(p_items))<>(SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_items)) THEN RAISE EXCEPTION 'Produto repetido no pedido.'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'id' LOOP
  IF (item->>'quantity')::numeric<>trunc((item->>'quantity')::numeric) THEN RAISE EXCEPTION 'Quantidade deve ser inteira.'; END IF;
  quantity:=(item->>'quantity')::integer;
  SELECT * INTO product FROM public.partner_products WHERE id=(item->>'id')::uuid AND user_id=company AND branch_id=p_branch_id AND NOT coalesce(is_service,false);
  IF NOT FOUND OR quantity IS NULL OR quantity<=0 OR quantity>product.stock OR product.sale_price IS NULL OR product.sale_price<=0 OR product.sale_price::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Produto, quantidade ou preço indisponível.'; END IF;
  amount:=amount+round(product.sale_price,2)*quantity;
  canonical_items:=canonical_items||jsonb_build_array(jsonb_build_object('id',product.id,'name',product.name,'sku',product.sku,'price',round(product.sale_price,2),'quantity',quantity));
 END LOOP;
 INSERT INTO public.catalog_orders(id,company_id,branch_id,buyer_id,business_name,contact,delivery_address,items,total,payment_method,delivery_method)
 VALUES(p_request_id,company,p_branch_id,actor,trim(p_business_name),trim(p_contact),left(p_delivery_address,1500),canonical_items,amount,p_payment_method,p_delivery_method);
 result:=jsonb_build_object('id',p_request_id,'total',amount,'items',canonical_items,'status','pendente');
 INSERT INTO partner_operations_private.operation_requests VALUES(actor,'catalog-order',p_request_id,payload,result,now());
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.place_catalog_order(uuid,text,uuid,jsonb,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.place_catalog_order(uuid,text,uuid,jsonb,text,text,text,text,text) TO authenticated;
-- Old browser-written commercial totals are no longer accepted.
REVOKE INSERT,UPDATE,DELETE ON public.b2b_orders FROM authenticated;

UPDATE public.store_settings_v2 s SET catalog_slug=left(trim(both '-' from regexp_replace(lower(p.business_name),'[^a-z0-9]+','-','g')),28)||'-'||left(s.user_id::text,8)
 FROM public.partner_profiles p WHERE p.id=s.user_id AND (s.catalog_slug IS NULL OR trim(s.catalog_slug)='');
CREATE UNIQUE INDEX store_catalog_slug_unique ON public.store_settings_v2(lower(catalog_slug)) WHERE catalog_slug IS NOT NULL;
CREATE FUNCTION public.read_public_catalog_v2(p_slug text,p_branch_slug text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE result jsonb; company uuid;
BEGIN
 result:=public.read_public_store_catalog(p_slug,p_branch_slug);
 IF result IS NULL THEN RETURN NULL; END IF;
 SELECT user_id INTO company FROM public.store_settings_v2 WHERE lower(catalog_slug)=lower(result#>>'{settings,catalog_slug}') AND catalog_enabled;
 RETURN result||jsonb_build_object('branches',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'address',address) ORDER BY name,id),'[]'::jsonb) FROM public.partner_branches WHERE user_id=company AND is_active));
END $fn$;
REVOKE ALL ON FUNCTION public.read_public_catalog_v2(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_public_catalog_v2(text,text) TO anon,authenticated;

CREATE FUNCTION public.update_catalog_order_status(p_order_id uuid,p_status text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE o public.catalog_orders%ROWTYPE;
BEGIN
 SELECT * INTO o FROM public.catalog_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
 IF o.company_id<>partner_operations_private.authorize_branch(o.branch_id,'pedidos') THEN RAISE EXCEPTION 'Pedido não autorizado.'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('pendente','confirmado','cancelado') THEN RAISE EXCEPTION 'Situação inválida.'; END IF;
 IF o.status='cancelado' AND p_status<>'cancelado' THEN RAISE EXCEPTION 'Pedido cancelado não pode ser reaberto.'; END IF;
 UPDATE public.catalog_orders SET status=p_status,updated_at=now() WHERE id=o.id;
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.update_catalog_order_status(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_catalog_order_status(uuid,text) TO authenticated;

CREATE FUNCTION public.get_admin_support_inbox(p_search text DEFAULT '',p_filter text DEFAULT 'all',p_page integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE conversations jsonb; total bigint; pending bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Acesso administrativo necessário.'; END IF;
 IF p_page IS NULL OR p_page<0 OR p_page>100000 OR p_filter NOT IN ('all','pending','closed','high') OR length(p_search)>200 THEN RAISE EXCEPTION 'Filtro inválido.'; END IF;
 WITH latest AS (SELECT DISTINCT ON(user_id) * FROM public.support_messages ORDER BY user_id,created_at DESC,id DESC),
 entries AS (SELECT m.*,coalesce(s.priority,'normal') AS priority,s.closed_at,coalesce(p.business_name,'Cliente '||left(m.user_id::text,8)) AS company_name,
  (s.closed_at IS NOT NULL AND s.closed_at>=m.created_at) AS closed FROM latest m LEFT JOIN public.admin_support_states s ON s.user_id=m.user_id LEFT JOIN public.partner_profiles p ON p.id=m.user_id),
 filtered AS (SELECT * FROM entries WHERE (p_search='' OR position(lower(p_search) in lower(company_name||' '||message))>0) AND (p_filter='all' OR p_filter='pending' AND NOT closed AND sender_role='cliente' OR p_filter='closed' AND closed OR p_filter='high' AND priority='high')),
 page AS (SELECT * FROM filtered ORDER BY (priority='high') DESC,created_at DESC,user_id LIMIT 25 OFFSET p_page*25)
 SELECT (SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY (priority='high') DESC,created_at DESC,user_id),'[]'::jsonb) FROM page),
  (SELECT count(*) FROM filtered),(SELECT count(*) FROM entries WHERE NOT closed AND sender_role='cliente') INTO conversations,total,pending;
 RETURN jsonb_build_object('conversations',conversations,'total',total,'pending',pending);
END $fn$;
REVOKE ALL ON FUNCTION public.get_admin_support_inbox(text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_admin_support_inbox(text,text,integer) TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA partner_operations_private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION partner_operations_private.can_access_os_file(text) TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA partner_operations_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
COMMIT;
