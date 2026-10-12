BEGIN;
DO $migration$ DECLARE f record; BEGIN FOR f IN SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('create_service_order','execute_partner_stock_replenishment') LOOP EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC,anon,authenticated',f.proname,f.args); END LOOP; END $migration$;
COMMIT;
