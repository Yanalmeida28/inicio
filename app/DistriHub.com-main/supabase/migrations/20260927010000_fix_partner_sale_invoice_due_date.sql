-- Corrige exclusivamente a data de vencimento de títulos B2B na RPC de venda.
-- A função em produção usa SECURITY DEFINER com search_path vazio; CURRENT_DATE
-- é uma construção SQL especial e não pode ser qualificada como pg_catalog.current_date.
DO $$
DECLARE
  v_function_oid oid;
  v_definition text;
  v_fixed_definition text;
  v_occurrence_position integer;
BEGIN
  SELECT p.oid
    INTO v_function_oid
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = pg_catalog.to_regprocedure(
    'public.execute_partner_sale_mutation(uuid,text,uuid,uuid,text,jsonb,numeric,text,text,text,uuid,text,text,text,text)'
  );

  IF v_function_oid IS NULL THEN
    RAISE EXCEPTION 'execute_partner_sale_mutation com a assinatura esperada não foi encontrada';
  END IF;

  v_definition := pg_catalog.pg_get_functiondef(v_function_oid);

  v_occurrence_position := pg_catalog.strpos(
    v_definition,
    'pg_catalog.current_date+30'
  );

  IF v_occurrence_position = 0 THEN
    RAISE EXCEPTION 'A referência de data de vencimento esperada não foi encontrada na RPC de venda';
  END IF;

  IF pg_catalog.strpos(
    pg_catalog.substr(v_definition, v_occurrence_position + 1),
    'pg_catalog.current_date+30'
  ) > 0 THEN
    RAISE EXCEPTION 'A referência de data de vencimento ocorreu mais de uma vez na RPC de venda';
  END IF;

  v_fixed_definition := pg_catalog.replace(
    v_definition,
    'pg_catalog.current_date+30',
    'CURRENT_DATE + 30'
  );

  EXECUTE v_fixed_definition;
END;
$$;
