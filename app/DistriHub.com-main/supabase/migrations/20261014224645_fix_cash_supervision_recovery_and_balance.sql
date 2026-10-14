BEGIN;
CREATE SCHEMA partner_cash_supervision_private;
REVOKE ALL ON SCHEMA partner_cash_supervision_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA partner_cash_supervision_private TO authenticated;
CREATE TABLE partner_cash_supervision_private.abandoned_requests (
 request_id uuid PRIMARY KEY, company_id uuid NOT NULL, branch_id uuid NOT NULL, actor_key uuid NOT NULL,
 resolved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE partner_cash_supervision_private.abandoned_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY no_direct_access ON partner_cash_supervision_private.abandoned_requests
 FOR ALL TO authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON partner_cash_supervision_private.abandoned_requests FROM PUBLIC,anon,authenticated;

-- Reconciliation retires an absent UUID so a delayed initial request cannot later
-- commit after the operator has been allowed to start a corrected request.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.mutate_partner_cash_register(text,uuid,uuid,text,uuid,numeric,text,text,uuid,text,uuid)'::regprocedure) INTO definition;
 definition:=replace(definition,' IF p_action=''abrir'' THEN',$guard$
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,9));
 IF EXISTS(SELECT 1 FROM partner_cash_supervision_private.abandoned_requests WHERE request_id=p_request_id) THEN
  RAISE EXCEPTION 'Operação conciliada como não registrada. Use um novo identificador.';
 END IF;
 IF p_action='abrir' THEN$guard$);
 EXECUTE definition;
END $migration$;

