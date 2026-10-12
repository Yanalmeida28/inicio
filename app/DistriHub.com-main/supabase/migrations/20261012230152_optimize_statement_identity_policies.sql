-- Cache statement-wide identity checks and consolidate equivalent permissive rules.
-- Guards abort if an existing rule changed; grants, restrictive policies and business data are preserved.
BEGIN;
DO $guard$ DECLARE fingerprint text; BEGIN
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='fiscal_documents' AND policyname='select_company_branch_fiscal_documents' AND roles='{authenticated}'::name[] AND cmd='SELECT' AND permissive='PERMISSIVE';
 IF fingerprint IS DISTINCT FROM '9dafddfc66273e5d3c68a461066a2daf' THEN RAISE EXCEPTION 'Policy changed before optimization: fiscal_documents.select_company_branch_fiscal_documents'; END IF;
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='fiscal_inutilizations' AND policyname='select_company_branch_fiscal_inutilizations' AND roles='{authenticated}'::name[] AND cmd='SELECT' AND permissive='PERMISSIVE';
 IF fingerprint IS DISTINCT FROM '2e6a442001db62727b7e417c0190b149' THEN RAISE EXCEPTION 'Policy changed before optimization: fiscal_inutilizations.select_company_branch_fiscal_inutilizations'; END IF;
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='fiscal_tax_rules' AND policyname='select_company_branch_fiscal_tax_rules' AND roles='{authenticated}'::name[] AND cmd='SELECT' AND permissive='PERMISSIVE';
 IF fingerprint IS DISTINCT FROM '735adffd7313a5fc647e8ac8d4a6aafe' THEN RAISE EXCEPTION 'Policy changed before optimization: fiscal_tax_rules.select_company_branch_fiscal_tax_rules'; END IF;
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='partner_categories' AND policyname='select_own_categories' AND roles='{authenticated}'::name[] AND cmd='SELECT' AND permissive='PERMISSIVE';
 IF fingerprint IS DISTINCT FROM '95f2e799fb7c49c56e2eabebc6f33680' THEN RAISE EXCEPTION 'Policy changed before optimization: partner_categories.select_own_categories'; END IF;
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='partner_combos' AND policyname='select_own_combos' AND roles='{authenticated}'::name[] AND cmd='SELECT' AND permissive='PERMISSIVE';
 IF fingerprint IS DISTINCT FROM '95f2e799fb7c49c56e2eabebc6f33680' THEN RAISE EXCEPTION 'Policy changed before optimization: partner_combos.select_own_combos'; END IF;
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='partner_crm_tasks' AND policyname='crm_tasks_insert' AND roles='{authenticated}'::name[] AND cmd='INSERT' AND permissive='PERMISSIVE';
 IF fingerprint IS DISTINCT FROM '9efd19fde1356e7a6afcbaffde654b8c' THEN RAISE EXCEPTION 'Policy changed before optimization: partner_crm_tasks.crm_tasks_insert'; END IF;
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='partner_crm_tasks' AND policyname='crm_tasks_select' AND roles='{authenticated}'::name[] AND cmd='SELECT' AND permissive='PERMISSIVE';
 IF fingerprint IS DISTINCT FROM '136aa91479636194929926022f28376d' THEN RAISE EXCEPTION 'Policy changed before optimization: partner_crm_tasks.crm_tasks_select'; END IF;
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='partner_crm_tasks' AND policyname='crm_tasks_update' AND roles='{authenticated}'::name[] AND cmd='UPDATE' AND permissive='PERMISSIVE';
 IF fingerprint IS DISTINCT FROM 'fc9e00f4397628d673cdef71daf43f13' THEN RAISE EXCEPTION 'Policy changed before optimization: partner_crm_tasks.crm_tasks_update'; END IF;
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='partner_customers' AND policyname='partner_customers_select' AND roles='{authenticated}'::name[] AND cmd='SELECT' AND permissive='PERMISSIVE';
 IF fingerprint IS DISTINCT FROM '114b81bf956ddd101a6e6ad0e88dc5a9' THEN RAISE EXCEPTION 'Policy changed before optimization: partner_customers.partner_customers_select'; END IF;
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='partner_modifiers' AND policyname='select_own_modifiers' AND roles='{authenticated}'::name[] AND cmd='SELECT' AND permissive='PERMISSIVE';
 IF fingerprint IS DISTINCT FROM '95f2e799fb7c49c56e2eabebc6f33680' THEN RAISE EXCEPTION 'Policy changed before optimization: partner_modifiers.select_own_modifiers'; END IF;
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='partner_plan_change_requests' AND policyname='select_own_plan_change_requests' AND roles='{authenticated}'::name[] AND cmd='SELECT' AND permissive='PERMISSIVE';
 IF fingerprint IS DISTINCT FROM 'f655cc3d2e5837c2fa67b191581fa78c' THEN RAISE EXCEPTION 'Policy changed before optimization: partner_plan_change_requests.select_own_plan_change_requests'; END IF;
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='partner_salespeople' AND policyname='partner_salespeople_select' AND roles='{authenticated}'::name[] AND cmd='SELECT' AND permissive='PERMISSIVE';
 IF fingerprint IS DISTINCT FROM '95f2e799fb7c49c56e2eabebc6f33680' THEN RAISE EXCEPTION 'Policy changed before optimization: partner_salespeople.partner_salespeople_select'; END IF;
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='partner_suppliers' AND policyname='select_own_suppliers' AND roles='{authenticated}'::name[] AND cmd='SELECT' AND permissive='PERMISSIVE';
 IF fingerprint IS DISTINCT FROM '95f2e799fb7c49c56e2eabebc6f33680' THEN RAISE EXCEPTION 'Policy changed before optimization: partner_suppliers.select_own_suppliers'; END IF;
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='service_order_items' AND policyname='os_items_branch_gate' AND roles='{authenticated}'::name[] AND cmd='ALL' AND permissive='RESTRICTIVE';
 IF fingerprint IS DISTINCT FROM '2e16f7b198987eca861cc018dbee2215' THEN RAISE EXCEPTION 'Policy changed before optimization: service_order_items.os_items_branch_gate'; END IF;
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='service_order_items' AND policyname='service_order_items_select' AND roles='{authenticated}'::name[] AND cmd='SELECT' AND permissive='PERMISSIVE';
 IF fingerprint IS DISTINCT FROM '62790e223bd98757aa4a1bba9386dcf6' THEN RAISE EXCEPTION 'Policy changed before optimization: service_order_items.service_order_items_select'; END IF;
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='service_order_photos' AND policyname='os_photos_branch_gate' AND roles='{authenticated}'::name[] AND cmd='ALL' AND permissive='RESTRICTIVE';
 IF fingerprint IS DISTINCT FROM '2e16f7b198987eca861cc018dbee2215' THEN RAISE EXCEPTION 'Policy changed before optimization: service_order_photos.os_photos_branch_gate'; END IF;
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='service_order_photos' AND policyname='service_order_photos_select_own' AND roles='{authenticated}'::name[] AND cmd='SELECT' AND permissive='PERMISSIVE';
 IF fingerprint IS DISTINCT FROM '36ec810ddc98307405e553064750dfcb' THEN RAISE EXCEPTION 'Policy changed before optimization: service_order_photos.service_order_photos_select_own'; END IF;
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='service_orders' AND policyname='os_branch_gate' AND roles='{authenticated}'::name[] AND cmd='ALL' AND permissive='RESTRICTIVE';
 IF fingerprint IS DISTINCT FROM '2e16f7b198987eca861cc018dbee2215' THEN RAISE EXCEPTION 'Policy changed before optimization: service_orders.os_branch_gate'; END IF;
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='fiscal_documents' AND policyname='fiscal_documents_select_own' AND roles='{authenticated}'::name[] AND cmd='SELECT' AND permissive='PERMISSIVE';
 IF fingerprint IS DISTINCT FROM 'a7d7eb18352aa8797d6f9c34aa194875' THEN RAISE EXCEPTION 'Policy changed before optimization: fiscal_documents.fiscal_documents_select_own'; END IF;
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='support_messages' AND policyname='clients_read_own_support_messages' AND roles='{authenticated}'::name[] AND cmd='SELECT' AND permissive='PERMISSIVE';
 IF fingerprint IS DISTINCT FROM 'a1fc7aa105a1b503f03297d4c928519f' THEN RAISE EXCEPTION 'Policy changed before optimization: support_messages.clients_read_own_support_messages'; END IF;
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='support_messages' AND policyname='clients_send_support_messages' AND roles='{authenticated}'::name[] AND cmd='INSERT' AND permissive='PERMISSIVE';
 IF fingerprint IS DISTINCT FROM '2ada38ff7a7f405e182aab7268e8c7e8' THEN RAISE EXCEPTION 'Policy changed before optimization: support_messages.clients_send_support_messages'; END IF;
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='support_messages' AND policyname='super_admin_read_support_messages' AND roles='{authenticated}'::name[] AND cmd='SELECT' AND permissive='PERMISSIVE';
 IF fingerprint IS DISTINCT FROM 'e09ccd43bcc1450b63edcfdd2ff14db6' THEN RAISE EXCEPTION 'Policy changed before optimization: support_messages.super_admin_read_support_messages'; END IF;
 SELECT md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND tablename='support_messages' AND policyname='super_admin_reply_support_messages' AND roles='{authenticated}'::name[] AND cmd='INSERT' AND permissive='PERMISSIVE';
 IF fingerprint IS DISTINCT FROM '2f18263d1b77285f6c940b83ddefcde6' THEN RAISE EXCEPTION 'Policy changed before optimization: support_messages.super_admin_reply_support_messages'; END IF;
