-- Security baseline: employee identity, B2B order isolation, and public catalog projections.

ALTER TABLE partner_salespeople
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_salespeople_auth_user_id
  ON partner_salespeople(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

ALTER TABLE b2b_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_b2b_orders" ON b2b_orders;
DROP POLICY IF EXISTS "insert_b2b_orders" ON b2b_orders;
DROP POLICY IF EXISTS "update_b2b_orders" ON b2b_orders;
DROP POLICY IF EXISTS "delete_b2b_orders" ON b2b_orders;
DROP POLICY IF EXISTS "select_own_b2b_orders" ON b2b_orders;
DROP POLICY IF EXISTS "insert_own_b2b_orders" ON b2b_orders;
DROP POLICY IF EXISTS "update_own_b2b_orders" ON b2b_orders;
DROP POLICY IF EXISTS "delete_own_b2b_orders" ON b2b_orders;

CREATE POLICY "select_own_b2b_orders" ON b2b_orders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_b2b_orders" ON b2b_orders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_b2b_orders" ON b2b_orders
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_b2b_orders" ON b2b_orders
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "public_select_enabled_store_settings" ON store_settings_v2;
DROP POLICY IF EXISTS "public_select_catalog_partner_profiles" ON partner_profiles;
DROP POLICY IF EXISTS "public_select_catalog_partner_branches" ON partner_branches;
DROP POLICY IF EXISTS "public_select_catalog_products" ON partner_products;

CREATE OR REPLACE VIEW public_catalog_store_settings AS
SELECT id, user_id, catalog_slug, catalog_enabled, logo_url, banner_url, primary_color, nav_color, business_hours
FROM store_settings_v2
WHERE catalog_enabled = true;

CREATE OR REPLACE VIEW public_catalog_partner_profiles AS
SELECT p.id, p.business_name, p.account_name
FROM partner_profiles p
JOIN store_settings_v2 s ON s.user_id = p.id
WHERE s.catalog_enabled = true;

CREATE OR REPLACE VIEW public_catalog_partner_branches AS
SELECT b.id, b.user_id, b.name, b.address
FROM partner_branches b
JOIN store_settings_v2 s ON s.user_id = b.user_id
WHERE s.catalog_enabled = true AND b.is_active = true;

CREATE OR REPLACE VIEW public_catalog_products AS
SELECT p.id, p.user_id, p.branch_id, p.name, p.sale_price, p.image_url, p.stock,
       p.min_stock, p.category, p.sku, p.is_service, p.created_at, p.updated_at
FROM partner_products p
JOIN store_settings_v2 s ON s.user_id = p.user_id
WHERE s.catalog_enabled = true AND p.is_service = false AND p.stock > 0;

GRANT SELECT ON public_catalog_store_settings TO anon, authenticated;
GRANT SELECT ON public_catalog_partner_profiles TO anon, authenticated;
GRANT SELECT ON public_catalog_partner_branches TO anon, authenticated;
GRANT SELECT ON public_catalog_products TO anon, authenticated;