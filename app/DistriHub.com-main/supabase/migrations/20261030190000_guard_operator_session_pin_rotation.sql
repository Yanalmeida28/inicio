-- Recheck the PIN against the exact hash being saved. A concurrent PIN reset
-- between initial authorization and insertion must not authenticate the new PIN.
DO $$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('partner_access_private.create_operator_session(uuid,text)'::regprocedure);
 IF strpos(definition,'FROM public.partner_salespeople s WHERE s.id=op.salesperson_id AND s.active=true;')=0
 THEN RAISE EXCEPTION 'Unexpected operator session definition'; END IF;
 EXECUTE replace(definition,
  'FROM public.partner_salespeople s WHERE s.id=op.salesperson_id AND s.active=true;',
  'FROM public.partner_salespeople s WHERE s.id=op.salesperson_id AND s.active=true AND public.verify_partner_salesperson_pin(p_pin,s.pin_hash);');
END; $$;
