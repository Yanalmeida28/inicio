BEGIN;
-- Fail fast rather than waiting behind live transactions while holding another table lock.
LOCK TABLE public.partner_invoices, public.rma_requests_v2 IN ACCESS EXCLUSIVE MODE NOWAIT;
-- Existing status-only RMAs are deliberately not assigned invented credit values.
ALTER TABLE public.rma_requests_v2
 ADD COLUMN credit_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0 AND credit_amount::text NOT IN ('NaN','Infinity','-Infinity')),
 ADD COLUMN credited_at timestamptz;
ALTER TABLE public.partner_invoices
 ADD COLUMN return_credit_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (return_credit_amount >= 0 AND return_credit_amount <= COALESCE(paid_amount,0));
CREATE TABLE public.partner_rma_credit_applications (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id),
 branch_id uuid NOT NULL REFERENCES public.partner_branches(id),
 customer_id uuid NOT NULL REFERENCES public.partner_customers(id),
 rma_id uuid NOT NULL REFERENCES public.rma_requests_v2(id) ON DELETE RESTRICT,
 invoice_id uuid NOT NULL REFERENCES public.partner_invoices(id) ON DELETE RESTRICT,
 amount numeric(14,2) NOT NULL CHECK (amount > 0 AND amount::text NOT IN ('NaN','Infinity','-Infinity')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rma_credit_application_rma ON public.partner_rma_credit_applications(rma_id);
CREATE INDEX rma_credit_application_invoice ON public.partner_rma_credit_applications(invoice_id);
CREATE INDEX rma_credit_application_customer ON public.partner_rma_credit_applications(customer_id);
CREATE INDEX rma_credit_application_branch ON public.partner_rma_credit_applications(branch_id);
CREATE INDEX rma_credit_application_owner ON public.partner_rma_credit_applications(user_id);
ALTER TABLE public.partner_rma_credit_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY rma_credit_read ON public.partner_rma_credit_applications FOR SELECT TO authenticated
 USING (user_id = (SELECT auth.uid()) OR public.partner_employee_can_access_branch(user_id,branch_id));
REVOKE ALL ON public.partner_rma_credit_applications FROM anon, authenticated;
GRANT SELECT ON public.partner_rma_credit_applications TO authenticated;

CREATE FUNCTION partner_rma_private.guard_credit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op record; sold public.partner_sales%ROWTYPE; maximum numeric;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.credit_amount <> 0 OR NEW.credited_at IS NOT NULL THEN RAISE EXCEPTION 'Credito deve ser gerado depois da reintegracao'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.credit_amount > 0 THEN
  IF NEW.credit_amount IS DISTINCT FROM OLD.credit_amount OR NEW.credited_at IS DISTINCT FROM OLD.credited_at
  THEN RAISE EXCEPTION 'Credito ja gerado e imutavel'; END IF;
 ELSIF NEW.credit_amount > 0 THEN
  PERFORM partner_subscription_private.require_actor('rma');
  SELECT * INTO op FROM public.resolve_partner_pdv_operator(NULL,NULL,NEW.branch_id);
  IF op.company_id IS DISTINCT FROM NEW.user_id OR op.role NOT IN ('administrador','gerente') THEN RAISE EXCEPTION 'Sem permissao para gerar credito'; END IF;
  IF NEW.status <> 'credito_gerado' OR OLD.status NOT IN ('reintegrado_estoque','credito_gerado')
   OR NEW.sale_id IS NULL OR NEW.customer_id IS NULL THEN RAISE EXCEPTION 'Credito exige devolucao vinculada a venda e cliente'; END IF;
  SELECT * INTO sold FROM public.partner_sales WHERE id=NEW.sale_id;
  maximum := round((sold.items->NEW.sale_item_index->>'unit_price')::numeric * NEW.quantity,2);
  IF maximum IS NULL OR NEW.credit_amount > maximum THEN RAISE EXCEPTION 'Credito excede o valor dos itens devolvidos'; END IF;
  NEW.credited_at := now();
 ELSIF NEW.credited_at IS NOT NULL OR (NEW.status='credito_gerado' AND OLD.status IS DISTINCT FROM NEW.status) THEN
  RAISE EXCEPTION 'Informe o valor do credito antes de finalizar';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION partner_rma_private.guard_credit() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zz_guard_rma_customer_credit BEFORE INSERT OR UPDATE ON public.rma_requests_v2
 FOR EACH ROW EXECUTE FUNCTION partner_rma_private.guard_credit();

CREATE FUNCTION public.grant_partner_rma_credit(p_rma_id uuid,p_amount numeric) RETURNS public.rma_requests_v2
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.rma_requests_v2%ROWTYPE; op record;
BEGIN
 PERFORM partner_subscription_private.require_actor('rma');
 IF p_amount IS NULL OR p_amount <= 0 OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_amount <> round(p_amount,2)
 THEN RAISE EXCEPTION 'Valor de credito invalido'; END IF;
 SELECT * INTO r FROM public.rma_requests_v2 WHERE id=p_rma_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Devolucao nao encontrada'; END IF;
 SELECT * INTO op FROM public.resolve_partner_pdv_operator(NULL,NULL,r.branch_id);
 IF op.company_id IS DISTINCT FROM r.user_id OR op.role NOT IN ('administrador','gerente') THEN RAISE EXCEPTION 'Sem permissao para gerar credito'; END IF;
 IF r.credit_amount > 0 THEN
  IF r.credit_amount <> p_amount THEN RAISE EXCEPTION 'Credito ja gerado com outro valor'; END IF;
  RETURN r;
 END IF;
 UPDATE public.rma_requests_v2 SET status='credito_gerado',credit_amount=p_amount,updated_at=now() WHERE id=r.id RETURNING * INTO r;
 RETURN r;
END; $$;
REVOKE ALL ON FUNCTION public.grant_partner_rma_credit(uuid,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.grant_partner_rma_credit(uuid,numeric) TO authenticated;

-- An invoice settled with a return credit releases the customer's debt, but is not cash received.
CREATE OR REPLACE FUNCTION public.capture_partner_invoice_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_before numeric:=0; v_after numeric; v_delta numeric; previous_credit numeric:=0;
BEGIN
 IF TG_OP='UPDATE' THEN
  v_before:=COALESCE(OLD.paid_amount,CASE WHEN OLD.status='paga' THEN OLD.amount ELSE 0 END);
  previous_credit:=OLD.return_credit_amount;
 END IF;
 v_after:=COALESCE(NEW.paid_amount,CASE WHEN NEW.status='paga' THEN NEW.amount ELSE 0 END);
 v_delta:=v_after-v_before-(NEW.return_credit_amount-previous_credit);
 IF v_delta <> 0 THEN
  INSERT INTO public.partner_invoice_receipts(user_id,invoice_id,branch_id,customer_id,customer_name,invoice_number,amount,occurred_at)
   VALUES(NEW.user_id,NEW.id,NEW.branch_id,NEW.customer_id,NEW.customer_name,NEW.number,v_delta,now());
 END IF;
 RETURN NEW;
END; $$;

CREATE FUNCTION public.apply_partner_rma_credit(p_rma_id uuid,p_invoice_id uuid,p_amount numeric,p_application_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.rma_requests_v2%ROWTYPE; inv public.partner_invoices%ROWTYPE; op record;
 existing public.partner_rma_credit_applications%ROWTYPE; used numeric; settled numeric;
BEGIN
 PERFORM partner_subscription_private.require_actor('financeiro');
 IF p_application_id IS NULL OR p_amount IS NULL OR p_amount <= 0 OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_amount <> round(p_amount,2)
 THEN RAISE EXCEPTION 'Valor de abatimento invalido'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_application_id::text,0));
 SELECT * INTO r FROM public.rma_requests_v2 WHERE id=p_rma_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Credito nao encontrado'; END IF;
 SELECT * INTO op FROM public.resolve_partner_pdv_operator(NULL,NULL,r.branch_id);
 IF op.company_id IS DISTINCT FROM r.user_id OR op.role NOT IN ('administrador','gerente','caixa') THEN RAISE EXCEPTION 'Sem permissao para abater credito'; END IF;
 SELECT * INTO existing FROM public.partner_rma_credit_applications WHERE id=p_application_id;
 IF FOUND THEN
  IF existing.rma_id IS DISTINCT FROM p_rma_id OR existing.invoice_id IS DISTINCT FROM p_invoice_id OR existing.amount <> p_amount
  THEN RAISE EXCEPTION 'Tentativa diverge do abatimento original'; END IF;
  RETURN existing.id;
 END IF;
 SELECT * INTO inv FROM public.partner_invoices WHERE id=p_invoice_id FOR UPDATE;
 IF NOT FOUND OR inv.user_id IS DISTINCT FROM r.user_id OR inv.branch_id IS DISTINCT FROM r.branch_id
  OR inv.customer_id IS DISTINCT FROM r.customer_id OR inv.status NOT IN ('aberta','parcial')
 THEN RAISE EXCEPTION 'Fatura deve pertencer ao mesmo cliente e filial e estar em aberto'; END IF;
 SELECT COALESCE(sum(amount),0) INTO used FROM public.partner_rma_credit_applications WHERE rma_id=r.id;
 IF r.status <> 'credito_gerado' OR r.credit_amount <= 0 OR p_amount > r.credit_amount-used THEN RAISE EXCEPTION 'Saldo de credito insuficiente'; END IF;
 IF p_amount > inv.amount-COALESCE(inv.paid_amount,0) THEN RAISE EXCEPTION 'Abatimento excede o saldo da fatura'; END IF;
 settled:=COALESCE(inv.paid_amount,0)+p_amount;
 UPDATE public.partner_invoices SET paid_amount=settled,return_credit_amount=return_credit_amount+p_amount,
  status=CASE WHEN settled=amount THEN 'paga' ELSE 'parcial' END,
  paid_at=CASE WHEN settled=amount THEN now() ELSE paid_at END WHERE id=inv.id;
 INSERT INTO public.partner_rma_credit_applications(id,user_id,branch_id,customer_id,rma_id,invoice_id,amount)
  VALUES(p_application_id,r.user_id,r.branch_id,r.customer_id,r.id,inv.id,p_amount);
 RETURN p_application_id;
END; $$;
REVOKE ALL ON FUNCTION public.apply_partner_rma_credit(uuid,uuid,numeric,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_partner_rma_credit(uuid,uuid,numeric,uuid) TO authenticated;

CREATE FUNCTION partner_rma_private.protect_credited_invoice() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF OLD.return_credit_amount > 0 AND (
  NEW.status='cancelada' OR NEW.return_credit_amount < OLD.return_credit_amount
  OR ROW(NEW.user_id,NEW.branch_id,NEW.customer_id,NEW.amount,NEW.sale_id)
   IS DISTINCT FROM ROW(OLD.user_id,OLD.branch_id,OLD.customer_id,OLD.amount,OLD.sale_id)
 ) THEN RAISE EXCEPTION 'Fatura com credito de devolucao deve preservar seu historico'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION partner_rma_private.protect_credited_invoice() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER protect_rma_credited_invoice BEFORE UPDATE ON public.partner_invoices
 FOR EACH ROW EXECUTE FUNCTION partner_rma_private.protect_credited_invoice();
COMMIT;
