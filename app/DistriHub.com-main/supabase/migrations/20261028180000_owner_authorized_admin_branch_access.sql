-- No grants are backfilled: existing administrators retain only their primary branch.
-- Roll back only by reverting this migration and restoring the prior RPC/RLS definitions
-- from the release backup; do not remove grants or history without owner approval.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS partner_salespeople_id_user_id_uidx
  ON public.partner_salespeople(id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS partner_branches_id_user_id_uidx
  ON public.partner_branches(id, user_id);

CREATE TABLE IF NOT EXISTS public.partner_admin_branch_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.partner_profiles(id) ON DELETE RESTRICT,
  salesperson_id uuid NOT NULL,
  branch_id uuid,
  all_branches boolean NOT NULL DEFAULT false,
  granted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT partner_admin_branch_access_scope_check
    CHECK (all_branches = (branch_id IS NULL)),
  CONSTRAINT partner_admin_branch_access_salesperson_company_fk
    FOREIGN KEY (salesperson_id, company_id)
    REFERENCES public.partner_salespeople(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT partner_admin_branch_access_branch_company_fk
    FOREIGN KEY (branch_id, company_id)
    REFERENCES public.partner_branches(id, user_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_admin_branch_access_active_branch_uidx
  ON public.partner_admin_branch_access(company_id, salesperson_id, branch_id)
  WHERE revoked_at IS NULL AND branch_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS partner_admin_branch_access_active_all_uidx
  ON public.partner_admin_branch_access(company_id, salesperson_id)
  WHERE revoked_at IS NULL AND all_branches;
CREATE INDEX IF NOT EXISTS partner_admin_branch_access_history_idx
  ON public.partner_admin_branch_access(company_id, salesperson_id, granted_at DESC);

ALTER TABLE public.partner_admin_branch_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.partner_admin_branch_access FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.partner_admin_branch_access TO authenticated;
DROP POLICY IF EXISTS partner_admin_branch_access_owner_read ON public.partner_admin_branch_access;
CREATE POLICY partner_admin_branch_access_owner_read
  ON public.partner_admin_branch_access
  FOR SELECT TO authenticated
  USING (company_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.partner_salesperson_has_branch_access(
  p_company_id uuid, p_salesperson_id uuid, p_branch_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT p_branch_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.partner_salespeople sp
      JOIN public.partner_branches b
        ON b.id = p_branch_id
       AND b.user_id = p_company_id
       AND b.is_active = true
      WHERE sp.id = p_salesperson_id
        AND sp.user_id = p_company_id
        AND sp.active = true
        AND (
          sp.branch_id = p_branch_id
          OR (
            sp.role = 'administrador'
            AND EXISTS (
              SELECT 1
              FROM public.partner_admin_branch_access access
              WHERE access.company_id = p_company_id
                AND access.salesperson_id = sp.id
                AND access.revoked_at IS NULL
                AND (
                  access.all_branches
                  OR access.branch_id = p_branch_id
                )
            )
          )
        )
    )
$$;
REVOKE ALL ON FUNCTION public.partner_salesperson_has_branch_access(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.revoke_admin_branch_access_on_demotion()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF OLD.role = 'administrador' AND NEW.role <> 'administrador' THEN
    UPDATE public.partner_admin_branch_access
    SET revoked_at = now()
    WHERE company_id = NEW.user_id
      AND salesperson_id = NEW.id
      AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_admin_branch_access_on_demotion()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS revoke_admin_branch_access_on_demotion ON public.partner_salespeople;
CREATE TRIGGER revoke_admin_branch_access_on_demotion
  AFTER UPDATE OF role ON public.partner_salespeople
  FOR EACH ROW EXECUTE FUNCTION public.revoke_admin_branch_access_on_demotion();

-- Self-contained copy of the branch requirement from 20261028130000; it only
-- validates future inserts/branch changes and never rewrites existing rows.
CREATE OR REPLACE FUNCTION public.require_partner_salesperson_branch()
RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NEW.branch_id IS NULL THEN
    RAISE EXCEPTION 'Cada colaborador precisa estar vinculado a uma filial.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.require_partner_salesperson_branch()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS require_partner_salesperson_branch ON public.partner_salespeople;
CREATE TRIGGER require_partner_salesperson_branch
  BEFORE INSERT OR UPDATE OF branch_id ON public.partner_salespeople
  FOR EACH ROW EXECUTE FUNCTION public.require_partner_salesperson_branch();

CREATE OR REPLACE FUNCTION public.partner_employee_can_access_branch(
  p_company_id uuid, p_branch_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT p_branch_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.partner_branches b
      WHERE b.id = p_branch_id
        AND b.user_id = p_company_id
        AND b.is_active = true
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.partner_profiles owner_profile
        WHERE owner_profile.id = p_company_id
          AND owner_profile.id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1
        FROM public.partner_salespeople sp
        WHERE sp.user_id = p_company_id
          AND sp.auth_user_id = (SELECT auth.uid())
          AND sp.active = true
          AND public.partner_salesperson_has_branch_access(
            p_company_id, sp.id, p_branch_id
          )
      )
    )
$$;
REVOKE ALL ON FUNCTION public.partner_employee_can_access_branch(uuid,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_employee_can_access_branch(uuid,uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.partner_employee_can_operate_sale(
  p_company_id uuid, p_branch_id uuid, p_salesperson_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.partner_branches b
    JOIN public.partner_salespeople target
      ON target.id = p_salesperson_id
     AND target.user_id = p_company_id
     AND target.active = true
    WHERE b.id = p_branch_id
      AND b.user_id = p_company_id
      AND b.is_active = true
      AND public.partner_salesperson_has_branch_access(
        p_company_id, target.id, p_branch_id
      )
      AND (
        EXISTS (
          SELECT 1
          FROM public.partner_profiles owner_profile
          WHERE owner_profile.id = p_company_id
            AND owner_profile.id = (SELECT auth.uid())
        )
        OR EXISTS (
          SELECT 1
          FROM public.partner_salespeople actor
          WHERE actor.user_id = p_company_id
            AND actor.auth_user_id = (SELECT auth.uid())
            AND actor.active = true
            AND public.partner_employee_can_access_branch(
              p_company_id, p_branch_id
            )
        )
      )
  )
$$;
REVOKE ALL ON FUNCTION public.partner_employee_can_operate_sale(uuid,uuid,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_employee_can_operate_sale(uuid,uuid,uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.list_saas_access_branches(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.partner_profiles p
    WHERE p.id = p_company_id
      AND (
        p.id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.partner_salespeople sp
          WHERE sp.user_id = p_company_id
            AND sp.auth_user_id = (SELECT auth.uid())
            AND sp.active = true
        )
      )
  ) THEN
    RAISE EXCEPTION 'Empresa não autorizada.';
  END IF;

  RETURN (
    SELECT COALESCE(
      jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) ORDER BY b.name),
      '[]'::jsonb
    )
    FROM public.partner_branches b
    WHERE b.user_id = p_company_id
      AND b.is_active = true
      AND public.partner_employee_can_access_branch(p_company_id, b.id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.list_saas_access_branches(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_saas_access_branches(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_partner_operator(
  p_salesperson_id uuid, p_pin text, p_requested_branch_id uuid
) RETURNS TABLE(company_id uuid, salesperson_id uuid, role text, branch_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_auth uuid := (SELECT auth.uid());
  v_is_owner boolean;
  v_operator public.partner_salespeople%ROWTYPE;
  v_count integer;
  v_effective_branch uuid;
BEGIN
  IF v_auth IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.partner_profiles p WHERE p.id = v_auth
  ) INTO v_is_owner;

  IF p_salesperson_id IS NULL AND v_is_owner THEN
    IF p_requested_branch_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.partner_branches b
      WHERE b.id = p_requested_branch_id AND b.user_id = v_auth AND b.is_active = true
    ) THEN RAISE EXCEPTION 'Acesso negado à filial.'; END IF;
    RETURN QUERY SELECT v_auth, NULL::uuid, 'administrador'::text, p_requested_branch_id;
    RETURN;
  END IF;

  IF p_salesperson_id IS NULL THEN
    SELECT count(*) INTO v_count
    FROM public.partner_salespeople sp
    WHERE sp.auth_user_id = v_auth;
    IF v_count <> 1 THEN RAISE EXCEPTION 'Identidade de funcionário inválida ou ambígua.'; END IF;
    SELECT sp.* INTO v_operator
    FROM public.partner_salespeople sp
    WHERE sp.auth_user_id = v_auth AND sp.active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário inativo ou não encontrado.'; END IF;
  ELSE
    SELECT sp.* INTO v_operator
    FROM public.partner_salespeople sp
    WHERE sp.id = p_salesperson_id
      AND sp.active = true
      AND (
        (v_is_owner AND sp.user_id = v_auth)
        OR (NOT v_is_owner AND sp.auth_user_id = v_auth)
      )
      AND public.verify_partner_salesperson_pin(p_pin, sp.pin_hash);
    IF NOT FOUND THEN RAISE EXCEPTION 'Operador inválido ou PIN incorreto.'; END IF;
  END IF;

  IF v_operator.role IS NULL OR v_operator.branch_id IS NULL THEN
    RAISE EXCEPTION 'Funcionário sem filial principal válida.';
  END IF;
  v_effective_branch := COALESCE(p_requested_branch_id, v_operator.branch_id);
  IF NOT public.partner_salesperson_has_branch_access(
    v_operator.user_id, v_operator.id, v_effective_branch
  ) THEN RAISE EXCEPTION 'Acesso negado à filial.'; END IF;

  RETURN QUERY SELECT
    v_operator.user_id,
    v_operator.id,
    v_operator.role,
    v_effective_branch;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_partner_operator(uuid,text,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_partner_operator(uuid,text,uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_partner_pdv_operator(
  p_salesperson_id uuid, p_pin text, p_requested_branch_id uuid
) RETURNS TABLE(company_id uuid, salesperson_id uuid, role text, branch_id uuid)
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$
  SELECT * FROM public.resolve_partner_operator(
    p_salesperson_id, p_pin, p_requested_branch_id
  )
$$;
REVOKE ALL ON FUNCTION public.resolve_partner_pdv_operator(uuid,text,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_partner_pdv_operator(uuid,text,uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.check_salesperson_branch_integrity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.salesperson_id IS NOT DISTINCT FROM OLD.salesperson_id
     AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id THEN
    RETURN NEW;
  END IF;

  IF NEW.salesperson_id IS NOT NULL AND (
    NEW.branch_id IS NULL
    OR NOT public.partner_salesperson_has_branch_access(
      NEW.user_id, NEW.salesperson_id, NEW.branch_id
    )
  ) THEN
    RAISE EXCEPTION 'Funcionário sem autorização para operar nesta filial.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_salesperson_branch_integrity()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_check_sale_salesperson_branch ON public.partner_sales;
CREATE TRIGGER trg_check_sale_salesperson_branch
  BEFORE INSERT OR UPDATE OF salesperson_id, branch_id ON public.partner_sales
  FOR EACH ROW EXECUTE FUNCTION public.check_salesperson_branch_integrity();

CREATE OR REPLACE FUNCTION public.set_partner_admin_branch_access(
  p_salesperson_id uuid, p_branch_id uuid, p_all_branches boolean, p_granted boolean
) RETURNS public.partner_admin_branch_access
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_company_id uuid := (SELECT auth.uid());
  v_target public.partner_salespeople%ROWTYPE;
  v_result public.partner_admin_branch_access%ROWTYPE;
BEGIN
  IF v_company_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.partner_profiles p WHERE p.id = v_company_id
  ) THEN RAISE EXCEPTION 'Somente o proprietário autenticado pode alterar acessos adicionais.'; END IF;
  IF p_granted IS NULL OR p_all_branches IS NULL
     OR (p_all_branches AND p_branch_id IS NOT NULL)
     OR (NOT p_all_branches AND p_branch_id IS NULL) THEN
    RAISE EXCEPTION 'Escopo de acesso inválido.';
  END IF;

  SELECT sp.* INTO v_target
  FROM public.partner_salespeople sp
  WHERE sp.id = p_salesperson_id
    AND sp.user_id = v_company_id
  FOR UPDATE;
  IF NOT FOUND OR v_target.role <> 'administrador' THEN
    RAISE EXCEPTION 'Somente um administrador ativo da empresa pode receber acessos adicionais.';
  END IF;
  IF v_target.branch_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.partner_branches b
    WHERE b.id = v_target.branch_id
      AND b.user_id = v_company_id
      AND b.is_active = true
  ) THEN RAISE EXCEPTION 'O administrador precisa de uma filial principal ativa.'; END IF;
  IF NOT p_all_branches AND NOT EXISTS (
    SELECT 1 FROM public.partner_branches b
    WHERE b.id = p_branch_id
      AND b.user_id = v_company_id
      AND b.is_active = true
      AND b.id <> v_target.branch_id
  ) THEN RAISE EXCEPTION 'A filial adicional deve ser outra filial ativa da empresa.'; END IF;

  IF p_granted THEN
    INSERT INTO public.partner_admin_branch_access (
      company_id, salesperson_id, branch_id, all_branches, granted_by
    ) VALUES (
      v_company_id, p_salesperson_id,
      CASE WHEN p_all_branches THEN NULL ELSE p_branch_id END,
      p_all_branches, v_company_id
    )
    ON CONFLICT DO NOTHING
    RETURNING * INTO v_result;
    IF NOT FOUND THEN
      SELECT * INTO v_result
      FROM public.partner_admin_branch_access a
      WHERE a.company_id = v_company_id
        AND a.salesperson_id = p_salesperson_id
        AND a.revoked_at IS NULL
        AND a.all_branches = p_all_branches
        AND (p_all_branches OR a.branch_id = p_branch_id);
    END IF;
  ELSE
    UPDATE public.partner_admin_branch_access a
    SET revoked_at = now()
    WHERE a.company_id = v_company_id
      AND a.salesperson_id = p_salesperson_id
      AND a.revoked_at IS NULL
      AND a.all_branches = p_all_branches
      AND (p_all_branches OR a.branch_id = p_branch_id)
    RETURNING * INTO v_result;
    IF NOT FOUND THEN RAISE EXCEPTION 'A concessão ativa não foi encontrada.'; END IF;
  END IF;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.set_partner_admin_branch_access(uuid,uuid,boolean,boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_partner_admin_branch_access(uuid,uuid,boolean,boolean)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.update_partner_salesperson_access(
  p_salesperson_id uuid,
  p_name text,
  p_role text,
  p_commission_rate numeric,
  p_phone text,
  p_email text,
  p_is_active boolean,
  p_branch_id uuid,
  p_operator_id uuid,
  p_operator_pin text,
  p_new_pin text,
  p_blocked_modules text[]
) RETURNS public.partner_salespeople
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_company_id uuid := (SELECT auth.uid());
  v_result public.partner_salespeople;
BEGIN
  IF v_company_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.partner_profiles p WHERE p.id = v_company_id
  ) THEN RAISE EXCEPTION 'Somente o proprietário pode alterar os acessos da equipe.'; END IF;
  PERFORM partner_subscription_private.require_operator_module(
    'administrativo', p_operator_id
  );
  IF p_blocked_modules IS NULL
     OR array_position(p_blocked_modules, NULL) IS NOT NULL
     OR NOT p_blocked_modules <@ ARRAY[
       'cadastros','pdv','caixa','pedidos','os','historico','suporte','fiscal',
       'administrativo','entregas','financeiro','rma','relatorios',
       'white-label','configuracoes'
     ]::text[] THEN
    RAISE EXCEPTION 'Lista de módulos inválida.';
  END IF;

  PERFORM public.execute_partner_salesperson_mutation(
    p_salesperson_id, p_name, p_role, p_commission_rate, p_phone, p_email,
    p_is_active, p_branch_id, p_operator_id, p_operator_pin, p_new_pin
  );
  UPDATE public.partner_salespeople sp
  SET blocked_modules = p_blocked_modules
  WHERE sp.id = p_salesperson_id
    AND sp.user_id = v_company_id
  RETURNING * INTO v_result;
  IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador não encontrado nesta empresa.'; END IF;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.update_partner_salesperson_access(
  uuid,text,text,numeric,text,text,boolean,uuid,uuid,text,text,text[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_partner_salesperson_access(
  uuid,text,text,numeric,text,text,boolean,uuid,uuid,text,text,text[]
) TO authenticated;

CREATE OR REPLACE FUNCTION public.execute_partner_salesperson_mutation(
  p_salesperson_id uuid,
  p_name text,
  p_role text,
  p_commission_rate numeric,
  p_phone text,
  p_email text,
  p_is_active boolean,
  p_branch_id uuid,
  p_operator_id uuid,
  p_operator_pin text,
  p_new_pin text DEFAULT NULL
) RETURNS public.partner_salespeople
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_auth uuid := (SELECT auth.uid());
  v_is_owner boolean;
  v_operator record;
  v_company_id uuid;
  v_actor_id uuid;
  v_actor_role text;
  v_target_id uuid := COALESCE(p_salesperson_id, pg_catalog.gen_random_uuid());
  v_existing_user_id uuid;
  v_existing_role text;
  v_existing_branch uuid;
  v_pin_hash text;
  v_result public.partner_salespeople;
BEGIN
  IF v_auth IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_name IS NULL OR pg_catalog.btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Nome do colaborador é obrigatório.';
  END IF;
  IF p_role IS NULL OR p_role NOT IN (
    'administrador','gerente','caixa','vendedor','tecnico','atendente','logistica'
  ) THEN RAISE EXCEPTION 'Função/permissão inválida.'; END IF;
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'Cada colaborador precisa de uma filial principal.'; END IF;

  -- The caller is always the authenticated session; the operator id/PIN never
  -- replaces it, and the owner is recognised only by partner_profiles.id.
  SELECT EXISTS (
    SELECT 1 FROM public.partner_profiles p WHERE p.id = v_auth
  ) INTO v_is_owner;
  IF v_is_owner THEN
    v_company_id := v_auth;
    v_actor_role := 'administrador';
  ELSE
    SELECT * INTO v_operator
    FROM public.resolve_partner_operator(p_operator_id, p_operator_pin, p_branch_id);
    IF v_operator.role NOT IN ('administrador','gerente') THEN
      RAISE EXCEPTION 'Acesso negado: apenas administradores ou gerentes podem gerenciar colaboradores.';
    END IF;
    v_company_id := v_operator.company_id;
    v_actor_id := v_operator.salesperson_id;
    v_actor_role := v_operator.role;
  END IF;

  SELECT sp.user_id, sp.role, sp.branch_id
  INTO v_existing_user_id, v_existing_role, v_existing_branch
  FROM public.partner_salespeople sp
  WHERE sp.id = v_target_id AND sp.user_id = v_company_id
  FOR UPDATE;
  IF p_salesperson_id IS NOT NULL AND NOT FOUND THEN
    RAISE EXCEPTION 'Colaborador não encontrado nesta empresa.';
  END IF;

  IF NOT v_is_owner THEN
    IF p_salesperson_id IS NOT NULL AND p_salesperson_id = v_actor_id THEN
      RAISE EXCEPTION 'Você não pode alterar o próprio acesso.';
    END IF;
    IF p_role = 'administrador' OR v_existing_role = 'administrador' THEN
      RAISE EXCEPTION 'Somente o proprietário pode criar, promover ou alterar administradores.';
    END IF;
    IF v_existing_user_id IS NOT NULL AND (
      v_existing_branch IS NULL
      OR NOT public.partner_salesperson_has_branch_access(
        v_company_id, v_actor_id, v_existing_branch
      )
    ) THEN RAISE EXCEPTION 'Acesso negado à filial atual do colaborador.'; END IF;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.partner_branches b
    WHERE b.id = p_branch_id AND b.user_id = v_company_id AND b.is_active = true
  ) THEN RAISE EXCEPTION 'Filial informada não pertence à empresa ou está inativa.'; END IF;

  IF p_new_pin IS NOT NULL THEN
    IF p_new_pin !~ '^[0-9]{4,8}$' THEN RAISE EXCEPTION 'PIN deve conter entre 4 e 8 dígitos.'; END IF;
    v_pin_hash := extensions.crypt(p_new_pin, extensions.gen_salt('bf'));
  END IF;

  IF v_existing_user_id IS NULL THEN
    INSERT INTO public.partner_salespeople (
      id,user_id,name,role,commission_rate,branch_id,active,email,phone,pin,pin_hash,created_at
    ) VALUES (
      v_target_id,v_company_id,pg_catalog.btrim(p_name),p_role,
      COALESCE(p_commission_rate,0),p_branch_id,COALESCE(p_is_active,true),
      NULLIF(pg_catalog.btrim(COALESCE(p_email,'')), ''),
      NULLIF(pg_catalog.btrim(COALESCE(p_phone,'')), ''),
      NULL,v_pin_hash,pg_catalog.now()
    );
  ELSE
    UPDATE public.partner_salespeople
    SET name = pg_catalog.btrim(p_name),
        role = p_role,
        commission_rate = COALESCE(p_commission_rate, commission_rate),
        branch_id = p_branch_id,
        active = COALESCE(p_is_active, active),
        email = CASE WHEN p_email IS NULL THEN email ELSE NULLIF(pg_catalog.btrim(p_email), '') END,
        phone = CASE WHEN p_phone IS NULL THEN phone ELSE NULLIF(pg_catalog.btrim(p_phone), '') END,
        pin = CASE WHEN p_new_pin IS NOT NULL THEN NULL ELSE pin END,
        pin_hash = COALESCE(v_pin_hash, pin_hash)
    WHERE id = v_target_id AND user_id = v_company_id
    RETURNING * INTO v_result;
  END IF;

  IF v_existing_user_id IS NULL THEN
    SELECT * INTO v_result FROM public.partner_salespeople
    WHERE id = v_target_id AND user_id = v_company_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Não foi possível salvar o colaborador.'; END IF;

  INSERT INTO public.partner_audit_logs (
    id,user_id,actor_name,actor_role,action,entity_type,entity_id,details
  ) VALUES (
    'audit-' || pg_catalog.gen_random_uuid()::text,
    v_company_id,
    COALESCE((SELECT sp.name FROM public.partner_salespeople sp WHERE sp.id = v_actor_id), 'Proprietário'),
    v_actor_role,
    CASE WHEN v_existing_user_id IS NULL THEN 'Colaborador Criado' ELSE 'Colaborador Atualizado' END,
    'colaborador',v_target_id::text,
    'Colaborador ' || pg_catalog.btrim(p_name) || ' (' || p_role || ')'
  );
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.execute_partner_salesperson_mutation(
  uuid,text,text,numeric,text,text,boolean,uuid,uuid,text,text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_partner_salesperson_mutation(
  uuid,text,text,numeric,text,text,boolean,uuid,uuid,text,text
) TO authenticated;

DO $$
DECLARE
  v_table record;
  v_policy_sql text;
BEGIN
  FOR v_table IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN pg_class r ON r.relname = c.table_name
    JOIN pg_namespace n ON n.oid = r.relnamespace AND n.nspname = 'public'
    WHERE c.table_schema = 'public'
      AND c.column_name IN ('user_id','branch_id')
    GROUP BY c.table_name
    HAVING count(DISTINCT c.column_name) = 2
       AND bool_or(c.column_name = 'user_id')
       AND bool_or(c.column_name = 'branch_id')
       AND bool_or(r.relrowsecurity)
       AND c.table_name NOT IN ('partner_salespeople')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS restrict_authenticated_company_branch ON public.%I',
      v_table.table_name
    );
    v_policy_sql := format(
      'CREATE POLICY restrict_authenticated_company_branch ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (user_id = (SELECT auth.uid()) OR (branch_id IS NOT NULL AND public.partner_employee_can_access_branch(user_id, branch_id))) WITH CHECK (user_id = (SELECT auth.uid()) OR (branch_id IS NOT NULL AND public.partner_employee_can_access_branch(user_id, branch_id)))',
      v_table.table_name
    );
    EXECUTE v_policy_sql;
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS restrict_employee_products_to_branch ON public.partner_products;
CREATE POLICY restrict_employee_products_to_branch ON public.partner_products
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (branch_id IS NOT NULL AND public.partner_employee_can_access_branch(user_id, branch_id)))
  WITH CHECK (user_id = (SELECT auth.uid()) OR (branch_id IS NOT NULL AND public.partner_employee_can_access_branch(user_id, branch_id)));

DROP POLICY IF EXISTS restrict_employee_customers_to_branch ON public.partner_customers;
CREATE POLICY restrict_employee_customers_to_branch ON public.partner_customers
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (branch_id IS NOT NULL AND public.partner_employee_can_access_branch(user_id, branch_id)))
  WITH CHECK (user_id = (SELECT auth.uid()) OR (branch_id IS NOT NULL AND public.partner_employee_can_access_branch(user_id, branch_id)));

DROP POLICY IF EXISTS restrict_employee_sales_to_branch ON public.partner_sales;
CREATE POLICY restrict_employee_sales_to_branch ON public.partner_sales
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (branch_id IS NOT NULL AND public.partner_employee_can_access_branch(user_id, branch_id)))
  WITH CHECK (user_id = (SELECT auth.uid()) OR (branch_id IS NOT NULL AND public.partner_employee_can_access_branch(user_id, branch_id)));

DROP POLICY IF EXISTS restrict_employee_salespeople_to_branch ON public.partner_salespeople;
CREATE POLICY restrict_employee_salespeople_to_branch ON public.partner_salespeople
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR auth_user_id = (SELECT auth.uid())
    OR (branch_id IS NOT NULL AND public.partner_employee_can_access_branch(user_id, branch_id))
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR (branch_id IS NOT NULL AND public.partner_employee_can_access_branch(user_id, branch_id))
  );
DROP POLICY IF EXISTS deny_direct_salespeople_insert ON public.partner_salespeople;
CREATE POLICY deny_direct_salespeople_insert ON public.partner_salespeople
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (false);
DROP POLICY IF EXISTS deny_direct_salespeople_update ON public.partner_salespeople;
CREATE POLICY deny_direct_salespeople_update ON public.partner_salespeople
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);
DROP POLICY IF EXISTS deny_direct_salespeople_delete ON public.partner_salespeople;
CREATE POLICY deny_direct_salespeople_delete ON public.partner_salespeople
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (false);

DROP POLICY IF EXISTS restrict_employee_branches_to_assigned_branch ON public.partner_branches;
CREATE POLICY restrict_employee_branches_to_assigned_branch ON public.partner_branches
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.partner_employee_can_access_branch(user_id, id));
DROP POLICY IF EXISTS restrict_branch_insert_to_owner ON public.partner_branches;
CREATE POLICY restrict_branch_insert_to_owner ON public.partner_branches
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS restrict_branch_update_to_owner ON public.partner_branches;
CREATE POLICY restrict_branch_update_to_owner ON public.partner_branches
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS restrict_branch_delete_to_owner ON public.partner_branches;
CREATE POLICY restrict_branch_delete_to_owner ON public.partner_branches
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS restrict_employee_stock_movements_to_branch ON public.stock_movements;
CREATE POLICY restrict_employee_stock_movements_to_branch ON public.stock_movements
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.partner_products p
      WHERE p.id = stock_movements.product_id
        AND p.user_id = stock_movements.user_id
        AND public.partner_employee_can_access_branch(
          stock_movements.user_id, COALESCE(stock_movements.branch_id, p.branch_id)
        )
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR (branch_id IS NOT NULL AND public.partner_employee_can_access_branch(user_id, branch_id))
  );

ALTER TABLE public.partner_stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_authorized_partner_stock_movements ON public.partner_stock_movements;
CREATE POLICY allow_authorized_partner_stock_movements ON public.partner_stock_movements
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.partner_products p
      WHERE p.id = partner_stock_movements.product_id
        AND p.user_id = partner_stock_movements.user_id
        AND public.partner_employee_can_access_branch(
          partner_stock_movements.user_id,
          COALESCE(partner_stock_movements.branch_id, p.branch_id)
        )
    )
  );
DROP POLICY IF EXISTS deny_direct_partner_stock_movement_insert ON public.partner_stock_movements;
CREATE POLICY deny_direct_partner_stock_movement_insert ON public.partner_stock_movements
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (false);
DROP POLICY IF EXISTS deny_direct_partner_stock_movement_update ON public.partner_stock_movements;
CREATE POLICY deny_direct_partner_stock_movement_update ON public.partner_stock_movements
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);
DROP POLICY IF EXISTS deny_direct_partner_stock_movement_delete ON public.partner_stock_movements;
CREATE POLICY deny_direct_partner_stock_movement_delete ON public.partner_stock_movements
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (false);

COMMIT;
