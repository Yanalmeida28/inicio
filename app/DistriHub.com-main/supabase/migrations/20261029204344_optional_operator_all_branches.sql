ALTER TABLE public.partner_salespeople ADD COLUMN can_access_all_branches boolean NOT NULL DEFAULT false;
GRANT SELECT(can_access_all_branches) ON public.partner_salespeople TO authenticated;
CREATE SCHEMA partner_access_private;
REVOKE ALL ON SCHEMA partner_access_private FROM PUBLIC,anon,authenticated;
CREATE FUNCTION partner_access_private.has_branch(p_operator uuid,p_company uuid,p_branch uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.partner_salespeople s JOIN public.partner_branches b ON b.user_id=s.user_id
 WHERE s.id=p_operator AND s.user_id=p_company AND b.id=p_branch
 AND (s.branch_id=b.id OR (s.can_access_all_branches AND s.role IN ('administrador','gerente'))));
$$;
REVOKE ALL ON FUNCTION partner_access_private.has_branch(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION partner_access_private.guard_permission() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.role IS NULL OR NEW.role NOT IN ('administrador','gerente') THEN NEW.can_access_all_branches:=false; END IF;
 IF (TG_OP='INSERT' AND NEW.can_access_all_branches) OR
    (TG_OP='UPDATE' AND NEW.can_access_all_branches IS DISTINCT FROM OLD.can_access_all_branches) THEN
  IF auth.uid() IS DISTINCT FROM NEW.user_id THEN RAISE EXCEPTION 'Somente o proprietário pode autorizar acesso a todas as filiais.'; END IF;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION partner_access_private.guard_permission() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER operator_branch_permission BEFORE INSERT OR UPDATE ON public.partner_salespeople
 FOR EACH ROW EXECUTE FUNCTION partner_access_private.guard_permission();

CREATE OR REPLACE FUNCTION public.resolve_partner_operator(p_salesperson_id uuid,p_pin text,p_requested_branch_id uuid)
RETURNS TABLE(company_id uuid,salesperson_id uuid,role text,branch_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); staff public.partner_salespeople%ROWTYPE; requested uuid; matches integer;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
 IF p_salesperson_id IS NULL THEN
  SELECT count(*) INTO matches FROM public.partner_salespeople WHERE auth_user_id=actor;
  IF matches>1 THEN RAISE EXCEPTION 'Identidade de funcionario ambigua'; END IF;
  SELECT * INTO staff FROM public.partner_salespeople WHERE auth_user_id=actor;
  IF NOT FOUND THEN
   IF NOT EXISTS(SELECT 1 FROM public.partner_profiles WHERE id=actor) THEN RAISE EXCEPTION 'Operador invalido'; END IF;
   IF p_requested_branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partner_branches WHERE id=p_requested_branch_id AND user_id=actor)
    THEN RAISE EXCEPTION 'Acesso negado a filial'; END IF;
   RETURN QUERY SELECT actor,NULL::uuid,'administrador'::text,p_requested_branch_id; RETURN;
  END IF;
 ELSE
  SELECT * INTO staff FROM public.partner_salespeople s WHERE s.id=p_salesperson_id
   AND (s.auth_user_id=actor OR (s.user_id=actor AND EXISTS(SELECT 1 FROM public.partner_profiles WHERE id=actor)))
   AND public.verify_partner_salesperson_pin(p_pin,s.pin_hash);
  IF NOT FOUND THEN RAISE EXCEPTION 'Operador invalido ou PIN incorreto'; END IF;
 END IF;
 IF staff.active IS DISTINCT FROM true THEN RAISE EXCEPTION 'Funcionario inativo'; END IF;
 IF staff.role IS NULL OR staff.branch_id IS NULL THEN RAISE EXCEPTION 'Operador sem filial ou permissao'; END IF;
 requested:=COALESCE(p_requested_branch_id,staff.branch_id);
 IF NOT partner_access_private.has_branch(staff.id,staff.user_id,requested) OR NOT EXISTS(
  SELECT 1 FROM public.partner_branches WHERE id=requested AND user_id=staff.user_id AND is_active=true)
 THEN RAISE EXCEPTION 'Acesso negado a filial'; END IF;
 RETURN QUERY SELECT staff.user_id,staff.id,staff.role,requested;
