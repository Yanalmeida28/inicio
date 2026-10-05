BEGIN;

-- Keep the strict validator for legacy quotes and callers. The new private
-- validator receives permission only from the authenticated sale operator.
DO $migration$
DECLARE
  v_definition text;
  v_original text;
  v_old_check text := $old$    IF (v_item->>'unit_price')::numeric IS DISTINCT FROM v_price THEN
      RAISE EXCEPTION 'Preco unitario diverge do preco autorizado';
    END IF;$old$;
  v_new_check text := $new$    IF (v_item->>'unit_price')::numeric IS DISTINCT FROM v_price THEN
      IF NOT COALESCE(p_allow_override,false) THEN
        RAISE EXCEPTION 'Somente o gerente ou o dono da loja pode alterar o preco da venda';
      END IF;
      v_price := (v_item->>'unit_price')::numeric;
    END IF;
    IF v_price::text IN ('NaN','Infinity','-Infinity') OR v_price<0
      OR v_price<>round(v_price,2) OR v_price>99999999.99 THEN
      RAISE EXCEPTION 'Preco negociado invalido';
    END IF;$new$;
  v_old_call text := $call$public.validate_partner_pdv_prices(v_company_id,p_branch_id,p_customer_id,COALESCE(p_customer_type,'varejo'),p_items,p_total)$call$;
  v_new_call text := $call$partner_cash_private.validate_partner_pdv_negotiated_prices(v_company_id,p_branch_id,p_customer_id,COALESCE(p_customer_type,'varejo'),p_items,p_total,
    (v_role='gerente' OR (v_role='administrador' AND (SELECT auth.uid())=v_company_id))
    AND NOT COALESCE(v_old_status='pre_venda' AND p_status='concluida',false))$call$;
BEGIN
  v_definition := pg_get_functiondef('public.validate_partner_pdv_prices(uuid,uuid,uuid,text,jsonb,numeric)'::regprocedure);
  IF position(v_old_check IN v_definition)=0 OR position('p_total numeric)' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Validador de precos divergente; revisar antes de aplicar';
  END IF;
  v_definition := replace(v_definition,'public.validate_partner_pdv_prices(', 'partner_cash_private.validate_partner_pdv_negotiated_prices(');
  v_definition := replace(v_definition,'p_total numeric)', 'p_total numeric, p_allow_override boolean)');
  v_definition := replace(v_definition,v_old_check,v_new_check);
  EXECUTE v_definition;

  v_original := pg_get_functiondef('partner_cash_private.execute_partner_sale_mutation(uuid,text,uuid,uuid,text,jsonb,numeric,text,text,text,uuid,text,text,text,text,uuid)'::regprocedure);
  IF (length(v_original)-length(replace(v_original,v_old_call,'')))/length(v_old_call)<>2 THEN
    RAISE EXCEPTION 'RPC de venda divergente; revisar antes de aplicar';
  END IF;
  EXECUTE replace(v_original,v_old_call,v_new_call);
END;
$migration$;

REVOKE ALL ON FUNCTION partner_cash_private.validate_partner_pdv_negotiated_prices(uuid,uuid,uuid,text,jsonb,numeric,boolean) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
