-- Corrige a persistencia de Clientes, Colaboradores e Fornecedores.
-- Migration aditiva: nao altera nenhuma migration historica.
--
-- Resumo:
-- 1) Infra de PIN hash (coluna pin_hash + funcao verify_partner_salesperson_pin),
--    exigida pela RPC execute_partner_sale_mutation (20260908000000) que ja
--    referenciava esses objetos sem eles terem sido criados.
-- 2) RPCs seguras SECURITY DEFINER para Colaboradores (partner_salespeople) e
--    Fornecedores (partner_suppliers), substituindo o INSERT/UPDATE/DELETE
--    direto usado hoje pelo frontend.
-- 3) Bloqueio de escrita direta (RLS deny-all) nessas duas tabelas, forcando
--    todas as mutacoes a passarem pelas RPCs auditadas.
-- 4) Recriacao de execute_partner_customer_mutation com a assinatura real
--    (a versao anterior tentava gravar a coluna person_type, que nunca existiu
--    em partner_customers, e o frontend chamava a RPC com 40 parametros
--    contra uma funcao de 17 -- por isso o cadastro de clientes nunca persistia).

-- ============================================================
-- 1. Infra de PIN hash
-- ============================================================

ALTER TABLE public.partner_salespeople
  ADD COLUMN IF NOT EXISTS pin_hash text;

-- Backfill: hash do PIN em texto puro ja existente, sem remover a coluna legada
-- (a coluna "pin" continua sendo usada pela funcao resolve_partner_operator,
-- definida em 20260903135419_harden_partner_mutation_rpcs.sql, que nao pode
-- ser alterada por esta tarefa).
UPDATE public.partner_salespeople
SET pin_hash = extensions.crypt(pin, extensions.gen_salt('bf'))
WHERE pin IS NOT NULL AND pin_hash IS NULL;

