/*
# DistriHub B2B — Tabelas expandidas para ERP multi-loja, admin e checkout
*/

-- ============================================================
-- 1. partner_branches (Filiais do lojista)
-- ============================================================
CREATE TABLE IF NOT EXISTS partner_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE partner_branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_branches" ON partner_branches;
CREATE POLICY "select_own_branches" ON partner_branches FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_branches" ON partner_branches;
CREATE POLICY "insert_own_branches" ON partner_branches FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_branches" ON partner_branches;
CREATE POLICY "update_own_branches" ON partner_branches FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_branches" ON partner_branches;
CREATE POLICY "delete_own_branches" ON partner_branches FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Adiciona colunas em partner_products
DO $$ BEGIN
  ALTER TABLE partner_products ADD COLUMN branch_id uuid REFERENCES partner_branches(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE partner_products ADD COLUMN category text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE partner_products ADD COLUMN sku text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE partner_products ADD COLUMN is_service boolean DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Adiciona campos em partner_customers
DO $$ BEGIN
  ALTER TABLE partner_customers ADD COLUMN birthday date;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE partner_customers ADD COLUMN branch_id uuid REFERENCES partner_branches(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Adiciona campos em partner_sales
DO $$ BEGIN
  ALTER TABLE partner_sales ADD COLUMN branch_id uuid REFERENCES partner_branches(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE partner_sales ADD COLUMN salesperson_id uuid;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE partner_sales ADD COLUMN imei text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE partner_sales ADD COLUMN serial_number text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE partner_sales ADD COLUMN payment_method text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Adiciona segmento em partner_profiles
DO $$ BEGIN
  ALTER TABLE partner_profiles ADD COLUMN segment text DEFAULT 'assistencia';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ============================================================
-- 2. partner_categories
-- ============================================================
CREATE TABLE IF NOT EXISTS partner_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE partner_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_categories" ON partner_categories;
CREATE POLICY "select_own_categories" ON partner_categories FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_categories" ON partner_categories;
CREATE POLICY "insert_own_categories" ON partner_categories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_categories" ON partner_categories;
CREATE POLICY "update_own_categories" ON partner_categories FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_categories" ON partner_categories;
CREATE POLICY "delete_own_categories" ON partner_categories FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 3. partner_suppliers
-- ============================================================
CREATE TABLE IF NOT EXISTS partner_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  notes text,
  payable_balance numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE partner_suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_suppliers" ON partner_suppliers;
CREATE POLICY "select_own_suppliers" ON partner_suppliers FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_suppliers" ON partner_suppliers;
CREATE POLICY "insert_own_suppliers" ON partner_suppliers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_suppliers" ON partner_suppliers;
CREATE POLICY "update_own_suppliers" ON partner_suppliers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_suppliers" ON partner_suppliers;
CREATE POLICY "delete_own_suppliers" ON partner_suppliers FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 4. partner_salespeople
-- ============================================================
CREATE TABLE IF NOT EXISTS partner_salespeople (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  commission_rate numeric(5,2) DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE partner_salespeople ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_salespeople" ON partner_salespeople;
CREATE POLICY "select_own_salespeople" ON partner_salespeople FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_salespeople" ON partner_salespeople;
CREATE POLICY "insert_own_salespeople" ON partner_salespeople FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_salespeople" ON partner_salespeople;
CREATE POLICY "update_own_salespeople" ON partner_salespeople FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_salespeople" ON partner_salespeople;
CREATE POLICY "delete_own_salespeople" ON partner_salespeople FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 5. partner_combos
-- ============================================================
CREATE TABLE IF NOT EXISTS partner_combos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(10,2) NOT NULL,
  items jsonb NOT NULL DEFAULT '[]',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE partner_combos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_combos" ON partner_combos;
CREATE POLICY "select_own_combos" ON partner_combos FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_combos" ON partner_combos;
CREATE POLICY "insert_own_combos" ON partner_combos FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_combos" ON partner_combos;
CREATE POLICY "update_own_combos" ON partner_combos FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_combos" ON partner_combos;
CREATE POLICY "delete_own_combos" ON partner_combos FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 6. partner_modifiers
-- ============================================================
CREATE TABLE IF NOT EXISTS partner_modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid REFERENCES partner_products(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_adjustment numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE partner_modifiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_modifiers" ON partner_modifiers;
CREATE POLICY "select_own_modifiers" ON partner_modifiers FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_modifiers" ON partner_modifiers;
CREATE POLICY "insert_own_modifiers" ON partner_modifiers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_modifiers" ON partner_modifiers;
CREATE POLICY "update_own_modifiers" ON partner_modifiers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_modifiers" ON partner_modifiers;
CREATE POLICY "delete_own_modifiers" ON partner_modifiers FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 7. partner_invoices (Faturas B2B)
-- ============================================================
CREATE TABLE IF NOT EXISTS partner_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'aberta',
  due_date date,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE partner_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_invoices" ON partner_invoices;
CREATE POLICY "select_own_invoices" ON partner_invoices FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_invoices" ON partner_invoices;
CREATE POLICY "insert_own_invoices" ON partner_invoices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_invoices" ON partner_invoices;
CREATE POLICY "update_own_invoices" ON partner_invoices FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 8. delivery_routes
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  shift text NOT NULL DEFAULT 'manha',
  cutoff_time time,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE delivery_routes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_routes" ON delivery_routes;
CREATE POLICY "select_routes" ON delivery_routes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_routes" ON delivery_routes;
CREATE POLICY "insert_routes" ON delivery_routes FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_routes" ON delivery_routes;
CREATE POLICY "update_routes" ON delivery_routes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_routes" ON delivery_routes;
CREATE POLICY "delete_routes" ON delivery_routes FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 9. delivery_rates (Taxas por bairro)
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  neighborhood text NOT NULL,
  rate numeric(10,2) NOT NULL DEFAULT 0,
  route_id uuid REFERENCES delivery_routes(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE delivery_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_rates" ON delivery_rates;
CREATE POLICY "select_rates" ON delivery_rates FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_rates" ON delivery_rates;
CREATE POLICY "insert_rates" ON delivery_rates FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_rates" ON delivery_rates;
CREATE POLICY "update_rates" ON delivery_rates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_rates" ON delivery_rates;
CREATE POLICY "delete_rates" ON delivery_rates FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 10. admin_lojistas (Gestão de lojistas pelo admin)
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_lojistas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  document text,
  whatsapp text,
  segment text DEFAULT 'assistencia',
  credit_limit numeric(10,2) DEFAULT 0,
  credit_used numeric(10,2) DEFAULT 0,
  status text DEFAULT 'pendente',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE admin_lojistas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_admin_lojistas" ON admin_lojistas;
CREATE POLICY "select_admin_lojistas" ON admin_lojistas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "update_admin_lojistas" ON admin_lojistas;
CREATE POLICY "update_admin_lojistas" ON admin_lojistas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "insert_admin_lojistas" ON admin_lojistas;
CREATE POLICY "insert_admin_lojistas" ON admin_lojistas FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- 11. b2b_orders (Pedidos B2B da distribuidora)
-- ============================================================
CREATE TABLE IF NOT EXISTS b2b_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  business_name text,
  items jsonb NOT NULL DEFAULT '[]',
  total numeric(10,2) NOT NULL DEFAULT 0,
  payment_method text,
  delivery_method text,
  delivery_rate numeric(10,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE b2b_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_b2b_orders" ON b2b_orders;
CREATE POLICY "select_b2b_orders" ON b2b_orders FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_b2b_orders" ON b2b_orders;
CREATE POLICY "insert_b2b_orders" ON b2b_orders FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_b2b_orders" ON b2b_orders;
CREATE POLICY "update_b2b_orders" ON b2b_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- SEED: Rotas de entrega
-- ============================================================
INSERT INTO delivery_routes (name, shift, cutoff_time) VALUES
  ('Rota Manhã', 'manha', '09:00'),
  ('Rota Tarde', 'tarde', '14:00'),
  ('Express Motoboy', 'express', null)
ON CONFLICT DO NOTHING;
