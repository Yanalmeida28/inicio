-- Migration: Harden Multi-tenant & Multi-branch Security for Production (Enforced)
-- File: 20260903130000_harden_multitenant_security.sql
-- Date: 2026-09-03

-- ============================================================
-- 0. ESTRUTURA: Identidade de Funcionário via auth_user_id
-- ============================================================
ALTER TABLE partner_salespeople ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_salespeople_auth_user_id ON partner_salespeople(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- ============================================================
-- 1. CRÍTICO: b2b_orders (Isolamento por user_id)
-- ============================================================
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
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "insert_own_b2b_orders" ON b2b_orders
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_b2b_orders" ON b2b_orders
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_b2b_orders" ON b2b_orders
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- 2. ALTO & VIEWS PÚBLICAS: Catálogo Público sem expor cost_price e dados internos
-- ============================================================

-- Remove quaisquer políticas públicas diretas das tabelas internas
DROP POLICY IF EXISTS "public_select_enabled_store_settings" ON store_settings_v2;
DROP POLICY IF EXISTS "public_select_catalog_partner_profiles" ON partner_profiles;
DROP POLICY IF EXISTS "public_select_catalog_partner_branches" ON partner_branches;
DROP POLICY IF EXISTS "public_select_catalog_products" ON partner_products;

-- VIEW 1: Store Settings Pública (exclusivamente visual e horário público - SEM internal_notice)
CREATE OR REPLACE VIEW public_catalog_store_settings AS
SELECT
  id,
  user_id,
  catalog_slug,
  catalog_enabled,
  logo_url,
  banner_url,
  primary_color,
  nav_color,
  business_hours
FROM store_settings_v2
WHERE catalog_enabled = true;

-- VIEW 2: Perfis de Parceria Públicos (exclusivamente business_name e account_name - SEM name, document, whatsapp ou subscription)
CREATE OR REPLACE VIEW public_catalog_partner_profiles AS
SELECT
  p.id,
  p.business_name,
  p.account_name
FROM partner_profiles p
JOIN store_settings_v2 s ON s.user_id = p.id
WHERE s.catalog_enabled = true;

-- VIEW 3: Filiais Públicas (expõe apenas nome e endereço)
CREATE OR REPLACE VIEW public_catalog_partner_branches AS
SELECT
  b.id,
  b.user_id,
  b.name,
  b.address
FROM partner_branches b
JOIN store_settings_v2 s ON s.user_id = b.user_id
WHERE s.catalog_enabled = true;

-- VIEW 4: Produtos Públicos (expõe apenas nome, foto, estoque, preços de venda, SEM cost_price)
CREATE OR REPLACE VIEW public_catalog_products AS
SELECT
  p.id,
  p.user_id,
  p.branch_id,
  p.name,
  p.sale_price,
  p.wholesale_price,
  p.image_url,
  p.stock,
  p.min_stock,
  p.category,
  p.sku,
  p.is_service,
  p.created_at,
  p.updated_at
FROM partner_products p
JOIN store_settings_v2 s ON s.user_id = p.user_id
WHERE s.catalog_enabled = true
  AND p.is_service = false
  AND p.stock > 0;

-- Concede privilégio de SELECT nas VIEWS públicas para anon e authenticated
GRANT SELECT ON public_catalog_store_settings TO anon, authenticated;
GRANT SELECT ON public_catalog_partner_profiles TO anon, authenticated;
GRANT SELECT ON public_catalog_partner_branches TO anon, authenticated;
GRANT SELECT ON public_catalog_products TO anon, authenticated;

-- ============================================================
-- 3. ALTO: Fechamento de Tabelas Legadas
-- ============================================================
-- Bloqueia acesso direto de anon e authenticated para tabelas antigas obsoletas

-- branches
DROP POLICY IF EXISTS "anon_select_branches" ON branches;
DROP POLICY IF EXISTS "anon_insert_branches" ON branches;
DROP POLICY IF EXISTS "anon_update_branches" ON branches;
DROP POLICY IF EXISTS "anon_delete_branches" ON branches;
DROP POLICY IF EXISTS "deny_all_branches" ON branches;
CREATE POLICY "deny_all_branches" ON branches FOR ALL TO anon, authenticated USING (false);

-- store_settings
DROP POLICY IF EXISTS "anon_select_store_settings" ON store_settings;
DROP POLICY IF EXISTS "anon_insert_store_settings" ON store_settings;
DROP POLICY IF EXISTS "anon_update_store_settings" ON store_settings;
DROP POLICY IF EXISTS "anon_delete_store_settings" ON store_settings;
DROP POLICY IF EXISTS "deny_all_store_settings" ON store_settings;
CREATE POLICY "deny_all_store_settings" ON store_settings FOR ALL TO anon, authenticated USING (false);

-- rma_requests
DROP POLICY IF EXISTS "anon_select_rma" ON rma_requests;
DROP POLICY IF EXISTS "anon_insert_rma" ON rma_requests;
DROP POLICY IF EXISTS "anon_update_rma" ON rma_requests;
DROP POLICY IF EXISTS "anon_delete_rma" ON rma_requests;
DROP POLICY IF EXISTS "deny_all_rma" ON rma_requests;
CREATE POLICY "deny_all_rma" ON rma_requests FOR ALL TO anon, authenticated USING (false);

-- local_stock
DROP POLICY IF EXISTS "anon_select_local_stock" ON local_stock;
DROP POLICY IF EXISTS "anon_insert_local_stock" ON local_stock;
DROP POLICY IF EXISTS "anon_update_local_stock" ON local_stock;
DROP POLICY IF EXISTS "anon_delete_local_stock" ON local_stock;
DROP POLICY IF EXISTS "deny_all_local_stock" ON local_stock;
CREATE POLICY "deny_all_local_stock" ON local_stock FOR ALL TO anon, authenticated USING (false);

-- wallet_balance
DROP POLICY IF EXISTS "anon_select_wallet" ON wallet_balance;
DROP POLICY IF EXISTS "anon_insert_wallet" ON wallet_balance;
DROP POLICY IF EXISTS "anon_update_wallet" ON wallet_balance;
DROP POLICY IF EXISTS "anon_delete_wallet" ON wallet_balance;
DROP POLICY IF EXISTS "deny_all_wallet" ON wallet_balance;
CREATE POLICY "deny_all_wallet" ON wallet_balance FOR ALL TO anon, authenticated USING (false);

-- ============================================================
-- 4. MÉDIO: SECURITY DEFINER e busca/validação de filial para funcionários
-- ============================================================

-- Valida integridade do funcionário/vendedor especificamente em partner_sales (onde existe salesperson_id)
CREATE OR REPLACE FUNCTION check_salesperson_branch_integrity()
RETURNS TRIGGER AS $$
DECLARE
  v_sp_branch_id uuid;
BEGIN
  IF NEW.salesperson_id IS NOT NULL THEN
    SELECT branch_id INTO v_sp_branch_id
    FROM public.partner_salespeople
    WHERE id = NEW.salesperson_id AND user_id = NEW.user_id;

    -- Se o funcionário possui uma filial fixa cadastrada e ela difere da filial da operação, barra a transação
    IF v_sp_branch_id IS NOT NULL AND NEW.branch_id IS NOT NULL AND v_sp_branch_id <> NEW.branch_id THEN
      RAISE EXCEPTION 'Acesso negado: o funcionário % pertence à filial % e não pode registrar operações na filial %.', NEW.salesperson_id, v_sp_branch_id, NEW.branch_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_check_sale_salesperson_branch ON partner_sales;
CREATE TRIGGER trg_check_sale_salesperson_branch
  BEFORE INSERT OR UPDATE ON partner_sales
  FOR EACH ROW
  EXECUTE FUNCTION check_salesperson_branch_integrity();

-- Function trigger genérico para tabelas que NÃO possuem salesperson_id (ex: partner_products, partner_customers)
-- Garante que a filial indicada pertença estritamente à mesma empresa (user_id)
CREATE OR REPLACE FUNCTION check_record_branch_company_integrity()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.branch_id IS NOT NULL AND NEW.user_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.partner_branches
        WHERE id = NEW.branch_id AND user_id = NEW.user_id
      ) THEN
        RAISE EXCEPTION 'Acesso negado: a filial informada não pertence a esta empresa.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_check_product_branch_integrity ON partner_products;
