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
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  SELECT * INTO v_operator
  FROM public.resolve_partner_operator(p_operator_id, p_operator_pin, NULL);

  IF v_operator.role <> 'administrador' THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem desativar colaboradores.';
  END IF;

  SELECT id, name INTO v_target
  FROM public.partner_salespeople
  WHERE id = p_salesperson_id AND user_id = v_operator.company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Colaborador nao encontrado nesta empresa.';
  END IF;

  IF v_target.id = v_operator.salesperson_id THEN
    RAISE EXCEPTION 'Nao e possivel desativar o proprio operador em uso.';
  END IF;

  UPDATE public.partner_salespeople
  SET active = false
  WHERE id = p_salesperson_id AND user_id = v_operator.company_id;

  INSERT INTO public.partner_audit_logs (
    id, user_id, actor_name, actor_role, action, entity_type, entity_id, details
  )
  VALUES (
    'audit-' || pg_catalog.gen_random_uuid()::text,
    v_operator.company_id,
    COALESCE(
      (SELECT name FROM public.partner_salespeople WHERE id = v_operator.salesperson_id),
      'Administrador'
    ),
    v_operator.role,
    'Acesso do colaborador desativado',
    'colaborador',
    p_salesperson_id::text,
    'Acesso do colaborador ' || v_target.name || ' desativado; historico preservado'
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_partner_salesperson_delete(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_partner_salesperson_delete(uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.execute_partner_salesperson_delete(uuid, text, uuid) TO authenticated;
