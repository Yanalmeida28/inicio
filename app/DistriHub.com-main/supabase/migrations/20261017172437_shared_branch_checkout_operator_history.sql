-- Share checkout destinations within the authorized branch, keeping cash
-- management permissions and the authenticated performer separate.
ALTER TABLE public.partner_cash_movements
  ADD COLUMN performed_by uuid,
  ADD COLUMN performed_by_name text;

DO $migration$
DECLARE fn record; definition text; original text; old_lookup text;
BEGIN
 FOR fn IN
  SELECT n.nspname, p.proname, p.oid FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.proname='execute_partner_sale_mutation'
    AND n.nspname IN ('public','partner_cash_supervision_private')
 LOOP
  original:=pg_get_functiondef(fn.oid);
  definition:=replace(original,'v_actor uuid;', 'v_actor uuid; v_performer_name text;');
  IF fn.nspname='public' THEN
   old_lookup:='SELECT * INTO s FROM public.partner_cash_sessions WHERE user_id=op.company_id AND branch_id=p_branch_id AND actor_key=v_actor AND closed_at IS NULL FOR UPDATE;';
   IF position(old_lookup IN definition)=0 THEN RAISE EXCEPTION 'Cash checkout lookup changed'; END IF;
   definition:=replace(definition,old_lookup,
    'SELECT * INTO s FROM public.partner_cash_sessions WHERE user_id=op.company_id AND branch_id=p_branch_id AND closed_at IS NULL ORDER BY (actor_key=v_actor) DESC, opened_at DESC, id DESC LIMIT 1 FOR UPDATE;');
  END IF;
  IF position('IF s.id IS NOT NULL THEN' IN definition)=0
     OR position('amount,reason,sale_id)' IN definition)=0 THEN
   RAISE EXCEPTION 'Cash movement implementation changed: %',fn.nspname;
  END IF;
  definition:=replace(definition,'IF s.id IS NOT NULL THEN', $performer$
IF s.id IS NOT NULL THEN
   SELECT COALESCE(NULLIF(btrim(sp.name),''),'Colaborador') INTO v_performer_name
   FROM public.partner_salespeople sp WHERE sp.id=op.salesperson_id AND sp.user_id=op.company_id;
   IF op.salesperson_id IS NULL THEN
     SELECT COALESCE(NULLIF(btrim(pp.account_name),''),NULLIF(btrim(pp.business_name),''),'Administrador')
     INTO v_performer_name FROM public.partner_profiles pp WHERE pp.id=op.company_id;
   END IF;
$performer$);
  definition:=replace(definition,'amount,reason,sale_id)', 'amount,reason,sale_id,performed_by,performed_by_name)');
  definition:=replace(definition,$old$'Pagamento dividido da venda (inclui frete)',v_id$old$,
    $new$'Pagamento dividido da venda (inclui frete)',v_id,COALESCE(op.salesperson_id,op.company_id),COALESCE(v_performer_name,'Colaborador')$new$);
  definition:=replace(definition,$old$'Venda finalizada (inclui frete para repasse)',v_id$old$,
    $new$'Venda finalizada (inclui frete para repasse)',v_id,COALESCE(op.salesperson_id,op.company_id),COALESCE(v_performer_name,'Colaborador')$new$);
  IF definition=original OR position('v_performer_name text' IN definition)=0 THEN
    RAISE EXCEPTION 'Cash performer migration did not match: %',fn.nspname;
  END IF;
  EXECUTE definition;
 END LOOP;
END $migration$;

-- Staff can discover open destinations in their own branch and retain their
-- own shared-checkout history. Other operators' private/closed history stays
-- restricted. Owners and managers retain their existing complete view.
CREATE OR REPLACE FUNCTION public.read_partner_cash_register(p_branch_id uuid, p_salesperson_id uuid DEFAULT NULL, p_pin text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE op record; v_sessions jsonb; v_movements jsonb; v_actor uuid;
BEGIN
 PERFORM partner_subscription_private.require_operator_module('caixa',p_salesperson_id);
 PERFORM partner_subscription_private.require_actor('caixa');
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
 SELECT * INTO op FROM public.resolve_partner_pdv_operator(p_salesperson_id,p_pin,p_branch_id);
 IF op.role NOT IN ('administrador','gerente','caixa','vendedor') THEN RAISE EXCEPTION 'Sem permissão para acessar o caixa'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.partner_branches WHERE id=p_branch_id AND user_id=op.company_id) THEN RAISE EXCEPTION 'Filial inválida'; END IF;
 v_actor:=COALESCE(op.salesperson_id,op.company_id);
 SELECT COALESCE(jsonb_agg((to_jsonb(s) || jsonb_build_object('history_complete',op.role IN ('administrador','gerente') OR s.actor_key=v_actor)) ORDER BY s.opened_at DESC,s.id DESC),'[]'::jsonb) INTO v_sessions
 FROM public.partner_cash_sessions s WHERE s.user_id=op.company_id AND s.branch_id=p_branch_id
 AND (op.role IN ('administrador','gerente') OR s.actor_key=v_actor OR s.closed_at IS NULL
   OR EXISTS(SELECT 1 FROM public.partner_cash_movements m WHERE m.session_id=s.id AND m.performed_by=v_actor));
 SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC),'[]'::jsonb) INTO v_movements
 FROM public.partner_cash_movements m JOIN public.partner_cash_sessions s ON s.id=m.session_id
 WHERE s.user_id=op.company_id AND s.branch_id=p_branch_id
 AND (op.role IN ('administrador','gerente') OR s.actor_key=v_actor OR m.performed_by=v_actor);
 RETURN jsonb_build_object('sessions',v_sessions,'movements',v_movements,'actor_key',v_actor,
   'can_manage',op.role IN ('administrador','gerente'),
   'sales',(SELECT COALESCE(jsonb_agg(to_jsonb(ps) ORDER BY ps.created_at DESC),'[]'::jsonb)
     FROM public.partner_sales ps WHERE ps.user_id=op.company_id AND ps.branch_id=p_branch_id
     AND EXISTS(SELECT 1 FROM public.partner_cash_movements m JOIN public.partner_cash_sessions s ON s.id=m.session_id
       WHERE m.sale_id=ps.id AND s.user_id=op.company_id AND s.branch_id=p_branch_id
       AND (op.role IN ('administrador','gerente') OR s.actor_key=v_actor OR m.performed_by=v_actor))));
END $function$;
REVOKE ALL ON FUNCTION public.read_partner_cash_register(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_partner_cash_register(uuid,uuid,text) TO authenticated;
