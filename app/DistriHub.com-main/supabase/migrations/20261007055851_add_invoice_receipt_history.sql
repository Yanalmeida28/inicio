CREATE TABLE public.partner_invoice_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 invoice_id uuid NOT NULL REFERENCES public.partner_invoices(id),
 branch_id uuid REFERENCES public.partner_branches(id),
 customer_id uuid,
 customer_name text NOT NULL,
 invoice_number text NOT NULL,
 amount numeric(14,2) NOT NULL CHECK (amount <> 0 AND amount::text NOT IN ('NaN','Infinity','-Infinity')),
 occurred_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX partner_invoice_receipts_owner_time ON public.partner_invoice_receipts(user_id,occurred_at,id);
CREATE INDEX partner_invoice_receipts_invoice ON public.partner_invoice_receipts(invoice_id);
ALTER TABLE public.partner_invoice_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_receipts_owner_read ON public.partner_invoice_receipts FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
REVOKE ALL ON public.partner_invoice_receipts FROM anon,authenticated;
GRANT SELECT ON public.partner_invoice_receipts TO authenticated;
-- Existing totals are retained without inventing a date for partial receipts.
INSERT INTO public.partner_invoice_receipts(user_id,invoice_id,branch_id,customer_id,customer_name,invoice_number,amount,occurred_at)
SELECT user_id,id,branch_id,customer_id,customer_name,number,
 COALESCE(paid_amount,CASE WHEN status='paga' THEN amount ELSE 0 END),NULL
FROM public.partner_invoices
WHERE status <> 'cancelada' AND COALESCE(paid_amount,CASE WHEN status='paga' THEN amount ELSE 0 END) > 0;
CREATE FUNCTION public.capture_partner_invoice_receipt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_before numeric := 0; v_after numeric; v_delta numeric;
BEGIN
 IF TG_OP='UPDATE' THEN v_before := COALESCE(OLD.paid_amount,CASE WHEN OLD.status='paga' THEN OLD.amount ELSE 0 END); END IF;
 v_after := COALESCE(NEW.paid_amount,CASE WHEN NEW.status='paga' THEN NEW.amount ELSE 0 END);
 v_delta := v_after-v_before;
 IF v_delta <> 0 THEN
 INSERT INTO public.partner_invoice_receipts(user_id,invoice_id,branch_id,customer_id,customer_name,invoice_number,amount,occurred_at)
 VALUES(NEW.user_id,NEW.id,NEW.branch_id,NEW.customer_id,NEW.customer_name,NEW.number,v_delta,pg_catalog.now());
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_partner_invoice_receipt() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER capture_partner_invoice_receipt AFTER INSERT OR UPDATE OF paid_amount,status ON public.partner_invoices FOR EACH ROW EXECUTE FUNCTION public.capture_partner_invoice_receipt();