CREATE TRIGGER trg_check_product_branch_integrity
  BEFORE INSERT OR UPDATE ON partner_products
  FOR EACH ROW
  EXECUTE FUNCTION check_record_branch_company_integrity();

-- Migration: Harden Multi-tenant & Multi-branch Security for Production (Enforced)
-- File: 20260903130000_harden_multitenant_security.sql
-- Date: 2026-09-03

-- ============================================================
-- 0. ESTRUTURA: Identidade de Funcionário via auth_user_id
-- ============================================================
ALTER TABLE partner_salespeople ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_salespeople_auth_user_id ON partner_salespeople(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- ============================================================
-- 1. CRÍTICO: b2b_orders (Isolamento por user_id)
-- ============================================================
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
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "insert_own_b2b_orders" ON b2b_orders
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_b2b_orders" ON b2b_orders
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_b2b_orders" ON b2b_orders
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- 2. ALTO & VIEWS PÚBLICAS: Catálogo Público sem expor cost_price, internal_notice e dados sensíveis
-- ============================================================

-- Remove quaisquer políticas públicas diretas das tabelas internas
DROP POLICY IF EXISTS "public_select_enabled_store_settings" ON store_settings_v2;
DROP POLICY IF EXISTS "public_select_catalog_partner_profiles" ON partner_profiles;
DROP POLICY IF EXISTS "public_select_catalog_partner_branches" ON partner_branches;
DROP POLICY IF EXISTS "public_select_catalog_products" ON partner_products;

-- VIEW 1: Store Settings Pública (exclusivamente visual e horário público - SEM internal_notice)
CREATE OR REPLACE VIEW public_catalog_store_settings AS
SELECT
  id,
  user_id,
  catalog_slug,
  catalog_enabled,
  logo_url,
  banner_url,
  primary_color,
  nav_color,
  business_hours
FROM store_settings_v2
WHERE catalog_enabled = true;

-- VIEW 2: Perfis de Parceria Públicos (exclusivamente business_name e account_name - SEM name, document, whatsapp ou subscription)
CREATE OR REPLACE VIEW public_catalog_partner_profiles AS
SELECT
  p.id,
  p.business_name,
  p.account_name
FROM partner_profiles p
JOIN store_settings_v2 s ON s.user_id = p.id
WHERE s.catalog_enabled = true;

-- VIEW 3: Filiais Públicas (exclusivamente nome e endereço público de filiais ativas)
CREATE OR REPLACE VIEW public_catalog_partner_branches AS
SELECT
  b.id,
  b.user_id,
  b.name,
  b.address
FROM partner_branches b
JOIN store_settings_v2 s ON s.user_id = b.user_id
WHERE s.catalog_enabled = true
  AND b.is_active = true;

-- VIEW 4: Produtos Públicos (exclusivamente dados públicos do produto - SEM cost_price, icms, ncm, etc.)
CREATE OR REPLACE VIEW public_catalog_products AS
SELECT
  p.id,
  p.user_id,
  p.branch_id,
  p.name,
  p.sale_price,
  p.image_url,
  p.stock,
  p.min_stock,
  p.category,
  p.sku,
  p.is_service,
  p.created_at,
  p.updated_at
FROM partner_products p
JOIN store_settings_v2 s ON s.user_id = p.user_id
WHERE s.catalog_enabled = true
  AND p.is_service = false
  AND p.stock > 0;

-- Concede privilégio de SELECT nas VIEWS públicas para anon e authenticated
GRANT SELECT ON public_catalog_store_settings TO anon, authenticated;
GRANT SELECT ON public_catalog_partner_profiles TO anon, authenticated;
GRANT SELECT ON public_catalog_partner_branches TO anon, authenticated;
GRANT SELECT ON public_catalog_products TO anon, authenticated;

-- ============================================================
-- 3. BLOQUEIO DE ESCRITA DIRETA (PostgREST) E RLS SUPORTANDO FUNCIONÁRIOS
-- ============================================================

-- partner_products: SELECT para proprietário e funcionário autenticado por auth_user_id
DROP POLICY IF EXISTS "select_own_products" ON partner_products;
DROP POLICY IF EXISTS "select_authenticated_products" ON partner_products;
DROP POLICY IF EXISTS "insert_own_products" ON partner_products;
DROP POLICY IF EXISTS "update_own_products" ON partner_products;
DROP POLICY IF EXISTS "delete_own_products" ON partner_products;
DROP POLICY IF EXISTS "deny_direct_insert_products" ON partner_products;
DROP POLICY IF EXISTS "deny_direct_update_products" ON partner_products;
DROP POLICY IF EXISTS "deny_direct_delete_products" ON partner_products;

CREATE POLICY "select_authenticated_products" ON partner_products
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.partner_salespeople sp
      WHERE sp.auth_user_id = auth.uid()
        AND COALESCE(sp.active, sp.is_active, true) = true
        AND sp.user_id = partner_products.user_id
        AND (sp.role = 'administrador' OR sp.branch_id IS NULL OR partner_products.branch_id IS NULL OR partner_products.branch_id = sp.branch_id)
    )
  );