-- All cash refunds, including existing clients, must respect physical cash.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.record_partner_cash_refund(uuid,uuid,text,uuid,uuid,numeric,text,uuid,text,uuid,text)'::regprocedure) INTO definition;
 definition:=replace(definition,'  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 9));',$guard$
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 9));
  IF EXISTS(SELECT 1 FROM partner_cash_supervision_private.abandoned_requests WHERE request_id=p_request_id) THEN
    RAISE EXCEPTION 'Operação conciliada como não registrada. Use um novo identificador.';
  END IF;$guard$);
 IF position('  INSERT INTO public.partner_cash_movements(' IN definition)=0 THEN RAISE EXCEPTION 'Refund implementation changed'; END IF;
 definition:=replace(definition,'  INSERT INTO public.partner_cash_movements(', $guard$
  IF v_original.payment_method='dinheiro' AND p_amount > v_session.opening_amount +
    (partner_cash_private.totals(v_session.id)->>'dinheiro')::numeric THEN
    RAISE EXCEPTION 'Devolução maior que o dinheiro disponível neste caixa. Registre um suprimento antes de devolver.';
  END IF;
  INSERT INTO public.partner_cash_movements($guard$);
 EXECUTE definition;
END $migration$;

-- Reuse authoritative pricing, stock, freight, split payments and idempotency.
-- The authenticated supervisor remains the actor; only the destination cash changes.
DO $migration$
DECLARE definition text; original text; fn record; args text; signature text; guard text;
BEGIN
 FOR fn IN SELECT p.oid,p.proname,pg_get_function_arguments(p.oid) arguments,pg_get_function_identity_arguments(p.oid) identity_args,p.proargnames
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('execute_partner_sale_mutation','mutate_partner_cash_register','record_partner_cash_refund')
 LOOP
  original:=pg_get_functiondef(fn.oid);
  definition:=replace(original,'public.'||fn.proname||'(', 'partner_cash_supervision_private.'||fn.proname||'(');
  IF fn.proname='execute_partner_sale_mutation' THEN
   definition:=replace(definition,'('||fn.arguments||')','(p_cash_session_id uuid, '||fn.arguments||')');
   definition:=replace(definition,' v_actor:=COALESCE(op.salesperson_id,op.company_id);', $guard$
 PERFORM partner_subscription_private.require_actor('caixa');
 PERFORM partner_subscription_private.require_operator_module('caixa',p_salesperson_id);
 IF op.role NOT IN ('administrador','gerente') THEN RAISE EXCEPTION 'Somente gerente ou proprietário pode operar outro caixa'; END IF;
 IF p_status IS DISTINCT FROM 'concluida' THEN RAISE EXCEPTION 'Selecione uma venda para finalizar no caixa supervisionado'; END IF;
 SELECT actor_key INTO v_actor FROM public.partner_cash_sessions
 WHERE id=p_cash_session_id AND user_id=op.company_id AND branch_id=p_branch_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Caixa inválido para esta empresa e filial'; END IF;
$guard$);
   definition:=replace(definition,'WHERE user_id=op.company_id AND branch_id=p_branch_id AND actor_key=v_actor AND closed_at IS NULL FOR UPDATE',
      'WHERE id=p_cash_session_id AND user_id=op.company_id AND branch_id=p_branch_id AND actor_key=v_actor AND closed_at IS NULL FOR UPDATE');
   definition:=replace(definition,' SELECT status INTO v_old_status FROM public.partner_sales WHERE id=p_sale_id;', $guard$
 SELECT status INTO v_old_status FROM public.partner_sales WHERE id=p_sale_id;
 IF v_old_status='concluida' AND NOT EXISTS(SELECT 1 FROM public.partner_cash_movements WHERE sale_id=p_sale_id AND kind='venda' AND session_id=p_cash_session_id) THEN
   RAISE EXCEPTION 'Venda já finalizada em outro caixa';
 END IF;
$guard$);
   definition:=replace(definition,' IF s.id IS NOT NULL THEN', $audit$
 IF s.id IS NOT NULL THEN
   INSERT INTO public.partner_audit_logs(id,user_id,actor_name,actor_role,action,entity_type,entity_id,details)
   VALUES(gen_random_uuid()::text,op.company_id,COALESCE(op.salesperson_id,op.company_id)::text,op.role,'venda_caixa_supervisionado','partner_cash_session',s.id::text,'Venda '||v_id::text||'; caixa de '||s.operator_name);
$audit$);
  ELSIF fn.proname='mutate_partner_cash_register' THEN
   definition:=replace(definition,' v_actor:=COALESCE(op.salesperson_id,op.company_id);', $guard$
 IF op.role NOT IN ('administrador','gerente') THEN RAISE EXCEPTION 'Somente gerente ou proprietário pode operar outro caixa'; END IF;
 IF p_action NOT IN ('movimentar','fechar') OR p_action IS NULL THEN RAISE EXCEPTION 'Ação de supervisão inválida'; END IF;
 SELECT actor_key INTO v_actor FROM public.partner_cash_sessions WHERE id=p_session_id AND user_id=op.company_id AND branch_id=p_branch_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Caixa inválido para esta empresa e filial'; END IF;
$guard$);
   definition:=replace(definition,'THEN v_authorizer:=v_actor;', 'THEN v_authorizer:=COALESCE(op.salesperson_id,op.company_id);');
   definition:=replace(definition,' RETURN s.id;'||chr(10)||'END', $audit$
 INSERT INTO public.partner_audit_logs(id,user_id,actor_name,actor_role,action,entity_type,entity_id,details)
 VALUES(gen_random_uuid()::text,op.company_id,COALESCE(op.salesperson_id,op.company_id)::text,op.role,'caixa_supervisionado_'||p_action,'partner_cash_session',s.id::text,'Operador original: '||s.operator_name);
 RETURN s.id;
END$audit$);
  ELSE
   definition:=replace(definition,'  v_authorizer uuid;', '  v_authorizer uuid; v_target_actor uuid;');
   guard:=$guard$
  IF v_operator.role NOT IN ('administrador','gerente') THEN RAISE EXCEPTION 'Somente gerente ou proprietário pode operar outro caixa'; END IF;
  SELECT actor_key INTO v_target_actor FROM public.partner_cash_sessions WHERE id=p_session_id AND user_id=v_operator.company_id AND branch_id=p_branch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caixa inválido para esta empresa e filial'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended($guard$;
   definition:=overlay(definition placing guard from position('  PERFORM pg_advisory_xact_lock(hashtextextended(' IN definition) for length('  PERFORM pg_advisory_xact_lock(hashtextextended('));
   definition:=replace(definition,'      COALESCE(v_operator.salesperson_id, v_operator.company_id)::text, 1','      v_target_actor::text, 1');
   definition:=replace(definition,'v_existing_actor <> COALESCE(v_operator.salesperson_id, v_operator.company_id)', 'v_existing_actor <> v_target_actor');
   definition:=replace(definition,'AND actor_key = COALESCE(v_operator.salesperson_id, v_operator.company_id)', 'AND actor_key = v_target_actor');
   definition:=replace(definition,'  RETURN p_session_id;', $audit$
  INSERT INTO public.partner_audit_logs(id,user_id,actor_name,actor_role,action,entity_type,entity_id,details)
  VALUES(gen_random_uuid()::text,v_operator.company_id,COALESCE(v_operator.salesperson_id,v_operator.company_id)::text,v_operator.role,'caixa_supervisionado_devolucao','partner_cash_session',p_session_id::text,'Venda '||p_sale_id::text||'; caixa de '||v_session.operator_name);
  RETURN p_session_id;$audit$);
  END IF;
  IF definition=original OR position('Somente gerente ou proprietário' IN definition)=0 THEN RAISE EXCEPTION 'Cash implementation changed: %',fn.proname; END IF;
  EXECUTE definition;
  signature:=CASE WHEN fn.proname='execute_partner_sale_mutation' THEN 'p_cash_session_id uuid, ' ELSE '' END||fn.arguments;
  args:=CASE WHEN fn.proname='execute_partner_sale_mutation' THEN 'p_cash_session_id, ' ELSE '' END||array_to_string(fn.proargnames,', ');
  EXECUTE format('REVOKE ALL ON FUNCTION partner_cash_supervision_private.%I(%s) FROM PUBLIC,anon',fn.proname,CASE WHEN fn.proname='execute_partner_sale_mutation' THEN 'uuid, ' ELSE '' END||fn.identity_args);
  EXECUTE format('GRANT EXECUTE ON FUNCTION partner_cash_supervision_private.%I(%s) TO authenticated',fn.proname,CASE WHEN fn.proname='execute_partner_sale_mutation' THEN 'uuid, ' ELSE '' END||fn.identity_args);
  EXECUTE format('CREATE FUNCTION public.%I(%s) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='''' AS %L',
    'supervised_'||fn.proname,signature,'SELECT partner_cash_supervision_private.'||fn.proname||'('||args||')');
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC,anon','supervised_'||fn.proname,CASE WHEN fn.proname='execute_partner_sale_mutation' THEN 'uuid, ' ELSE '' END||fn.identity_args);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated','supervised_'||fn.proname,CASE WHEN fn.proname='execute_partner_sale_mutation' THEN 'uuid, ' ELSE '' END||fn.identity_args);
 END LOOP;
END $migration$;

-- Cash-linked sales are returned under exactly the same cash visibility rules.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.read_partner_cash_register(uuid,uuid,text)'::regprocedure) INTO definition;
 definition:=replace(definition,$match$'actor_key',COALESCE(op.salesperson_id,op.company_id)$match$, $sales$
 'actor_key',COALESCE(op.salesperson_id,op.company_id), 'can_manage',op.role IN ('administrador','gerente'),
 'sales',(SELECT COALESCE(jsonb_agg(to_jsonb(ps) ORDER BY ps.created_at DESC),'[]'::jsonb) FROM public.partner_sales ps
 WHERE ps.user_id=op.company_id AND ps.branch_id=p_branch_id AND EXISTS(
   SELECT 1 FROM public.partner_cash_movements m JOIN public.partner_cash_sessions s ON s.id=m.session_id
   WHERE m.sale_id=ps.id AND s.user_id=op.company_id AND s.branch_id=p_branch_id
   AND (op.role IN ('administrador','gerente') OR s.actor_key=COALESCE(op.salesperson_id,op.company_id))))
$sales$);
 EXECUTE definition;
END $migration$;

CREATE FUNCTION partner_cash_supervision_private.resolve_request(p_branch_id uuid,p_salesperson_id uuid,p_pin text,p_request jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op record; actor uuid; request_id uuid:=(p_request->>'id')::uuid; session_id uuid:=(p_request->>'sessionId')::uuid;
 s public.partner_cash_sessions%ROWTYPE; m public.partner_cash_movements%ROWTYPE;
BEGIN
 PERFORM partner_subscription_private.require_actor('caixa');
 PERFORM partner_subscription_private.require_operator_module('caixa',p_salesperson_id);
 SELECT * INTO op FROM public.resolve_partner_pdv_operator(p_salesperson_id,p_pin,p_branch_id);
 IF NOT EXISTS(SELECT 1 FROM public.partner_branches WHERE id=p_branch_id AND user_id=op.company_id) THEN RAISE EXCEPTION 'Filial inválida'; END IF;
 actor:=COALESCE(op.salesperson_id,op.company_id);
 IF session_id IS NOT NULL THEN
  SELECT * INTO s FROM public.partner_cash_sessions WHERE id=session_id AND user_id=op.company_id AND branch_id=p_branch_id;
  IF NOT FOUND OR (s.actor_key<>actor AND op.role NOT IN ('administrador','gerente')) THEN RAISE EXCEPTION 'Caixa não autorizado'; END IF;
  actor:=s.actor_key;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(op.company_id::text||p_branch_id::text||actor::text,1));
 PERFORM pg_advisory_xact_lock(hashtextextended(request_id::text,9));
 IF p_request->>'action'='abrir' THEN
  SELECT * INTO s FROM public.partner_cash_sessions WHERE open_request_id=request_id;
  IF NOT FOUND THEN
   INSERT INTO partner_cash_supervision_private.abandoned_requests(request_id,company_id,branch_id,actor_key) VALUES(request_id,op.company_id,p_branch_id,actor) ON CONFLICT DO NOTHING;
   RETURN false;
  END IF;
  IF ROW(s.user_id,s.branch_id,s.actor_key,s.opening_amount) IS DISTINCT FROM ROW(op.company_id,p_branch_id,actor,(p_request->>'amount')::numeric) THEN RAISE EXCEPTION 'Conciliação exige conferência: dados divergentes'; END IF;
 ELSIF p_request->>'action'='fechar' THEN
  SELECT * INTO s FROM public.partner_cash_sessions WHERE close_request_id=request_id;
  IF NOT FOUND THEN
   INSERT INTO partner_cash_supervision_private.abandoned_requests(request_id,company_id,branch_id,actor_key) VALUES(request_id,op.company_id,p_branch_id,actor) ON CONFLICT DO NOTHING;
   RETURN false;
  END IF;
  IF ROW(s.user_id,s.branch_id,s.actor_key,s.id,s.counted_amount,s.notes) IS DISTINCT FROM ROW(op.company_id,p_branch_id,actor,session_id,(p_request->>'amount')::numeric,NULLIF(trim(p_request->>'reason'),'')) THEN RAISE EXCEPTION 'Conciliação exige conferência: dados divergentes'; END IF;
 ELSIF p_request->>'action' IN ('movimentar','devolver') THEN
  SELECT * INTO m FROM public.partner_cash_movements WHERE request_id=request_id;
  IF NOT FOUND THEN
   INSERT INTO partner_cash_supervision_private.abandoned_requests(request_id,company_id,branch_id,actor_key) VALUES(request_id,op.company_id,p_branch_id,actor) ON CONFLICT DO NOTHING;
   RETURN false;
  END IF;
  SELECT * INTO s FROM public.partner_cash_sessions WHERE id=m.session_id;
  IF ROW(s.user_id,s.branch_id,s.actor_key,m.session_id,m.kind,m.amount,m.reason,m.sale_id) IS DISTINCT FROM
    ROW(op.company_id,p_branch_id,actor,session_id,CASE WHEN p_request->>'action'='devolver' THEN 'devolucao' ELSE p_request->>'kind' END,(p_request->>'amount')::numeric,trim(p_request->>'reason'),(p_request->>'saleId')::uuid)
    OR (p_request->>'paymentMethod' IS NOT NULL AND m.payment_method IS DISTINCT FROM p_request->>'paymentMethod') THEN RAISE EXCEPTION 'Conciliação exige conferência: dados divergentes'; END IF;
 ELSE RAISE EXCEPTION 'Solicitação inválida'; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION partner_cash_supervision_private.resolve_request(uuid,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION partner_cash_supervision_private.resolve_request(uuid,uuid,text,jsonb) TO authenticated;
CREATE FUNCTION public.resolve_partner_cash_request(p_branch_id uuid,p_salesperson_id uuid,p_pin text,p_request jsonb)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT partner_cash_supervision_private.resolve_request(p_branch_id,p_salesperson_id,p_pin,p_request) $$;
REVOKE ALL ON FUNCTION public.resolve_partner_cash_request(uuid,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resolve_partner_cash_request(uuid,uuid,text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
