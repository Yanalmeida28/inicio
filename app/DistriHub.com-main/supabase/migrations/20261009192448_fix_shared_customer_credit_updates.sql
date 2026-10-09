-- Preserve shared customers while saving their credit limit and billed-sale permission.
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.execute_partner_customer_mutation(uuid,text,uuid,uuid,text,text,text,text,date,text,text,text,text,text,text,numeric,boolean)'::regprocedure)) <> 'd9b4c2853da35fff1a912b37e6dca2fc' THEN
    RAISE EXCEPTION 'Customer mutation changed since review; reconcile before applying';
  END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.execute_partner_customer_mutation(p_salesperson_id uuid, p_pin text, p_customer_id uuid, p_branch_id uuid, p_name text, p_document text, p_phone text, p_email text, p_birthday date, p_address text, p_neighborhood text, p_city text, p_device_model text, p_notes text, p_customer_type text, p_credit_limit numeric, p_allow_credit boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_operator record;
  v_existing_user_id uuid;
  v_existing_branch_id uuid;
  v_target_id uuid := COALESCE(p_customer_id, pg_catalog.gen_random_uuid());
  v_person_type text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Nao autenticado.'; END IF;
  IF p_name IS NULL OR pg_catalog.btrim(p_name) = '' THEN RAISE EXCEPTION 'Nome do cliente e obrigatorio.'; END IF;
  IF p_credit_limit IS NOT NULL AND p_credit_limit < 0 THEN RAISE EXCEPTION 'Limite de credito nao pode ser negativo.'; END IF;

  SELECT user_id, branch_id INTO v_existing_user_id, v_existing_branch_id
  FROM public.partner_customers WHERE id = v_target_id FOR UPDATE;
  IF p_customer_id IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'Cliente nao encontrado nesta empresa.'; END IF;

  SELECT * INTO v_operator FROM public.resolve_partner_operator(p_salesperson_id, p_pin, COALESCE(p_branch_id,v_existing_branch_id));


  v_person_type := CASE WHEN pg_catalog.length(regexp_replace(COALESCE(p_document,''), '[^0-9]', '', 'g')) > 11 THEN 'PJ' ELSE 'PF' END;


  IF v_existing_user_id IS NOT NULL AND v_existing_user_id <> v_operator.company_id THEN
    RAISE EXCEPTION 'Acesso negado: cliente pertence a outra empresa.';
  END IF;
  IF v_operator.role <> 'administrador' AND v_existing_branch_id IS NOT NULL AND v_existing_branch_id <> v_operator.branch_id THEN
    RAISE EXCEPTION 'Acesso negado: voce nao pode alterar clientes de outra filial.';
  END IF;

  -- Company-wide customers remain shared. Only the company owner may edit them without branch context.
  IF v_operator.branch_id IS NULL THEN
    IF v_existing_user_id IS NULL OR v_existing_branch_id IS NOT NULL
       OR v_operator.role <> 'administrador' OR (SELECT auth.uid()) IS DISTINCT FROM v_operator.company_id THEN
      RAISE EXCEPTION 'E necessario informar uma filial valida.';
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM public.partner_branches b WHERE b.id=v_operator.branch_id AND b.user_id=v_operator.company_id) THEN
    RAISE EXCEPTION 'Filial invalida.';
  END IF;

  IF v_existing_user_id IS NULL THEN
    INSERT INTO public.partner_customers (
      id,user_id,branch_id,name,document,person_type,phone,email,birthday,address,
      neighborhood,city,device_model,notes,customer_type,credit_limit,allow_credit
    ) VALUES (
      v_target_id,v_operator.company_id,v_operator.branch_id,pg_catalog.btrim(p_name),p_document,v_person_type,
      p_phone,p_email,p_birthday,p_address,p_neighborhood,p_city,p_device_model,p_notes,
      COALESCE(p_customer_type,'varejo'),GREATEST(COALESCE(p_credit_limit,0),0),COALESCE(p_allow_credit,false)
    );
  ELSE
    UPDATE public.partner_customers SET
      branch_id=CASE WHEN v_existing_branch_id IS NULL THEN NULL ELSE v_operator.branch_id END,
      name=pg_catalog.btrim(p_name),
      document=p_document,
      person_type=v_person_type,
      phone=p_phone,
      email=p_email,
      birthday=p_birthday,
      address=p_address,
      neighborhood=p_neighborhood,
      city=p_city,
      device_model=p_device_model,
      notes=p_notes,
      customer_type=COALESCE(p_customer_type,customer_type),
      credit_limit=GREATEST(COALESCE(p_credit_limit,credit_limit),0),
      allow_credit=COALESCE(p_allow_credit,allow_credit)
    WHERE id=v_target_id AND user_id=v_operator.company_id;
  END IF;

  RETURN v_target_id;
END;
$function$
;
REVOKE ALL ON FUNCTION public.execute_partner_customer_mutation(uuid,text,uuid,uuid,text,text,text,text,date,text,text,text,text,text,text,numeric,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.execute_partner_customer_mutation(uuid,text,uuid,uuid,text,text,text,text,date,text,text,text,text,text,text,numeric,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