CREATE OR REPLACE FUNCTION public.verify_partner_salesperson_pin(p_pin text, p_pin_hash text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_pin IS NOT NULL AND p_pin_hash IS NOT NULL AND p_pin_hash = extensions.crypt(p_pin, p_pin_hash);
$$;

REVOKE ALL ON FUNCTION public.verify_partner_salesperson_pin(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_partner_salesperson_pin(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_partner_salesperson_pin(text, text) TO authenticated;

-- ============================================================
-- 2. Bloqueio de escrita direta em partner_salespeople / partner_suppliers
--    (mantem SELECT existente; INSERT/UPDATE/DELETE passam a exigir RPC)
-- ============================================================

DROP POLICY IF EXISTS "insert_own_salespeople" ON public.partner_salespeople;
DROP POLICY IF EXISTS "update_own_salespeople" ON public.partner_salespeople;
DROP POLICY IF EXISTS "delete_own_salespeople" ON public.partner_salespeople;
DROP POLICY IF EXISTS "deny_direct_insert_salespeople" ON public.partner_salespeople;
DROP POLICY IF EXISTS "deny_direct_update_salespeople" ON public.partner_salespeople;
DROP POLICY IF EXISTS "deny_direct_delete_salespeople" ON public.partner_salespeople;
CREATE POLICY "deny_direct_insert_salespeople" ON public.partner_salespeople FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "deny_direct_update_salespeople" ON public.partner_salespeople FOR UPDATE TO authenticated USING (false);
CREATE POLICY "deny_direct_delete_salespeople" ON public.partner_salespeople FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS "insert_own_suppliers" ON public.partner_suppliers;
DROP POLICY IF EXISTS "update_own_suppliers" ON public.partner_suppliers;
DROP POLICY IF EXISTS "delete_own_suppliers" ON public.partner_suppliers;
DROP POLICY IF EXISTS "deny_direct_insert_suppliers" ON public.partner_suppliers;
DROP POLICY IF EXISTS "deny_direct_update_suppliers" ON public.partner_suppliers;
DROP POLICY IF EXISTS "deny_direct_delete_suppliers" ON public.partner_suppliers;
CREATE POLICY "deny_direct_insert_suppliers" ON public.partner_suppliers FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "deny_direct_update_suppliers" ON public.partner_suppliers FOR UPDATE TO authenticated USING (false);
CREATE POLICY "deny_direct_delete_suppliers" ON public.partner_suppliers FOR DELETE TO authenticated USING (false);

-- ============================================================
-- 3. RPCs de Colaboradores (partner_salespeople)
-- ============================================================

CREATE OR REPLACE FUNCTION public.execute_partner_salesperson_mutation(
  p_operator_id uuid,
  p_operator_pin text,
  p_salesperson_id uuid,
  p_name text,
  p_role text,
  p_commission_rate numeric,
  p_branch_id uuid,
  p_active boolean,
  p_new_pin text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_operator record;
  v_target_id uuid := COALESCE(p_salesperson_id, pg_catalog.gen_random_uuid());
  v_existing_user_id uuid;
  v_pin_hash text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Nao autenticado.'; END IF;
  IF p_name IS NULL OR pg_catalog.btrim(p_name) = '' THEN RAISE EXCEPTION 'Nome do colaborador e obrigatorio.'; END IF;
  IF p_role IS NULL OR p_role NOT IN ('administrador','gerente','caixa','vendedor','tecnico','atendente','logistica') THEN
    RAISE EXCEPTION 'Funcao/permissao invalida.';
  END IF;

  SELECT * INTO v_operator FROM public.resolve_partner_operator(p_operator_id, p_operator_pin, p_branch_id);
  IF v_operator.role <> 'administrador' THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem gerenciar colaboradores.';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.partner_branches b WHERE b.id = p_branch_id AND b.user_id = v_operator.company_id
  ) THEN
    RAISE EXCEPTION 'Filial informada nao pertence a esta empresa.';
  END IF;

  SELECT user_id INTO v_existing_user_id FROM public.partner_salespeople WHERE id = v_target_id;
  IF p_salesperson_id IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'Colaborador nao encontrado nesta empresa.'; END IF;
 IF v_existing_user_id IS NOT NULL AND v_existing_user_id <> v_operator.company_id THEN
    RAISE EXCEPTION 'Acesso negado: colaborador pertence a outra empresa.';
  END IF;

  IF p_new_pin IS NOT NULL THEN
    IF p_new_pin !~ '^[0-9]{4,8}$' THEN RAISE EXCEPTION 'PIN deve conter entre 4 e 8 digitos numericos.'; END IF;
    v_pin_hash := extensions.crypt(p_new_pin, extensions.gen_salt('bf'));
  END IF;

  IF v_existing_user_id IS NULL THEN
    INSERT INTO public.partner_salespeople (
      id, user_id, name, role, commission_rate, branch_id, active, pin, pin_hash, created_at
    ) VALUES (
      v_target_id, 
v_operator.company_id, pg_catalog.btrim(p_name), p_role, COALESCE(p_commission_rate, 0),
      p_branch_id,
COALESCE(p_active, true), NULL, v_pin_hash, pg_catalog.now()
    );
  ELSE
    UPDATE public.partner_salespeople SET
      name = pg_catalog.btrim(p_name),
      role = p_role,
      commission_rate = COALESCE(p_commission_rate, commission_rate),
      branch_id = p_branch_id,
      active = COALESCE(p_active, active),
     pin = CASE WHEN p_new_pin IS NOT NULL THEN NULL ELSE pin END,
pin_hash = COALESCE(v_pin_hash, pin_hash)
    WHERE id = v_target_id AND user_id = v_operator.company_id;
  END IF;

  INSERT INTO public.partner_audit_logs (id, user_id, actor_name, actor_role, action, entity_type, entity_id, details)
  VALUES (
    'audit-' || pg_catalog.gen_random_uuid()::text,
    v_operator.company_id,
    COALESCE((SELECT name FROM public.partner_salespeople WHERE id = v_operator.salesperson_id), 'Administrador'),
    v_operator.role,
    CASE WHEN v_existing_user_id IS NULL THEN 'Colaborador Criado' ELSE 'Colaborador Atualizado' END,
    'colaborador', v_target_id::text,
    'Colaborador ' || pg_catalog.btrim(p_name) || ' (' || p_role || ')'
  );

  RETURN v_target_id;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_partner_salesperson_mutation(uuid, text, uuid, text, text, numeric, uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_partner_salesperson_mutation(uuid, text, uuid, text, text, numeric, uuid, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.execute_partner_salesperson_mutation(uuid, text, uuid, text, text, numeric, uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.execute_partner_salesperson_delete(
  p_operator_id uuid,
  p_operator_pin text,
  p_salesperson_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_operator record;
  v_target record;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Nao autenticado.'; END IF;
  SELECT * INTO v_operator FROM public.resolve_partner_operator(p_operator_id, p_operator_pin, NULL);
  IF v_operator.role <> 'administrador' THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem excluir colaboradores.';
  END IF;

  SELECT v_operator.company_id, name INTO v_target
  FROM public.partner_salespeople
  WHERE id = p_salesperson_id AND user_id = v_operator.company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador nao encontrado nesta empresa.'; END IF;
  IF v_target.company_id = v_operator.company_id THEN
    RAISE EXCEPTION 'Nao e possivel excluir o proprio operador em uso.';
  END IF;

  DELETE FROM public.partner_salespeople WHERE id = p_salesperson_id AND user_id = v_operator.company_id;

  INSERT INTO public.partner_audit_logs (id, user_id, actor_name, actor_role, action, entity_type, entity_id, details)
  VALUES (
    'audit-' || pg_catalog.gen_random_uuid()::text, v_operator.company_id, 'Administrador', v_operator.role,
    'Colaborador Excluido', 'colaborador', p_salesperson_id::text, 'Colaborador ' || v_target.name || ' removido'
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_partner_salesperson_delete(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_partner_salesperson_delete(uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.execute_partner_salesperson_delete(uuid, text, uuid) TO authenticated;

-- ============================================================
-- 4. RPCs de Fornecedores (partner_suppliers)
-- ============================================================

CREATE OR REPLACE FUNCTION public.execute_partner_supplier_mutation(
  p_operator_id uuid,
  p_operator_pin text,
  p_supplier_id uuid,
  p_name text,
  p_phone text,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_operator record;
  v_target_id uuid := COALESCE(p_supplier_id, pg_catalog.gen_random_uuid());
  v_existing_user_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Nao autenticado.'; END IF;
  IF p_name IS NULL OR pg_catalog.btrim(p_name) = '' THEN RAISE EXCEPTION 'Nome do fornecedor e obrigatorio.'; END IF;

  SELECT * INTO v_operator FROM public.resolve_partner_operator(p_operator_id, p_operator_pin, NULL);

  SELECT user_id INTO v_existing_user_id FROM public.partner_suppliers WHERE id = p_supplier_id AND user_id = v_operator.company_id;
  IF p_supplier_id IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'Fornecedor nao encontrado nesta empresa.'; END IF;
  IF v_existing_user_id IS NOT NULL AND v_existing_user_id <> v_operator.company_id THEN
    RAISE EXCEPTION 'Acesso negado: fornecedor pertence a outra empresa.';
  END IF;

  IF v_existing_user_id IS NULL THEN
    INSERT INTO public.partner_suppliers (id, user_id, name, phone, notes, payable_balance, created_at)
    VALUES (v_target_id, v_operator.company_id, pg_catalog.btrim(p_name), p_phone, p_notes, 0, pg_catalog.now());
  ELSE
    UPDATE public.partner_suppliers SET
      name = pg_catalog.btrim(p_name),
      phone = p_phone,
      notes = p_notes
    WHERE id = v_target_id AND user_id = v_operator.company_id;
  END IF;

  INSERT INTO public.partner_audit_logs (id, user_id, actor_name, actor_role, action, entity_type, entity_id, details)
  VALUES (
    'audit-' || pg_catalog.gen_random_uuid()::text,
    v_operator.company_id,
    COALESCE((SELECT name FROM public.partner_salespeople WHERE id = v_operator.salesperson_id), 'Administrador'),
    v_operator.role,
    CASE WHEN v_existing_user_id IS NULL THEN 'Fornecedor Criado' ELSE 'Fornecedor Atualizado' END,
    'fornecedor', v_target_id::text, 'Fornecedor ' || pg_catalog.btrim(p_name)
  );

  RETURN v_target_id;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_partner_supplier_mutation(uuid, text, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_partner_supplier_mutation(uuid, text, uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.execute_partner_supplier_mutation(uuid, text, uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.execute_partner_supplier_delete(
  p_operator_id uuid,
  p_operator_pin text,
  p_supplier_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_operator record;
  v_target record;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Nao autenticado.'; END IF;
  SELECT * INTO v_operator FROM public.resolve_partner_operator(p_operator_id, p_operator_pin, NULL);

  SELECT id, user_id, name INTO v_target
  FROM public.partner_suppliers
  WHERE id = p_supplier_id AND user_id = v_operator.company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fornecedor nao encontrado nesta empresa.'; END IF;

  DELETE FROM public.partner_suppliers WHERE id = p_supplier_id AND user_id = v_operator.company_id;

  INSERT INTO public.partner_audit_logs (id, user_id, actor_name, actor_role, action, entity_type, entity_id, details)
  VALUES (
    'audit-' || pg_catalog.gen_random_uuid()::text,
    v_operator.company_id,
    COALESCE((SELECT name FROM public.partner_salespeople WHERE id = v_operator.salesperson_id), 'Administrador'),
    v_operator.role,
    'Fornecedor Excluido', 'fornecedor', p_supplier_id::text, 'Fornecedor ' || v_target.name || ' removido'
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_partner_supplier_delete(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_partner_supplier_delete(uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.execute_partner_supplier_delete(uuid, text, uuid) TO authenticated;

-- ============================================================
-- 5. Correcao de execute_partner_customer_mutation
--    (assinatura real: apenas colunas que existem em partner_customers)
-- ============================================================

DROP FUNCTION IF EXISTS public.execute_partner_customer_mutation(
  uuid, text, uuid, uuid, text, text, text, text, text, date, text, text, text, text, text, text, numeric
);

CREATE OR REPLACE FUNCTION public.execute_partner_customer_mutation(
  p_salesperson_id uuid,
  p_pin text,
  p_customer_id uuid,
  p_branch_id uuid,
  p_name text,
  p_document text,
  p_phone text,
  p_email text,
  p_birthday date,
  p_address text,
  p_neighborhood text,
  p_city text,
  p_device_model text,
  p_notes text,
  p_customer_type text,
  p_credit_limit numeric,
  p_allow_credit boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_operator record;
  v_existing_user_id uuid;
  v_existing_branch_id uuid;
  v_target_id uuid := COALESCE(p_customer_id, pg_catalog.gen_random_uuid());
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Nao autenticado.'; END IF;
  IF p_name IS NULL OR pg_catalog.btrim(p_name) = '' THEN RAISE EXCEPTION 'Nome do cliente e obrigatorio.'; END IF;
  IF p_credit_limit IS NOT NULL AND p_credit_limit < 0 THEN RAISE EXCEPTION 'Limite de credito nao pode ser negativo.'; END IF;

  SELECT * INTO v_operator FROM public.resolve_partner_operator(p_salesperson_id, p_pin, p_branch_id);
  IF v_operator.branch_id IS NULL THEN RAISE EXCEPTION 'E necessario informar uma filial valida.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.partner_branches b WHERE b.id = v_operator.branch_id AND b.user_id = v_operator.company_id
  ) THEN
    RAISE EXCEPTION 'Filial invalida.';
  END IF;

  SELECT user_id, branch_id INTO v_existing_user_id, v_existing_branch_id
  FROM public.partner_customers WHERE id = v_target_id;
  IF p_customer_id IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'Cliente nao encontrado nesta empresa.'; END IF;
  IF v_existing_user_id IS NOT NULL AND v_existing_user_id <> v_operator.company_id THEN
    RAISE EXCEPTION 'Acesso negado: cliente pertence a outra empresa.';
  END IF;
  IF v_operator.role <> 'administrador' AND v_existing_branch_id IS NOT NULL AND v_existing_branch_id <> v_operator.branch_id THEN
    RAISE EXCEPTION 'Acesso negado: voce nao pode alterar clientes de outra filial.';
  END IF;

  IF v_existing_user_id IS NULL THEN
    INSERT INTO public.partner_customers (
      id, user_id, branch_id, name, document, phone, email, birthday, address,
      neighborhood, city, device_model, notes, customer_type, credit_limit, allow_credit
    ) VALUES (
      v_target_id, v_operator.company_id, v_operator.branch_id, pg_catalog.btrim(p_name), p_document, p_phone, p_email,
      p_birthday, p_address, p_neighborhood, p_city, p_device_model, p_notes,
      COALESCE(p_customer_type, 'varejo'), GREATEST(COALESCE(p_credit_limit, 0), 0), COALESCE(p_allow_credit, false)
    );
  ELSE
    UPDATE public.partner_customers SET
      branch_id = v_operator.branch_id,
      name = pg_catalog.btrim(p_name),
      document = p_document,
      phone = p_phone,
      email = p_email,
      birthday = p_birthday,
      address = p_address,
      neighborhood = p_neighborhood,
      city = p_city,
      device_model = p_device_model,
      notes = p_notes,
      customer_type = COALESCE(p_customer_type, customer_type),
      credit_limit = GREATEST(COALESCE(p_credit_limit, credit_limit), 0),
      allow_credit = COALESCE(p_allow_credit, allow_credit)
    WHERE id = v_target_id AND user_id = v_operator.company_id;
  END IF;

  RETURN v_target_id;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_partner_customer_mutation(
  uuid, text, uuid, uuid, text, text, text, text, date, text, text, text, text, text, text, numeric, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_partner_customer_mutation(
  uuid, text, uuid, uuid, text, text, text, text, date, text, text, text, text, text, text, numeric, boolean
) FROM anon;
GRANT EXECUTE ON FUNCTION public.execute_partner_customer_mutation(
  uuid, text, uuid, uuid, text, text, text, text, date, text, text, text, text, text, text, numeric, boolean
) TO authenticated;
