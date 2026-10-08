-- Match resolve_partner_operator's company_id result, preserving all access checks.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.execute_partner_stock_replenishment(uuid,text,uuid,uuid,integer,numeric,text)'::regprocedure)
    INTO definition;
  EXECUTE replace(definition, 'v_operator.user_id', 'v_operator.company_id');
END;
$$;
