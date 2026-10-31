-- Atomic product + fiscal persistence. Existing RPC remains available to older clients.
CREATE OR REPLACE FUNCTION partner_pdv_fix_private.save_product_profile(
 p_salesperson_id uuid, p_pin text, p_product_id uuid, p_branch_id uuid,
 p_name text, p_cost_price numeric, p_sale_price numeric, p_wholesale_price numeric,
 p_stock integer, p_min_stock integer, p_category text, p_sku text,
 p_is_service boolean, p_image_url text, p_supplier_id uuid, p_premium_price numeric,
 p_barcode text, p_fiscal jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_id uuid; v_row public.partner_products; v_key text; v_rate numeric;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
 IF p_fiscal IS NULL OR jsonb_typeof(p_fiscal)<>'object' THEN RAISE EXCEPTION 'Dados fiscais inválidos'; END IF;
 FOR v_key IN SELECT jsonb_object_keys(p_fiscal) LOOP
  IF v_key NOT IN ('ncm','cfop','cst_csosn','icms_rate','pis_rate','cofins_rate') THEN RAISE EXCEPTION 'Campo fiscal inválido'; END IF;
 END LOOP;
 FOREACH v_key IN ARRAY ARRAY['icms_rate','pis_rate','cofins_rate'] LOOP
  IF p_fiscal ? v_key THEN
   v_rate := COALESCE((p_fiscal->>v_key)::numeric,0);
   IF v_rate<0 OR v_rate>100 THEN RAISE EXCEPTION 'As alíquotas devem estar entre 0 e 100%%'; END IF;
  END IF;
 END LOOP;
 -- Serialize identifier changes within the company/branch, including older clients.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  (SELECT op.company_id::text FROM public.resolve_partner_pdv_operator(p_salesperson_id,p_pin,p_branch_id) op)||':'||p_branch_id::text,0));
 v_id := partner_pdv_fix_private.mutate_barcode_product(
  p_salesperson_id,p_pin,p_product_id,p_branch_id,p_name,p_cost_price,p_sale_price,
  p_wholesale_price,p_stock,p_min_stock,p_category,p_sku,p_is_service,p_image_url,
  p_supplier_id,p_premium_price,p_barcode);
 UPDATE public.partner_products SET
  ncm=CASE WHEN p_fiscal ? 'ncm' THEN NULLIF(btrim(p_fiscal->>'ncm'),'') ELSE ncm END,
  cfop=CASE WHEN p_fiscal ? 'cfop' THEN NULLIF(btrim(p_fiscal->>'cfop'),'') ELSE cfop END,
  cst_csosn=CASE WHEN p_fiscal ? 'cst_csosn' THEN NULLIF(btrim(p_fiscal->>'cst_csosn'),'') ELSE cst_csosn END,
  icms_rate=CASE WHEN p_fiscal ? 'icms_rate' THEN COALESCE((p_fiscal->>'icms_rate')::numeric,0) ELSE icms_rate END,
  pis_rate=CASE WHEN p_fiscal ? 'pis_rate' THEN COALESCE((p_fiscal->>'pis_rate')::numeric,0) ELSE pis_rate END,
  cofins_rate=CASE WHEN p_fiscal ? 'cofins_rate' THEN COALESCE((p_fiscal->>'cofins_rate')::numeric,0) ELSE cofins_rate END
 WHERE id=v_id RETURNING * INTO STRICT v_row;
 RETURN to_jsonb(v_row);
END $$;
REVOKE ALL ON FUNCTION partner_pdv_fix_private.save_product_profile(uuid,text,uuid,uuid,text,numeric,numeric,numeric,integer,integer,text,text,boolean,text,uuid,numeric,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION partner_pdv_fix_private.save_product_profile(uuid,text,uuid,uuid,text,numeric,numeric,numeric,integer,integer,text,text,boolean,text,uuid,numeric,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_partner_product_profile(
 p_salesperson_id uuid, p_pin text, p_product_id uuid, p_branch_id uuid,
 p_name text, p_cost_price numeric, p_sale_price numeric, p_wholesale_price numeric,
 p_stock integer, p_min_stock integer, p_category text, p_sku text,
 p_is_service boolean, p_image_url text, p_supplier_id uuid, p_premium_price numeric,
 p_barcode text, p_fiscal jsonb
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO '' AS $$
 SELECT partner_pdv_fix_private.save_product_profile(
  p_salesperson_id,p_pin,p_product_id,p_branch_id,p_name,p_cost_price,p_sale_price,
  p_wholesale_price,p_stock,p_min_stock,p_category,p_sku,p_is_service,p_image_url,
  p_supplier_id,p_premium_price,p_barcode,p_fiscal);
$$;
REVOKE ALL ON FUNCTION public.save_partner_product_profile(uuid,text,uuid,uuid,text,numeric,numeric,numeric,integer,integer,text,text,boolean,text,uuid,numeric,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_partner_product_profile(uuid,text,uuid,uuid,text,numeric,numeric,numeric,integer,integer,text,text,boolean,text,uuid,numeric,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION partner_pdv_fix_private.guard_product_codes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
  AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id
  AND lower(btrim(NEW.barcode)) IS NOT DISTINCT FROM lower(btrim(OLD.barcode))
  AND lower(btrim(NEW.sku)) IS NOT DISTINCT FROM lower(btrim(OLD.sku)) THEN RETURN NEW; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.user_id::text||':'||NEW.branch_id::text,0));
 IF EXISTS(SELECT 1 FROM public.partner_products p WHERE p.user_id=NEW.user_id
  AND p.branch_id=NEW.branch_id AND p.id<>NEW.id
  AND EXISTS(SELECT 1 FROM unnest(ARRAY[NULLIF(lower(btrim(NEW.barcode)),''),NULLIF(lower(btrim(NEW.sku)),'')]) code
   WHERE code IS NOT NULL AND code IN (NULLIF(lower(btrim(p.barcode)),''),NULLIF(lower(btrim(p.sku)),''))))
 THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='Este código de barras ou SKU já pertence a outro produto nesta filial.'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION partner_pdv_fix_private.guard_product_codes() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER product_code_collision_guard BEFORE INSERT OR UPDATE OF user_id,branch_id,barcode,sku
 ON public.partner_products FOR EACH ROW EXECUTE FUNCTION partner_pdv_fix_private.guard_product_codes();
CREATE INDEX IF NOT EXISTS partner_products_branch_barcode_normalized_idx
 ON public.partner_products(user_id,branch_id,lower(btrim(barcode))) WHERE NULLIF(btrim(barcode),'') IS NOT NULL;
CREATE INDEX IF NOT EXISTS partner_products_branch_sku_normalized_idx
 ON public.partner_products(user_id,branch_id,lower(btrim(sku))) WHERE NULLIF(btrim(sku),'') IS NOT NULL;
NOTIFY pgrst, 'reload schema';

