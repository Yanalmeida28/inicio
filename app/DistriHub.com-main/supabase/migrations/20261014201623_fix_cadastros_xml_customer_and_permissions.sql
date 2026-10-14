
-- Authorization helpers stay in a non-exposed schema.
CREATE SCHEMA IF NOT EXISTS partner_cadastros_private;
GRANT USAGE ON SCHEMA partner_cadastros_private TO authenticated;
CREATE OR REPLACE FUNCTION partner_cadastros_private.can_manage(company uuid, branch uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND (company=auth.uid() OR EXISTS (
  SELECT 1 FROM public.partner_salespeople sp WHERE sp.user_id=company AND sp.auth_user_id=auth.uid()
   AND sp.active=true AND NOT ('cadastros'=ANY(coalesce(sp.blocked_modules,'{}'::text[])))
   AND (branch IS NULL OR sp.role='administrador' OR sp.branch_id=branch)
 ));
$$;
REVOKE ALL ON FUNCTION partner_cadastros_private.can_manage(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION partner_cadastros_private.can_manage(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION partner_cadastros_private.update_customer_profile(p_customer_id uuid,p_fields jsonb,p_operator_id uuid DEFAULT NULL,p_operator_pin text DEFAULT NULL,p_branch_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing public.partner_customers%ROWTYPE; desired public.partner_customers%ROWTYPE; allowed jsonb; operator record;
BEGIN
 PERFORM partner_subscription_private.require_actor('cadastros');
 PERFORM partner_subscription_private.require_operator_module('cadastros',p_operator_id);
 SELECT * INTO existing FROM public.partner_customers WHERE id=p_customer_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado.'; END IF;
 SELECT * INTO operator FROM public.resolve_partner_operator(p_operator_id,p_operator_pin,coalesce(p_branch_id,existing.branch_id));
 IF existing.user_id<>operator.company_id OR (operator.role<>'administrador' AND existing.branch_id IS NOT NULL AND existing.branch_id IS DISTINCT FROM operator.branch_id)
 THEN RAISE EXCEPTION 'Cliente de outra empresa ou filial.'; END IF;
 IF jsonb_typeof(p_fields) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Dados do cliente inválidos.'; END IF;
 SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO allowed FROM jsonb_each(p_fields)
 WHERE key=ANY(ARRAY['branch_id','name','document','person_type','phone','email','birthday','address','neighborhood','city','device_model','notes','customer_type','credit_limit','allow_credit','trade_name','rg','municipal_registration','state_registration','ie_isento','suframa_id','sex','address_number','zip_code','state','complement','reference_point','country','salesperson_id','customer_group','price_table','convenio','simples_nacional','reter_iss','is_active','is_store_admin','phone_commercial_1','phone_commercial_2','photo_url']);
 SELECT * INTO desired FROM jsonb_populate_record(existing,allowed);
 -- Company-wide customers remain shared even when the form supplies its active branch.
 IF existing.branch_id IS NULL THEN desired.branch_id:=NULL; END IF;
 IF desired.branch_id IS DISTINCT FROM existing.branch_id AND
 (desired.branch_id IS NULL OR operator.role<>'administrador' OR NOT EXISTS(SELECT 1 FROM public.partner_branches b WHERE b.id=desired.branch_id AND b.user_id=existing.user_id))
 THEN RAISE EXCEPTION 'Filial do cliente não autorizada.'; END IF;
 desired.name:=trim(desired.name);
 IF desired.name IS NULL OR trim(desired.name)='' THEN RAISE EXCEPTION 'Nome obrigatório.'; END IF;
 IF desired.person_type IS NULL OR desired.person_type NOT IN ('PF','PJ') THEN RAISE EXCEPTION 'Tipo de pessoa inválido.'; END IF;
 IF nullif(desired.document,'') IS NOT NULL AND length(regexp_replace(desired.document,'[^0-9]','','g')) <> (CASE WHEN desired.person_type='PJ' THEN 14 ELSE 11 END)
 THEN RAISE EXCEPTION 'Documento incompatível com o tipo de pessoa.'; END IF;
 IF desired.credit_limit IS NULL OR desired.credit_limit<0 OR desired.credit_limit::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Limite de crédito inválido.'; END IF;
 IF desired.salesperson_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partner_salespeople sp WHERE sp.id=desired.salesperson_id AND sp.user_id=existing.user_id AND (sp.branch_id IS NULL OR sp.branch_id IS NOT DISTINCT FROM desired.branch_id))
 THEN RAISE EXCEPTION 'Vendedor de outra empresa ou filial.'; END IF;
 IF desired.photo_url IS DISTINCT FROM existing.photo_url AND desired.photo_url IS NOT NULL AND
 (split_part(desired.photo_url,'/',1)<>auth.uid()::text OR split_part(desired.photo_url,'/',2)<>p_customer_id::text OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='customer-photos' AND name=desired.photo_url))
 THEN RAISE EXCEPTION 'Foto do cliente inválida.'; END IF;
 UPDATE public.partner_customers SET name=desired.name,document=desired.document,person_type=desired.person_type,phone=desired.phone,email=desired.email,birthday=desired.birthday,address=desired.address,neighborhood=desired.neighborhood,city=desired.city,device_model=desired.device_model,notes=desired.notes,customer_type=desired.customer_type,credit_limit=desired.credit_limit,allow_credit=desired.allow_credit,trade_name=desired.trade_name,rg=desired.rg,municipal_registration=desired.municipal_registration,state_registration=desired.state_registration,ie_isento=desired.ie_isento,suframa_id=desired.suframa_id,sex=desired.sex,address_number=desired.address_number,zip_code=desired.zip_code,state=desired.state,complement=desired.complement,reference_point=desired.reference_point,country=desired.country,salesperson_id=desired.salesperson_id,customer_group=desired.customer_group,price_table=desired.price_table,convenio=desired.convenio,simples_nacional=desired.simples_nacional,reter_iss=desired.reter_iss,is_active=desired.is_active,is_store_admin=desired.is_store_admin,phone_commercial_1=desired.phone_commercial_1,phone_commercial_2=desired.phone_commercial_2,photo_url=desired.photo_url
 WHERE id=existing.id AND user_id=operator.company_id;
 UPDATE public.partner_customers SET branch_id=desired.branch_id WHERE id=existing.id AND user_id=operator.company_id RETURNING * INTO desired;
 RETURN jsonb_set(to_jsonb(desired),'{convenio}',to_jsonb(coalesce(desired.convenio,'false') IN ('true','sim','1')));
END $$;
REVOKE ALL ON FUNCTION partner_cadastros_private.update_customer_profile(uuid,jsonb,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION partner_cadastros_private.update_customer_profile(uuid,jsonb,uuid,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.update_partner_customer_profile(p_customer_id uuid,p_fields jsonb,p_operator_id uuid DEFAULT NULL,p_operator_pin text DEFAULT NULL,p_branch_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT partner_cadastros_private.update_customer_profile(p_customer_id,p_fields,p_operator_id,p_operator_pin,p_branch_id);
$$;
REVOKE ALL ON FUNCTION public.update_partner_customer_profile(uuid,jsonb,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_partner_customer_profile(uuid,jsonb,uuid,text,uuid) TO authenticated;

CREATE POLICY customer_photo_read_company ON storage.objects FOR SELECT TO authenticated USING (
 bucket_id='customer-photos' AND EXISTS(SELECT 1 FROM public.partner_customers c WHERE c.photo_url=storage.objects.name AND partner_cadastros_private.can_manage(c.user_id,c.branch_id))
);

-- Shared categories; kits and modifiers remain limited to accessible product branches.
CREATE POLICY employee_category_write ON public.partner_categories FOR ALL TO authenticated
 USING (partner_cadastros_private.can_manage(user_id)) WITH CHECK (partner_cadastros_private.can_manage(user_id));
CREATE OR REPLACE FUNCTION partner_cadastros_private.can_manage_combo(company uuid,items jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT partner_cadastros_private.can_manage(company) AND jsonb_typeof(items)='array' AND NOT EXISTS (
 SELECT 1 FROM jsonb_array_elements(items) i WHERE NOT EXISTS (
 SELECT 1 FROM public.partner_products p WHERE p.id::text=i->>'product_id' AND p.user_id=company AND partner_cadastros_private.can_manage(company,p.branch_id))
 );
$$;
REVOKE ALL ON FUNCTION partner_cadastros_private.can_manage_combo(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION partner_cadastros_private.can_manage_combo(uuid,jsonb) TO authenticated;
CREATE POLICY employee_combo_write ON public.partner_combos FOR ALL TO authenticated
 USING (partner_cadastros_private.can_manage_combo(user_id,items)) WITH CHECK (partner_cadastros_private.can_manage_combo(user_id,items));
CREATE POLICY employee_modifier_write ON public.partner_modifiers FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.partner_products p WHERE p.id=product_id AND p.user_id=partner_modifiers.user_id AND partner_cadastros_private.can_manage(p.user_id,p.branch_id)))
 WITH CHECK (EXISTS(SELECT 1 FROM public.partner_products p WHERE p.id=product_id AND p.user_id=partner_modifiers.user_id AND partner_cadastros_private.can_manage(p.user_id,p.branch_id)));
CREATE OR REPLACE FUNCTION partner_cadastros_private.validate_combo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i jsonb; product_branch uuid; kit_branch uuid;
BEGIN
 IF trim(coalesce(NEW.name,''))='' OR NEW.price IS NULL OR NEW.price<0 OR NEW.price::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Nome e preço válido são obrigatórios no kit.'; END IF;
 IF jsonb_typeof(NEW.items) IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.items)=0 THEN RAISE EXCEPTION 'Selecione os produtos do kit.'; END IF;
 FOR i IN SELECT * FROM jsonb_array_elements(NEW.items) LOOP
  SELECT p.branch_id INTO product_branch FROM public.partner_products p WHERE p.id::text=i->>'product_id' AND p.user_id=NEW.user_id FOR KEY SHARE;
  IF NOT FOUND OR product_branch IS NULL OR (kit_branch IS NOT NULL AND product_branch<>kit_branch) THEN RAISE EXCEPTION 'Produtos do kit devem pertencer à mesma empresa e filial.'; END IF;
  IF NOT (coalesce(i->>'quantity','') ~ '^[1-9][0-9]*$') THEN RAISE EXCEPTION 'Quantidade do kit inválida.'; END IF;
  kit_branch:=product_branch;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION partner_cadastros_private.validate_combo() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_catalog_combo BEFORE INSERT OR UPDATE ON public.partner_combos FOR EACH ROW EXECUTE FUNCTION partner_cadastros_private.validate_combo();

-- A whole invoice is committed or rolled back together. Key is unique per company/branch.
ALTER TABLE public.partner_suppliers ADD COLUMN IF NOT EXISTS document text;
CREATE TABLE partner_cadastros_private.xml_receipts (
 company_id uuid NOT NULL REFERENCES auth.users(id),branch_id uuid NOT NULL REFERENCES public.partner_branches(id),
 invoice_key text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,branch_id,invoice_key)
);
ALTER TABLE partner_cadastros_private.xml_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON partner_cadastros_private.xml_receipts FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION partner_cadastros_private.import_stock_xml(p_branch_id uuid,p_invoice jsonb,p_operator_id uuid DEFAULT NULL,p_operator_pin text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operator record; v_invoice_key text:=p_invoice->>'invoiceKey'; receipt record; supplier uuid; supplier_count integer; supplier_document text;
 item jsonb; product public.partner_products%ROWTYPE; matches integer; qty numeric; cost numeric; result jsonb; changed uuid[]:='{}'; v_sku text;
BEGIN
 PERFORM partner_subscription_private.require_actor('cadastros');
 PERFORM partner_subscription_private.require_operator_module('cadastros',p_operator_id);
 SELECT * INTO operator FROM public.resolve_partner_operator(p_operator_id,p_operator_pin,p_branch_id);
 IF NOT EXISTS(SELECT 1 FROM public.partner_branches WHERE id=p_branch_id AND user_id=operator.company_id)
 OR (operator.role<>'administrador' AND operator.branch_id IS DISTINCT FROM p_branch_id) THEN RAISE EXCEPTION 'Filial não autorizada.'; END IF;
 IF v_invoice_key IS NULL OR v_invoice_key !~ '^[0-9]{44}$' THEN RAISE EXCEPTION 'Chave da NF-e inválida.'; END IF;
 IF jsonb_typeof(p_invoice->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_invoice->'items')=0 THEN RAISE EXCEPTION 'NF-e sem itens.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(operator.company_id::text||':xml',0));
 SELECT * INTO receipt FROM partner_cadastros_private.xml_receipts r WHERE r.company_id=operator.company_id AND r.branch_id=p_branch_id AND r.invoice_key=v_invoice_key;
 IF FOUND THEN
  IF receipt.payload<>p_invoice THEN RAISE EXCEPTION 'A chave já foi importada com outros dados. Confira a NF-e original.'; END IF;
  RETURN receipt.result;
 END IF;
 supplier_document:=p_invoice->'supplier'->>'document';
 IF supplier_document IS NULL OR supplier_document !~ '^([0-9]{11}|[0-9]{14})$' OR trim(coalesce(p_invoice->'supplier'->>'name',''))='' THEN RAISE EXCEPTION 'Fornecedor inválido.'; END IF;
 SELECT count(*) INTO supplier_count FROM public.partner_suppliers WHERE user_id=operator.company_id AND regexp_replace(document,'[^0-9]','','g')=supplier_document;
 IF supplier_count>1 THEN RAISE EXCEPTION 'Há mais de um fornecedor com o documento da NF-e.'; END IF;
 SELECT id INTO supplier FROM public.partner_suppliers WHERE user_id=operator.company_id AND regexp_replace(document,'[^0-9]','','g')=supplier_document LIMIT 1;
 IF supplier IS NULL THEN
  INSERT INTO public.partner_suppliers(user_id,name,document,phone,payable_balance) VALUES(operator.company_id,trim(p_invoice->'supplier'->>'name'),supplier_document,p_invoice->'supplier'->>'phone',0) RETURNING id INTO supplier;
 END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(p_invoice->'items') LOOP
  v_sku:=trim(item->>'sku'); qty:=(item->>'qty')::numeric; cost:=(item->>'cost')::numeric;
  IF trim(coalesce(item->>'name',''))='' OR coalesce(v_sku,'')='' OR qty IS NULL OR qty::text IN ('NaN','Infinity','-Infinity') OR qty<=0 OR qty<>trunc(qty) OR qty>2147483647
  OR cost IS NULL OR cost::text IN ('NaN','Infinity','-Infinity') OR cost<0 OR cost<>round(cost,2) THEN RAISE EXCEPTION 'Item da NF-e inválido.'; END IF;
  SELECT count(*) INTO matches FROM public.partner_products p WHERE p.user_id=operator.company_id AND p.branch_id=p_branch_id AND lower(trim(p.sku))=lower(v_sku);
  IF matches>1 THEN RAISE EXCEPTION 'SKU % corresponde a mais de um produto na filial.',v_sku; END IF;
  SELECT * INTO product FROM public.partner_products p WHERE p.user_id=operator.company_id AND p.branch_id=p_branch_id AND lower(trim(p.sku))=lower(v_sku) FOR UPDATE;
  IF FOUND THEN
   IF product.is_service THEN RAISE EXCEPTION 'Não é possível dar entrada de estoque em um serviço.'; END IF;
   UPDATE public.partner_products SET stock=coalesce(stock,0)+qty::integer,cost_price=cost,supplier_id=supplier,updated_at=now() WHERE id=product.id;
  ELSE
   INSERT INTO public.partner_products(user_id,branch_id,name,sku,cost_price,sale_price,wholesale_price,stock,min_stock,is_service,supplier_id,ncm)
   VALUES(operator.company_id,p_branch_id,trim(item->>'name'),v_sku,cost,round(cost*1.8,2),round(cost*1.3,2),qty::integer,5,false,supplier,item->>'ncm') RETURNING * INTO product;
  END IF;
  INSERT INTO public.stock_movements(user_id,product_id,product_name,type,quantity,reason,branch_id)
  VALUES(operator.company_id,product.id,product.name,'entrada',qty::integer,'NF-e '||v_invoice_key,p_branch_id);
  changed:=array_append(changed,product.id);
 END LOOP;
 result:=jsonb_build_object('invoice_key',v_invoice_key,'supplier_id',supplier,'product_ids',to_jsonb(changed));
 INSERT INTO partner_cadastros_private.xml_receipts(company_id,branch_id,invoice_key,payload,result) VALUES(operator.company_id,p_branch_id,v_invoice_key,p_invoice,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION partner_cadastros_private.import_stock_xml(uuid,jsonb,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION partner_cadastros_private.import_stock_xml(uuid,jsonb,uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.import_partner_stock_xml(p_branch_id uuid,p_invoice jsonb,p_operator_id uuid DEFAULT NULL,p_operator_pin text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT partner_cadastros_private.import_stock_xml(p_branch_id,p_invoice,p_operator_id,p_operator_pin);
$$;
REVOKE ALL ON FUNCTION public.import_partner_stock_xml(uuid,jsonb,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_partner_stock_xml(uuid,jsonb,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
