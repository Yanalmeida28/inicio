BEGIN;
DO $migration$
DECLARE definition text;
DECLARE anchor text := 'SELECT * INTO v_operator FROM public.resolve_partner_operator(p_salesperson_id, p_pin, COALESCE(p_branch_id,v_existing_branch_id));';
BEGIN
 definition := pg_get_functiondef('public.execute_partner_customer_mutation(uuid,text,uuid,uuid,text,text,text,text,date,text,text,text,text,text,text,numeric,boolean)'::regprocedure);
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Customer mutation changed; review branch context'; END IF;
 definition := replace(definition,anchor,anchor || E'\n  IF v_operator.role = ''administrador'' THEN\n    v_operator.branch_id := COALESCE(p_branch_id,v_existing_branch_id);\n  END IF;');
 EXECUTE definition;
END $migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
