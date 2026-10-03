-- Apply together with the Caixa frontend. Existing financial/stock RPC stays intact
-- behind an authenticated cash wrapper; old sales are never assigned retroactively.
BEGIN;
CREATE SCHEMA IF NOT EXISTS partner_cash_private;
REVOKE ALL ON SCHEMA partner_cash_private FROM PUBLIC, anon, authenticated;

CREATE TABLE public.partner_cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.partner_branches(id),
  actor_key uuid NOT NULL,
  operator_id uuid REFERENCES public.partner_salespeople(id) ON DELETE RESTRICT,
  operator_name text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  opening_amount numeric(10,2) NOT NULL CHECK (opening_amount >= 0),
  counted_amount numeric(10,2),
  expected_amount numeric(12,2),
  difference numeric(12,2),
  closing_totals jsonb,
  notes text,
  authorized_by uuid,
  open_request_id uuid NOT NULL UNIQUE,
  close_request_id uuid UNIQUE,
  CHECK ((closed_at IS NULL AND counted_amount IS NULL AND expected_amount IS NULL AND difference IS NULL AND closing_totals IS NULL)
    OR (closed_at IS NOT NULL AND counted_amount >= 0 AND expected_amount IS NOT NULL AND difference IS NOT NULL AND closing_totals IS NOT NULL))
);
CREATE UNIQUE INDEX partner_cash_one_open ON public.partner_cash_sessions(user_id,branch_id,actor_key) WHERE closed_at IS NULL;
CREATE INDEX partner_cash_history ON public.partner_cash_sessions(user_id,branch_id,actor_key,opened_at DESC);

CREATE TABLE public.partner_cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.partner_cash_sessions(id),
  kind text NOT NULL CHECK (kind IN ('venda','estorno','sangria','suprimento')),
  payment_method text NOT NULL CHECK (payment_method IN ('dinheiro','pix','cartao','faturado')),
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  reason text NOT NULL,
  sale_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  request_id uuid UNIQUE,
  authorized_by uuid,
  CHECK (kind IN ('venda','estorno') OR (payment_method='dinheiro' AND amount > 0)),
  CHECK ((kind IN ('venda','estorno') AND sale_id IS NOT NULL) OR (kind IN ('sangria','suprimento') AND sale_id IS NULL))
);
CREATE UNIQUE INDEX partner_cash_sale_once ON public.partner_cash_movements(sale_id,kind) WHERE sale_id IS NOT NULL;
CREATE INDEX partner_cash_movements_session ON public.partner_cash_movements(session_id,created_at);
ALTER TABLE public.partner_cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_cash_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_cash_sessions,public.partner_cash_movements FROM PUBLIC,anon,authenticated;
-- No direct client writes or reads. Authenticated RPCs validate company, branch,
-- linked identity / operator PIN; amounts and closing snapshots are server computed.

CREATE FUNCTION partner_cash_private.totals(p_session uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object(
   'dinheiro',COALESCE(sum(CASE WHEN payment_method='dinheiro' THEN amount * CASE WHEN kind IN ('estorno','sangria') THEN -1 ELSE 1 END ELSE 0 END),0),
   'pix',COALESCE(sum(CASE WHEN payment_method='pix' THEN amount * CASE WHEN kind='estorno' THEN -1 ELSE 1 END ELSE 0 END),0),
   'cartao',COALESCE(sum(CASE WHEN payment_method='cartao' THEN amount * CASE WHEN kind='estorno' THEN -1 ELSE 1 END ELSE 0 END),0),
   'faturado',COALESCE(sum(CASE WHEN payment_method='faturado' THEN amount * CASE WHEN kind='estorno' THEN -1 ELSE 1 END ELSE 0 END),0)
 ) FROM public.partner_cash_movements WHERE session_id=p_session
$$;

CREATE FUNCTION public.read_partner_cash_register(p_branch_id uuid,p_salesperson_id uuid DEFAULT NULL,p_pin text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op record; v_sessions jsonb; v_movements jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
 SELECT * INTO op FROM public.resolve_partner_pdv_operator(p_salesperson_id,p_pin,p_branch_id);
 IF op.role NOT IN ('administrador','gerente','caixa','vendedor') THEN RAISE EXCEPTION 'Sem permissão para acessar o caixa'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.partner_branches WHERE id=p_branch_id AND user_id=op.company_id) THEN RAISE EXCEPTION 'Filial inválida'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.opened_at DESC),'[]'::jsonb) INTO v_sessions
 FROM public.partner_cash_sessions s WHERE s.user_id=op.company_id AND s.branch_id=p_branch_id AND (op.role IN ('administrador','gerente') OR s.actor_key=COALESCE(op.salesperson_id,op.company_id));
 SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC),'[]'::jsonb) INTO v_movements
 FROM public.partner_cash_movements m JOIN public.partner_cash_sessions s ON s.id=m.session_id
 WHERE s.user_id=op.company_id AND s.branch_id=p_branch_id AND (op.role IN ('administrador','gerente') OR s.actor_key=COALESCE(op.salesperson_id,op.company_id));
 RETURN jsonb_build_object('sessions',v_sessions,'movements',v_movements,'actor_key',COALESCE(op.salesperson_id,op.company_id));
