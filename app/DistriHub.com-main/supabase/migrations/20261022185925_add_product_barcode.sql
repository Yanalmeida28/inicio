-- Keep internal SKUs intact. Barcodes are text so leading zeroes survive.
ALTER TABLE public.partner_products ADD COLUMN IF NOT EXISTS barcode text;
COMMENT ON COLUMN public.partner_products.barcode IS 'Barcode scanned at checkout, separate from the internal SKU.';

-- Reuse the existing mutation's subscription, operator, company, branch,
-- supplier and stock checks. Both writes share one transaction.
CREATE OR REPLACE FUNCTION partner_pdv_fix_private.mutate_barcode_product(
  p_salesperson_id uuid, p_pin text, p_product_id uuid, p_branch_id uuid,
  p_name text, p_cost_price numeric, p_sale_price numeric, p_wholesale_price numeric,
  p_stock integer, p_min_stock integer, p_category text, p_sku text,
  p_is_service boolean, p_image_url text, p_supplier_id uuid, p_premium_price numeric,
  p_barcode text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_id := partner_pdv_fix_private.mutate_priced_product(
    p_salesperson_id,p_pin,p_product_id,p_branch_id,p_name,p_cost_price,p_sale_price,
    p_wholesale_price,p_stock,p_min_stock,p_category,p_sku,p_is_service,p_image_url,
    p_supplier_id,p_premium_price
  );
  UPDATE public.partner_products SET barcode = NULLIF(pg_catalog.btrim(p_barcode), '') WHERE id = v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION partner_pdv_fix_private.mutate_barcode_product(uuid,text,uuid,uuid,text,numeric,numeric,numeric,integer,integer,text,text,boolean,text,uuid,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION partner_pdv_fix_private.mutate_barcode_product(uuid,text,uuid,uuid,text,numeric,numeric,numeric,integer,integer,text,text,boolean,text,uuid,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.execute_partner_product_barcode_mutation(
  p_salesperson_id uuid, p_pin text, p_product_id uuid, p_branch_id uuid,
  p_name text, p_cost_price numeric, p_sale_price numeric, p_wholesale_price numeric,
  p_stock integer, p_min_stock integer, p_category text, p_sku text,
  p_is_service boolean, p_image_url text, p_supplier_id uuid, p_premium_price numeric,
  p_barcode text
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT partner_pdv_fix_private.mutate_barcode_product(
    p_salesperson_id,p_pin,p_product_id,p_branch_id,p_name,p_cost_price,p_sale_price,
    p_wholesale_price,p_stock,p_min_stock,p_category,p_sku,p_is_service,p_image_url,
    p_supplier_id,p_premium_price,p_barcode
  );
$$;
REVOKE ALL ON FUNCTION public.execute_partner_product_barcode_mutation(uuid,text,uuid,uuid,text,numeric,numeric,numeric,integer,integer,text,text,boolean,text,uuid,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_partner_product_barcode_mutation(uuid,text,uuid,uuid,text,numeric,numeric,numeric,integer,integer,text,text,boolean,text,uuid,numeric,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