END $guard$;
ALTER POLICY "select_company_branch_fiscal_documents" ON public."fiscal_documents" USING ((((SELECT auth.uid()) = user_id) OR (EXISTS ( SELECT 1
   FROM partner_salespeople sp
  WHERE ((sp.auth_user_id = (SELECT auth.uid())) AND (sp.user_id = fiscal_documents.user_id) AND (sp.active = true) AND ((sp.role = 'administrador'::text) OR (sp.branch_id = fiscal_documents.branch_id)))))));
ALTER POLICY "select_company_branch_fiscal_inutilizations" ON public."fiscal_inutilizations" USING ((((SELECT auth.uid()) = user_id) OR (EXISTS ( SELECT 1
   FROM partner_salespeople sp
  WHERE ((sp.auth_user_id = (SELECT auth.uid())) AND (sp.user_id = fiscal_inutilizations.user_id) AND (sp.active = true) AND ((sp.role = 'administrador'::text) OR (sp.branch_id = fiscal_inutilizations.branch_id)))))));
ALTER POLICY "select_company_branch_fiscal_tax_rules" ON public."fiscal_tax_rules" USING ((((SELECT auth.uid()) = user_id) OR (EXISTS ( SELECT 1
   FROM partner_salespeople sp
  WHERE ((sp.auth_user_id = (SELECT auth.uid())) AND (sp.user_id = fiscal_tax_rules.user_id) AND (sp.active = true) AND ((sp.role = 'administrador'::text) OR (sp.branch_id = fiscal_tax_rules.branch_id)))))));