CREATE POLICY "deny_direct_insert_products" ON partner_products FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "deny_direct_update_products" ON partner_products FOR UPDATE TO authenticated USING (false);
CREATE POLICY "deny_direct_delete_products" ON partner_products FOR DELETE TO authenticated USING (false);

-- partner_customers: SELECT para proprietário e funcionário autenticado
DROP POLICY IF EXISTS "select_own_customers" ON partner_customers;
DROP POLICY IF EXISTS "select_authenticated_customers" ON partner_customers;
DROP POLICY IF EXISTS "insert_own_customers" ON partner_customers;
DROP POLICY IF EXISTS "update_own_customers" ON partner_customers;
DROP POLICY IF EXISTS "delete_own_customers" ON partner_customers;
DROP POLICY IF EXISTS "deny_direct_insert_customers" ON partner_customers;
DROP POLICY IF EXISTS "deny_direct_update_customers" ON partner_customers;
DROP POLICY IF EXISTS "deny_direct_delete_customers" ON partner_customers;

CREATE POLICY "select_authenticated_customers" ON partner_customers
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.partner_salespeople sp
      WHERE sp.auth_user_id = auth.uid()
        AND COALESCE(sp.active, sp.is_active, true) = true
        AND sp.user_id = partner_customers.user_id
        AND (sp.role = 'administrador' OR sp.branch_id IS NULL OR partner_customers.branch_id IS NULL OR partner_customers.branch_id = sp.branch_id)
    )
  );

CREATE POLICY "deny_direct_insert_customers" ON partner_customers FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "deny_direct_update_customers" ON partner_customers FOR UPDATE TO authenticated USING (false);
CREATE POLICY "deny_direct_delete_customers" ON partner_customers FOR DELETE TO authenticated USING (false);

-- partner_sales: SELECT para proprietário e funcionário autenticado
DROP POLICY IF EXISTS "select_own_sales" ON partner_sales;
DROP POLICY IF EXISTS "select_authenticated_sales" ON partner_sales;
DROP POLICY IF EXISTS "insert_own_sales" ON partner_sales;
DROP POLICY IF EXISTS "update_own_sales" ON partner_sales;
DROP POLICY IF EXISTS "delete_own_sales" ON partner_sales;
DROP POLICY IF EXISTS "deny_direct_insert_sales" ON partner_sales;
DROP POLICY IF EXISTS "deny_direct_update_sales" ON partner_sales;
DROP POLICY IF EXISTS "deny_direct_delete_sales" ON partner_sales;

CREATE POLICY "select_authenticated_sales" ON partner_sales
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.partner_salespeople sp
      WHERE sp.auth_user_id = auth.uid()
        AND COALESCE(sp.active, sp.is_active, true) = true
        AND sp.user_id = partner_sales.user_id
        AND (sp.role = 'administrador' OR sp.branch_id IS NULL OR partner_sales.branch_id IS NULL OR partner_sales.branch_id = sp.branch_id)
    )
  );

CREATE POLICY "deny_direct_insert_sales" ON partner_sales FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "deny_direct_update_sales" ON partner_sales FOR UPDATE TO authenticated USING (false);
CREATE POLICY "deny_direct_delete_sales" ON partner_sales FOR DELETE TO authenticated USING (false);

-- partner_salespeople: SELECT para proprietário e funcionário autenticado
DROP POLICY IF EXISTS "select_own_salespeople" ON partner_salespeople;
DROP POLICY IF EXISTS "select_authenticated_salespeople" ON partner_salespeople;
CREATE POLICY "select_authenticated_salespeople" ON partner_salespeople
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR auth_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.partner_salespeople sp
      WHERE sp.auth_user_id = auth.uid()
        AND COALESCE(sp.active, sp.is_active, true) = true
        AND sp.user_id = partner_salespeople.user_id
    )
  );

-- partner_branches: SELECT para proprietário e funcionário autenticado
DROP POLICY IF EXISTS "select_own_branches" ON partner_branches;
DROP POLICY IF EXISTS "select_authenticated_branches" ON partner_branches;
CREATE POLICY "select_authenticated_branches" ON partner_branches
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.partner_salespeople sp
      WHERE sp.auth_user_id = auth.uid()
        AND COALESCE(sp.active, sp.is_active, true) = true
        AND sp.user_id = partner_branches.user_id
        AND (sp.role = 'administrador' OR sp.branch_id IS NULL OR partner_branches.id = sp.branch_id)
    )
  );

-- ============================================================
-- 4. ALTO: Fechamento de Tabelas Legadas
-- ============================================================
-- Bloqueia acesso direto de anon e authenticated para tabelas antigas obsoletas

-- branches
DROP POLICY IF EXISTS "anon_select_branches" ON branches;
DROP POLICY IF EXISTS "anon_insert_branches" ON branches;
DROP POLICY IF EXISTS "anon_update_branches" ON branches;
DROP POLICY IF EXISTS "anon_delete_branches" ON branches;
DROP POLICY IF EXISTS "deny_all_branches" ON branches;
CREATE POLICY "deny_all_branches" ON branches FOR ALL TO anon, authenticated USING (false);

-- store_settings
DROP POLICY IF EXISTS "anon_select_store_settings" ON store_settings;
DROP POLICY IF EXISTS "anon_insert_store_settings" ON store_settings;
DROP POLICY IF EXISTS "anon_update_store_settings" ON store_settings;
DROP POLICY IF EXISTS "anon_delete_store_settings" ON store_settings;
DROP POLICY IF EXISTS "deny_all_store_settings" ON store_settings;
CREATE POLICY "deny_all_store_settings" ON store_settings FOR ALL TO anon, authenticated USING (false);