END $$;

CREATE FUNCTION public.mutate_partner_cash_register(
 p_action text,p_branch_id uuid,p_salesperson_id uuid DEFAULT NULL,p_pin text DEFAULT NULL,
 p_session_id uuid DEFAULT NULL,p_amount numeric DEFAULT NULL,p_kind text DEFAULT NULL,p_reason text DEFAULT NULL,
 p_supervisor_id uuid DEFAULT NULL,p_supervisor_pin text DEFAULT NULL,p_request_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op record; supervisor record; s public.partner_cash_sessions%ROWTYPE;
 v_actor uuid; v_name text; v_totals jsonb; v_expected numeric; v_authorizer uuid; v_existing public.partner_cash_movements%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
 SELECT * INTO op FROM public.resolve_partner_pdv_operator(p_salesperson_id,p_pin,p_branch_id);
 IF op.role NOT IN ('administrador','gerente','caixa','vendedor') THEN RAISE EXCEPTION 'Sem permissão para operar o caixa'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.partner_branches WHERE id=p_branch_id AND user_id=op.company_id) THEN RAISE EXCEPTION 'Filial inválida'; END IF;
 IF p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_amount<0 OR p_amount>99999999.99 OR round(p_amount,2)<>p_amount THEN RAISE EXCEPTION 'Valor inválido'; END IF;
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'Identificador da operação obrigatório'; END IF;
 IF length(COALESCE(p_reason,''))>500 THEN RAISE EXCEPTION 'Observação muito longa'; END IF;
 v_actor:=COALESCE(op.salesperson_id,op.company_id);
 -- Serializes opening, closing and checkout for this company/branch/operator.
 PERFORM pg_advisory_xact_lock(hashtextextended(op.company_id::text||p_branch_id::text||v_actor::text,1));
 IF p_action='abrir' THEN
   SELECT * INTO s FROM public.partner_cash_sessions WHERE open_request_id=p_request_id;
   IF FOUND THEN
     IF ROW(s.user_id,s.branch_id,s.actor_key,s.opening_amount) IS DISTINCT FROM ROW(op.company_id,p_branch_id,v_actor,p_amount) THEN RAISE EXCEPTION 'Operação repetida com dados diferentes'; END IF;
     RETURN s.id;
   END IF;
   SELECT * INTO s FROM public.partner_cash_sessions WHERE user_id=op.company_id AND branch_id=p_branch_id AND actor_key=v_actor AND closed_at IS NULL FOR UPDATE;
   IF FOUND THEN RAISE EXCEPTION 'Este operador já possui um caixa aberto nesta filial'; END IF;
   SELECT name INTO v_name FROM public.partner_salespeople WHERE id=op.salesperson_id;
   INSERT INTO public.partner_cash_sessions(user_id,branch_id,actor_key,operator_id,operator_name,opening_amount,open_request_id)
   VALUES(op.company_id,p_branch_id,v_actor,op.salesperson_id,COALESCE(v_name,'Administrador'),p_amount,p_request_id) RETURNING id INTO p_session_id;
   RETURN p_session_id;
 END IF;
 SELECT * INTO s FROM public.partner_cash_sessions WHERE id=p_session_id AND user_id=op.company_id AND branch_id=p_branch_id AND actor_key=v_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Caixa não pertence ao operador ou à filial'; END IF;
 IF p_action='movimentar' THEN
   SELECT * INTO v_existing FROM public.partner_cash_movements WHERE request_id=p_request_id;
   IF FOUND THEN
     IF ROW(v_existing.session_id,v_existing.kind,v_existing.amount,v_existing.reason) IS DISTINCT FROM ROW(s.id,p_kind,p_amount,trim(p_reason)) THEN RAISE EXCEPTION 'Operação repetida com dados diferentes'; END IF;
     RETURN s.id;
   END IF;
 END IF;
 IF s.closed_at IS NOT NULL THEN
   IF p_action='fechar' AND s.close_request_id=p_request_id AND s.counted_amount=p_amount AND s.notes IS NOT DISTINCT FROM NULLIF(trim(p_reason),'') THEN RETURN s.id; END IF;
   RAISE EXCEPTION 'Este caixa já está fechado';
 END IF;
 v_totals:=partner_cash_private.totals(s.id);
 v_expected:=s.opening_amount+(v_totals->>'dinheiro')::numeric;
 IF p_action='movimentar' AND (p_kind NOT IN ('sangria','suprimento') OR p_kind IS NULL OR p_amount<=0 OR length(trim(COALESCE(p_reason,'')))=0) THEN RAISE EXCEPTION 'Informe tipo, valor e motivo da movimentação'; END IF;
 IF (p_action='movimentar' AND p_kind='sangria') OR (p_action='fechar' AND p_amount<>v_expected) THEN
   IF op.role IN ('administrador','gerente') AND p_supervisor_id IS NULL THEN v_authorizer:=v_actor;
   ELSE
     IF p_supervisor_id IS NULL THEN RAISE EXCEPTION 'Esta operação exige autorização de gerente ou administrador'; END IF;
     -- Owner PIN switching or a linked manager must satisfy the existing resolver.
     -- For employee cashiers, authorize a same-company manager PIN explicitly.
     SELECT sp.id,sp.user_id,sp.role,sp.branch_id INTO supervisor FROM public.partner_salespeople sp
       WHERE sp.id=p_supervisor_id AND sp.user_id=op.company_id AND sp.active=true
       AND sp.role IN ('administrador','gerente') AND (sp.role='administrador' OR sp.branch_id=p_branch_id)
       AND public.verify_partner_salesperson_pin(p_supervisor_pin,sp.pin_hash);
     IF NOT FOUND THEN RAISE EXCEPTION 'Responsável inválido ou PIN incorreto'; END IF;
     v_authorizer:=supervisor.id;
   END IF;
 END IF;
 IF p_action='movimentar' THEN
   IF p_request_id IS NULL THEN RAISE EXCEPTION 'Identificador da operação obrigatório'; END IF;
   IF p_kind='sangria' AND p_amount>v_expected THEN RAISE EXCEPTION 'Retirada maior que o dinheiro disponível'; END IF;
   INSERT INTO public.partner_cash_movements(session_id,kind,payment_method,amount,reason,request_id,authorized_by)
   VALUES(s.id,p_kind,'dinheiro',p_amount,trim(p_reason),p_request_id,v_authorizer);
 ELSIF p_action='fechar' THEN
   IF p_amount<>v_expected AND length(trim(COALESCE(p_reason,'')))=0 THEN RAISE EXCEPTION 'Justifique a diferença do fechamento'; END IF;
   UPDATE public.partner_cash_sessions SET closed_at=now(),counted_amount=p_amount,expected_amount=v_expected,difference=p_amount-v_expected,
     closing_totals=v_totals,notes=NULLIF(trim(p_reason),''),authorized_by=v_authorizer,close_request_id=p_request_id WHERE id=s.id;
 ELSE RAISE EXCEPTION 'Ação inválida'; END IF;
 RETURN s.id;
