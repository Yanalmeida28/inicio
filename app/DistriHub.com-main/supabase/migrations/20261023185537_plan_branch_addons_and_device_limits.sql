BEGIN;

ALTER TABLE public.saas_plans ADD COLUMN device_limit integer NOT NULL DEFAULT 3 CHECK(device_limit > 0);
ALTER TABLE public.saas_plans ADD COLUMN extra_branch_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK(extra_branch_amount >= 0);
UPDATE public.saas_plans SET monthly_amount=129.90,device_limit=5 WHERE id='profissional';
UPDATE public.saas_plans SET monthly_amount=249.90,branch_limit=5,device_limit=8,extra_branch_amount=39.90,
 features=array_remove(array_remove(features,'instagram'),'api') WHERE id='enterprise';
ALTER TABLE public.saas_subscriptions ADD COLUMN extra_branches integer NOT NULL DEFAULT 0 CHECK(extra_branches BETWEEN 0 AND 1000);
ALTER TABLE public.saas_subscriptions ADD COLUMN courtesy_branches integer NOT NULL DEFAULT 0 CHECK(courtesy_branches BETWEEN 0 AND 1000);
ALTER TABLE public.saas_checkout_attempts ADD COLUMN extra_branches integer NOT NULL DEFAULT 0 CHECK(extra_branches BETWEEN 0 AND 1000);

CREATE TABLE public.saas_branch_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.partner_profiles(id) ON DELETE CASCADE,
 extra_branches integer NOT NULL CHECK(extra_branches BETWEEN 0 AND 1000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reason text, resolved_by uuid, created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE UNIQUE INDEX saas_branch_request_pending ON public.saas_branch_requests(company_id) WHERE status='pending';
CREATE INDEX saas_branch_requests_company_date ON public.saas_branch_requests(company_id,created_at DESC);
ALTER TABLE public.saas_branch_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saas_branch_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.saas_branch_requests TO service_role;

-- Keep the original access/status rules; enrich them with server-calculated capacity and prices.
ALTER FUNCTION partner_subscription_private.state(uuid) RENAME TO state_before_branch_addons;
CREATE FUNCTION partner_subscription_private.state(p_company uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; s public.saas_subscriptions; p public.saas_plans; funded integer; quoted numeric; authorized numeric;
BEGIN
 result:=partner_subscription_private.state_before_branch_addons(p_company);
 SELECT * INTO s FROM public.saas_subscriptions WHERE company_id=p_company;
 IF NOT FOUND THEN RETURN result; END IF;
 SELECT * INTO p FROM public.saas_plans WHERE id=result->>'effective_plan';
 SELECT COALESCE(max(a.extra_branches),0) INTO funded FROM public.saas_invoices i
 JOIN public.saas_checkout_attempts a ON a.provider_subscription_id=i.provider_subscription_id
 WHERE i.subscription_id=s.id AND i.status='paid' AND i.period_start<=now() AND i.period_end>now() AND a.plan_id='enterprise';
 funded:=CASE WHEN s.plan_id='enterprise' THEN LEAST(funded,s.extra_branches) ELSE 0 END;
 SELECT monthly_amount + CASE WHEN id='enterprise' THEN s.extra_branches*extra_branch_amount ELSE 0 END INTO quoted
 FROM public.saas_plans WHERE id=s.plan_id;
 SELECT amount INTO authorized FROM public.saas_checkout_attempts WHERE provider_subscription_id=s.provider_subscription_id;
 RETURN result||jsonb_build_object(
  'base_monthly_amount',(SELECT monthly_amount FROM public.saas_plans WHERE id=s.plan_id),
  'quoted_monthly_amount',CASE WHEN s.billing_mode='exempt' THEN 0 ELSE quoted END,
  'monthly_amount',CASE WHEN s.billing_mode='exempt' THEN 0 ELSE COALESCE(authorized,quoted) END,
  'authorized_monthly_amount',authorized,'extra_branch_amount',p.extra_branch_amount,
  'funded_extra_branches',funded,'included_branches',p.branch_limit,'device_limit',p.device_limit,
  'branch_count',(SELECT count(*) FROM public.partner_branches WHERE user_id=p_company),
  'branch_limit',CASE WHEN s.full_access THEN NULL ELSE p.branch_limit+s.courtesy_branches+
   CASE WHEN s.billing_mode='exempt' THEN s.extra_branches ELSE funded END END);
END;
$$;
REVOKE ALL ON FUNCTION partner_subscription_private.state(uuid) FROM PUBLIC,anon,authenticated;

ALTER FUNCTION public.get_partner_subscription(uuid) RENAME TO get_partner_subscription_before_addons;
REVOKE ALL ON FUNCTION public.get_partner_subscription_before_addons(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.get_partner_subscription(p_company_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 result:=public.get_partner_subscription_before_addons(p_company_id);
 IF result->>'company_id'=auth.uid()::text THEN
  result:=result||jsonb_build_object('branch_requests',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY created_at DESC),'[]'::jsonb)
   FROM (SELECT * FROM public.saas_branch_requests WHERE company_id=auth.uid() ORDER BY created_at DESC LIMIT 20) r));
 END IF;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_partner_subscription(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_partner_subscription(uuid) TO authenticated;

ALTER FUNCTION public.get_saas_admin_overview() RENAME TO get_saas_admin_overview_before_addons;
REVOKE ALL ON FUNCTION public.get_saas_admin_overview_before_addons() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.get_saas_admin_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 result:=public.get_saas_admin_overview_before_addons();
 RETURN result||jsonb_build_object('branch_requests',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY created_at DESC),'[]'::jsonb)
  FROM (SELECT * FROM public.saas_branch_requests WHERE status='pending') r));