-- rma_requests
DROP POLICY IF EXISTS "anon_select_rma" ON rma_requests;
DROP POLICY IF EXISTS "anon_insert_rma" ON rma_requests;
DROP POLICY IF EXISTS "anon_update_rma" ON rma_requests;
DROP POLICY IF EXISTS "anon_delete_rma" ON rma_requests;
DROP POLICY IF EXISTS "deny_all_rma" ON rma_requests;
CREATE POLICY "deny_all_rma" ON rma_requests FOR ALL TO anon, authenticated USING (false);

-- local_stock
DROP POLICY IF EXISTS "anon_select_local_stock" ON local_stock;
DROP POLICY IF EXISTS "anon_insert_local_stock" ON local_stock;
DROP POLICY IF EXISTS "anon_update_local_stock" ON local_stock;
DROP POLICY IF EXISTS "anon_delete_local_stock" ON local_stock;
DROP POLICY IF EXISTS "deny_all_local_stock" ON local_stock;
CREATE POLICY "deny_all_local_stock" ON local_stock FOR ALL TO anon, authenticated USING (false);

-- wallet_balance
DROP POLICY IF EXISTS "anon_select_wallet" ON wallet_balance;
DROP POLICY IF EXISTS "anon_insert_wallet" ON wallet_balance;
DROP POLICY IF EXISTS "anon_update_wallet" ON wallet_balance;
DROP POLICY IF EXISTS "anon_delete_wallet" ON wallet_balance;
DROP POLICY IF EXISTS "deny_all_wallet" ON wallet_balance;
CREATE POLICY "deny_all_wallet" ON wallet_balance FOR ALL TO anon, authenticated USING (false);

-- ============================================================
-- 5. RPCs SECURITY DEFINER Controladas para Mutação por Funcionários
-- ============================================================

