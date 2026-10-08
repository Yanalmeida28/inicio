BEGIN;

CREATE INDEX saas_invoices_subscription ON public.saas_invoices(subscription_id);
CREATE INDEX saas_attempts_subscription ON public.saas_checkout_attempts(subscription_id);
CREATE INDEX saas_jobs_company ON public.saas_provider_jobs(company_id);
CREATE INDEX saas_events_company_date ON public.saas_billing_events(company_id,created_at DESC);
CREATE INDEX saas_jobs_ready ON public.saas_provider_jobs(status,lease_until,created_at) WHERE status<>'done';
ALTER TABLE public.saas_provider_jobs ADD COLUMN lease_token uuid;

-- Return only the caller's entitlement. Existing policies still enforce roles and branches.
CREATE FUNCTION public.partner_has_saas_access(p_company uuid,p_feature text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 IF public.is_super_admin() THEN RETURN true; END IF;
 IF auth.uid()<>p_company AND NOT EXISTS(SELECT 1 FROM public.partner_salespeople
  WHERE user_id=p_company AND auth_user_id=auth.uid() AND active=true) THEN RETURN false; END IF;
 s:=partner_subscription_private.state(p_company);
 RETURN COALESCE((s->>'can_access')::boolean,false) AND s->'features' ? p_feature;
END;
$$;
REVOKE ALL ON FUNCTION public.partner_has_saas_access(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.partner_has_saas_access(uuid,text) TO authenticated;

CREATE FUNCTION partner_subscription_private.require_actor(p_feature text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE company uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
 IF public.is_super_admin() THEN RETURN; END IF;
 SELECT id INTO company FROM public.partner_profiles WHERE id=auth.uid();
 IF company IS NULL THEN SELECT user_id INTO company FROM public.partner_salespeople
  WHERE auth_user_id=auth.uid() AND active=true LIMIT 1; END IF;
 IF company IS NULL THEN RAISE EXCEPTION 'Empresa não autorizada.'; END IF;
 PERFORM partner_subscription_private.require_access(company,p_feature);
END;
$$;
REVOKE ALL ON FUNCTION partner_subscription_private.require_actor(text) FROM PUBLIC,anon,authenticated;

-- Table triggers also cover SECURITY DEFINER writes, which bypass RLS.
CREATE FUNCTION partner_subscription_private.guard_operational_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE company uuid; previous_company uuid; s jsonb; max_branches integer;
BEGIN
 company:=(CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END->>'user_id')::uuid;
 IF TG_OP='UPDATE' THEN
  previous_company:=(to_jsonb(OLD)->>'user_id')::uuid;
  IF company IS DISTINCT FROM previous_company THEN RAISE EXCEPTION 'Não é permitido transferir registros entre empresas.'; END IF;
 END IF;
 -- Server maintenance is allowed; JWT-less browser roles are not.
 IF auth.uid() IS NULL THEN
  IF COALESCE(NULLIF(current_setting('role',true),'none'),session_user) NOT IN ('postgres','service_role') THEN
   RAISE EXCEPTION 'Não autenticado.';
  END IF;
 ELSE
  IF NOT public.partner_has_saas_access(company,TG_ARGV[0]) THEN
   RAISE EXCEPTION 'Recurso indisponível para esta assinatura ou empresa.';
  END IF;
 END IF;
 IF TG_TABLE_NAME='partner_branches' AND TG_OP='INSERT' THEN
  PERFORM 1 FROM public.saas_subscriptions WHERE company_id=company FOR UPDATE;
  s:=partner_subscription_private.state(company);
  max_branches:=(s->>'branch_limit')::integer;
  IF max_branches IS NOT NULL AND (SELECT count(*) FROM public.partner_branches WHERE user_id=company)>=max_branches THEN
   RAISE EXCEPTION 'Limite de filiais do plano atingido.';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION partner_subscription_private.guard_operational_write() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION partner_subscription_private.guard_branding() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE key text; previous jsonb; incoming jsonb:=to_jsonb(NEW);
BEGIN
 IF auth.uid() IS NULL THEN
  IF COALESCE(NULLIF(current_setting('role',true),'none'),session_user) IN ('postgres','service_role') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Não autenticado.';
 END IF;
 previous:=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
 FOREACH key IN ARRAY ARRAY['logo_url','banner_url','primary_color','nav_color'] LOOP
  IF NULLIF(incoming->>key,'') IS DISTINCT FROM NULLIF(previous->>key,'') THEN
   IF NOT public.partner_has_saas_access((incoming->>'user_id')::uuid,'white-label') THEN
    RAISE EXCEPTION 'Personalização visual exige o plano Enterprise ou isenção com acesso completo.';
   END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION partner_subscription_private.guard_branding() FROM PUBLIC,anon,authenticated;
DO $$
DECLARE name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['partner_store_settings','store_settings_v2'] LOOP
  IF EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||name) AND relkind IN ('r','p')) THEN
   EXECUTE format('CREATE TRIGGER saas_branding_access BEFORE INSERT OR UPDATE ON public.%I
    FOR EACH ROW EXECUTE FUNCTION partner_subscription_private.guard_branding()',name);
  END IF;
 END LOOP;
END;
$$;

DO $$
DECLARE entry record; table_kind "char";
BEGIN
 FOR entry IN SELECT * FROM (VALUES
  ('partner_branches','cadastros'),('partner_customers','cadastros'),('partner_products','cadastros'),
  ('partner_categories','cadastros'),('partner_suppliers','cadastros'),('partner_salespeople','cadastros'),
  ('partner_sales','pdv'),('partner_invoices','pdv'),('partner_invoice_receipts','pdv'),
  ('partner_pdv_price_snapshots','pdv'),('stock_movements','pdv'),('partner_cash_sessions','caixa'),
  ('partner_payables','financeiro'),('partner_payable_payments','financeiro'),
  ('rma_requests_v2','rma'),('service_orders','os'),('service_order_items','os'),('service_order_photos','os'),
  ('fiscal_documents','fiscal'),('fiscal_branch_settings','fiscal'),('fiscal_tax_rules','fiscal'),
  ('partner_combos','cadastros'),('partner_modifiers','cadastros'),('b2b_orders','pedidos')
 ) AS entries(table_name,feature)
 LOOP
  SELECT relkind INTO table_kind FROM pg_class WHERE oid=to_regclass('public.'||entry.table_name);
  IF table_kind NOT IN ('r','p') OR table_kind IS NULL THEN CONTINUE; END IF;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
   AND table_name=entry.table_name AND column_name='user_id') THEN CONTINUE; END IF;
  EXECUTE format('CREATE TRIGGER saas_operational_access BEFORE INSERT OR UPDATE OR DELETE ON public.%I
   FOR EACH ROW EXECUTE FUNCTION partner_subscription_private.guard_operational_write(%L)',entry.table_name,entry.feature);
  EXECUTE format('CREATE POLICY saas_entitlement ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
   USING (public.partner_has_saas_access(user_id,%L)) WITH CHECK (public.partner_has_saas_access(user_id,%L))',
   entry.table_name,entry.feature,entry.feature);
 END LOOP;
END;
$$;

-- Add a precondition to the existing authorized RPCs, preserving their role/branch checks.
DO $$
DECLARE f record; definition text; feature text;
BEGIN
 FOR f IN SELECT oid,proname FROM pg_proc WHERE pronamespace='public'::regnamespace
 AND proname IN ('get_partner_pdv_snapshot','read_partner_cash_register','mutate_partner_cash_register',
 'record_partner_cash_refund','record_partner_invoice_payment','create_partner_payable','record_partner_payable_payment',
 'execute_partner_stock_replenishment','record_partner_stock_movement','execute_partner_delivery_mutation',
 'record_fiscal_document','save_fiscal_branch_settings','save_fiscal_tax_rule','delete_fiscal_tax_rule','create_fiscal_inutilization')
 LOOP
  feature:=CASE
   WHEN f.proname LIKE '%fiscal%' THEN 'fiscal'
   WHEN f.proname LIKE '%payable%' OR f.proname='record_partner_invoice_payment' THEN 'financeiro'
   WHEN f.proname LIKE '%stock%' THEN 'estoque'
   WHEN f.proname LIKE '%delivery%' THEN 'entregas'
   WHEN f.proname LIKE '%cash%' THEN 'caixa' ELSE 'pdv' END;
  definition:=pg_get_functiondef(f.oid);
  IF definition !~* '\mBEGIN\M' THEN RAISE EXCEPTION 'RPC % não possui bloco PL/pgSQL',f.proname; END IF;
  definition:=regexp_replace(definition,'\mBEGIN\M',format('BEGIN PERFORM partner_subscription_private.require_actor(%L);',feature),'i');
  EXECUTE definition;
 END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_partner_branch(p_name text,p_address text DEFAULT NULL)
RETURNS public.partner_branches LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.partner_branches;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.partner_profiles WHERE id=auth.uid()) THEN
  RAISE EXCEPTION 'Empresa não autorizada.';
 END IF;
 IF length(trim(COALESCE(p_name,''))) NOT BETWEEN 1 AND 120 OR length(COALESCE(p_address,''))>500 THEN
  RAISE EXCEPTION 'Nome ou endereço inválido.';
 END IF;
 INSERT INTO public.partner_branches(id,user_id,name,address)
 VALUES(gen_random_uuid(),auth.uid(),trim(p_name),NULLIF(trim(COALESCE(p_address,'')),'')) RETURNING * INTO result;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_partner_branch(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_partner_branch(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_partner_plan_change(p_request_id uuid,p_approved boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE request public.partner_plan_change_requests%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Acesso administrativo necessário.'; END IF;
 IF p_approved IS NULL THEN RAISE EXCEPTION 'Informe a decisão.'; END IF;
 SELECT * INTO request FROM public.partner_plan_change_requests WHERE id=p_request_id AND status='pending' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação pendente não encontrada.'; END IF;
 IF p_approved THEN
  UPDATE public.saas_subscriptions SET plan_id=request.requested_plan WHERE company_id=request.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assinatura não encontrada.'; END IF;
  INSERT INTO public.saas_billing_events(company_id,actor_id,action,details)
  VALUES(request.user_id,auth.uid(),'plan_request_approved',jsonb_build_object('request_id',request.id,'plan',request.requested_plan));
 END IF;
 UPDATE public.partner_plan_change_requests SET status=CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,resolved_at=now() WHERE id=request.id;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_partner_plan_change(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resolve_partner_plan_change(uuid,boolean) TO authenticated;

CREATE FUNCTION public.claim_saas_provider_jobs(p_limit integer DEFAULT 10) RETURNS SETOF public.saas_provider_jobs
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 UPDATE public.saas_provider_jobs SET status='processing',attempts=attempts+1,lease_until=now()+interval '2 minutes',
 lease_token=gen_random_uuid(),updated_at=now()
 WHERE id IN (SELECT id FROM public.saas_provider_jobs WHERE
  status='pending' OR (status IN ('processing','failed') AND lease_until<now())
  ORDER BY created_at LIMIT LEAST(GREATEST(p_limit,1),50) FOR UPDATE SKIP LOCKED)
 RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_saas_provider_jobs(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_saas_provider_jobs(integer) TO service_role;

CREATE FUNCTION public.finish_saas_provider_job(p_job_id uuid,p_lease_token uuid,p_success boolean,p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.saas_provider_jobs;
BEGIN
 SELECT * INTO job FROM public.saas_provider_jobs WHERE id=p_job_id;
 IF NOT FOUND THEN RETURN false; END IF;
 -- Use the same subscription -> job lock order as cancellation and checkout.
 PERFORM 1 FROM public.saas_subscriptions WHERE company_id=job.company_id FOR UPDATE;
 SELECT * INTO job FROM public.saas_provider_jobs WHERE id=p_job_id AND status='processing'
  AND lease_token=p_lease_token AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.saas_provider_jobs SET status=CASE WHEN p_success THEN 'done' ELSE 'failed' END,
  last_error=CASE WHEN p_success THEN NULL ELSE LEFT(p_error,500) END,
  lease_until=CASE WHEN p_success THEN NULL ELSE now()+interval '5 minutes' END,updated_at=now() WHERE id=job.id;
 IF p_success AND job.kind='cancel_payment' THEN
  UPDATE public.saas_invoices SET status='cancelled',updated_at=now()
   WHERE id=job.invoice_id AND status='cancellation_requested';
 END IF;
 IF p_success AND job.kind='cancel_subscription' THEN
  UPDATE public.saas_subscriptions SET provider_cancel_pending=EXISTS(SELECT 1 FROM public.saas_provider_jobs
   WHERE company_id=job.company_id AND kind='cancel_subscription' AND status<>'done') WHERE company_id=job.company_id;
 END IF;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_saas_provider_job(uuid,uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_saas_provider_job(uuid,uuid,boolean,text) TO service_role;

CREATE FUNCTION public.sync_saas_provider_subscription(p_provider_id text,p_status text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_status NOT IN ('pending','authorized','paused','cancelled') THEN RAISE EXCEPTION 'Status do gateway inválido.'; END IF;
 UPDATE public.saas_subscriptions SET provider_status=p_status,
  auto_renew=CASE WHEN p_status IN ('paused','cancelled') THEN false ELSE auto_renew END
 WHERE provider_subscription_id=p_provider_id;
 RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_saas_provider_subscription(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_saas_provider_subscription(text,text) TO service_role;
COMMIT;
