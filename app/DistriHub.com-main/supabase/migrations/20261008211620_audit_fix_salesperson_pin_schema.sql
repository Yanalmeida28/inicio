DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.set_partner_salesperson_pin(uuid,text)'::regprocedure) INTO definition;
 definition:=replace(definition,'COALESCE(sp.active, sp.is_active, true)','COALESCE(sp.active, true)');
 definition:=regexp_replace(definition,',\s*updated_at = pg_catalog.now\(\)','','g');
 definition:=regexp_replace(definition,'\mBEGIN\M','BEGIN PERFORM partner_subscription_private.require_actor(''administrativo'');','i');
 EXECUTE definition;
END; $$;