-- RPC 1: Mutação de Produto (Insert / Update)
CREATE OR REPLACE FUNCTION public.execute_partner_product_mutation(
  p_salesperson_id uuid,
  p_pin text,
  p_product_id uuid,
  p_branch_id uuid,
  p_name text,
  p_cost_price numeric,
  p_sale_price numeric,
  p_wholesale_price numeric,
  p_stock integer,
  p_min_stock integer,
  p_category text,
  p_sku text,
  p_is_service boolean,
  p_image_url text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_calling_user_id uuid := auth.uid();
  v_sp_id uuid;
  v_sp_company_id uuid;
  v_sp_branch_id uuid;
  v_sp_role text;
  v_sp_active boolean;
  v_sp_pin text;
  v_effective_user_id uuid;
  v_effective_branch_id uuid;
  v_target_product_id uuid;
BEGIN
  IF v_calling_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;

  -- 1. Verifica se auth.uid() é um funcionário individual com auth_user_id
  SELECT id, user_id, branch_id, role, COALESCE(active, is_active, true), pin
  INTO v_sp_id, v_sp_company_id, v_sp_branch_id, v_sp_role, v_sp_active, v_sp_pin
  FROM public.partner_salespeople
  WHERE auth_user_id = v_calling_user_id;

  IF FOUND THEN
    IF NOT v_sp_active THEN
      RAISE EXCEPTION 'Acesso negado: conta de funcionário desativada.';
    END IF;

    v_effective_user_id := v_sp_company_id;

    IF v_sp_role <> 'administrador' AND v_sp_branch_id IS NOT NULL THEN
      IF p_branch_id IS NOT NULL AND p_branch_id <> v_sp_branch_id THEN
        RAISE EXCEPTION 'Acesso negado: você pertence à filial % e não pode gravar produtos na filial %.', v_sp_branch_id, p_branch_id;
      END IF;
      v_effective_branch_id := v_sp_branch_id;
    ELSE
      v_effective_branch_id := p_branch_id;
    END IF;

  ELSE
    -- 2. Não é funcionário individual. Verifica se é Proprietário/Empresa
    IF EXISTS (SELECT 1 FROM public.partner_profiles WHERE id = v_calling_user_id) THEN
      v_effective_user_id := v_calling_user_id;
      v_effective_branch_id := p_branch_id;

      IF p_salesperson_id IS NOT NULL THEN
        SELECT branch_id, pin, role, COALESCE(active, is_active, true)
        INTO v_sp_branch_id, v_sp_pin, v_sp_role, v_sp_active
        FROM public.partner_salespeople
        WHERE id = p_salesperson_id AND user_id = v_effective_user_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Operador selecionado não encontrado nesta empresa.';
        END IF;

        IF NOT v_sp_active THEN
          RAISE EXCEPTION 'Acesso negado: operador selecionado está desativado.';
        END IF;

        IF v_sp_pin IS NOT NULL AND v_sp_pin <> p_pin THEN
          RAISE EXCEPTION 'PIN do operador incorreto.';
        END IF;

        IF v_sp_role <> 'administrador' AND v_sp_branch_id IS NOT NULL THEN
          IF p_branch_id IS NOT NULL AND p_branch_id <> v_sp_branch_id THEN
            RAISE EXCEPTION 'Acesso negado: o operador pertence à filial % e não pode operar na filial %.', v_sp_branch_id, p_branch_id;
          END IF;
          v_effective_branch_id := v_sp_branch_id;
        END IF;
      END IF;
    ELSE
      RAISE EXCEPTION 'Acesso negado: usuário não autorizado nesta empresa.';
    END IF;
  END IF;

  IF v_effective_branch_id IS NULL THEN
    RAISE EXCEPTION 'É necessário informar uma filial válida.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.partner_branches
    WHERE id = v_effective_branch_id AND user_id = v_effective_user_id
  ) THEN
    RAISE EXCEPTION 'Filial informada não pertence a esta empresa.';
  END IF;

  v_target_product_id := COALESCE(p_product_id, gen_random_uuid());

  INSERT INTO public.partner_products (
    id, user_id, branch_id, name, cost_price, sale_price, wholesale_price, stock, min_stock, category, sku, is_service, image_url, updated_at
  ) VALUES (
    v_target_product_id, v_effective_user_id, v_effective_branch_id, p_name, COALESCE(p_cost_price, 0), COALESCE(p_sale_price, 0), COALESCE(p_wholesale_price, 0), COALESCE(p_stock, 0), COALESCE(p_min_stock, 5), p_category, p_sku, COALESCE(p_is_service, false), p_image_url, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    branch_id = EXCLUDED.branch_id,
    name = EXCLUDED.name,
    cost_price = EXCLUDED.cost_price,
    sale_price = EXCLUDED.sale_price,
    wholesale_price = EXCLUDED.wholesale_price,
    stock = EXCLUDED.stock,
    min_stock = EXCLUDED.min_stock,
    category = EXCLUDED.category,
    sku = EXCLUDED.sku,
    is_service = EXCLUDED.is_service,
    image_url = COALESCE(EXCLUDED.image_url, partner_products.image_url),
    updated_at = now();

  RETURN v_target_product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.execute_partner_product_mutation TO authenticated;

-- RPC 2: Exclusão de Produto
CREATE OR REPLACE FUNCTION public.execute_partner_product_delete(
  p_salesperson_id uuid,
  p_pin text,
  p_product_id uuid
)
RETURNS boolean AS $$
DECLARE
  v_calling_user_id uuid := auth.uid();
  v_sp_id uuid;
  v_sp_company_id uuid;
  v_sp_branch_id uuid;
  v_sp_role text;
  v_sp_active boolean;
  v_sp_pin text;
  v_effective_user_id uuid;
  v_prod_branch_id uuid;
BEGIN
  IF v_calling_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;

  SELECT id, user_id, branch_id, role, COALESCE(active, is_active, true), pin
  INTO v_sp_id, v_sp_company_id, v_sp_branch_id, v_sp_role, v_sp_active, v_sp_pin
  FROM public.partner_salespeople
  WHERE auth_user_id = v_calling_user_id;

  IF FOUND THEN
    IF NOT v_sp_active THEN
      RAISE EXCEPTION 'Acesso negado: conta de funcionário desativada.';
    END IF;
    v_effective_user_id := v_sp_company_id;
  ELSE
    IF EXISTS (SELECT 1 FROM public.partner_profiles WHERE id = v_calling_user_id) THEN
      v_effective_user_id := v_calling_user_id;
      IF p_salesperson_id IS NOT NULL THEN
        SELECT branch_id, pin, role, COALESCE(active, is_active, true)
        INTO v_sp_branch_id, v_sp_pin, v_sp_role, v_sp_active
        FROM public.partner_salespeople
        WHERE id = p_salesperson_id AND user_id = v_effective_user_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Operador não encontrado.';
        END IF;

        IF NOT v_sp_active THEN
          RAISE EXCEPTION 'Acesso negado: operador desativado.';
        END IF;

        IF v_sp_pin IS NOT NULL AND v_sp_pin <> p_pin THEN
          RAISE EXCEPTION 'PIN incorreto.';
        END IF;
      END IF;
    ELSE
      RAISE EXCEPTION 'Acesso negado: usuário não autorizado.';
    END IF;
  END IF;

  SELECT branch_id INTO v_prod_branch_id
  FROM public.partner_products
  WHERE id = p_product_id AND user_id = v_effective_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado.';
  END IF;

  IF v_sp_role IS NOT NULL AND v_sp_role <> 'administrador' AND v_sp_branch_id IS NOT NULL THEN
    IF v_prod_branch_id IS NOT NULL AND v_prod_branch_id <> v_sp_branch_id THEN
      RAISE EXCEPTION 'Acesso negado: você não pode excluir produtos de outra filial.';
    END IF;
  END IF;

  DELETE FROM public.partner_products
  WHERE id = p_product_id AND user_id = v_effective_user_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.execute_partner_product_delete TO authenticated;

-- RPC 3: Mutação de Cliente (Insert / Update)
CREATE OR REPLACE FUNCTION public.execute_partner_customer_mutation(
  p_salesperson_id uuid,
  p_pin text,
  p_customer_id uuid,
  p_branch_id uuid,
  p_name text,
  p_document text,
  p_person_type text,
  p_phone text,
  p_email text,
  p_birthday date,
  p_address text,
  p_neighborhood text,
  p_city text,
  p_device_model text,
  p_notes text,
  p_customer_type text
)
RETURNS uuid AS $$
DECLARE
  v_calling_user_id uuid := auth.uid();
  v_sp_id uuid;
  v_sp_company_id uuid;
  v_sp_branch_id uuid;
  v_sp_role text;
  v_sp_active boolean;
  v_sp_pin text;
  v_effective_user_id uuid;
  v_effective_branch_id uuid;
  v_target_customer_id uuid;
BEGIN
  IF v_calling_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;

  SELECT id, user_id, branch_id, role, COALESCE(active, is_active, true), pin
  INTO v_sp_id, v_sp_company_id, v_sp_branch_id, v_sp_role, v_sp_active, v_sp_pin
  FROM public.partner_salespeople
  WHERE auth_user_id = v_calling_user_id;

  IF FOUND THEN
    IF NOT v_sp_active THEN
      RAISE EXCEPTION 'Acesso negado: conta de funcionário desativada.';
    END IF;

    v_effective_user_id := v_sp_company_id;

    IF v_sp_role <> 'administrador' AND v_sp_branch_id IS NOT NULL THEN
      IF p_branch_id IS NOT NULL AND p_branch_id <> v_sp_branch_id THEN
        RAISE EXCEPTION 'Acesso negado: funcionário vinculado à filial % não pode cadastrar clientes na filial %.', v_sp_branch_id, p_branch_id;
      END IF;
      v_effective_branch_id := v_sp_branch_id;
    ELSE
      v_effective_branch_id := p_branch_id;
    END IF;

  ELSE
    IF EXISTS (SELECT 1 FROM public.partner_profiles WHERE id = v_calling_user_id) THEN
      v_effective_user_id := v_calling_user_id;
      v_effective_branch_id := p_branch_id;

      IF p_salesperson_id IS NOT NULL THEN
        SELECT branch_id, pin, role, COALESCE(active, is_active, true)
        INTO v_sp_branch_id, v_sp_pin, v_sp_role, v_sp_active
        FROM public.partner_salespeople
        WHERE id = p_salesperson_id AND user_id = v_effective_user_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Operador não encontrado nesta empresa.';
        END IF;

        IF NOT v_sp_active THEN
          RAISE EXCEPTION 'Acesso negado: operador desativado.';
        END IF;

        IF v_sp_pin IS NOT NULL AND v_sp_pin <> p_pin THEN
          RAISE EXCEPTION 'PIN incorreto.';
        END IF;

        IF v_sp_role <> 'administrador' AND v_sp_branch_id IS NOT NULL THEN
          IF p_branch_id IS NOT NULL AND p_branch_id <> v_sp_branch_id THEN
            RAISE EXCEPTION 'Acesso negado: o operador pertence à filial % e não pode gravar clientes na filial %.', v_sp_branch_id, p_branch_id;
          END IF;
          v_effective_branch_id := v_sp_branch_id;
        END IF;
      END IF;
    ELSE
      RAISE EXCEPTION 'Acesso negado: usuário não autorizado.';
    END IF;
  END IF;

  IF v_effective_branch_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.partner_branches
      WHERE id = v_effective_branch_id AND user_id = v_effective_user_id
    ) THEN
      RAISE EXCEPTION 'Filial informada não pertence a esta empresa.';
    END IF;
  END IF;

  v_target_customer_id := COALESCE(p_customer_id, gen_random_uuid());

  INSERT INTO public.partner_customers (
    id, user_id, branch_id, name, document, person_type, phone, email, birthday, address, neighborhood, city, device_model, notes, customer_type
  ) VALUES (
    v_target_customer_id, v_effective_user_id, v_effective_branch_id, p_name, p_document, p_person_type, p_phone, p_email, p_birthday, p_address, p_neighborhood, p_city, p_device_model, p_notes, COALESCE(p_customer_type, 'varejo')
  )
  ON CONFLICT (id) DO UPDATE SET
    branch_id = EXCLUDED.branch_id,
    name = EXCLUDED.name,
    document = EXCLUDED.document,
    person_type = EXCLUDED.person_type,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    birthday = EXCLUDED.birthday,
    address = EXCLUDED.address,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    device_model = EXCLUDED.device_model,
    notes = EXCLUDED.notes,
    customer_type = EXCLUDED.customer_type;

  RETURN v_target_customer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.execute_partner_customer_mutation TO authenticated;

