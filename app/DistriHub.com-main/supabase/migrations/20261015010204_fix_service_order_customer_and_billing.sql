BEGIN;
-- Keep the existing six-argument API compatible: NULL still means omitted.
-- All callers, including the old frontend, must respect billed customer identity.
DO $migration$
DECLARE definition text; arguments text; identity_args text;
BEGIN
 SELECT pg_get_functiondef(p.oid),pg_get_function_arguments(p.oid),pg_get_function_identity_arguments(p.oid)
 INTO definition,arguments,identity_args FROM pg_proc p WHERE p.oid='public.update_service_order_workflow(uuid,text,text,text,text,uuid)'::regprocedure;
 IF position(' IF o.status IN (''cancelada'',''finalizada'') THEN' IN definition)=0 THEN RAISE EXCEPTION 'OS workflow implementation changed'; END IF;
 definition:=replace(definition,' IF o.status IN (''cancelada'',''finalizada'') THEN',$guard$
 IF p_customer_id IS NOT NULL AND p_customer_id IS DISTINCT FROM o.customer_id
  AND EXISTS(SELECT 1 FROM public.partner_invoices WHERE service_order_id=o.id) THEN
  RAISE EXCEPTION 'OS já faturada: o cliente não pode ser alterado. Utilize a conciliação financeira.';
 END IF;
 IF o.status IN ('cancelada','finalizada') THEN$guard$);
 EXECUTE definition;
 CREATE SCHEMA partner_service_orders_private;
 REVOKE ALL ON SCHEMA partner_service_orders_private FROM PUBLIC,anon,authenticated;
 GRANT USAGE ON SCHEMA partner_service_orders_private TO authenticated;
 definition:=replace(definition,'public.update_service_order_workflow(', 'partner_service_orders_private.update_workflow(');
 definition:=replace(definition,'('||arguments||')','('||arguments||', p_clear_customer boolean DEFAULT false)');
 definition:=replace(definition,'DECLARE o public.service_orders%ROWTYPE;', 'DECLARE target_customer uuid; o public.service_orders%ROWTYPE;');
 definition:=replace(definition,' IF p_customer_id IS NOT NULL AND p_customer_id IS DISTINCT FROM o.customer_id', $clear$
 IF p_clear_customer AND p_customer_id IS NOT NULL THEN RAISE EXCEPTION 'Solicitação de cliente inconsistente'; END IF;
 target_customer:=CASE WHEN p_clear_customer THEN NULL ELSE COALESCE(p_customer_id,o.customer_id) END;
 IF target_customer IS DISTINCT FROM o.customer_id$clear$);
 definition:=replace(definition,'coalesce(p_customer_id,o.customer_id) IS NOT DISTINCT FROM o.customer_id','target_customer IS NOT DISTINCT FROM o.customer_id');
 definition:=replace(definition,'customer_id=coalesce(p_customer_id,customer_id),customer_name=coalesce(name,customer_name)',
   'customer_id=target_customer,customer_name=CASE WHEN p_clear_customer THEN '''' ELSE coalesce(name,customer_name) END');
 IF position('customer_id=target_customer' IN definition)=0 THEN RAISE EXCEPTION 'OS customer update implementation changed'; END IF;
 EXECUTE definition;
 EXECUTE format('REVOKE ALL ON FUNCTION partner_service_orders_private.update_workflow(%s,boolean) FROM PUBLIC,anon',identity_args);
 EXECUTE format('GRANT EXECUTE ON FUNCTION partner_service_orders_private.update_workflow(%s,boolean) TO authenticated',identity_args);
 EXECUTE format('CREATE FUNCTION public.update_service_order_workflow_checked(%s,p_clear_customer boolean DEFAULT false) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='''' AS %L',arguments,
  'SELECT partner_service_orders_private.update_workflow(p_order_id,p_status,p_technician,p_approval,p_reason,p_customer_id,p_clear_customer)');
 EXECUTE format('REVOKE ALL ON FUNCTION public.update_service_order_workflow_checked(%s,boolean) FROM PUBLIC,anon',identity_args);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.update_service_order_workflow_checked(%s,boolean) TO authenticated',identity_args);
END $migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
