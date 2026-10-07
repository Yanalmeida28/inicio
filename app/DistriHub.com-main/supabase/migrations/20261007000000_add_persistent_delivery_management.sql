BEGIN;

ALTER TABLE public.partner_sales
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS delivery_driver_id uuid;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.partner_sales'::regclass
      AND conname = 'partner_sales_delivery_status_check'
  ) THEN
    ALTER TABLE public.partner_sales
      ADD CONSTRAINT partner_sales_delivery_status_check
      CHECK (delivery_status IN ('pendente', 'em_rota', 'entregue', 'falhou'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.partner_sales'::regclass
      AND conname = 'partner_sales_delivery_driver_id_fkey'
  ) THEN
    ALTER TABLE public.partner_sales
      ADD CONSTRAINT partner_sales_delivery_driver_id_fkey
      FOREIGN KEY (delivery_driver_id)
      REFERENCES public.partner_salespeople(id)
      ON DELETE SET NULL;
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.execute_partner_delivery_mutation(
  p_salesperson_id uuid,
  p_pin text,
  p_sale_id uuid,
  p_status text,
  p_driver_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_operator record;
  v_sale public.partner_sales%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('pendente', 'em_rota', 'entregue', 'falhou') THEN
    RAISE EXCEPTION 'Status de entrega inválido.';
  END IF;

  SELECT * INTO v_operator
  FROM public.resolve_partner_pdv_operator(p_salesperson_id, p_pin, NULL);

  IF v_operator.role NOT IN ('administrador', 'gerente', 'logistica') THEN
    RAISE EXCEPTION 'Operador sem permissão para gerenciar entregas.';
  END IF;

  SELECT * INTO v_sale
  FROM public.partner_sales s
  WHERE s.id = p_sale_id
    AND s.user_id = v_operator.company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada nesta empresa.';
  END IF;
  IF v_sale.delivery_type IS DISTINCT FROM 'entrega' OR v_sale.status = 'cancelada' THEN
    RAISE EXCEPTION 'Esta venda não está disponível para gestão de entrega.';
  END IF;
  IF v_operator.salesperson_id IS NOT NULL
     AND v_operator.branch_id IS DISTINCT FROM v_sale.branch_id THEN
    RAISE EXCEPTION 'Acesso negado: venda pertence a outra filial.';
  END IF;

  IF v_operator.role = 'logistica' AND (
    v_sale.delivery_driver_id IS DISTINCT FROM v_operator.salesperson_id
    OR p_driver_id IS DISTINCT FROM v_operator.salesperson_id
  ) THEN
    RAISE EXCEPTION 'Entregador só pode atualizar as entregas atribuídas a ele.';
  END IF;

  IF p_driver_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.partner_salespeople sp
    WHERE sp.id = p_driver_id
      AND sp.user_id = v_operator.company_id
      AND sp.role = 'logistica'
      AND sp.active = true
      AND (sp.branch_id IS NULL OR sp.branch_id = v_sale.branch_id)
  ) THEN
    RAISE EXCEPTION 'Entregador inválido, inativo ou vinculado a outra filial.';
  END IF;

  UPDATE public.partner_sales
  SET delivery_status = p_status,
      delivery_driver_id = p_driver_id
  WHERE id = v_sale.id
    AND user_id = v_operator.company_id;

  INSERT INTO public.partner_audit_logs(id,user_id,actor_name,actor_role,action,entity_type,entity_id,details)
  VALUES(gen_random_uuid()::text,v_operator.company_id,
    COALESCE((SELECT name FROM public.partner_salespeople WHERE id=v_operator.salesperson_id),'Proprietário'),
    v_operator.role,'atualizacao_entrega','partner_sale',v_sale.id::text,
    'Entrega: ' || v_sale.delivery_status || ' → ' || p_status || '; entregador: ' || COALESCE(p_driver_id::text,'não atribuído'));

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.execute_partner_delivery_mutation(uuid, text, uuid, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_partner_delivery_mutation(uuid, text, uuid, text, uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