-- RPC 4: Exclusão de Cliente
CREATE OR REPLACE FUNCTION public.execute_partner_customer_delete(
  p_salesperson_id uuid,
  p_pin text,
  p_customer_id uuid
)
RETURNS boolean AS $$
DECLARE
  v_calling_user_id uuid := auth.uid();
  v_sp_id uuid;
  v_sp_company_id uuid;
  v_sp_branch_id uuid;
  v_sp_role text;
  v_sp_active boolean;
  v_sp_pin text;
  v_effective_user_id uuid;
  v_cust_branch_id uuid;
BEGIN
  IF v_calling_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;

  SELECT id, user_id, branch_id, role, COALESCE(active, is_active, true), pin
  INTO v_sp_id, v_sp_company_id, v_sp_branch_id, v_sp_role, v_sp_active, v_sp_pin
  FROM public.partner_salespeople
  WHERE auth_user_id = v_calling_user_id;

  IF FOUND THEN
    IF NOT v_sp_active THEN
      RAISE EXCEPTION 'Acesso negado: conta de funcionário desativada.';
    END IF;
    v_effective_user_id := v_sp_company_id;
  ELSE
    IF EXISTS (SELECT 1 FROM public.partner_profiles WHERE id = v_calling_user_id) THEN
      v_effective_user_id := v_calling_user_id;
      IF p_salesperson_id IS NOT NULL THEN
        SELECT branch_id, pin, role, COALESCE(active, is_active, true)
        INTO v_sp_branch_id, v_sp_pin, v_sp_role, v_sp_active
        FROM public.partner_salespeople
        WHERE id = p_salesperson_id AND user_id = v_effective_user_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Operador não encontrado.';
        END IF;

        IF NOT v_sp_active THEN
          RAISE EXCEPTION 'Acesso negado: operador desativado.';
        END IF;

        IF v_sp_pin IS NOT NULL AND v_sp_pin <> p_pin THEN
          RAISE EXCEPTION 'PIN incorreto.';
        END IF;
      END IF;
    ELSE
      RAISE EXCEPTION 'Acesso negado: usuário não autorizado.';
    END IF;
  END IF;

  SELECT branch_id INTO v_cust_branch_id
  FROM public.partner_customers
  WHERE id = p_customer_id AND user_id = v_effective_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado.';
  END IF;

  IF v_sp_role IS NOT NULL AND v_sp_role <> 'administrador' AND v_sp_branch_id IS NOT NULL THEN
    IF v_cust_branch_id IS NOT NULL AND v_cust_branch_id <> v_sp_branch_id THEN
      RAISE EXCEPTION 'Acesso negado: você não pode excluir clientes de outra filial.';
    END IF;
  END IF;

  DELETE FROM public.partner_customers
  WHERE id = p_customer_id AND user_id = v_effective_user_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.execute_partner_customer_delete TO authenticated;

-- RPC 5: Mutação de Venda / Pré-Venda
CREATE OR REPLACE FUNCTION public.execute_partner_sale_mutation(
  p_salesperson_id uuid,
  p_pin text,
  p_sale_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_items jsonb,
  p_total numeric,
  p_imei text,
  p_serial_number text,
  p_payment_method text,
  p_branch_id uuid,
  p_status text,
  p_origin text
)
RETURNS uuid AS $$
DECLARE
  v_calling_user_id uuid := auth.uid();
  v_sp_id uuid;
  v_sp_company_id uuid;
  v_sp_branch_id uuid;
  v_sp_role text;
  v_sp_active boolean;
  v_sp_pin text;
  v_effective_user_id uuid;
  v_effective_branch_id uuid;
  v_effective_sp_id uuid;
  v_target_sale_id uuid;