END;
$$;
REVOKE ALL ON FUNCTION public.get_saas_admin_overview() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_saas_admin_overview() TO authenticated;

CREATE FUNCTION public.request_saas_extra_branches(p_extra_branches integer) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.saas_subscriptions; result uuid;
BEGIN
 SELECT * INTO s FROM public.saas_subscriptions WHERE company_id=auth.uid() FOR UPDATE;
 IF auth.uid() IS NULL OR NOT FOUND OR s.plan_id<>'enterprise' THEN RAISE EXCEPTION 'Somente o titular Enterprise pode solicitar filiais adicionais.'; END IF;
 IF p_extra_branches IS NULL OR p_extra_branches NOT BETWEEN 0 AND 1000 OR p_extra_branches=s.extra_branches THEN
  RAISE EXCEPTION 'Informe uma quantidade diferente da atual, entre 0 e 1000.';
 END IF;
 INSERT INTO public.saas_branch_requests(company_id,extra_branches) VALUES(auth.uid(),p_extra_branches)
 ON CONFLICT(company_id) WHERE status='pending' DO UPDATE SET extra_branches=EXCLUDED.extra_branches,created_at=now()
 RETURNING id INTO result;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.request_saas_extra_branches(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_saas_extra_branches(integer) TO authenticated;

CREATE FUNCTION public.admin_reject_saas_branch_request(p_request_id uuid,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE company uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Apenas o Super Admin pode decidir solicitações.'; END IF;
 IF length(trim(COALESCE(p_reason,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Informe o motivo (5 a 500 caracteres).'; END IF;
 UPDATE public.saas_branch_requests SET status='rejected',reason=trim(p_reason),resolved_by=auth.uid(),resolved_at=now()
 WHERE id=p_request_id AND status='pending' RETURNING company_id INTO company;
 IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação pendente não encontrada.'; END IF;
 INSERT INTO public.saas_billing_events(company_id,actor_id,action,details)
 VALUES(company,auth.uid(),'branch_request_rejected',jsonb_build_object('request_id',p_request_id,'reason',trim(p_reason)));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reject_saas_branch_request(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_saas_branch_request(uuid,text) TO authenticated;

-- A new recurring authorization is required whenever paid capacity changes.
-- The old checkout is cancelled by the existing provider job pipeline.
CREATE OR REPLACE FUNCTION partner_subscription_private.guard_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE limit_count integer;
BEGIN
 IF NEW.extra_branches>0 AND NEW.plan_id<>'enterprise' THEN RAISE EXCEPTION 'Filiais adicionais pagas exigem Enterprise.'; END IF;
 IF ROW(NEW.plan_id,NEW.billing_mode,NEW.full_access,NEW.extra_branches,NEW.courtesy_branches)
  IS DISTINCT FROM ROW(OLD.plan_id,OLD.billing_mode,OLD.full_access,OLD.extra_branches,OLD.courtesy_branches) THEN
  SELECT branch_limit INTO limit_count FROM public.saas_plans WHERE id=CASE WHEN NEW.full_access THEN 'enterprise' ELSE NEW.plan_id END;
  IF NOT NEW.full_access AND (SELECT count(*) FROM public.partner_branches WHERE user_id=NEW.company_id)>
    limit_count+NEW.extra_branches+NEW.courtesy_branches THEN RAISE EXCEPTION 'A empresa possui mais filiais que a nova configuração permite.'; END IF;
 END IF;
 IF ROW(NEW.plan_id,NEW.billing_mode,NEW.full_access,NEW.extra_branches)
  IS DISTINCT FROM ROW(OLD.plan_id,OLD.billing_mode,OLD.full_access,OLD.extra_branches)
  OR (NEW.status IS DISTINCT FROM OLD.status AND (NEW.status IN ('suspended','cancelled') OR OLD.status IN ('suspended','cancelled')))
  OR (OLD.auto_renew AND NOT NEW.auto_renew) THEN
  NEW.revision:=OLD.revision+1;
  IF OLD.provider_subscription_id IS NOT NULL THEN
   PERFORM partner_subscription_private.queue_cancel(NEW.company_id,OLD.provider_subscription_id);
   NEW.provider_cancel_pending:=true; NEW.provider_subscription_id:=NULL; NEW.provider_status:=NULL;
  END IF;
  NEW.auto_renew:=false;
  UPDATE public.saas_checkout_attempts SET state='cancelled',updated_at=now()
   WHERE company_id=NEW.company_id AND state IN ('creating','ready','uncertain');
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END;
$$;

CREATE FUNCTION public.admin_save_saas_configuration(p_company_id uuid,p_plan_id text,p_billing_mode text,
 p_full_access boolean,p_status text,p_admin_access_until timestamptz,p_extra_branches integer,p_courtesy_branches integer,p_reason text,
 p_request_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Apenas o Super Admin pode alterar assinaturas.'; END IF;
 IF length(trim(COALESCE(p_reason,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Informe o motivo (5 a 500 caracteres).'; END IF;
 IF p_plan_id IS NULL OR p_billing_mode IS NULL OR p_full_access IS NULL OR p_status IS NULL
  OR p_extra_branches IS NULL OR p_courtesy_branches IS NULL THEN RAISE EXCEPTION 'Configuração incompleta.'; END IF;
 SELECT to_jsonb(s) INTO previous FROM public.saas_subscriptions s WHERE company_id=p_company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assinatura não encontrada.'; END IF;
 IF p_request_id IS NOT NULL THEN
  PERFORM 1 FROM public.saas_branch_requests WHERE id=p_request_id AND company_id=p_company_id
   AND status='pending' AND extra_branches=p_extra_branches FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A solicitação mudou. Atualize antes de aprovar.'; END IF;
 END IF;
 UPDATE public.saas_subscriptions SET plan_id=p_plan_id,billing_mode=p_billing_mode,full_access=p_full_access,
  status=p_status,admin_access_until=p_admin_access_until,extra_branches=p_extra_branches,courtesy_branches=p_courtesy_branches
 WHERE company_id=p_company_id;
 IF p_request_id IS NOT NULL THEN
  UPDATE public.saas_branch_requests SET status='approved',reason=trim(p_reason),resolved_by=auth.uid(),resolved_at=now() WHERE id=p_request_id;
 END IF;
 INSERT INTO public.saas_billing_events(company_id,actor_id,action,details) VALUES(p_company_id,auth.uid(),'admin_capacity_update',
  jsonb_build_object('before',previous,'after',partner_subscription_private.state(p_company_id),'reason',trim(p_reason),'request_id',p_request_id));
 RETURN partner_subscription_private.state(p_company_id);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_save_saas_configuration(uuid,text,text,boolean,text,timestamptz,integer,integer,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_save_saas_configuration(uuid,text,text,boolean,text,timestamptz,integer,integer,text,uuid) TO authenticated;

ALTER FUNCTION public.begin_saas_checkout(uuid) RENAME TO begin_saas_checkout_before_addons;
REVOKE ALL ON FUNCTION public.begin_saas_checkout_before_addons(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.begin_saas_checkout(p_company_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; s public.saas_subscriptions;
BEGIN
 result:=public.begin_saas_checkout_before_addons(p_company_id);
 SELECT * INTO s FROM public.saas_subscriptions WHERE company_id=p_company_id;
 IF (result->>'should_create')::boolean THEN
  UPDATE public.saas_checkout_attempts SET extra_branches=s.extra_branches,
   amount=(SELECT monthly_amount+s.extra_branches*extra_branch_amount FROM public.saas_plans WHERE id=s.plan_id)
   WHERE id=(result->>'id')::uuid RETURNING to_jsonb(saas_checkout_attempts) INTO result;
  result:=result||jsonb_build_object('should_create',true);
 END IF;
 RETURN result||jsonb_build_object('trial_ends_at',GREATEST(s.trial_ends_at,s.paid_until));
END;
$$;
REVOKE ALL ON FUNCTION public.begin_saas_checkout(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.begin_saas_checkout(uuid) TO authenticated;

-- Preserve already registered branches when replacing the former unlimited plan.
UPDATE public.saas_subscriptions s SET courtesy_branches=GREATEST(0,
 (SELECT count(*)::integer FROM public.partner_branches WHERE user_id=s.company_id)-5)
WHERE s.plan_id='enterprise' AND NOT s.full_access;

CREATE TABLE partner_subscription_private.device_sessions (
 session_id uuid PRIMARY KEY REFERENCES auth.sessions(id) ON DELETE CASCADE,
 company_id uuid NOT NULL REFERENCES public.partner_profiles(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 device_id uuid NOT NULL REFERENCES public.partner_devices(id) ON DELETE CASCADE,
 branch_id uuid REFERENCES public.partner_branches(id) ON DELETE CASCADE,
 last_seen timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
);
CREATE INDEX saas_device_capacity ON partner_subscription_private.device_sessions(company_id,branch_id,last_seen) WHERE revoked_at IS NULL;
CREATE INDEX saas_device_actor ON partner_subscription_private.device_sessions(actor_id);
CREATE INDEX saas_device_registry ON partner_subscription_private.device_sessions(device_id);
ALTER TABLE partner_subscription_private.device_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON partner_subscription_private.device_sessions FROM PUBLIC,anon,authenticated;

CREATE FUNCTION partner_subscription_private.guard_device_plan_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE limit_count integer;
BEGIN
 IF NEW.plan_id IS DISTINCT FROM OLD.plan_id OR NEW.full_access IS DISTINCT FROM OLD.full_access THEN
  SELECT device_limit INTO limit_count FROM public.saas_plans WHERE id=CASE WHEN NEW.full_access THEN 'enterprise' ELSE NEW.plan_id END;
  IF EXISTS(SELECT 1 FROM partner_subscription_private.device_sessions d JOIN auth.sessions a ON a.id=d.session_id
   WHERE d.company_id=NEW.company_id AND d.revoked_at IS NULL AND d.last_seen>now()-interval '3 minutes'
   GROUP BY d.branch_id HAVING count(*)>limit_count) THEN
   RAISE EXCEPTION 'Encerre sessões excedentes antes de mudar para um plano com limite de % dispositivos por filial.',limit_count;
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION partner_subscription_private.guard_device_plan_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER saas_device_plan_change BEFORE UPDATE ON public.saas_subscriptions
 FOR EACH ROW EXECUTE FUNCTION partner_subscription_private.guard_device_plan_change();

CREATE FUNCTION partner_subscription_private.device_allowed(p_company uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM partner_subscription_private.device_sessions d JOIN auth.sessions a ON a.id=d.session_id
 LEFT JOIN public.partner_branches b ON b.id=d.branch_id
 WHERE d.company_id=p_company AND d.actor_id=auth.uid() AND a.user_id=auth.uid()
 AND d.session_id=NULLIF(auth.jwt()->>'session_id','')::uuid AND d.revoked_at IS NULL
 AND d.last_seen>now()-interval '3 minutes'
 AND (d.branch_id IS NULL OR b.is_active)
 AND (auth.uid()=p_company OR EXISTS(SELECT 1 FROM public.partner_salespeople sp
  WHERE sp.user_id=p_company AND sp.auth_user_id=auth.uid() AND sp.active=true AND sp.branch_id IS NOT DISTINCT FROM d.branch_id)))
$$;
REVOKE ALL ON FUNCTION partner_subscription_private.device_allowed(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.touch_partner_device(p_device_key uuid,p_name text,p_branch_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE company uuid; branch uuid; result uuid; sid uuid:=NULLIF(auth.jwt()->>'session_id','')::uuid;
 limit_count integer; current_session partner_subscription_private.device_sessions;
BEGIN
 IF auth.uid() IS NULL OR sid IS NULL OR p_device_key IS NULL OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=sid AND user_id=auth.uid())
 THEN RAISE EXCEPTION 'Sessão inválida. Entre novamente.'; END IF;
 SELECT id INTO company FROM public.partner_profiles WHERE id=auth.uid();
 IF company IS NULL THEN
  SELECT user_id,branch_id INTO company,branch FROM public.partner_salespeople WHERE auth_user_id=auth.uid() AND active=true LIMIT 1;
  IF company IS NULL OR (p_branch_id IS NOT NULL AND branch IS DISTINCT FROM p_branch_id) THEN RAISE EXCEPTION 'Filial não autorizada.'; END IF;
 ELSE branch:=COALESCE(p_branch_id,(SELECT id FROM public.partner_branches WHERE user_id=company AND is_active ORDER BY id LIMIT 1)); END IF;
 IF branch IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partner_branches WHERE id=branch AND user_id=company AND is_active) THEN RAISE EXCEPTION 'Filial inválida ou inativa.'; END IF;
 IF length(trim(COALESCE(p_name,''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Nome do terminal inválido.'; END IF;
 -- Serialize admission and transfers for the entire company, including an empty branch.
 PERFORM 1 FROM public.saas_subscriptions WHERE company_id=company FOR UPDATE;
 SELECT * INTO current_session FROM partner_subscription_private.device_sessions WHERE session_id=sid;
 IF current_session.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Esta sessão foi encerrada pelo administrador. Saia e entre novamente.'; END IF;
 limit_count:=(partner_subscription_private.state(company)->>'device_limit')::integer;
 IF limit_count IS NULL THEN RAISE EXCEPTION 'Assinatura não encontrada.'; END IF;
 IF current_session.session_id IS NULL OR current_session.branch_id IS DISTINCT FROM branch
  OR current_session.last_seen<=now()-interval '3 minutes' THEN
  IF (SELECT count(*) FROM partner_subscription_private.device_sessions d JOIN auth.sessions a ON a.id=d.session_id
   WHERE d.company_id=company AND d.branch_id IS NOT DISTINCT FROM branch AND d.revoked_at IS NULL
   AND d.last_seen>now()-interval '3 minutes' AND d.session_id<>sid)>=limit_count THEN
   RAISE EXCEPTION 'Limite de % dispositivos simultâneos nesta filial atingido. Encerre uma sessão antiga para continuar.',limit_count;
  END IF;
 END IF;
 INSERT INTO public.partner_devices(user_id,device_key,branch_id,name) VALUES(company,p_device_key,branch,trim(p_name))
 ON CONFLICT(user_id,device_key) DO UPDATE SET branch_id=EXCLUDED.branch_id,name=EXCLUDED.name,last_seen=now() RETURNING id INTO result;
 INSERT INTO partner_subscription_private.device_sessions(session_id,company_id,actor_id,device_id,branch_id)
 VALUES(sid,company,auth.uid(),result,branch)
 ON CONFLICT(session_id) DO UPDATE SET device_id=EXCLUDED.device_id,branch_id=EXCLUDED.branch_id,last_seen=now();
 RETURN result;
END;
$$;

CREATE FUNCTION public.list_saas_device_sessions(p_company_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR (auth.uid()<>p_company_id AND NOT public.is_super_admin() AND NOT EXISTS(
  SELECT 1 FROM public.partner_salespeople WHERE user_id=p_company_id AND auth_user_id=auth.uid() AND active=true))
 THEN RAISE EXCEPTION 'Empresa não autorizada.'; END IF;
 RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',d.session_id,'name',r.name,'branch_id',d.branch_id,'branch_name',b.name,
  'last_seen',d.last_seen,'is_current',d.session_id=NULLIF(auth.jwt()->>'session_id','')::uuid,
  'can_revoke',auth.uid()=p_company_id OR public.is_super_admin() OR d.actor_id=auth.uid()) ORDER BY d.last_seen DESC),'[]'::jsonb)
 FROM partner_subscription_private.device_sessions d JOIN public.partner_devices r ON r.id=d.device_id JOIN auth.sessions a ON a.id=d.session_id
 LEFT JOIN public.partner_branches b ON b.id=d.branch_id
 WHERE d.company_id=p_company_id AND d.revoked_at IS NULL AND d.last_seen>now()-interval '3 minutes'
 AND (auth.uid()=p_company_id OR public.is_super_admin() OR EXISTS(SELECT 1 FROM public.partner_salespeople sp
  WHERE sp.user_id=p_company_id AND sp.auth_user_id=auth.uid() AND sp.active=true AND sp.branch_id=d.branch_id)));
END;
$$;
REVOKE ALL ON FUNCTION public.list_saas_device_sessions(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_saas_device_sessions(uuid) TO authenticated;

CREATE FUNCTION public.list_saas_access_branches(p_company_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR (auth.uid()<>p_company_id AND NOT EXISTS(
  SELECT 1 FROM public.partner_salespeople WHERE user_id=p_company_id AND auth_user_id=auth.uid() AND active=true))
 THEN RAISE EXCEPTION 'Empresa não autorizada.'; END IF;
 RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) ORDER BY b.name),'[]'::jsonb)
 FROM public.partner_branches b WHERE b.user_id=p_company_id AND b.is_active AND (auth.uid()=p_company_id OR EXISTS(
  SELECT 1 FROM public.partner_salespeople sp WHERE sp.user_id=p_company_id AND sp.auth_user_id=auth.uid() AND sp.active=true AND sp.branch_id=b.id)));
END;
$$;
REVOKE ALL ON FUNCTION public.list_saas_access_branches(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_saas_access_branches(uuid) TO authenticated;

CREATE FUNCTION public.revoke_saas_device_session(p_session_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d partner_subscription_private.device_sessions;
BEGIN
 SELECT * INTO d FROM partner_subscription_private.device_sessions WHERE session_id=p_session_id;
 IF auth.uid() IS NULL OR NOT FOUND OR (auth.uid()<>d.company_id AND auth.uid()<>d.actor_id AND NOT public.is_super_admin())
 THEN RAISE EXCEPTION 'Sessão não autorizada.'; END IF;
 PERFORM 1 FROM public.saas_subscriptions WHERE company_id=d.company_id FOR UPDATE;
 UPDATE partner_subscription_private.device_sessions SET revoked_at=now() WHERE session_id=p_session_id;
 INSERT INTO public.saas_billing_events(company_id,actor_id,action,details)
 VALUES(d.company_id,auth.uid(),'device_session_revoked',jsonb_build_object('session_id',p_session_id));
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_saas_device_session(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revoke_saas_device_session(uuid) TO authenticated;

-- Enforce on both table access and existing privileged RPCs; billing and support stay reachable.
CREATE OR REPLACE FUNCTION public.partner_has_saas_access(p_company uuid,p_feature text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 IF public.is_super_admin() THEN RETURN true; END IF;
 IF auth.uid()<>p_company AND NOT EXISTS(SELECT 1 FROM public.partner_salespeople
  WHERE user_id=p_company AND auth_user_id=auth.uid() AND active=true) THEN RETURN false; END IF;
 s:=partner_subscription_private.state(p_company);
 RETURN COALESCE((s->>'can_access')::boolean,false) AND s->'features' ? p_feature
 AND (p_feature IN ('configuracoes','suporte') OR partner_subscription_private.device_allowed(p_company));
END;
$$;
REVOKE ALL ON FUNCTION public.partner_has_saas_access(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.partner_has_saas_access(uuid,text) TO authenticated;

ALTER FUNCTION partner_subscription_private.require_access(uuid,text) RENAME TO require_access_before_devices;
CREATE FUNCTION partner_subscription_private.require_access(p_company uuid,p_feature text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM partner_subscription_private.require_access_before_devices(p_company,p_feature);
 IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() AND p_feature NOT IN ('configuracoes','suporte')
  AND NOT partner_subscription_private.device_allowed(p_company) THEN
  RAISE EXCEPTION 'Terminal sem sessão ativa. Verifique o limite de dispositivos e tente novamente.';
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION partner_subscription_private.require_access(uuid,text) FROM PUBLIC,anon,authenticated;

COMMIT;
