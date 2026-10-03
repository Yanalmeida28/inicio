BEGIN;

DO $$
DECLARE
  v_kind "char";
BEGIN
  SELECT c.relkind INTO v_kind
  FROM pg_class c
  WHERE c.oid = to_regclass('public.admin_financial_months');

  IF v_kind IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.admin_financial_months FROM PUBLIC, anon, authenticated';
    IF v_kind = 'v' THEN
      EXECUTE 'ALTER VIEW public.admin_financial_months SET (security_invoker = true)';
    END IF;
  END IF;
END
$$;

REVOKE UPDATE ON TABLE public.partner_profiles FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (subscription_plan, subscription_status, next_billing_date, payment_method)
  ON TABLE public.partner_profiles FROM PUBLIC, anon, authenticated;
GRANT UPDATE (account_name, whatsapp, document)
  ON TABLE public.partner_profiles TO authenticated;
REVOKE INSERT, DELETE ON TABLE public.partner_profiles FROM PUBLIC, anon, authenticated;
REVOKE INSERT (subscription_plan, subscription_status, next_billing_date, payment_method)
  ON TABLE public.partner_profiles FROM PUBLIC, anon, authenticated;
GRANT INSERT (id, business_name, document, whatsapp, segment)
  ON TABLE public.partner_profiles TO authenticated;

ALTER TABLE public.partner_profiles
  ALTER COLUMN subscription_plan SET DEFAULT 'basico',
  ALTER COLUMN subscription_status SET DEFAULT 'trial',
  ALTER COLUMN next_billing_date DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.set_partner_profile_subscription_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.subscription_plan := 'basico';
  NEW.subscription_status := 'trial';
  NEW.next_billing_date := NULL;
  NEW.payment_method := NULL;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS set_partner_profile_subscription_defaults ON public.partner_profiles;
CREATE TRIGGER set_partner_profile_subscription_defaults
  BEFORE INSERT ON public.partner_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_partner_profile_subscription_defaults();