BEGIN
  IF v_calling_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;

  SELECT id, user_id, branch_id, role, COALESCE(active, is_active, true), pin
  INTO v_sp_id, v_sp_company_id, v_sp_branch_id, v_sp_role, v_sp_active, v_sp_pin
  FROM public.partner_salespeople
  WHERE auth_user_id = v_calling_user_id;

  IF FOUND THEN
    IF NOT v_sp_active THEN
      RAISE EXCEPTION 'Acesso negado: conta de funcionário desativada.';
    END IF;

    v_effective_user_id := v_sp_company_id;
    v_effective_sp_id := v_sp_id;

    IF v_sp_role <> 'administrador' AND v_sp_branch_id IS NOT NULL THEN
      IF p_branch_id IS NOT NULL AND p_branch_id <> v_sp_branch_id THEN
        RAISE EXCEPTION 'Acesso negado: você só pode registrar vendas na sua filial vinculada.';
      END IF;
      v_effective_branch_id := v_sp_branch_id;
    ELSE
      v_effective_branch_id := p_branch_id;
    END IF;

  ELSE
    IF EXISTS (SELECT 1 FROM public.partner_profiles WHERE id = v_calling_user_id) THEN
      v_effective_user_id := v_calling_user_id;
      v_effective_branch_id := p_branch_id;
      v_effective_sp_id := p_salesperson_id;

      IF p_salesperson_id IS NOT NULL THEN
        SELECT branch_id, pin, role, COALESCE(active, is_active, true)
        INTO v_sp_branch_id, v_sp_pin, v_sp_role, v_sp_active
        FROM public.partner_salespeople
        WHERE id = p_salesperson_id AND user_id = v_effective_user_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Operador não encontrado nesta empresa.';
        END IF;

        IF NOT v_sp_active THEN
          RAISE EXCEPTION 'Acesso negado: operador desativado.';
        END IF;

        IF v_sp_pin IS NOT NULL AND v_sp_pin <> p_pin THEN
          RAISE EXCEPTION 'PIN incorreto.';
        END IF;

        IF v_sp_role <> 'administrador' AND v_sp_branch_id IS NOT NULL THEN
          IF p_branch_id IS NOT NULL AND p_branch_id <> v_sp_branch_id THEN
            RAISE EXCEPTION 'Acesso negado: o operador pertence à filial % e não pode gravar vendas na filial %.', v_sp_branch_id, p_branch_id;
          END IF;
          v_effective_branch_id := v_sp_branch_id;
        END IF;
      END IF;
    ELSE
      RAISE EXCEPTION 'Acesso negado: usuário não autorizado.';
    END IF;
  END IF;

  IF v_effective_branch_id IS NULL THEN
    RAISE EXCEPTION 'Filial inválida.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.partner_branches
    WHERE id = v_effective_branch_id AND user_id = v_effective_user_id
  ) THEN
    RAISE EXCEPTION 'Filial informada não pertence a esta empresa.';
  END IF;

  v_target_sale_id := COALESCE(p_sale_id, gen_random_uuid());

  INSERT INTO public.partner_sales (
    id, user_id, customer_id, customer_name, items, total, imei, serial_number, payment_method, branch_id, salesperson_id, status, origin, payment_status, created_at
  ) VALUES (
    v_target_sale_id, v_effective_user_id, p_customer_id, p_customer_name, COALESCE(p_items, '[]'::jsonb), COALESCE(p_total, 0), p_imei, p_serial_number, p_payment_method, v_effective_branch_id, v_effective_sp_id, COALESCE(p_status, 'concluida'), COALESCE(p_origin, 'pdv'), CASE WHEN p_status = 'pre_venda' THEN 'pendente' ELSE 'pago' END, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    customer_id = EXCLUDED.customer_id,
    customer_name = EXCLUDED.customer_name,
    items = EXCLUDED.items,
    total = EXCLUDED.total,
    imei = EXCLUDED.imei,
    serial_number = EXCLUDED.serial_number,
    payment_method = EXCLUDED.payment_method,
    branch_id = EXCLUDED.branch_id,
    salesperson_id = EXCLUDED.salesperson_id,
    status = EXCLUDED.status,
    origin = EXCLUDED.origin,
    payment_status = EXCLUDED.payment_status;

  RETURN v_target_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.execute_partner_sale_mutation TO authenticated;

-- RPC 6: Exclusão de Venda / Pedido
CREATE OR REPLACE FUNCTION public.execute_partner_sale_delete(
  p_salesperson_id uuid,
  p_pin text,
  p_sale_id uuid
)
RETURNS boolean AS $$
DECLARE
  v_calling_user_id uuid := auth.uid();
  v_sp_id uuid;
  v_sp_company_id uuid;
  v_sp_branch_id uuid;
  v_sp_role text;
  v_sp_active boolean;
  v_sp_pin text;
  v_effective_user_id uuid;
  v_sale_branch_id uuid;
BEGIN
  IF v_calling_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;

  SELECT id, user_id, branch_id, role, COALESCE(active, is_active, true), pin
  INTO v_sp_id, v_sp_company_id, v_sp_branch_id, v_sp_role, v_sp_active, v_sp_pin
  FROM public.partner_salespeople
  WHERE auth_user_id = v_calling_user_id;

  IF FOUND THEN
    IF NOT v_sp_active THEN
      RAISE EXCEPTION 'Acesso negado: conta de funcionário desativada.';
    END IF;
    v_effective_user_id := v_sp_company_id;
  ELSE
    IF EXISTS (SELECT 1 FROM public.partner_profiles WHERE id = v_calling_user_id) THEN
      v_effective_user_id := v_calling_user_id;
      IF p_salesperson_id IS NOT NULL THEN
        SELECT branch_id, pin, role, COALESCE(active, is_active, true)
        INTO v_sp_branch_id, v_sp_pin, v_sp_role, v_sp_active
        FROM public.partner_salespeople
        WHERE id = p_salesperson_id AND user_id = v_effective_user_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Operador não encontrado.';
        END IF;

        IF NOT v_sp_active THEN
          RAISE EXCEPTION 'Acesso negado: operador desativado.';
        END IF;

        IF v_sp_pin IS NOT NULL AND v_sp_pin <> p_pin THEN
          RAISE EXCEPTION 'PIN incorreto.';
        END IF;
      END IF;
    ELSE
      RAISE EXCEPTION 'Acesso negado: usuário não autorizado.';
    END IF;
  END IF;

  SELECT branch_id INTO v_sale_branch_id
  FROM public.partner_sales
  WHERE id = p_sale_id AND user_id = v_effective_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada.';
  END IF;

  IF v_sp_role IS NOT NULL AND v_sp_role <> 'administrador' AND v_sp_branch_id IS NOT NULL THEN
    IF v_sale_branch_id IS NOT NULL AND v_sale_branch_id <> v_sp_branch_id THEN
      RAISE EXCEPTION 'Acesso negado: você não tem permissão para excluir vendas de outra filial.';
    END IF;
  END IF;

  DELETE FROM public.partner_sales
  WHERE id = p_sale_id AND user_id = v_effective_user_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.execute_partner_sale_delete TO authenticated;

-- ============================================================
-- 6. CRÍTICO: admin_lojistas e tabelas de entrega (delivery)
-- ============================================================
ALTER TABLE admin_lojistas ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_admin_lojistas" ON admin_lojistas;
DROP POLICY IF EXISTS "update_admin_lojistas" ON admin_lojistas;
DROP POLICY IF EXISTS "insert_admin_lojistas" ON admin_lojistas;
DROP POLICY IF EXISTS "super_admin_manage_admin_lojistas" ON admin_lojistas;

-- Apenas o super-administrador pode visualizar e gerenciar admin_lojistas (sem OR true)
CREATE POLICY "super_admin_manage_admin_lojistas" ON admin_lojistas
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM super_admin_settings
      WHERE auth.uid()::text = super_admin_settings.id::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM super_admin_settings
      WHERE auth.uid()::text = super_admin_settings.id::text
    )
  );

