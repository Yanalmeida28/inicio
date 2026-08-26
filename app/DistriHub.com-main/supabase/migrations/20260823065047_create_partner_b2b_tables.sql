/*
# Painel B2B — Criação das tabelas e dados iniciais

Cria as 5 tabelas do painel B2B "Sou Lojista" com RLS habilitado e políticas
de acesso para app single-tenant (anon + authenticated), além de dados
iniciais (seed) para demonstração.
*/

-- ============================================================
-- 1. branches (Filiais do lojista)
-- ============================================================
CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_branches" ON branches;
CREATE POLICY "anon_select_branches" ON branches FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_branches" ON branches;
CREATE POLICY "anon_insert_branches" ON branches FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_branches" ON branches;
CREATE POLICY "anon_update_branches" ON branches FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_branches" ON branches;
CREATE POLICY "anon_delete_branches" ON branches FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- 2. store_settings (White-Label)
-- ============================================================
CREATE TABLE IF NOT EXISTS store_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logo_url text,
  primary_color text DEFAULT '#3193e5',
  nav_color text DEFAULT '#0b1927',
  banner_url text,
  internal_notice text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_store_settings" ON store_settings;
CREATE POLICY "anon_select_store_settings" ON store_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_store_settings" ON store_settings;
CREATE POLICY "anon_insert_store_settings" ON store_settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_store_settings" ON store_settings;
CREATE POLICY "anon_update_store_settings" ON store_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_store_settings" ON store_settings;
CREATE POLICY "anon_delete_store_settings" ON store_settings FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- 3. rma_requests (Garantia/RMA)
-- ============================================================
CREATE TABLE IF NOT EXISTS rma_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name text NOT NULL,
  product_sku text NOT NULL,
  batch_or_order text NOT NULL,
  defect_description text NOT NULL,
  media_url text,
  status text NOT NULL DEFAULT 'analise',
  credit_amount numeric(10,2) DEFAULT 0,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE rma_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_rma" ON rma_requests;
CREATE POLICY "anon_select_rma" ON rma_requests FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_rma" ON rma_requests;
CREATE POLICY "anon_insert_rma" ON rma_requests FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_rma" ON rma_requests;
CREATE POLICY "anon_update_rma" ON rma_requests FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_rma" ON rma_requests;
CREATE POLICY "anon_delete_rma" ON rma_requests FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- 4. local_stock (Estoque local da filial)
-- ============================================================
CREATE TABLE IF NOT EXISTS local_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_sku text NOT NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  delivery_status text NOT NULL DEFAULT 'pendente',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE local_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_local_stock" ON local_stock;
CREATE POLICY "anon_select_local_stock" ON local_stock FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_local_stock" ON local_stock;
CREATE POLICY "anon_insert_local_stock" ON local_stock FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_local_stock" ON local_stock;
CREATE POLICY "anon_update_local_stock" ON local_stock FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_local_stock" ON local_stock;
CREATE POLICY "anon_delete_local_stock" ON local_stock FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- 5. wallet_balance (Saldo do lojista)
-- ============================================================
CREATE TABLE IF NOT EXISTS wallet_balance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  balance numeric(10,2) NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE wallet_balance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_wallet" ON wallet_balance;
CREATE POLICY "anon_select_wallet" ON wallet_balance FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_wallet" ON wallet_balance;
CREATE POLICY "anon_insert_wallet" ON wallet_balance FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_wallet" ON wallet_balance;
CREATE POLICY "anon_update_wallet" ON wallet_balance FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_wallet" ON wallet_balance;
CREATE POLICY "anon_delete_wallet" ON wallet_balance FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- SEED: dados iniciais para demonstração
-- ============================================================
INSERT INTO branches (name, address) VALUES
  ('Loja 1 - Centro', 'Rua das Palmeiras, 123 - Centro, São Paulo/SP'),
  ('Loja 2 - Bairro', 'Av. Brasil, 456 - Bairro Novo, Campinas/SP')
ON CONFLICT DO NOTHING;

INSERT INTO wallet_balance (balance) VALUES (0)
ON CONFLICT DO NOTHING;

INSERT INTO store_settings (primary_color, nav_color) VALUES ('#3193e5', '#0b1927')
ON CONFLICT DO NOTHING;