ALTER POLICY "select_own_categories" ON public."partner_categories" USING (((user_id = (SELECT auth.uid())) OR partner_rma_company_access(user_id)));
ALTER POLICY "select_own_combos" ON public."partner_combos" USING (((user_id = (SELECT auth.uid())) OR partner_rma_company_access(user_id)));
ALTER POLICY "crm_tasks_insert" ON public."partner_crm_tasks" WITH CHECK ((partner_has_saas_access(user_id, 'relatorios'::text) AND ((user_id = (SELECT auth.uid())) OR partner_employee_can_access_branch(user_id, branch_id)) AND (EXISTS ( SELECT 1
   FROM partner_customers c
  WHERE ((c.id = partner_crm_tasks.customer_id) AND (c.user_id = partner_crm_tasks.user_id)))) AND (EXISTS ( SELECT 1
   FROM partner_branches b
  WHERE ((b.id = partner_crm_tasks.branch_id) AND (b.user_id = partner_crm_tasks.user_id)))) AND ((responsible_id IS NULL) OR (EXISTS ( SELECT 1
   FROM partner_salespeople s
  WHERE ((s.id = partner_crm_tasks.responsible_id) AND (s.user_id = partner_crm_tasks.user_id) AND ((s.branch_id IS NULL) OR (s.branch_id = partner_crm_tasks.branch_id))))))));
