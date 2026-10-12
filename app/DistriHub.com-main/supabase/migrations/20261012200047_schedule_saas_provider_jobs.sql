BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
DO $fn$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='distrihub_saas_scheduler') THEN
  PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'distrihub_saas_scheduler','Private token for the scheduled SaaS cancellation worker');
 END IF;
END $fn$;
CREATE FUNCTION public.authorize_saas_scheduler(p_token text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE secret text;
BEGIN
 IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
 SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name='distrihub_saas_scheduler';
 RETURN secret IS NOT NULL AND extensions.digest(p_token,'sha256')=extensions.digest(secret,'sha256');
END $fn$;
REVOKE ALL ON FUNCTION public.authorize_saas_scheduler(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_saas_scheduler(text) TO service_role;
CREATE FUNCTION partner_operations_private.dispatch_saas_jobs() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE request_id bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.saas_provider_jobs WHERE status='pending' OR status IN ('processing','failed') AND lease_until<now()) THEN RETURN NULL; END IF;
 SELECT net.http_post(url:='https://kcxefjgchxhvcfppglvp.supabase.co/functions/v1/saas-provider-jobs',
   headers:=jsonb_build_object('Content-Type','application/json','x-distrihub-scheduler',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='distrihub_saas_scheduler')),
   body:='{}'::jsonb, timeout_milliseconds:=30000) INTO request_id;
 RETURN request_id;
END $fn$;
REVOKE ALL ON FUNCTION partner_operations_private.dispatch_saas_jobs() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('distrihub-saas-provider-jobs','* * * * *','SELECT partner_operations_private.dispatch_saas_jobs();');
COMMIT;
