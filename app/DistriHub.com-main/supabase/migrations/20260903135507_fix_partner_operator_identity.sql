-- Resolve operator identity from auth.users and restrict employees to their company and branch.

DROP POLICY IF EXISTS "select_own_products" ON partner_products;
DROP POLICY IF EXISTS "select_authenticated_products" ON partner_products;
DROP POLICY IF EXISTS "insert_own_products" ON partner_products;
DROP POLICY IF EXISTS "update_own_products" ON partner_products;
DROP POLICY IF EXISTS "delete_own_products" ON partner_products;
DROP POLICY IF EXISTS "deny_direct_insert_products" ON partner_products;
DROP POLICY IF EXISTS "deny_direct_update_products" ON partner_products;
DROP POLICY IF EXISTS "deny_direct_delete_products" ON partner_products;
CREATE POLICY "select_authenticated_products" ON partner_products FOR SELECT TO authenticated USING (
  auth.uid() = user_id OR EXISTS (
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

DROP POLICY IF EXISTS "select_own_customers" ON partner_customers;
DROP POLICY IF EXISTS "select_authenticated_customers" ON partner_customers;
DROP POLICY IF EXISTS "insert_own_customers" ON partner_customers;
DROP POLICY IF EXISTS "update_own_customers" ON partner_customers;
DROP POLICY IF EXISTS "delete_own_customers" ON partner_customers;
DROP POLICY IF EXISTS "deny_direct_insert_customers" ON partner_customers;
DROP POLICY IF EXISTS "deny_direct_update_customers" ON partner_customers;
DROP POLICY IF EXISTS "deny_direct_delete_customers" ON partner_customers;
CREATE POLICY "select_authenticated_customers" ON partner_customers FOR SELECT TO authenticated USING (
  auth.uid() = user_id OR EXISTS (
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

DROP POLICY IF EXISTS "select_own_sales" ON partner_sales;
DROP POLICY IF EXISTS "select_authenticated_sales" ON partner_sales;
DROP POLICY IF EXISTS "insert_own_sales" ON partner_sales;
DROP POLICY IF EXISTS "update_own_sales" ON partner_sales;
DROP POLICY IF EXISTS "delete_own_sales" ON partner_sales;
DROP POLICY IF EXISTS "deny_direct_insert_sales" ON partner_sales;
DROP POLICY IF EXISTS "deny_direct_update_sales" ON partner_sales;
DROP POLICY IF EXISTS "deny_direct_delete_sales" ON partner_sales;
CREATE POLICY "select_authenticated_sales" ON partner_sales FOR SELECT TO authenticated USING (
  auth.uid() = user_id OR EXISTS (
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

DROP POLICY IF EXISTS "select_own_salespeople" ON partner_salespeople;
DROP POLICY IF EXISTS "select_authenticated_salespeople" ON partner_salespeople;
CREATE POLICY "select_authenticated_salespeople" ON partner_salespeople FOR SELECT TO authenticated USING (
  auth.uid() = user_id OR auth_user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.partner_salespeople sp
    WHERE sp.auth_user_id = auth.uid()
      AND COALESCE(sp.active, sp.is_active, true) = true
      AND sp.user_id = partner_salespeople.user_id
      AND (sp.role = 'administrador' OR sp.branch_id IS NULL OR partner_salespeople.branch_id IS NULL OR partner_salespeople.branch_id = sp.branch_id)
  )
);

DROP POLICY IF EXISTS "select_own_branches" ON partner_branches;
DROP POLICY IF EXISTS "select_authenticated_branches" ON partner_branches;
CREATE POLICY "select_authenticated_branches" ON partner_branches FOR SELECT TO authenticated USING (
  auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.partner_salespeople sp
    WHERE sp.auth_user_id = auth.uid()
      AND COALESCE(sp.active, sp.is_active, true) = true
      AND sp.user_id = partner_branches.user_id
      AND (sp.role = 'administrador' OR sp.branch_id IS NULL OR partner_branches.id = sp.branch_id)
  )
);

DROP POLICY IF EXISTS "select_own_movements" ON stock_movements;
DROP POLICY IF EXISTS "insert_own_movements" ON stock_movements;
DROP POLICY IF EXISTS "delete_own_movements" ON stock_movements;
CREATE POLICY "select_authorized_movements" ON stock_movements FOR SELECT TO authenticated USING (
  auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.partner_products p
    JOIN public.partner_salespeople sp ON sp.user_id = p.user_id
    WHERE p.id = stock_movements.product_id
      AND sp.auth_user_id = auth.uid()
      AND COALESCE(sp.active, sp.is_active, true) = true
      AND (sp.role = 'administrador' OR sp.branch_id IS NULL OR p.branch_id IS NULL OR p.branch_id = sp.branch_id)
  )
);
CREATE POLICY "insert_authorized_movements" ON stock_movements FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.partner_products p
    WHERE p.id = stock_movements.product_id
      AND (p.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.partner_salespeople sp
        WHERE sp.auth_user_id = auth.uid() AND sp.user_id = p.user_id
          AND COALESCE(sp.active, sp.is_active, true) = true
          AND (sp.role = 'administrador' OR sp.branch_id IS NULL OR p.branch_id IS NULL OR p.branch_id = sp.branch_id)
      ))
  )
);