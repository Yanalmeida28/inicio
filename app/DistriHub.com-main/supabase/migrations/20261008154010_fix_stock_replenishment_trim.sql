-- Preserve authorization, SaaS access and atomic stock/movement writes.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.execute_partner_stock_replenishment(uuid,text,uuid,uuid,integer,numeric,text)'::regprocedure)
    INTO definition;
  IF position('pg_catalog.trim(p_reason)' IN definition) > 0 THEN
    EXECUTE replace(definition, 'pg_catalog.trim(p_reason)', 'pg_catalog.btrim(p_reason)');
  END IF;
END;
$$;