END; $$;
CREATE OR REPLACE FUNCTION public.resolve_partner_pdv_operator(p_salesperson_id uuid,p_pin text,p_requested_branch_id uuid)
RETURNS TABLE(company_id uuid,salesperson_id uuid,role text,branch_id uuid)
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM public.resolve_partner_operator(p_salesperson_id,p_pin,p_requested_branch_id);
$$;
CREATE OR REPLACE FUNCTION public.partner_employee_can_access_branch(p_company_id uuid,p_branch_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p_branch_id IS NOT NULL AND count(*)=1 AND COALESCE(bool_and(s.user_id=p_company_id AND s.active=true
  AND partner_access_private.has_branch(s.id,p_company_id,p_branch_id)),false)
 FROM public.partner_salespeople s WHERE s.auth_user_id=auth.uid();
$$;

CREATE FUNCTION public.set_partner_salesperson_branch_access(p_salesperson_id uuid,p_allowed boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.partner_salespeople;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.partner_profiles WHERE id=auth.uid())
  OR EXISTS(SELECT 1 FROM public.partner_salespeople WHERE auth_user_id=auth.uid())
 THEN RAISE EXCEPTION 'Somente o proprietário pode alterar os acessos da equipe.'; END IF;
 SELECT * INTO target FROM public.partner_salespeople WHERE id=p_salesperson_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador não encontrado nesta empresa.'; END IF;
 IF p_allowed IS NULL OR (p_allowed AND (target.role IS NULL OR target.role NOT IN ('administrador','gerente')))
  THEN RAISE EXCEPTION 'Acesso a todas as filiais exige função administrador ou gerente.'; END IF;
 UPDATE public.partner_salespeople SET can_access_all_branches=p_allowed WHERE id=target.id;
 INSERT INTO public.partner_audit_logs(id,user_id,actor_name,actor_role,action,entity_type,entity_id,details)
 VALUES('audit-'||gen_random_uuid()::text,auth.uid(),'Proprietário','administrador','Acesso às filiais alterado','colaborador',target.id::text,
  CASE WHEN p_allowed THEN 'Todas as filiais autorizadas' ELSE 'Restrito à filial vinculada' END);
 RETURN p_allowed;
END; $$;

CREATE FUNCTION public.list_partner_operator_directory() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op record; result jsonb;
BEGIN
 SELECT * INTO op FROM public.resolve_partner_operator(NULL,NULL,NULL);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'active',s.active,
  'branch_id',s.branch_id,'branch_name',b.name,'can_access_all_branches',s.can_access_all_branches)
  ORDER BY lower(s.name),b.name,s.id),'[]'::jsonb) INTO result
 FROM public.partner_salespeople s LEFT JOIN public.partner_branches b ON b.id=s.branch_id AND b.user_id=s.user_id
 WHERE s.user_id=op.company_id AND (op.salesperson_id IS NULL OR s.id=op.salesperson_id);
 RETURN result;
END; $$;

CREATE FUNCTION public.read_partner_operator_branch_access(p_salesperson_id uuid,p_pin text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op record; allowed boolean; available jsonb;
BEGIN
 IF p_salesperson_id IS NULL THEN RAISE EXCEPTION 'Selecione um colaborador'; END IF;
 SELECT * INTO op FROM public.resolve_partner_operator(p_salesperson_id,p_pin,NULL);
 SELECT s.can_access_all_branches AND s.role IN ('administrador','gerente') INTO allowed FROM public.partner_salespeople s WHERE s.id=op.salesperson_id;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) ORDER BY b.name,b.id),'[]'::jsonb) INTO available
 FROM public.partner_branches b WHERE b.user_id=op.company_id AND b.is_active=true AND (allowed OR b.id=op.branch_id);
 RETURN jsonb_build_object('can_access_all_branches',allowed,'branches',available);
END; $$;