DROP POLICY IF EXISTS "select_routes" ON delivery_routes;
DROP POLICY IF EXISTS "insert_routes" ON delivery_routes;
DROP POLICY IF EXISTS "update_routes" ON delivery_routes;
DROP POLICY IF EXISTS "delete_routes" ON delivery_routes;
DROP POLICY IF EXISTS "authenticated_select_routes" ON delivery_routes;
DROP POLICY IF EXISTS "owner_manage_routes" ON delivery_routes;
DROP POLICY IF EXISTS "super_admin_manage_routes" ON delivery_routes;

-- Leitura permitida para usuários autenticados da plataforma
CREATE POLICY "authenticated_select_routes" ON delivery_routes
  FOR SELECT TO authenticated USING (true);

-- Edição de rotas restrita exclusivamente a super_admin
CREATE POLICY "super_admin_manage_routes" ON delivery_routes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM super_admin_settings
      WHERE auth.uid()::text = super_admin_settings.id::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM super_admin_settings
      WHERE auth.uid()::text = super_admin_settings.id::text
    )
  );

DROP POLICY IF EXISTS "select_rates" ON delivery_rates;
DROP POLICY IF EXISTS "insert_rates" ON delivery_rates;
DROP POLICY IF EXISTS "update_rates" ON delivery_rates;
DROP POLICY IF EXISTS "delete_rates" ON delivery_rates;
DROP POLICY IF EXISTS "authenticated_select_rates" ON delivery_rates;
DROP POLICY IF EXISTS "owner_manage_rates" ON delivery_rates;
DROP POLICY IF EXISTS "super_admin_manage_rates" ON delivery_rates;

-- Leitura permitida para usuários autenticados da plataforma
CREATE POLICY "authenticated_select_rates" ON delivery_rates
  FOR SELECT TO authenticated USING (true);

-- Edição de taxas restrita exclusivamente a super_admin
CREATE POLICY "super_admin_manage_rates" ON delivery_rates
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM super_admin_settings
      WHERE auth.uid()::text = super_admin_settings.id::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM super_admin_settings
      WHERE auth.uid()::text = super_admin_settings.id::text
    )
  );
ALTER TABLE admin_lojistas ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_admin_lojistas" ON admin_lojistas;
DROP POLICY IF EXISTS "update_admin_lojistas" ON admin_lojistas;
DROP POLICY IF EXISTS "insert_admin_lojistas" ON admin_lojistas;
DROP POLICY IF EXISTS "super_admin_manage_admin_lojistas" ON admin_lojistas;

-- Apenas o super-administrador pode visualizar e gerenciar admin_lojistas (sem OR true)
CREATE POLICY "super_admin_manage_admin_lojistas" ON admin_lojistas
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM super_admin_settings
      WHERE auth.uid()::text = super_admin_settings.id::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM super_admin_settings
      WHERE auth.uid()::text = super_admin_settings.id::text
    )
  );

DROP POLICY IF EXISTS "select_routes" ON delivery_routes;
DROP POLICY IF EXISTS "insert_routes" ON delivery_routes;
DROP POLICY IF EXISTS "update_routes" ON delivery_routes;
DROP POLICY IF EXISTS "delete_routes" ON delivery_routes;
DROP POLICY IF EXISTS "authenticated_select_routes" ON delivery_routes;
DROP POLICY IF EXISTS "owner_manage_routes" ON delivery_routes;
DROP POLICY IF EXISTS "super_admin_manage_routes" ON delivery_routes;

-- Leitura permitida para usuários autenticados da plataforma
CREATE POLICY "authenticated_select_routes" ON delivery_routes
  FOR SELECT TO authenticated USING (true);

-- Edição de rotas restrita exclusivamente a super_admin
CREATE POLICY "super_admin_manage_routes" ON delivery_routes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM super_admin_settings
      WHERE auth.uid()::text = super_admin_settings.id::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM super_admin_settings
      WHERE auth.uid()::text = super_admin_settings.id::text
    )
  );

DROP POLICY IF EXISTS "select_rates" ON delivery_rates;
DROP POLICY IF EXISTS "insert_rates" ON delivery_rates;
DROP POLICY IF EXISTS "update_rates" ON delivery_rates;
DROP POLICY IF EXISTS "delete_rates" ON delivery_rates;
DROP POLICY IF EXISTS "authenticated_select_rates" ON delivery_rates;
DROP POLICY IF EXISTS "owner_manage_rates" ON delivery_rates;
DROP POLICY IF EXISTS "super_admin_manage_rates" ON delivery_rates;

-- Leitura permitida para usuários autenticados da plataforma
CREATE POLICY "authenticated_select_rates" ON delivery_rates
  FOR SELECT TO authenticated USING (true);

-- Edição de taxas restrita exclusivamente a super_admin
CREATE POLICY "super_admin_manage_rates" ON delivery_rates
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM super_admin_settings
      WHERE auth.uid()::text = super_admin_settings.id::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM super_admin_settings
      WHERE auth.uid()::text = super_admin_settings.id::text
    )
  );

