ALTER TABLE public.partner_salespeople ADD COLUMN blocked_modules text[] NOT NULL DEFAULT '{}';
CREATE FUNCTION public.update_partner_salesperson_access(
 p_salesperson_id uuid,p_name text,p_role text,p_commission_rate numeric,p_phone text,p_email text,
 p_is_active boolean,p_branch_id uuid,p_operator_id uuid,p_operator_pin text,p_new_pin text,p_blocked_modules text[]
) RETURNS public.partner_salespeople LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.partner_salespeople;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.partner_profiles WHERE id=auth.uid())
 OR NOT EXISTS(SELECT 1 FROM public.partner_salespeople WHERE id=p_salesperson_id AND user_id=auth.uid())
 THEN RAISE EXCEPTION 'Somente o proprietário pode alterar os acessos da equipe.'; END IF;
 IF p_blocked_modules IS NULL OR array_position(p_blocked_modules,NULL) IS NOT NULL OR NOT p_blocked_modules <@ ARRAY['cadastros','pdv','caixa','pedidos','os','historico','suporte','fiscal','administrativo','entregas','financeiro','rma','relatorios','white-label','configuracoes']::text[]
 THEN RAISE EXCEPTION 'Lista de módulos inválida.'; END IF;
 PERFORM public.execute_partner_salesperson_mutation(p_salesperson_id,p_name,p_role,p_commission_rate,p_phone,p_email,p_is_active,p_branch_id,p_operator_id,p_operator_pin,p_new_pin);
 UPDATE public.partner_salespeople SET blocked_modules=p_blocked_modules WHERE id=p_salesperson_id AND user_id=auth.uid() RETURNING * INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.update_partner_salesperson_access(uuid,text,text,numeric,text,text,boolean,uuid,uuid,text,text,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_partner_salesperson_access(uuid,text,text,numeric,text,text,boolean,uuid,uuid,text,text,text[]) TO authenticated;
CREATE FUNCTION public.guard_partner_collaborator_modules() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.blocked_modules IS DISTINCT FROM OLD.blocked_modules AND auth.uid() IS DISTINCT FROM OLD.user_id
 THEN RAISE EXCEPTION 'Somente o proprietário pode alterar os acessos da equipe.'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_partner_collaborator_modules() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER collaborator_access_owner BEFORE UPDATE ON public.partner_salespeople FOR EACH ROW EXECUTE FUNCTION public.guard_partner_collaborator_modules();
CREATE FUNCTION partner_subscription_private.require_collaborator_module(p_feature text) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE feature text:=CASE WHEN p_feature='estoque' THEN 'cadastros' ELSE p_feature END;
BEGIN
 IF EXISTS(SELECT 1 FROM public.partner_salespeople WHERE auth_user_id=auth.uid() AND active=true AND feature=ANY(blocked_modules))
 THEN RAISE EXCEPTION 'Acesso a este módulo bloqueado pelo administrador.'; END IF;
END; $$;
REVOKE ALL ON FUNCTION partner_subscription_private.require_collaborator_module(text) FROM PUBLIC,anon,authenticated;
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('partner_subscription_private.require_actor(text)'::regprocedure) INTO definition;
 EXECUTE regexp_replace(definition,'\mBEGIN\M','BEGIN PERFORM partner_subscription_private.require_collaborator_module(p_feature);','i');
END; $$;
CREATE FUNCTION partner_subscription_private.guard_collaborator_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM partner_subscription_private.require_collaborator_module(TG_ARGV[0]);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION partner_subscription_private.guard_collaborator_write() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT c.relname,tg.tgargs FROM pg_trigger tg JOIN pg_class c ON c.oid=tg.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND tg.tgname='saas_operational_access' LOOP
 EXECUTE format('CREATE TRIGGER collaborator_module_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION partner_subscription_private.guard_collaborator_write(%L)',t.relname,split_part(encode(t.tgargs,'escape'),'\000',1));
 END LOOP;
END; $$;
