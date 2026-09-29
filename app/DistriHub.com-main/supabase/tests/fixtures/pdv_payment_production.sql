-- Read-only production function snapshot; no data or credentials.
CREATE OR REPLACE FUNCTION public.record_partner_invoice_payment(p_invoice_id uuid, p_amount numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_auth uuid := (SELECT auth.uid());
  v_invoice public.partner_invoices%ROWTYPE;
  v_new_paid numeric;
  v_new_status text;
  v_actor_name text;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado';
  END IF;
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Fatura invalida';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valor de recebimento invalido';
  END IF;

  SELECT * INTO v_invoice
  FROM public.partner_invoices
  WHERE id = p_invoice_id
    AND user_id = v_auth
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fatura nao encontrada';
  END IF;
  IF v_invoice.status = 'cancelada' THEN
    RAISE EXCEPTION 'Fatura cancelada nao pode receber pagamento';
  END IF;
  IF p_amount > (v_invoice.amount - COALESCE(v_invoice.paid_amount,0)) THEN
    RAISE EXCEPTION 'Valor excede o saldo da fatura';
  END IF;

  v_new_paid := round(COALESCE(v_invoice.paid_amount,0) + p_amount, 2);
  IF v_new_paid >= v_invoice.amount THEN
    v_new_paid := v_invoice.amount;
    v_new_status := 'paga';
  ELSE
    v_new_status := 'parcial';
  END IF;

  UPDATE public.partner_invoices
  SET paid_amount = v_new_paid,
      status = v_new_status,
      paid_at = CASE WHEN v_new_status = 'paga' THEN pg_catalog.now() ELSE paid_at END
  WHERE id = v_invoice.id
    AND user_id = v_auth;

  SELECT COALESCE(NULLIF(trim(pp.account_name),''), NULLIF(trim(pp.business_name),''), 'Administrador')
    INTO v_actor_name
  FROM public.partner_profiles pp
  WHERE pp.user_id = v_auth;
  v_actor_name := COALESCE(v_actor_name, 'Administrador');

  INSERT INTO public.partner_audit_logs(
    id,user_id,actor_name,actor_role,action,entity_type,entity_id,details
  ) VALUES (
    pg_catalog.gen_random_uuid()::text,
    v_auth,
    v_actor_name,
    'administrador',
    'recebimento_fatura',
    'partner_invoice',
    v_invoice.id::text,
    'Recebimento de R$ ' || p_amount::text || '; saldo anterior R$ ' ||
      (v_invoice.amount - COALESCE(v_invoice.paid_amount,0))::text ||
      '; saldo atual R$ ' || (v_invoice.amount - v_new_paid)::text
  );

  RETURN v_invoice.id;
END;
$function$
;
REVOKE ALL ON FUNCTION public.record_partner_invoice_payment(uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_partner_invoice_payment(uuid,numeric) TO authenticated,service_role;
