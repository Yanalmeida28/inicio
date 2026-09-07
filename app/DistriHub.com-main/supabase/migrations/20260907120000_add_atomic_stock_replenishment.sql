-- Reposição incremental de estoque com movimento de entrada atômico.
-- Não aplicar automaticamente: revisar e executar via Supabase após aprovação.

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.partner_branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_user_branch
  ON public.stock_movements(user_id, branch_id);

CREATE OR REPLACE FUNCTION public.execute_partner_stock_replenishment(
  p_salesperson_id uuid,
  p_pin text,
  p_product_id uuid,
  p_branch_id uuid,
  p_quantity integer,
  p_unit_cost numeric DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_operator record;
  v_product record;
  v_new_stock integer;
  v_reason text := COALESCE(NULLIF(pg_catalog.trim(p_reason), ''), 'Reposição de estoque');
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'A quantidade de reposição deve ser maior que zero.';
  END IF;
  IF p_unit_cost IS NOT NULL AND p_unit_cost < 0 THEN
    RAISE EXCEPTION 'O custo unitário não pode ser negativo.';
  END IF;
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'A filial da reposição é obrigatória.';
  END IF;

  SELECT * INTO v_operator
  FROM public.resolve_partner_operator(p_salesperson_id, p_pin, p_branch_id);

  SELECT p.id, p.user_id, p.branch_id, p.name, p.stock
    INTO v_product
  FROM public.partner_products p
  WHERE p.id = p_product_id
    AND p.user_id = v_operator.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado nesta empresa.';
  END IF;
  IF v_product.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'O produto não pertence à filial selecionada.';
  END IF;
  IF v_operator.role <> 'administrador'
     AND v_operator.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Acesso negado: operador vinculado a outra filial.';
  END IF;

  v_new_stock := COALESCE(v_product.stock, 0) + p_quantity;

  UPDATE public.partner_products
  SET stock = v_new_stock,
      cost_price = COALESCE(p_unit_cost, cost_price),
      updated_at = now()
  WHERE id = p_product_id
    AND user_id = v_operator.user_id
    AND branch_id = p_branch_id;

  INSERT INTO public.stock_movements (
    user_id, product_id, product_name, type, quantity, reason, branch_id
  ) VALUES (
    v_operator.user_id, p_product_id, v_product.name, 'entrada', p_quantity, v_reason, p_branch_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'product_id', p_product_id,
    'branch_id', p_branch_id,
    'new_stock', v_new_stock,
    'previous_stock', v_product.stock,
    'quantity', p_quantity
  );
END;
$$;

REVOKE ALL ON FUNCTION public.execute_partner_stock_replenishment(uuid, text, uuid, uuid, integer, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_partner_stock_replenishment(uuid, text, uuid, uuid, integer, numeric, text) TO authenticated;