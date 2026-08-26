/*
# Painel B2B — Criação das tabelas com auth + RLS owner-scoped

Cria as tabelas para o painel B2B autenticado: perfil do lojista, produtos,
clientes, vendas/OS, movimentações de estoque e configurações white-label.
Todas com RLS owner-scoped (user_id = auth.uid()).
*/

-- ============================================================
-- 1. partner_profiles (1:1 com auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS partner_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  document text,
  whatsapp text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE partner_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON partner_profiles;
CREATE POLICY "select_own_profile" ON partner_profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON partner_profiles;
CREATE POLICY "insert_own_profile" ON partner_profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON partner_profiles;
CREATE POLICY "update_own_profile" ON partner_profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON partner_profiles;
CREATE POLICY "delete_own_profile" ON partner_profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- ============================================================
-- 2. partner_products
-- ============================================================
CREATE TABLE IF NOT EXISTS partner_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  cost_price numeric(10,2) NOT NULL DEFAULT 0,
  sale_price numeric(10,2) NOT NULL DEFAULT 0,
  image_url text,
  stock integer NOT NULL DEFAULT 0,
  min_stock integer NOT NULL DEFAULT 5,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE partner_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_products" ON partner_products;
CREATE POLICY "select_own_products" ON partner_products FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_products" ON partner_products;
CREATE POLICY "insert_own_products" ON partner_products FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_products" ON partner_products;
CREATE POLICY "update_own_products" ON partner_products FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_products" ON partner_products;
CREATE POLICY "delete_own_products" ON partner_products FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 3. partner_customers
-- ============================================================
CREATE TABLE IF NOT EXISTS partner_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  device_model text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE partner_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_customers" ON partner_customers;
CREATE POLICY "select_own_customers" ON partner_customers FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_customers" ON partner_customers;
CREATE POLICY "insert_own_customers" ON partner_customers FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_customers" ON partner_customers;
CREATE POLICY "update_own_customers" ON partner_customers FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_customers" ON partner_customers;
CREATE POLICY "delete_own_customers" ON partner_customers FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 4. partner_sales (Vendas / Ordens de Serviço)
-- ============================================================
CREATE TABLE IF NOT EXISTS partner_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES partner_customers(id) ON DELETE SET NULL,
  customer_name text,
  items jsonb NOT NULL DEFAULT '[]',
  total numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'aberta',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE partner_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_sales" ON partner_sales;
CREATE POLICY "select_own_sales" ON partner_sales FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_sales" ON partner_sales;
CREATE POLICY "insert_own_sales" ON partner_sales FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_sales" ON partner_sales;
CREATE POLICY "update_own_sales" ON partner_sales FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_sales" ON partner_sales;
CREATE POLICY "delete_own_sales" ON partner_sales FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 5. stock_movements
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid REFERENCES partner_products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  type text NOT NULL,
  quantity integer NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_movements" ON stock_movements;
CREATE POLICY "select_own_movements" ON stock_movements FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_movements" ON stock_movements;
CREATE POLICY "insert_own_movements" ON stock_movements FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_movements" ON stock_movements;
CREATE POLICY "delete_own_movements" ON stock_movements FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 6. store_settings (adaptada com user_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS store_settings_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  logo_url text,
  primary_color text DEFAULT '#3193e5',
  nav_color text DEFAULT '#0b1927',
  internal_notice text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE store_settings_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_store_settings" ON store_settings_v2;
CREATE POLICY "select_own_store_settings" ON store_settings_v2 FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_store_settings" ON store_settings_v2;
CREATE POLICY "insert_own_store_settings" ON store_settings_v2 FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_store_settings" ON store_settings_v2;
CREATE POLICY "update_own_store_settings" ON store_settings_v2 FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_store_settings" ON store_settings_v2;
CREATE POLICY "delete_own_store_settings" ON store_settings_v2 FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- RMA (adaptada com user_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS rma_requests_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  product_sku text NOT NULL,
  batch_or_order text NOT NULL,
  defect_description text NOT NULL,
  media_url text,
  status text NOT NULL DEFAULT 'aguardando_troca',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE rma_requests_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_rma" ON rma_requests_v2;
CREATE POLICY "select_own_rma" ON rma_requests_v2 FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_rma" ON rma_requests_v2;
CREATE POLICY "insert_own_rma" ON rma_requests_v2 FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_rma" ON rma_requests_v2;
CREATE POLICY "update_own_rma" ON rma_requests_v2 FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_rma" ON rma_requests_v2;
CREATE POLICY "delete_own_rma" ON rma_requests_v2 FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
