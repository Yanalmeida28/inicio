BEGIN;
-- Billing history is read-only and restricted to the master account.
GRANT SELECT ON public.saas_billing_events TO authenticated;
CREATE POLICY super_admin_billing_history ON public.saas_billing_events
FOR SELECT TO authenticated USING ((SELECT public.is_super_admin()));

CREATE TABLE public.admin_support_states (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','high')),
  closed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_support_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_support_states FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.admin_support_states TO authenticated;
CREATE POLICY super_admin_support_read ON public.admin_support_states FOR SELECT TO authenticated USING ((SELECT public.is_super_admin()));
CREATE POLICY super_admin_support_insert ON public.admin_support_states FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_super_admin()));
CREATE POLICY super_admin_support_update ON public.admin_support_states FOR UPDATE TO authenticated USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));

ALTER TABLE public.partner_plan_change_requests ADD COLUMN resolution_reason text;
CREATE FUNCTION public.resolve_partner_plan_change_with_reason(p_request_id uuid, p_approved boolean, p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE company uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Acesso administrativo necessário.'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 OR length(p_reason) > 500 THEN RAISE EXCEPTION 'Informe um motivo de 5 a 500 caracteres.'; END IF;
  PERFORM public.resolve_partner_plan_change(p_request_id, p_approved);
  UPDATE public.partner_plan_change_requests SET resolution_reason = trim(p_reason) WHERE id = p_request_id RETURNING user_id INTO company;
  INSERT INTO public.saas_billing_events(company_id, actor_id, action, details)
  VALUES(company, auth.uid(), CASE WHEN p_approved THEN 'plan_request_decision' ELSE 'plan_request_rejected' END, jsonb_build_object('request_id',p_request_id,'approved',p_approved,'reason',trim(p_reason)));
  RETURN true;
END;
$fn$;
REVOKE ALL ON FUNCTION public.resolve_partner_plan_change_with_reason(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_partner_plan_change_with_reason(uuid,boolean,text) TO authenticated;

CREATE FUNCTION public.get_super_admin_plan_requests() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Acesso administrativo necessário.'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('request_id',r.id,'company_name',p.business_name,'current_plan',r.current_plan,'requested_plan',r.requested_plan,'status',r.status,'created_at',r.created_at,'resolved_at',r.resolved_at,'resolution_reason',r.resolution_reason) ORDER BY r.created_at DESC),'[]'::jsonb)
    FROM public.partner_plan_change_requests r JOIN public.partner_profiles p ON p.id=r.user_id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_super_admin_plan_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_super_admin_plan_requests() TO authenticated;

CREATE FUNCTION public.get_super_admin_pending_summary() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Acesso administrativo necessário.'; END IF;
  RETURN jsonb_build_object('plans',(SELECT count(*) FROM public.partner_plan_change_requests WHERE status='pending'),
    'support',(SELECT count(*) FROM (SELECT DISTINCT ON (user_id) user_id,sender_role,created_at FROM public.support_messages ORDER BY user_id,created_at DESC,id DESC) m
       LEFT JOIN public.admin_support_states s ON s.user_id=m.user_id WHERE m.sender_role='cliente' AND (s.closed_at IS NULL OR m.created_at>s.closed_at)));
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_super_admin_pending_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_super_admin_pending_summary() TO authenticated;
COMMIT;
