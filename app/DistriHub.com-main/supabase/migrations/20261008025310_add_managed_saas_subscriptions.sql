BEGIN;
CREATE SCHEMA IF NOT EXISTS partner_subscription_private;
REVOKE ALL ON SCHEMA partner_subscription_private FROM PUBLIC,anon,authenticated;

CREATE TABLE public.saas_plans (
 id text PRIMARY KEY CHECK(id IN ('basico','profissional','enterprise')),
 name text NOT NULL, monthly_amount numeric(10,2) NOT NULL CHECK(monthly_amount>0),
 branch_limit integer CHECK(branch_limit>0), features text[] NOT NULL
);
INSERT INTO public.saas_plans VALUES
 ('basico','Básico',49.90,1,ARRAY['cadastros','pdv','caixa','pedidos','historico','relatorios','configuracoes','suporte']),
 ('profissional','Profissional',99.90,3,ARRAY['cadastros','pdv','caixa','pedidos','historico','relatorios','configuracoes','suporte','estoque','crm','entregas','financeiro','rma','os','fiscal','administrativo','cupons','relatorios_avancados']),
 ('enterprise','Enterprise',199.90,NULL,ARRAY['cadastros','pdv','caixa','pedidos','historico','relatorios','configuracoes','suporte','estoque','crm','entregas','financeiro','rma','os','fiscal','administrativo','cupons','relatorios_avancados','white-label','instagram','api','suporte_prioritario']);
ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_plans_read ON public.saas_plans FOR SELECT TO authenticated USING(true);
REVOKE ALL ON public.saas_plans FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.saas_plans TO authenticated;

CREATE TABLE public.saas_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL UNIQUE REFERENCES public.partner_profiles(id) ON DELETE CASCADE,
 plan_id text NOT NULL DEFAULT 'basico' REFERENCES public.saas_plans(id),
 billing_mode text NOT NULL DEFAULT 'paid' CHECK(billing_mode IN ('paid','exempt')),
 full_access boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'trial' CHECK(status IN ('trial','active','suspended','cancelled')),
 trial_ends_at timestamptz NOT NULL DEFAULT (now()+interval '14 days'),
 paid_until timestamptz, admin_access_until timestamptz, grace_until timestamptz,
 auto_renew boolean NOT NULL DEFAULT false,
 provider_subscription_id text UNIQUE, provider_status text,
 provider_cancel_pending boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(NOT full_access OR billing_mode='exempt')
);
CREATE TABLE public.saas_invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 subscription_id uuid NOT NULL REFERENCES public.saas_subscriptions(id),
 company_id uuid NOT NULL REFERENCES public.partner_profiles(id),
 provider_payment_id text UNIQUE,
 provider_subscription_id text NOT NULL,
 period_start timestamptz NOT NULL, period_end timestamptz NOT NULL,
 amount numeric(10,2) NOT NULL CHECK(amount>0), currency text NOT NULL DEFAULT 'BRL' CHECK(currency='BRL'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','cancelled','cancellation_requested','refunded','charged_back')),
 paid_at timestamptz, cancellation_reason text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(period_end>period_start)
);
CREATE INDEX saas_invoices_company_date ON public.saas_invoices(company_id,created_at DESC);
CREATE TABLE public.saas_billing_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.partner_profiles(id),
 actor_id uuid, action text NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.saas_provider_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.partner_profiles(id),
 kind text NOT NULL CHECK(kind IN ('cancel_subscription','cancel_payment')),
 provider_id text NOT NULL, invoice_id uuid REFERENCES public.saas_invoices(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','done','failed')),
 attempts integer NOT NULL DEFAULT 0, last_error text, lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(kind,provider_id)
);
CREATE TABLE public.saas_checkout_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscription_id uuid NOT NULL REFERENCES public.saas_subscriptions(id),
 company_id uuid NOT NULL REFERENCES public.partner_profiles(id),
 subscription_revision bigint NOT NULL, plan_id text NOT NULL,
 amount numeric(10,2) NOT NULL, state text NOT NULL DEFAULT 'creating' CHECK(state IN ('creating','ready','uncertain','failed','cancelled')),
 provider_subscription_id text UNIQUE, checkout_url text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX saas_one_checkout_attempt ON public.saas_checkout_attempts(company_id)
 WHERE state IN ('creating','ready','uncertain');
