BEGIN;
ALTER TABLE public.service_order_items ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE public.service_order_items ADD CONSTRAINT service_order_manual_part_valid CHECK (product_id IS NOT NULL OR (stock_consumed IS FALSE AND length(btrim(product_name)) BETWEEN 1 AND 200));

CREATE OR REPLACE FUNCTION public.create_service_order_once(p_request_id uuid,p_payload jsonb) RETURNS uuid
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
  IF item->>'product_id' IS NULL THEN
   IF jsonb_typeof(item->'name') IS DISTINCT FROM 'string' OR length(btrim(item->>'name')) NOT BETWEEN 1 AND 200 OR qty>999 OR price>9999999.99 THEN RAISE EXCEPTION 'Peça manual: informe descrição, quantidade de 1 a 999 e preço válido.'; END IF;
   INSERT INTO public.service_order_items(service_order_id,user_id,product_id,branch_id,product_name,quantity,unit_cost,unit_price,stock_consumed)
    VALUES(p_request_id,company,NULL,branch,btrim(item->>'name'),qty,0,price,false);
   total_parts:=total_parts+price*qty;
   CONTINUE;
  END IF;
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

NOTIFY pgrst,'reload schema';
COMMIT;