REVOKE ALL ON FUNCTION public.set_partner_salesperson_branch_access(uuid,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.list_partner_operator_directory() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.read_partner_operator_branch_access(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_partner_salesperson_branch_access(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_partner_operator_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_partner_operator_branch_access(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_salesperson_branch_integrity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE linked_branch uuid; company uuid; cross_branch boolean;
BEGIN
 IF NEW.salesperson_id IS NOT NULL THEN
  SELECT s.branch_id,s.user_id,s.can_access_all_branches AND s.role IN ('administrador','gerente')
   INTO linked_branch,company,cross_branch FROM public.partner_salespeople s WHERE s.id=NEW.salesperson_id;
  IF company IS NULL OR company<>NEW.user_id THEN RAISE EXCEPTION 'Vendedor inválido para a empresa'; END IF;
  IF linked_branch IS NOT NULL AND NEW.branch_id IS NOT NULL AND linked_branch<>NEW.branch_id AND NOT COALESCE(cross_branch,false)
   THEN RAISE EXCEPTION 'Funcionário não pode operar nesta filial'; END IF;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.resolve_partner_operator(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resolve_partner_operator(uuid,text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.resolve_partner_pdv_operator(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resolve_partner_pdv_operator(uuid,text,uuid) TO authenticated;
-- Retain existing pricing, balances, device limits and module permissions;
-- replace only branch eligibility checks in the deployed compatibility paths.
DO $migration$
DECLARE patch jsonb; target regprocedure; definition text;
BEGIN
 FOR patch IN SELECT value FROM jsonb_array_elements($branch_patch$[{"signature":"public.execute_partner_product_delete(uuid, text, uuid)","old":"IF v_operator.role <> 'administrador' AND (\n    v_operator.branch_id IS NULL OR v_operator.branch_id IS DISTINCT FROM v_product_branch\n  ) THEN","replacement":"IF v_operator.salesperson_id IS NOT NULL AND NOT partner_access_private.has_branch(v_operator.salesperson_id,v_operator.company_id,v_product_branch) THEN"},{"signature":"partner_cadastros_private.update_customer_profile(uuid, jsonb, uuid, text, uuid)","old":"sp.role,sp.branch_id\n  INTO operator","replacement":"sp.role,COALESCE(p_branch_id,existing.branch_id,sp.branch_id) AS branch_id\n  INTO operator"},{"signature":"partner_cadastros_private.update_customer_profile(uuid, jsonb, uuid, text, uuid)","old":"AND public.verify_partner_salesperson_pin(p_operator_pin,sp.pin_hash);","replacement":"AND public.verify_partner_salesperson_pin(p_operator_pin,sp.pin_hash)\n   AND partner_access_private.has_branch(sp.id,existing.user_id,COALESCE(p_branch_id,existing.branch_id,sp.branch_id));"},{"signature":"partner_cadastros_private.update_customer_profile(uuid, jsonb, uuid, text, uuid)","old":"(sp.branch_id IS NULL OR sp.branch_id IS NOT DISTINCT FROM desired.branch_id)","replacement":"(desired.branch_id IS NULL OR partner_access_private.has_branch(sp.id,existing.user_id,desired.branch_id))"},{"signature":"partner_subscription_private.device_allowed(uuid)","old":"sp.branch_id IS NOT DISTINCT FROM d.branch_id","replacement":"partner_access_private.has_branch(sp.id,p_company,d.branch_id)"},{"signature":"public.list_saas_device_sessions(uuid)","old":"sp.branch_id=d.branch_id","replacement":"partner_access_private.has_branch(sp.id,p_company_id,d.branch_id)"},{"signature":"public.list_saas_access_branches(uuid)","old":"sp.branch_id=b.id","replacement":"partner_access_private.has_branch(sp.id,p_company_id,b.id)"},{"signature":"public.execute_partner_customer_delete(uuid, text, uuid)","old":"IF v_role <> 'administrador'\n       AND (v_branch IS NULL OR v_branch IS DISTINCT FROM v_customer_branch) THEN","replacement":"IF (v_customer_branch IS NULL AND v_role <> 'administrador') OR (v_customer_branch IS NOT NULL AND NOT partner_access_private.has_branch(p_salesperson_id,v_company_id,v_customer_branch)) THEN"},{"signature":"public.execute_partner_product_mutation(uuid, text, uuid, uuid, text, numeric, numeric, numeric, integer, integer, text, text, boolean, text)","old":"IF v_role <> 'administrador' AND (v_branch IS NULL OR v_branch <> p_branch_id) THEN","replacement":"IF NOT partner_access_private.has_branch(p_salesperson_id,v_company_id,p_branch_id) THEN"},{"signature":"public.execute_partner_product_mutation(uuid, text, uuid, uuid, text, numeric, numeric, numeric, integer, integer, text, text, boolean, text, uuid)","old":"IF v_role <> 'administrador' AND (v_branch IS NULL OR v_branch <> p_branch_id) THEN","replacement":"IF NOT partner_access_private.has_branch(p_salesperson_id,v_company_id,p_branch_id) THEN"},{"signature":"public.touch_partner_device(uuid, text, uuid)","old":"SELECT user_id,branch_id INTO company,branch FROM public.partner_salespeople WHERE auth_user_id=auth.uid() AND active=true LIMIT 1;","replacement":"SELECT user_id,CASE WHEN can_access_all_branches AND role IN ('administrador','gerente') THEN COALESCE(p_branch_id,branch_id) ELSE branch_id END INTO company,branch FROM public.partner_salespeople WHERE auth_user_id=auth.uid() AND active=true LIMIT 1;"},{"signature":"partner_cadastros_private.can_manage(uuid, uuid)","old":"branch IS NULL OR sp.role='administrador' OR sp.branch_id=branch","replacement":"branch IS NULL OR partner_access_private.has_branch(sp.id,company,branch)"},{"signature":"public.mutate_partner_cash_register(text, uuid, uuid, text, uuid, numeric, text, text, uuid, text, uuid)","old":"sp.role='administrador' OR sp.branch_id=p_branch_id","replacement":"partner_access_private.has_branch(sp.id,sp.user_id,p_branch_id)"},{"signature":"public.record_partner_cash_refund(uuid, uuid, text, uuid, uuid, numeric, text, uuid, text, uuid, text)","old":"sp.role = 'administrador' OR sp.branch_id = p_branch_id","replacement":"partner_access_private.has_branch(sp.id,sp.user_id,p_branch_id)"},{"signature":"partner_rma_private.record_cash_refund(uuid, uuid, text, uuid, uuid, numeric, text, uuid, text, uuid, text)","old":"sp.role = 'administrador' OR sp.branch_id = p_branch_id","replacement":"partner_access_private.has_branch(sp.id,sp.user_id,p_branch_id)"}]$branch_patch$::jsonb) LOOP
  target:=to_regprocedure(patch->>'signature');
  IF target IS NULL THEN CONTINUE; END IF;
  definition:=pg_get_functiondef(target);
  IF strpos(definition,patch->>'old')=0 THEN RAISE EXCEPTION 'Branch authorization definition changed: %',patch->>'signature'; END IF;
  EXECUTE replace(definition,patch->>'old',patch->>'replacement');
 END LOOP;
END $migration$;

