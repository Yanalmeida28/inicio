CREATE OR REPLACE FUNCTION partner_subscription_private.guard_branding()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;
