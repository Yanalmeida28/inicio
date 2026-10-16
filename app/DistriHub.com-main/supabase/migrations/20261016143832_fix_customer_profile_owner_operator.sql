BEGIN;
DO $migration$
DECLARE
 definition text;
 anchor text := 'SELECT * INTO operator FROM public.resolve_partner_operator(p_operator_id,p_operator_pin,coalesce(p_branch_id,existing.branch_id));';
 replacement text := $replacement$
 IF auth.uid()=existing.user_id AND p_operator_id IS NOT NULL THEN
  -- The company owner may authorize a company operator with a valid PIN,
  -- including operators who also have their own login. Preserve their role.
  SELECT sp.user_id AS company_id,sp.id AS salesperson_id,sp.role,sp.branch_id
  INTO operator FROM public.partner_salespeople sp
  WHERE sp.id=p_operator_id AND sp.user_id=auth.uid() AND coalesce(sp.active,true)
   AND sp.pin_hash IS NOT NULL
   AND public.verify_partner_salesperson_pin(p_operator_pin,sp.pin_hash);
  IF NOT FOUND THEN RAISE EXCEPTION 'Operador invalido ou PIN incorreto'; END IF;
  IF operator.role<>'administrador' AND operator.branch_id IS NOT NULL
   AND operator.branch_id IS DISTINCT FROM coalesce(p_branch_id,existing.branch_id)
  THEN RAISE EXCEPTION 'Acesso negado a filial'; END IF;
 ELSE
  SELECT * INTO operator FROM public.resolve_partner_operator(p_operator_id,p_operator_pin,coalesce(p_branch_id,existing.branch_id));
 END IF;
 $replacement$;
BEGIN
 definition:=pg_get_functiondef('partner_cadastros_private.update_customer_profile(uuid,jsonb,uuid,text,uuid)'::regprocedure);
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Customer profile changed; review authorization'; END IF;
 definition:=replace(definition,anchor,replacement);
 EXECUTE definition;
END $migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