ALTER POLICY "crm_tasks_select" ON public."partner_crm_tasks" USING ((partner_has_saas_access(user_id, 'relatorios'::text) AND ((user_id = (SELECT auth.uid())) OR partner_employee_can_access_branch(user_id, branch_id))));
ALTER POLICY "crm_tasks_update" ON public."partner_crm_tasks" USING ((partner_has_saas_access(user_id, 'relatorios'::text) AND ((user_id = (SELECT auth.uid())) OR partner_employee_can_access_branch(user_id, branch_id)))) WITH CHECK ((partner_has_saas_access(user_id, 'relatorios'::text) AND ((user_id = (SELECT auth.uid())) OR partner_employee_can_access_branch(user_id, branch_id))));
ALTER POLICY "partner_customers_select" ON public."partner_customers" USING (((user_id = (SELECT auth.uid())) OR ((user_id IS NOT NULL) AND ((branch_id IS NULL) OR partner_employee_can_access_branch(user_id, branch_id)))));
ALTER POLICY "select_own_modifiers" ON public."partner_modifiers" USING (((user_id = (SELECT auth.uid())) OR partner_rma_company_access(user_id)));
ALTER POLICY "select_own_plan_change_requests" ON public."partner_plan_change_requests" USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "partner_salespeople_select" ON public."partner_salespeople" USING (((user_id = (SELECT auth.uid())) OR partner_rma_company_access(user_id)));
ALTER POLICY "select_own_suppliers" ON public."partner_suppliers" USING (((user_id = (SELECT auth.uid())) OR partner_rma_company_access(user_id)));
ALTER POLICY "os_items_branch_gate" ON public."service_order_items" USING ((partner_has_saas_access(user_id, 'os'::text) AND ((user_id = (SELECT auth.uid())) OR partner_employee_can_access_branch(user_id, branch_id) OR (SELECT public.is_super_admin())))) WITH CHECK ((partner_has_saas_access(user_id, 'os'::text) AND ((user_id = (SELECT auth.uid())) OR partner_employee_can_access_branch(user_id, branch_id) OR (SELECT public.is_super_admin()))));
ALTER POLICY "service_order_items_select" ON public."service_order_items" USING ((EXISTS ( SELECT 1
   FROM service_orders so
  WHERE ((so.id = service_order_items.service_order_id) AND ((so.user_id = (SELECT auth.uid())) OR ((so.branch_id IS NOT NULL) AND partner_employee_can_access_branch(so.user_id, so.branch_id)))))));
ALTER POLICY "os_photos_branch_gate" ON public."service_order_photos" USING ((partner_has_saas_access(user_id, 'os'::text) AND ((user_id = (SELECT auth.uid())) OR partner_employee_can_access_branch(user_id, branch_id) OR (SELECT public.is_super_admin())))) WITH CHECK ((partner_has_saas_access(user_id, 'os'::text) AND ((user_id = (SELECT auth.uid())) OR partner_employee_can_access_branch(user_id, branch_id) OR (SELECT public.is_super_admin()))));
ALTER POLICY "service_order_photos_select_own" ON public."service_order_photos" USING ((EXISTS ( SELECT 1
   FROM service_orders so
  WHERE ((so.id = service_order_photos.service_order_id) AND ((so.user_id = (SELECT auth.uid())) OR ((so.branch_id IS NOT NULL) AND partner_employee_can_access_branch(so.user_id, so.branch_id)))))));
ALTER POLICY "os_branch_gate" ON public."service_orders" USING ((partner_has_saas_access(user_id, 'os'::text) AND ((user_id = (SELECT auth.uid())) OR partner_employee_can_access_branch(user_id, branch_id) OR (SELECT public.is_super_admin())))) WITH CHECK ((partner_has_saas_access(user_id, 'os'::text) AND ((user_id = (SELECT auth.uid())) OR partner_employee_can_access_branch(user_id, branch_id) OR (SELECT public.is_super_admin()))));
-- The company/branch policy already includes the identical owner condition.
DROP POLICY fiscal_documents_select_own ON public.fiscal_documents;
CREATE POLICY support_messages_read ON public.support_messages FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id)) OR (( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY support_messages_send ON public.support_messages FOR INSERT TO authenticated WITH CHECK ((((( SELECT auth.uid() AS uid) = user_id) AND (sender_role = 'cliente'::text))) OR ((( SELECT is_super_admin() AS is_super_admin) AND (sender_role = 'suporte'::text))));
DROP POLICY clients_read_own_support_messages ON public.support_messages;
DROP POLICY super_admin_read_support_messages ON public.support_messages;
DROP POLICY clients_send_support_messages ON public.support_messages;
DROP POLICY super_admin_reply_support_messages ON public.support_messages;
COMMIT;