END $$;

-- Keep the authoritative sale implementation, including immutable retries,
-- stock, pricing and B2B credit, out of direct client reach.
ALTER FUNCTION public.execute_partner_sale_mutation(uuid,text,uuid,uuid,text,jsonb,numeric,text,text,text,uuid,text,text,text,text,uuid) SET SCHEMA partner_cash_private;
REVOKE ALL ON FUNCTION partner_cash_private.execute_partner_sale_mutation(uuid,text,uuid,uuid,text,jsonb,numeric,text,text,text,uuid,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.execute_partner_sale_mutation(
 p_salesperson_id uuid,p_pin text,p_sale_id uuid,p_customer_id uuid,p_customer_name text,p_items jsonb,p_total numeric,
 p_imei text,p_serial_number text,p_payment_method text,p_branch_id uuid,p_status text,p_origin text,p_customer_type text,p_delivery_type text,
 p_commercial_salesperson_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op record; s public.partner_cash_sessions%ROWTYPE; v_id uuid; v_old_status text; v_actor uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
 SELECT * INTO op FROM public.resolve_partner_pdv_operator(p_salesperson_id,p_pin,p_branch_id);
 v_actor:=COALESCE(op.salesperson_id,op.company_id);
 PERFORM pg_advisory_xact_lock(hashtextextended(op.company_id::text||p_branch_id::text||v_actor::text,1));
 -- Coordinate with existing idempotent sale/delete locks before reading status.
 IF p_sale_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(p_sale_id::text,0)); END IF;
 SELECT status INTO v_old_status FROM public.partner_sales WHERE id=p_sale_id;
 IF p_status='cancelada' THEN
   -- Same order as checkout: cash session before the authoritative stock locks.
   -- Otherwise a cancellation could hold stock while waiting for a checkout's cash row.
   PERFORM 1 FROM public.partner_cash_sessions cs JOIN public.partner_cash_movements cm ON cm.session_id=cs.id
   WHERE cm.sale_id=p_sale_id AND cm.kind='venda' FOR UPDATE OF cs;
 END IF;
 IF p_status='concluida' AND v_old_status IS DISTINCT FROM 'concluida' THEN
   SELECT * INTO s FROM public.partner_cash_sessions WHERE user_id=op.company_id AND branch_id=p_branch_id AND actor_key=v_actor AND closed_at IS NULL FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Abra o caixa desta filial e operador antes de finalizar a venda'; END IF;
   IF p_payment_method IS NULL OR p_payment_method NOT IN ('dinheiro','pix','cartao','faturado') THEN RAISE EXCEPTION 'Forma de pagamento inválida'; END IF;
 END IF;
 v_id:=partner_cash_private.execute_partner_sale_mutation(p_salesperson_id,p_pin,p_sale_id,p_customer_id,p_customer_name,p_items,p_total,
   p_imei,p_serial_number,p_payment_method,p_branch_id,p_status,p_origin,p_customer_type,p_delivery_type,p_commercial_salesperson_id);
 IF s.id IS NOT NULL THEN
   INSERT INTO public.partner_cash_movements(session_id,kind,payment_method,amount,reason,sale_id)
   VALUES(s.id,'venda',p_payment_method,p_total,'Venda finalizada',v_id);
 END IF;
 RETURN v_id;
END $$;

CREATE FUNCTION partner_cash_private.reverse_sale() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.partner_cash_sessions%ROWTYPE; m public.partner_cash_movements%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' AND NOT (OLD.status='concluida' AND NEW.status='cancelada') THEN RETURN NEW; END IF;
 SELECT * INTO m FROM public.partner_cash_movements WHERE sale_id=OLD.id AND kind='venda';
 IF FOUND AND NOT EXISTS(SELECT 1 FROM public.partner_cash_movements WHERE sale_id=OLD.id AND kind='estorno') THEN
   SELECT * INTO s FROM public.partner_cash_sessions WHERE id=m.session_id FOR UPDATE;
   IF s.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Venda vinculada a caixa fechado. O fechamento é imutável; não é possível cancelar ou apagar esta venda'; END IF;
   INSERT INTO public.partner_cash_movements(session_id,kind,payment_method,amount,reason,sale_id)
   VALUES(m.session_id,'estorno',m.payment_method,m.amount,'Cancelamento ou exclusão de venda',OLD.id);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER partner_cash_reverse_sale BEFORE UPDATE OF status OR DELETE ON public.partner_sales FOR EACH ROW EXECUTE FUNCTION partner_cash_private.reverse_sale();

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA partner_cash_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.read_partner_cash_register(uuid,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.mutate_partner_cash_register(text,uuid,uuid,text,uuid,numeric,text,text,uuid,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.execute_partner_sale_mutation(uuid,text,uuid,uuid,text,jsonb,numeric,text,text,text,uuid,text,text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_partner_cash_register(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_partner_cash_register(text,uuid,uuid,text,uuid,numeric,text,text,uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_partner_sale_mutation(uuid,text,uuid,uuid,text,jsonb,numeric,text,text,text,uuid,text,text,text,text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
