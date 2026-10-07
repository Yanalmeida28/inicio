-- Owner-only payables, matching the existing invoice receipt authorization.
CREATE TABLE public.partner_payables (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 branch_id uuid NOT NULL REFERENCES public.partner_branches(id),
 supplier_id uuid REFERENCES public.partner_suppliers(id),
 description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 200),
 creditor_name text NOT NULL CHECK (length(trim(creditor_name)) BETWEEN 1 AND 200),
 category text NOT NULL CHECK (category IN ('fornecedor','aluguel','energia','salarios','impostos','outros')),
 amount numeric(14,2) NOT NULL CHECK (amount > 0 AND amount::text NOT IN ('NaN','Infinity','-Infinity')),
 paid_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0 AND paid_amount <= amount),
 due_date date NOT NULL,
 status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','parcial','paga','cancelada')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX partner_payables_owner_due ON public.partner_payables(user_id, due_date, id);
CREATE TABLE public.partner_payable_payments (
 id uuid PRIMARY KEY,
 payable_id uuid NOT NULL REFERENCES public.partner_payables(id),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 amount numeric(14,2) NOT NULL CHECK (amount > 0 AND amount::text NOT IN ('NaN','Infinity','-Infinity')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX partner_payable_payments_account ON public.partner_payable_payments(payable_id);
ALTER TABLE public.partner_payables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_payable_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY payables_owner_read ON public.partner_payables FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY payable_payments_owner_read ON public.partner_payable_payments FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.partner_payables, public.partner_payable_payments FROM anon, authenticated;
GRANT SELECT ON public.partner_payables, public.partner_payable_payments TO authenticated;

CREATE FUNCTION public.create_partner_payable(p_id uuid, p_branch_id uuid, p_supplier_id uuid,
 p_description text, p_creditor_name text, p_category text, p_amount numeric, p_due_date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_auth uuid := (SELECT auth.uid()); v_existing public.partner_payables%ROWTYPE;
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
 IF p_id IS NULL OR p_due_date IS NULL OR p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity')
 OR p_amount <= 0 OR p_amount <> round(p_amount,2) THEN RAISE EXCEPTION 'Valor ou vencimento invalido'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.partner_branches WHERE id=p_branch_id AND user_id=v_auth)
 THEN RAISE EXCEPTION 'Filial nao pertence ao proprietario autenticado'; END IF;
 IF p_supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.partner_suppliers WHERE id=p_supplier_id AND user_id=v_auth)
 THEN RAISE EXCEPTION 'Fornecedor nao pertence a loja'; END IF;
 INSERT INTO public.partner_payables(id,user_id,branch_id,supplier_id,description,creditor_name,category,amount,due_date)
 VALUES(p_id,v_auth,p_branch_id,p_supplier_id,trim(p_description),trim(p_creditor_name),p_category,p_amount,p_due_date)
 ON CONFLICT(id) DO NOTHING;
 SELECT * INTO v_existing FROM public.partner_payables WHERE id=p_id AND user_id=v_auth;
 IF NOT FOUND OR v_existing.branch_id IS DISTINCT FROM p_branch_id OR v_existing.supplier_id IS DISTINCT FROM p_supplier_id
 OR v_existing.description IS DISTINCT FROM trim(p_description) OR v_existing.creditor_name IS DISTINCT FROM trim(p_creditor_name)
 OR v_existing.category IS DISTINCT FROM p_category OR v_existing.amount IS DISTINCT FROM p_amount
 OR v_existing.due_date IS DISTINCT FROM p_due_date THEN RAISE EXCEPTION 'Tentativa de cadastro diverge da original'; END IF;
 RETURN p_id;
END;
$$;
CREATE FUNCTION public.record_partner_payable_payment(p_payable_id uuid,p_amount numeric,p_payment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_auth uuid := (SELECT auth.uid()); v_account public.partner_payables%ROWTYPE;
 v_payment public.partner_payable_payments%ROWTYPE; v_paid numeric;
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
 IF p_payment_id IS NULL OR p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity')
 OR p_amount <= 0 OR p_amount <> round(p_amount,2) THEN RAISE EXCEPTION 'Pagamento invalido'; END IF;
 SELECT * INTO v_account FROM public.partner_payables WHERE id=p_payable_id AND user_id=v_auth FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conta nao encontrada ou acesso negado'; END IF;
 SELECT * INTO v_payment FROM public.partner_payable_payments WHERE id=p_payment_id;
 IF FOUND THEN
   IF v_payment.user_id=v_auth AND v_payment.payable_id=p_payable_id AND v_payment.amount=p_amount THEN RETURN p_payable_id; END IF;
   RAISE EXCEPTION 'Pagamento diverge da tentativa original';
 END IF;
 IF v_account.status NOT IN ('aberta','parcial') OR p_amount > v_account.amount-v_account.paid_amount
 THEN RAISE EXCEPTION 'Pagamento excede saldo ou conta encerrada'; END IF;
 INSERT INTO public.partner_payable_payments(id,payable_id,user_id,amount) VALUES(p_payment_id,p_payable_id,v_auth,p_amount);
 v_paid := v_account.paid_amount+p_amount;
 UPDATE public.partner_payables SET paid_amount=v_paid,status=CASE WHEN v_paid=amount THEN 'paga' ELSE 'parcial' END WHERE id=p_payable_id;
 RETURN p_payable_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_partner_payable(uuid,uuid,uuid,text,text,text,numeric,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_partner_payable_payment(uuid,numeric,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_partner_payable(uuid,uuid,uuid,text,text,text,numeric,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_partner_payable_payment(uuid,numeric,uuid) TO authenticated;