CREATE TABLE IF NOT EXISTS public.partner_plan_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_plan text NOT NULL,
  requested_plan text NOT NULL CHECK (requested_plan IN ('basico', 'profissional', 'enterprise')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
DO $$
BEGIN
  IF EXISTS (
    SELECT user_id
    FROM public.partner_plan_change_requests
    WHERE status = 'pending'
    GROUP BY user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existem solicitações de plano pendentes duplicadas; resolva-as antes de aplicar esta migration';
  END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS partner_plan_change_requests_user_created_idx
  ON public.partner_plan_change_requests(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS partner_plan_change_requests_one_pending_per_user_idx
  ON public.partner_plan_change_requests(user_id)
  WHERE status = 'pending';
ALTER TABLE public.partner_plan_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_plan_change_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.partner_plan_change_requests TO authenticated;
DROP POLICY IF EXISTS "select_own_plan_change_requests" ON public.partner_plan_change_requests;
CREATE POLICY "select_own_plan_change_requests"
  ON public.partner_plan_change_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP FUNCTION IF EXISTS public.get_partner_plan_change_requests();
CREATE FUNCTION public.get_partner_plan_change_requests()
RETURNS TABLE (
  request_id uuid,
  company_name text,
  current_plan text,
  requested_plan text,
  status text,
  created_at timestamptz,
  resolved_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Operador não autorizado para consultar solicitações de plano';
  END IF;

  RETURN QUERY
  SELECT r.id, p.business_name, r.current_plan, r.requested_plan,
         r.status, r.created_at, r.resolved_at
  FROM public.partner_plan_change_requests r
  JOIN public.partner_profiles p ON p.id = r.user_id
  ORDER BY r.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_partner_plan_change_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_partner_plan_change_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.request_partner_plan_change(p_requested_plan text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_plan text;
  v_request_id uuid;
  v_existing_request public.partner_plan_change_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_requested_plan IS NULL OR p_requested_plan NOT IN ('basico', 'profissional', 'enterprise') THEN
    RAISE EXCEPTION 'Plano solicitado inválido';
  END IF;

  SELECT subscription_plan INTO v_current_plan
  FROM public.partner_profiles
  WHERE id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil da empresa não encontrado'; END IF;
  IF v_current_plan = p_requested_plan THEN RAISE EXCEPTION 'Este já é o plano atual'; END IF;

  SELECT * INTO v_existing_request
  FROM public.partner_plan_change_requests
  WHERE user_id = auth.uid() AND status = 'pending'
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing_request.requested_plan = p_requested_plan THEN
      RETURN v_existing_request.id;
    END IF;
    RAISE EXCEPTION 'Já existe uma solicitação de mudança de plano pendente';
  END IF;

  INSERT INTO public.partner_plan_change_requests(user_id, current_plan, requested_plan)
  VALUES (auth.uid(), COALESCE(v_current_plan, 'basico'), p_requested_plan)
  RETURNING id INTO v_request_id;
  RETURN v_request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.request_partner_plan_change(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_partner_plan_change(text) TO authenticated;

DROP FUNCTION IF EXISTS public.resolve_partner_plan_change(text, uuid, boolean);
CREATE FUNCTION public.resolve_partner_plan_change(
  p_request_id uuid,
  p_approved boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.partner_plan_change_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Operador não autorizado para resolver solicitações de plano';
  END IF;
  IF p_approved IS NULL THEN RAISE EXCEPTION 'Informe se a solicitação foi aprovada ou rejeitada'; END IF;

  SELECT * INTO v_request
  FROM public.partner_plan_change_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação pendente não encontrada'; END IF;

  IF p_approved THEN
    UPDATE public.partner_profiles
    SET subscription_plan = v_request.requested_plan
    WHERE id = v_request.user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Perfil da empresa não encontrado'; END IF;
  END IF;

  UPDATE public.partner_plan_change_requests
  SET status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
      resolved_at = now()
  WHERE id = v_request.id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_partner_plan_change(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_partner_plan_change(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_partner_branch(p_name text, p_address text DEFAULT NULL)
RETURNS public.partner_branches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_plan text;
  v_limit integer;
  v_count integer;
  v_branch public.partner_branches%ROWTYPE;
BEGIN
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF length(trim(COALESCE(p_name, ''))) = 0 OR length(trim(p_name)) > 120 THEN
    RAISE EXCEPTION 'Informe um nome de filial válido';
  END IF;
  IF length(COALESCE(p_address, '')) > 500 THEN RAISE EXCEPTION 'Endereço muito longo'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_owner::text, 28));
  SELECT subscription_plan INTO v_plan
  FROM public.partner_profiles WHERE id = v_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil da empresa não encontrado'; END IF;

  v_limit := CASE v_plan
    WHEN 'basico' THEN 1
    WHEN 'profissional' THEN 3
    WHEN 'enterprise' THEN NULL
    ELSE 1
  END;
  SELECT count(*) INTO v_count
  FROM public.partner_branches WHERE user_id = v_owner;
  IF v_limit IS NOT NULL AND v_count >= v_limit THEN
    RAISE EXCEPTION 'O plano % permite até % filial(is). Solicite a mudança de plano para cadastrar outra.', v_plan, v_limit;
  END IF;

  INSERT INTO public.partner_branches(id, user_id, name, address)
  VALUES (gen_random_uuid(), v_owner, trim(p_name), NULLIF(trim(COALESCE(p_address, '')), ''))
  RETURNING * INTO v_branch;
  RETURN v_branch;
END;
$$;
REVOKE INSERT ON TABLE public.partner_branches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_partner_branch(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_partner_branch(text, text) TO authenticated;

ALTER TABLE public.fiscal_documents
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.partner_branches(id) ON DELETE CASCADE;
ALTER TABLE public.fiscal_tax_rules
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.partner_branches(id) ON DELETE CASCADE;
ALTER TABLE public.fiscal_inutilizations
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.partner_branches(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS fiscal_documents_branch_created_idx
  ON public.fiscal_documents(user_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fiscal_tax_rules_branch_created_idx
  ON public.fiscal_tax_rules(user_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fiscal_inutilizations_branch_created_idx
  ON public.fiscal_inutilizations(user_id, branch_id, created_at DESC);

DROP POLICY IF EXISTS "users_select_own_fiscal_documents" ON public.fiscal_documents;
DROP POLICY IF EXISTS "users_insert_own_fiscal_documents" ON public.fiscal_documents;
DROP POLICY IF EXISTS "select_company_branch_fiscal_documents" ON public.fiscal_documents;
CREATE POLICY "select_company_branch_fiscal_documents"
  ON public.fiscal_documents FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.partner_salespeople sp
      WHERE sp.auth_user_id = auth.uid()
        AND sp.user_id = fiscal_documents.user_id
        AND sp.active = true
        AND (sp.role = 'administrador' OR sp.branch_id = fiscal_documents.branch_id)
    )
  );
REVOKE INSERT, UPDATE, DELETE ON public.fiscal_documents FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "users_manage_own_tax_rules" ON public.fiscal_tax_rules;
DROP POLICY IF EXISTS "select_company_branch_fiscal_tax_rules" ON public.fiscal_tax_rules;
CREATE POLICY "select_company_branch_fiscal_tax_rules"
  ON public.fiscal_tax_rules FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.partner_salespeople sp
      WHERE sp.auth_user_id = auth.uid()
        AND sp.user_id = fiscal_tax_rules.user_id
        AND sp.active = true
        AND (sp.role = 'administrador' OR sp.branch_id = fiscal_tax_rules.branch_id)
    )
  );
REVOKE INSERT, UPDATE, DELETE ON public.fiscal_tax_rules FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "users_manage_own_inutilizations" ON public.fiscal_inutilizations;
DROP POLICY IF EXISTS "select_company_branch_fiscal_inutilizations" ON public.fiscal_inutilizations;
CREATE POLICY "select_company_branch_fiscal_inutilizations"
  ON public.fiscal_inutilizations FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.partner_salespeople sp
      WHERE sp.auth_user_id = auth.uid()
        AND sp.user_id = fiscal_inutilizations.user_id
        AND sp.active = true
        AND (sp.role = 'administrador' OR sp.branch_id = fiscal_inutilizations.branch_id)
    )
  );
REVOKE INSERT, UPDATE, DELETE ON public.fiscal_inutilizations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_fiscal_document(
  p_document_id uuid DEFAULT NULL,
  p_document_type text DEFAULT 'nfe',
  p_status text DEFAULT 'pending',
  p_document_number text DEFAULT NULL,
  p_access_key text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_branch uuid := NULLIF(p_payload->>'branch_id', '')::uuid;
  v_sale uuid := NULLIF(p_payload->>'sale_id', '')::uuid;
  v_op record;
  v_document public.fiscal_documents%ROWTYPE;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_document_type NOT IN ('nfe', 'nfce') THEN RAISE EXCEPTION 'Tipo de documento inválido'; END IF;
  IF v_branch IS NULL THEN RAISE EXCEPTION 'Selecione uma filial'; END IF;
  SELECT * INTO v_op FROM public.resolve_partner_pdv_operator(NULL, NULL, v_branch);
  IF v_op.role NOT IN ('administrador', 'gerente', 'caixa') THEN RAISE EXCEPTION 'Sem permissão para registrar documento fiscal'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.partner_branches b
    WHERE b.id = v_branch AND b.user_id = v_op.company_id
  ) THEN RAISE EXCEPTION 'Filial inválida'; END IF;

  IF p_document_id IS NULL THEN
    IF p_status <> 'pending' THEN RAISE EXCEPTION 'A emissão só pode ser registrada como pendente'; END IF;
    IF v_sale IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.partner_sales s
      WHERE s.id = v_sale AND s.user_id = v_op.company_id
        AND s.branch_id = v_branch AND s.status = 'concluida'
    ) THEN RAISE EXCEPTION 'Venda inexistente ou fora da filial selecionada'; END IF;

    INSERT INTO public.fiscal_documents(
      user_id, branch_id, order_id, provider, document_type, status,
      number, access_key, provider_response
    )
    VALUES (
      v_op.company_id, v_branch,
      NULLIF(p_payload->>'order_id', '')::uuid,
      p_payload->>'provider', p_document_type, 'pending',
      p_document_number, p_access_key, COALESCE(p_payload, '{}'::jsonb)
    )
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  IF p_status <> 'cancelled' THEN
    RAISE EXCEPTION 'Atualizações fiscais exigem processamento autorizado pelo provedor';
  END IF;
  SELECT * INTO v_document FROM public.fiscal_documents d
  WHERE d.id = p_document_id AND d.user_id = v_op.company_id AND d.branch_id = v_branch
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento não encontrado nesta filial'; END IF;
  UPDATE public.fiscal_documents
  SET provider_response = COALESCE(provider_response, '{}'::jsonb) ||
    COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object('cancellation_requested', true)
  WHERE id = v_document.id;
  RETURN v_document.id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_fiscal_document(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_fiscal_document(uuid, text, text, text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_fiscal_inutilization(p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_branch uuid := NULLIF(p_data->>'branch_id', '')::uuid;
  v_op record;
  v_id uuid;
  v_start integer := (p_data->>'number_start')::integer;
  v_end integer := (p_data->>'number_end')::integer;
  v_justification text := trim(COALESCE(p_data->>'justification', ''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF v_branch IS NULL THEN RAISE EXCEPTION 'Selecione uma filial'; END IF;
  IF p_data->>'document_type' NOT IN ('nfe', 'nfce') THEN RAISE EXCEPTION 'Tipo de documento inválido'; END IF;
  IF v_start IS NULL OR v_end IS NULL OR v_start < 1 OR v_end < v_start THEN RAISE EXCEPTION 'Faixa numérica inválida'; END IF;
  IF char_length(v_justification) < 15 THEN RAISE EXCEPTION 'A justificativa deve ter pelo menos 15 caracteres'; END IF;
  SELECT * INTO v_op FROM public.resolve_partner_pdv_operator(NULL, NULL, v_branch);
  IF v_op.role NOT IN ('administrador', 'gerente', 'caixa') THEN RAISE EXCEPTION 'Sem permissão para registrar inutilização'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.partner_branches b
    WHERE b.id = v_branch AND b.user_id = v_op.company_id
  ) THEN RAISE EXCEPTION 'Filial inválida'; END IF;

  INSERT INTO public.fiscal_inutilizations(
    user_id, branch_id, document_type, series, number_start, number_end, justification, status
  )
  VALUES (
    v_op.company_id, v_branch, p_data->>'document_type',
    trim(COALESCE(p_data->>'series', '')), v_start, v_end, v_justification, 'pending'
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_fiscal_inutilization(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_fiscal_inutilization(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_fiscal_branch_settings(p_settings jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_branch uuid := NULLIF(p_settings->>'branch_id', '')::uuid;
  v_op record;
  v_rule_id uuid := NULLIF(p_settings->>'id', '')::uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF v_branch IS NULL THEN RAISE EXCEPTION 'Selecione uma filial'; END IF;
  SELECT * INTO v_op FROM public.resolve_partner_pdv_operator(NULL, NULL, v_branch);
  IF v_op.role NOT IN ('administrador', 'gerente') THEN RAISE EXCEPTION 'Sem permissão para alterar regras fiscais'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.partner_branches b
    WHERE b.id = v_branch AND b.user_id = v_op.company_id
  ) THEN RAISE EXCEPTION 'Filial inválida'; END IF;

  IF v_rule_id IS NULL THEN
    INSERT INTO public.fiscal_tax_rules(
      user_id, branch_id, name, ncm, cfop, cst_csosn,
      icms_rate, pis_rate, cofins_rate, active
    )
    VALUES (
      v_op.company_id, v_branch, trim(p_settings->>'name'), p_settings->>'ncm',
      trim(p_settings->>'cfop'), trim(p_settings->>'cst_csosn'),
      COALESCE(NULLIF(p_settings->>'icms_rate', '')::numeric, 0),
      COALESCE(NULLIF(p_settings->>'pis_rate', '')::numeric, 0),
      COALESCE(NULLIF(p_settings->>'cofins_rate', '')::numeric, 0),
      COALESCE((p_settings->>'active')::boolean, true)
    )
    RETURNING id INTO v_rule_id;
  ELSE
    UPDATE public.fiscal_tax_rules
    SET name = trim(p_settings->>'name'),
        ncm = p_settings->>'ncm',
        cfop = trim(p_settings->>'cfop'),
        cst_csosn = trim(p_settings->>'cst_csosn'),
        icms_rate = COALESCE(NULLIF(p_settings->>'icms_rate', '')::numeric, 0),
        pis_rate = COALESCE(NULLIF(p_settings->>'pis_rate', '')::numeric, 0),
        cofins_rate = COALESCE(NULLIF(p_settings->>'cofins_rate', '')::numeric, 0),
        active = COALESCE((p_settings->>'active')::boolean, true)
    WHERE id = v_rule_id AND user_id = v_op.company_id AND branch_id = v_branch;
    IF NOT FOUND THEN RAISE EXCEPTION 'Regra fiscal não encontrada nesta filial'; END IF;
  END IF;
  RETURN v_rule_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_fiscal_branch_settings(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_fiscal_branch_settings(jsonb) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'partner_profiles'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_profiles;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