DO $policies$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['saas_subscriptions','saas_invoices','saas_billing_events','saas_provider_jobs','saas_checkout_attempts']
 LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END;
$policies$;

CREATE FUNCTION partner_subscription_private.state(p_company uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE s public.saas_subscriptions%ROWTYPE; p public.saas_plans%ROWTYPE;
 effective_status text; allowed boolean; effective_plan text;
BEGIN
 SELECT * INTO s FROM public.saas_subscriptions WHERE company_id=p_company;
 IF NOT FOUND THEN RETURN jsonb_build_object('can_access',false,'status','unavailable','features','[]'::jsonb); END IF;
 effective_plan:=CASE WHEN s.full_access THEN 'enterprise' ELSE s.plan_id END;
 SELECT * INTO p FROM public.saas_plans WHERE id=effective_plan;
 effective_status:=CASE
  WHEN s.status='suspended' THEN 'suspended'
  WHEN s.status='cancelled' AND s.billing_mode='exempt' THEN 'cancelled'
  WHEN s.billing_mode='exempt' THEN 'active'
  WHEN GREATEST(s.paid_until,s.admin_access_until)>now() THEN 'active'
  WHEN s.trial_ends_at>now() THEN 'trial'
  WHEN s.status='cancelled' THEN 'cancelled'
  WHEN s.grace_until>now() THEN 'past_due'
  ELSE 'expired' END;
 allowed:=effective_status IN ('active','trial','past_due');
 RETURN to_jsonb(s)||jsonb_build_object('status',effective_status,'can_access',allowed,
  'effective_plan',effective_plan,'features',CASE WHEN allowed THEN to_jsonb(p.features) ELSE '[]'::jsonb END,
  'monthly_amount',CASE WHEN s.billing_mode='exempt' THEN 0 ELSE (SELECT monthly_amount FROM public.saas_plans WHERE id=s.plan_id) END,
  'branch_limit',p.branch_limit,
  'next_billing_at',CASE WHEN s.billing_mode='exempt' OR NOT s.auto_renew THEN NULL ELSE GREATEST(s.paid_until,s.trial_ends_at) END);
END;
$function$;
REVOKE ALL ON FUNCTION partner_subscription_private.state(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION partner_subscription_private.require_access(p_company uuid,p_feature text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE s jsonb;
BEGIN
 s:=partner_subscription_private.state(p_company);
 IF NOT COALESCE((s->>'can_access')::boolean,false) THEN RAISE EXCEPTION 'Assinatura sem acesso ativo. Regularize em Configurações ou fale com o administrador.'; END IF;
 IF NOT (s->'features' ? p_feature) THEN RAISE EXCEPTION 'Este recurso não está incluído no plano contratado.'; END IF;
END;
$function$;
REVOKE ALL ON FUNCTION partner_subscription_private.require_access(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION partner_subscription_private.sync_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE s jsonb;
BEGIN
 s:=partner_subscription_private.state(NEW.company_id);
 UPDATE public.partner_profiles SET subscription_plan=NEW.plan_id,
  subscription_status=CASE s->>'status' WHEN 'active' THEN 'ativa' WHEN 'trial' THEN 'trial' WHEN 'cancelled' THEN 'cancelada' ELSE 'suspensa' END,
  next_billing_date=(s->>'next_billing_at')::timestamptz::date
 WHERE id=NEW.company_id;
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION partner_subscription_private.sync_profile() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER saas_sync_profile AFTER INSERT OR UPDATE ON public.saas_subscriptions
 FOR EACH ROW EXECUTE FUNCTION partner_subscription_private.sync_profile();

CREATE FUNCTION partner_subscription_private.queue_cancel(p_company uuid,p_provider_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF p_provider_id IS NULL THEN RETURN; END IF;
 INSERT INTO public.saas_provider_jobs(company_id,kind,provider_id)
 VALUES(p_company,'cancel_subscription',p_provider_id) ON CONFLICT(kind,provider_id) DO NOTHING;
END;
$function$;
REVOKE ALL ON FUNCTION partner_subscription_private.queue_cancel(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION partner_subscription_private.guard_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE limit_count integer;
BEGIN
 IF NEW.plan_id IS DISTINCT FROM OLD.plan_id OR NEW.billing_mode IS DISTINCT FROM OLD.billing_mode
  OR NEW.full_access IS DISTINCT FROM OLD.full_access
  OR (NEW.status IS DISTINCT FROM OLD.status AND (NEW.status IN ('suspended','cancelled') OR OLD.status IN ('suspended','cancelled')))
  OR (OLD.auto_renew AND NOT NEW.auto_renew) THEN
  IF NOT NEW.full_access AND (NEW.plan_id IS DISTINCT FROM OLD.plan_id OR (OLD.full_access AND NOT NEW.full_access)) THEN
   SELECT branch_limit INTO limit_count FROM public.saas_plans WHERE id=NEW.plan_id;
   IF limit_count IS NOT NULL AND (SELECT count(*) FROM public.partner_branches WHERE user_id=NEW.company_id)>limit_count THEN
    RAISE EXCEPTION 'A empresa possui mais filiais que o plano escolhido permite.';
   END IF;
  END IF;
  NEW.revision:=OLD.revision+1;
  IF (NEW.billing_mode='exempt' OR NEW.status IN ('suspended','cancelled') OR NEW.plan_id<>OLD.plan_id OR NOT NEW.auto_renew)
   AND OLD.provider_subscription_id IS NOT NULL THEN
   PERFORM partner_subscription_private.queue_cancel(NEW.company_id,OLD.provider_subscription_id);
   NEW.provider_cancel_pending:=true;
   NEW.provider_subscription_id:=NULL;
   NEW.provider_status:=NULL;
  END IF;
  IF NEW.billing_mode='exempt' OR NEW.status IN ('suspended','cancelled') THEN NEW.auto_renew:=false; END IF;
  UPDATE public.saas_checkout_attempts SET state='cancelled',updated_at=now()
   WHERE company_id=NEW.company_id AND state IN ('creating','ready','uncertain');
 END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION partner_subscription_private.guard_update() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER saas_guard_update BEFORE UPDATE ON public.saas_subscriptions
 FOR EACH ROW EXECUTE FUNCTION partner_subscription_private.guard_update();

CREATE FUNCTION partner_subscription_private.create_for_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 INSERT INTO public.saas_subscriptions(company_id,plan_id) VALUES(NEW.id,'basico')
 ON CONFLICT(company_id) DO NOTHING;
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION partner_subscription_private.create_for_profile() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER saas_create_for_profile AFTER INSERT ON public.partner_profiles
 FOR EACH ROW EXECUTE FUNCTION partner_subscription_private.create_for_profile();
-- Preserve existing plans and access dates without claiming a legacy payment was received.
INSERT INTO public.saas_subscriptions(company_id,plan_id,status,trial_ends_at,admin_access_until,billing_mode,full_access)
 SELECT id,CASE WHEN subscription_plan IN ('basico','profissional','enterprise') THEN subscription_plan ELSE 'basico' END,
 CASE subscription_status WHEN 'suspensa' THEN 'suspended' WHEN 'cancelada' THEN 'cancelled' ELSE 'trial' END,
 CASE WHEN subscription_status='cancelada' THEN now() ELSE now()+interval '14 days' END,
 CASE WHEN subscription_status='ativa' THEN next_billing_date::timestamptz ELSE NULL END,
 -- The owner explicitly grandfathered these two existing companies with full, free access.
 CASE WHEN id IN ('00e50356-2994-4077-9092-faf0fb174686'::uuid,'da37aec0-baea-491d-b9d5-a74cc28109de'::uuid) THEN 'exempt' ELSE 'paid' END,
 id IN ('00e50356-2994-4077-9092-faf0fb174686'::uuid,'da37aec0-baea-491d-b9d5-a74cc28109de'::uuid)
 FROM public.partner_profiles ON CONFLICT(company_id) DO NOTHING;
INSERT INTO public.saas_billing_events(company_id,action,details)
 SELECT company_id,'legacy_full_access_exemption',jsonb_build_object('reason','Isenção com acesso completo autorizada pelo proprietário em 07/10/2026')
 FROM public.saas_subscriptions WHERE billing_mode='exempt' AND full_access;

CREATE FUNCTION public.get_partner_subscription(p_company_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE company uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
 company:=COALESCE(p_company_id,(SELECT user_id FROM public.partner_salespeople WHERE auth_user_id=auth.uid() AND active=true LIMIT 1),auth.uid());
 IF company<>auth.uid() AND NOT EXISTS(SELECT 1 FROM public.partner_salespeople WHERE user_id=company AND auth_user_id=auth.uid() AND active=true) THEN
  RAISE EXCEPTION 'Empresa não autorizada.';
 END IF;
 RETURN partner_subscription_private.state(company)||jsonb_build_object(
  'invoices',CASE WHEN company=auth.uid() THEN (SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY created_at DESC),'[]'::jsonb)
   FROM (SELECT * FROM public.saas_invoices WHERE company_id=company ORDER BY created_at DESC LIMIT 100) i) ELSE '[]'::jsonb END,
  'plans',(SELECT jsonb_agg(to_jsonb(p) ORDER BY monthly_amount) FROM public.saas_plans p));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_partner_subscription(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_partner_subscription(uuid) TO authenticated;

CREATE FUNCTION public.get_saas_admin_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Apenas o Super Admin pode gerenciar assinaturas.'; END IF;
 RETURN jsonb_build_object('subscriptions',(SELECT COALESCE(jsonb_agg(
  partner_subscription_private.state(s.company_id)||jsonb_build_object('company_name',p.business_name)
  ORDER BY p.business_name),'[]'::jsonb) FROM public.saas_subscriptions s JOIN public.partner_profiles p ON p.id=s.company_id),
 'invoices',(SELECT COALESCE(jsonb_agg(to_jsonb(i)||jsonb_build_object('company_name',p.business_name) ORDER BY i.created_at DESC),'[]'::jsonb)
  FROM public.saas_invoices i JOIN public.partner_profiles p ON p.id=i.company_id),
 'jobs',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'company_id',company_id,'kind',kind,'status',status,'last_error',last_error)),'[]'::jsonb)
  FROM public.saas_provider_jobs WHERE status<>'done'));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_saas_admin_overview() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_saas_admin_overview() TO authenticated;

CREATE FUNCTION public.admin_update_saas_subscription(p_company_id uuid,p_plan_id text,p_billing_mode text,
 p_full_access boolean,p_status text,p_reason text,p_trial_ends_at timestamptz DEFAULT NULL,
 p_admin_access_until timestamptz DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Apenas o Super Admin pode alterar assinaturas.'; END IF;
 IF p_plan_id NOT IN ('basico','profissional','enterprise') OR p_billing_mode NOT IN ('paid','exempt')
  OR p_status NOT IN ('trial','active','suspended','cancelled') OR p_full_access IS NULL
  OR p_plan_id IS NULL OR p_billing_mode IS NULL OR p_status IS NULL THEN RAISE EXCEPTION 'Configuração de assinatura inválida.'; END IF;
 IF length(trim(COALESCE(p_reason,'')))<5 OR length(p_reason)>500 THEN RAISE EXCEPTION 'Informe o motivo da alteração (5 a 500 caracteres).'; END IF;
 UPDATE public.saas_subscriptions SET plan_id=p_plan_id,billing_mode=p_billing_mode,full_access=p_full_access,status=p_status,
  trial_ends_at=COALESCE(p_trial_ends_at,trial_ends_at),
  admin_access_until=p_admin_access_until,
  auto_renew=CASE WHEN p_billing_mode='exempt' OR p_status IN ('suspended','cancelled') THEN false ELSE auto_renew END
 WHERE company_id=p_company_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assinatura não encontrada.'; END IF;
 INSERT INTO public.saas_billing_events(company_id,actor_id,action,details)
 VALUES(p_company_id,auth.uid(),'admin_subscription_update',jsonb_build_object('plan',p_plan_id,'billing_mode',p_billing_mode,
  'full_access',p_full_access,'status',p_status,'trial_ends_at',p_trial_ends_at,'admin_access_until',p_admin_access_until,'reason',p_reason));
 RETURN partner_subscription_private.state(p_company_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_update_saas_subscription(uuid,text,text,boolean,text,text,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_update_saas_subscription(uuid,text,text,boolean,text,text,timestamptz,timestamptz) TO authenticated;

CREATE FUNCTION public.cancel_saas_renewal(p_company_id uuid DEFAULT NULL,p_reason text DEFAULT 'Cancelamento solicitado pelo titular') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE company uuid:=COALESCE(p_company_id,auth.uid());
BEGIN
 IF auth.uid() IS NULL OR (company<>auth.uid() AND NOT public.is_super_admin()) THEN RAISE EXCEPTION 'Cancelamento não autorizado.'; END IF;
 UPDATE public.saas_subscriptions SET auto_renew=false,status=CASE WHEN billing_mode='exempt' THEN status ELSE 'cancelled' END WHERE company_id=company;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assinatura não encontrada.'; END IF;
 INSERT INTO public.saas_billing_events(company_id,actor_id,action,details)
 VALUES(company,auth.uid(),'renewal_cancel_requested',jsonb_build_object('reason',LEFT(p_reason,500)));
 RETURN partner_subscription_private.state(company);
END;
$function$;
REVOKE ALL ON FUNCTION public.cancel_saas_renewal(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_saas_renewal(uuid,text) TO authenticated;

CREATE FUNCTION public.admin_cancel_saas_invoice(p_invoice_id uuid,p_reason text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE i public.saas_invoices%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Cancelamento não autorizado.'; END IF;
 IF length(trim(COALESCE(p_reason,'')))<5 THEN RAISE EXCEPTION 'Informe o motivo do cancelamento.'; END IF;
 SELECT * INTO i FROM public.saas_invoices WHERE id=p_invoice_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cobrança não encontrada.'; END IF;
 PERFORM 1 FROM public.saas_subscriptions WHERE id=i.subscription_id FOR UPDATE;
 SELECT * INTO i FROM public.saas_invoices WHERE id=p_invoice_id FOR UPDATE;
 IF i.status='cancelled' THEN RETURN true; END IF;
 IF i.status<>'pending' THEN RAISE EXCEPTION 'Somente cobranças pendentes podem ser canceladas; pagamentos recebidos exigem estorno no gateway.'; END IF;
 UPDATE public.saas_invoices SET status=CASE WHEN provider_payment_id IS NULL THEN 'cancelled' ELSE 'cancellation_requested' END,
  cancellation_reason=LEFT(p_reason,500),updated_at=now() WHERE id=i.id;
 UPDATE public.saas_subscriptions SET admin_access_until=GREATEST(admin_access_until,i.period_end),auto_renew=false
 WHERE id=i.subscription_id;
 IF i.provider_payment_id IS NOT NULL THEN
  INSERT INTO public.saas_provider_jobs(company_id,kind,provider_id,invoice_id)
  VALUES(i.company_id,'cancel_payment',i.provider_payment_id,i.id) ON CONFLICT(kind,provider_id) DO NOTHING;
 END IF;
 INSERT INTO public.saas_billing_events(company_id,actor_id,action,details)
 VALUES(i.company_id,auth.uid(),'invoice_cancel_requested',jsonb_build_object('invoice_id',i.id,'reason',p_reason));
 RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_cancel_saas_invoice(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_saas_invoice(uuid,text) TO authenticated;

CREATE FUNCTION public.begin_saas_checkout(p_company_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE s public.saas_subscriptions%ROWTYPE; a public.saas_checkout_attempts%ROWTYPE; price numeric;
BEGIN
 IF auth.uid() IS NULL OR auth.uid()<>p_company_id THEN RAISE EXCEPTION 'Apenas o titular pode autorizar a assinatura.'; END IF;
 SELECT * INTO s FROM public.saas_subscriptions WHERE company_id=p_company_id FOR UPDATE;
 IF NOT FOUND OR s.billing_mode='exempt' OR s.status='suspended' THEN RAISE EXCEPTION 'Esta conta não está disponível para cobrança.'; END IF;
 SELECT * INTO a FROM public.saas_checkout_attempts WHERE company_id=p_company_id AND state IN ('creating','ready','uncertain') ORDER BY created_at DESC LIMIT 1;
 IF FOUND THEN RETURN to_jsonb(a)||jsonb_build_object('should_create',false,'trial_ends_at',s.trial_ends_at); END IF;
 IF s.provider_subscription_id IS NOT NULL THEN RAISE EXCEPTION 'Já existe uma assinatura no gateway. Cancele a renovação antes de iniciar outra.'; END IF;
 IF s.provider_cancel_pending THEN RAISE EXCEPTION 'Aguarde a confirmação do cancelamento anterior no gateway.'; END IF;
 SELECT monthly_amount INTO price FROM public.saas_plans WHERE id=s.plan_id;
 UPDATE public.saas_subscriptions SET auto_renew=true,status='trial' WHERE company_id=p_company_id;
 SELECT * INTO s FROM public.saas_subscriptions WHERE company_id=p_company_id;
 INSERT INTO public.saas_checkout_attempts(subscription_id,company_id,subscription_revision,plan_id,amount)
 VALUES(s.id,p_company_id,s.revision,s.plan_id,price) RETURNING * INTO a;
 RETURN to_jsonb(a)||jsonb_build_object('should_create',true,'trial_ends_at',s.trial_ends_at);
END;
$function$;
REVOKE ALL ON FUNCTION public.begin_saas_checkout(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.begin_saas_checkout(uuid) TO authenticated;

CREATE FUNCTION public.finish_saas_checkout(p_attempt_id uuid,p_provider_id text,p_checkout_url text,p_provider_status text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE a public.saas_checkout_attempts%ROWTYPE; s public.saas_subscriptions%ROWTYPE; accepted boolean;
BEGIN
 SELECT * INTO a FROM public.saas_checkout_attempts WHERE id=p_attempt_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tentativa de assinatura desconhecida.'; END IF;
 SELECT * INTO s FROM public.saas_subscriptions WHERE id=a.subscription_id FOR UPDATE;
 SELECT * INTO a FROM public.saas_checkout_attempts WHERE id=p_attempt_id FOR UPDATE;
 IF a.provider_subscription_id IS NOT NULL AND a.provider_subscription_id<>p_provider_id THEN RAISE EXCEPTION 'Tentativa já associada a outra assinatura.'; END IF;
 accepted:=s.billing_mode='paid' AND s.status<>'suspended' AND s.auto_renew AND s.revision=a.subscription_revision AND a.state<>'cancelled';
 UPDATE public.saas_checkout_attempts SET provider_subscription_id=p_provider_id,checkout_url=p_checkout_url,
  state=CASE WHEN accepted THEN 'ready' ELSE 'cancelled' END,updated_at=now() WHERE id=a.id;
 IF accepted THEN
  UPDATE public.saas_subscriptions SET provider_subscription_id=p_provider_id,provider_status=p_provider_status WHERE id=s.id;
 ELSE
  PERFORM partner_subscription_private.queue_cancel(s.company_id,p_provider_id);
  UPDATE public.saas_subscriptions SET provider_cancel_pending=true WHERE id=s.id;
 END IF;
 RETURN jsonb_build_object('accepted',accepted,'company_id',s.company_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.finish_saas_checkout(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_saas_checkout(uuid,text,text,text) TO service_role;

CREATE FUNCTION public.mark_saas_checkout_uncertain(p_attempt_id uuid,p_definitive_failure boolean DEFAULT false) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $function$
 UPDATE public.saas_checkout_attempts SET state=CASE WHEN p_definitive_failure THEN 'failed' ELSE 'uncertain' END,updated_at=now()
 WHERE id=p_attempt_id AND state='creating';
$function$;
REVOKE ALL ON FUNCTION public.mark_saas_checkout_uncertain(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_saas_checkout_uncertain(uuid,boolean) TO service_role;

CREATE FUNCTION public.apply_saas_payment(p_provider_subscription_id text,p_payment_id text,p_status text,p_amount numeric,
 p_currency text,p_period_start timestamptz,p_paid_at timestamptz DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE a public.saas_checkout_attempts%ROWTYPE; s public.saas_subscriptions%ROWTYPE; period_end timestamptz; until_date timestamptz;
BEGIN
 IF p_status NOT IN ('pending','paid','cancelled','refunded','charged_back') OR p_status IS NULL OR p_period_start IS NULL THEN RAISE EXCEPTION 'Pagamento inválido.'; END IF;
 SELECT * INTO a FROM public.saas_checkout_attempts WHERE provider_subscription_id=p_provider_subscription_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assinatura do gateway não reconhecida.'; END IF;
 IF p_currency IS DISTINCT FROM 'BRL' OR p_amount IS DISTINCT FROM a.amount THEN RAISE EXCEPTION 'Valor ou moeda não corresponde à assinatura autorizada.'; END IF;
 SELECT * INTO s FROM public.saas_subscriptions WHERE id=a.subscription_id FOR UPDATE;
 period_end:=p_period_start+interval '1 month';
 IF p_payment_id IS NULL OR length(p_payment_id)=0 OR EXISTS(SELECT 1 FROM public.saas_invoices WHERE provider_payment_id=p_payment_id AND subscription_id<>s.id) THEN
  RAISE EXCEPTION 'Pagamento já vinculado a outra assinatura ou sem identificador.';
 END IF;
 IF p_status='paid' AND p_paid_at IS NULL THEN RAISE EXCEPTION 'Pagamento aprovado sem data de aprovação.'; END IF;
 IF EXISTS(SELECT 1 FROM public.saas_invoices WHERE provider_payment_id=p_payment_id
  AND (period_start IS DISTINCT FROM p_period_start OR amount IS DISTINCT FROM p_amount OR currency IS DISTINCT FROM p_currency
    OR provider_subscription_id IS DISTINCT FROM p_provider_subscription_id)) THEN
  RAISE EXCEPTION 'Dados do pagamento não correspondem à cobrança registrada.';
 END IF;
 INSERT INTO public.saas_invoices(subscription_id,company_id,provider_payment_id,provider_subscription_id,period_start,period_end,amount,currency,status,paid_at)
 VALUES(s.id,s.company_id,p_payment_id,p_provider_subscription_id,p_period_start,period_end,p_amount,p_currency,p_status,p_paid_at)
 ON CONFLICT(provider_payment_id) DO UPDATE SET status=EXCLUDED.status,paid_at=EXCLUDED.paid_at,updated_at=now()
 WHERE public.saas_invoices.subscription_id=EXCLUDED.subscription_id
  AND NOT(public.saas_invoices.status IN ('paid','refunded','charged_back') AND EXCLUDED.status IN ('pending','cancelled'))
  AND NOT(public.saas_invoices.status IN ('refunded','charged_back') AND EXCLUDED.status='paid');
 IF p_status IN ('paid','refunded','charged_back') THEN
  SELECT max(i.period_end) INTO until_date FROM public.saas_invoices i WHERE subscription_id=s.id AND status='paid';
  UPDATE public.saas_subscriptions SET paid_until=until_date,grace_until=until_date+interval '7 days',
   status=CASE WHEN status IN ('suspended','cancelled') THEN status ELSE 'active' END WHERE id=s.id;
 END IF;
 INSERT INTO public.saas_billing_events(company_id,action,details)
 VALUES(s.company_id,'provider_payment_update',jsonb_build_object('payment_id',p_payment_id,'status',p_status));
 RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.apply_saas_payment(text,text,text,numeric,text,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_saas_payment(text,text,text,numeric,text,timestamptz,timestamptz) TO service_role;
COMMIT;
