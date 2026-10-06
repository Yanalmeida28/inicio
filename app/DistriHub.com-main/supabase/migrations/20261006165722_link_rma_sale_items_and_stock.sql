-- RMA is a physical return, not a financial refund. Preserve sale and invoice amounts.
BEGIN;
ALTER TABLE public.rma_requests_v2
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.partner_branches(id),
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN sale_id uuid REFERENCES public.partner_sales(id) ON DELETE RESTRICT,
  ADD COLUMN sale_item_index integer,
  ADD COLUMN product_id uuid REFERENCES public.partner_products(id) ON DELETE RESTRICT,
  ADD COLUMN customer_id uuid,
  ADD COLUMN quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  ADD COLUMN stock_restored_at timestamptz,
  ADD CONSTRAINT rma_sale_link_complete CHECK (
    (sale_id IS NULL AND sale_item_index IS NULL AND customer_id IS NULL)
    OR (sale_id IS NOT NULL AND sale_item_index IS NOT NULL AND sale_item_index >= 0 AND product_id IS NOT NULL)
  );
CREATE INDEX rma_sale_item_idx ON public.rma_requests_v2(sale_id, sale_item_index) WHERE sale_id IS NOT NULL;
CREATE INDEX rma_product_idx ON public.rma_requests_v2(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rma_branch_idx ON public.rma_requests_v2(branch_id);

-- Company-wide legacy policies must also respect the employee's branch.
DROP POLICY IF EXISTS select_company_rma ON public.rma_requests_v2;
DROP POLICY IF EXISTS insert_company_rma ON public.rma_requests_v2;
DROP POLICY IF EXISTS update_company_rma ON public.rma_requests_v2;
DROP POLICY IF EXISTS delete_company_rma ON public.rma_requests_v2;
CREATE POLICY select_company_rma ON public.rma_requests_v2 FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.partner_employee_can_access_branch(user_id,branch_id));
CREATE POLICY insert_company_rma ON public.rma_requests_v2 FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) OR public.partner_employee_can_access_branch(user_id,branch_id));
CREATE POLICY update_company_rma ON public.rma_requests_v2 FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.partner_employee_can_access_branch(user_id,branch_id))
  WITH CHECK (user_id = (SELECT auth.uid()) OR public.partner_employee_can_access_branch(user_id,branch_id));
CREATE POLICY delete_company_rma ON public.rma_requests_v2 FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.partner_employee_can_access_branch(user_id,branch_id));

-- Link only exact historical references with one matching line and sufficient quantity.
-- Never replay historical stock receipts (the legacy status did not record an actual receipt).
WITH candidates AS (
  SELECT r.id, s.id AS sale_id, s.user_id, s.branch_id, s.customer_id, s.customer_name,
    (line.ordinality - 1)::integer AS item_index, p.id AS product_id,
    (line.item->>'quantity')::integer AS sold_quantity,
    count(*) OVER (PARTITION BY r.id) AS matches
  FROM public.rma_requests_v2 r
  JOIN public.partner_sales s ON r.batch_or_order = 'Venda #' || s.id::text
    AND r.user_id = s.user_id AND s.status = 'concluida'
    AND (r.branch_id IS NULL OR r.branch_id = s.branch_id)
  CROSS JOIN LATERAL jsonb_array_elements(s.items) WITH ORDINALITY AS line(item, ordinality)
  JOIN public.partner_products p ON p.id::text = line.item->>'product_id'
    AND p.user_id = s.user_id AND p.branch_id = s.branch_id AND NOT COALESCE(p.is_service, false)
    AND r.product_name = line.item->>'name' AND r.product_sku = COALESCE(NULLIF(trim(p.sku), ''), 'Sem SKU')
), unambiguous AS (
  SELECT *, count(*) OVER (PARTITION BY sale_id, item_index) AS returned FROM candidates WHERE matches = 1
)
UPDATE public.rma_requests_v2 r SET sale_id = c.sale_id, sale_item_index = c.item_index,
  product_id = c.product_id, customer_id = c.customer_id, customer_name = c.customer_name, branch_id = c.branch_id
FROM unambiguous c WHERE r.id = c.id AND c.returned <= c.sold_quantity;

CREATE SCHEMA IF NOT EXISTS partner_rma_private;
REVOKE ALL ON SCHEMA partner_rma_private FROM PUBLIC, anon, authenticated;
CREATE FUNCTION partner_rma_private.guard_return() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  op record;
  sale public.partner_sales%ROWTYPE;
  product public.partner_products%ROWTYPE;
  item jsonb;
  used integer;
  target_branch uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN target_branch := OLD.branch_id; ELSE target_branch := NEW.branch_id; END IF;
  SELECT * INTO op FROM public.resolve_partner_pdv_operator(NULL, NULL, target_branch);
  IF TG_OP = 'DELETE' THEN
    IF OLD.user_id IS DISTINCT FROM op.company_id THEN RAISE EXCEPTION 'Devolucao fora da empresa'; END IF;
    IF OLD.sale_id IS NOT NULL OR OLD.stock_restored_at IS NOT NULL THEN
      RAISE EXCEPTION 'Devolucao vinculada a venda ou estoque deve permanecer no historico';
    END IF;
    IF op.role NOT IN ('administrador', 'gerente') THEN RAISE EXCEPTION 'Sem permissao para excluir devolucao'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.user_id IS DISTINCT FROM op.company_id OR NEW.branch_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.partner_branches b WHERE b.id = NEW.branch_id AND b.user_id = op.company_id
  ) THEN RAISE EXCEPTION 'Empresa ou filial da devolucao invalida'; END IF;
  IF NEW.status NOT IN ('aguardando_troca','retornou_fornecedor','reintegrado_estoque','credito_gerado') THEN
    RAISE EXCEPTION 'Status de devolucao invalido';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.stock_restored_at IS NOT NULL OR NEW.status <> 'aguardando_troca' THEN
      RAISE EXCEPTION 'Nova devolucao deve iniciar aguardando troca';
    END IF;
  ELSE
    IF ROW(NEW.user_id,NEW.branch_id,NEW.sale_id,NEW.sale_item_index,NEW.product_id,NEW.customer_id,NEW.quantity,NEW.stock_restored_at)
      IS DISTINCT FROM ROW(OLD.user_id,OLD.branch_id,OLD.sale_id,OLD.sale_item_index,OLD.product_id,OLD.customer_id,OLD.quantity,OLD.stock_restored_at) THEN
      RAISE EXCEPTION 'Vinculo, quantidade e entrada da devolucao nao podem ser alterados';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status = 'aguardando_troca' AND NEW.status = 'retornou_fornecedor') OR
      (OLD.status = 'retornou_fornecedor' AND NEW.status = 'reintegrado_estoque') OR
      (OLD.status = 'reintegrado_estoque' AND NEW.status = 'credito_gerado')
    ) THEN RAISE EXCEPTION 'Transicao de devolucao invalida'; END IF;
  END IF;
  IF NEW.sale_id IS NOT NULL THEN
    SELECT * INTO sale FROM public.partner_sales WHERE id = NEW.sale_id FOR UPDATE;
    IF NOT FOUND OR sale.user_id IS DISTINCT FROM NEW.user_id OR sale.branch_id IS DISTINCT FROM NEW.branch_id
      OR sale.status <> 'concluida' OR sale.customer_id IS DISTINCT FROM NEW.customer_id THEN
      RAISE EXCEPTION 'Venda invalida para a devolucao';
    END IF;
    IF NEW.sale_item_index IS NULL OR NEW.sale_item_index < 0 THEN RAISE EXCEPTION 'Item da venda invalido'; END IF;
    item := sale.items -> NEW.sale_item_index;
    IF item IS NULL OR item->>'product_id' IS DISTINCT FROM NEW.product_id::text THEN
      RAISE EXCEPTION 'Produto nao pertence ao item vendido';
    END IF;
    SELECT COALESCE(sum(r.quantity),0) INTO used FROM public.rma_requests_v2 r
      WHERE r.sale_id = NEW.sale_id AND r.sale_item_index = NEW.sale_item_index AND r.id <> NEW.id;
    IF NEW.quantity <= 0 OR used + NEW.quantity > (item->>'quantity')::integer THEN
      RAISE EXCEPTION 'Quantidade devolvida excede a quantidade comprada';
    END IF;
    NEW.customer_name := sale.customer_name;
    NEW.product_name := item->>'name';
    NEW.batch_or_order := 'Venda #' || sale.id::text;
  END IF;
  IF NEW.product_id IS NOT NULL THEN
    SELECT * INTO product FROM public.partner_products WHERE id = NEW.product_id FOR UPDATE;
    IF NOT FOUND OR product.user_id IS DISTINCT FROM NEW.user_id OR product.branch_id IS DISTINCT FROM NEW.branch_id
      OR COALESCE(product.is_service,false) THEN RAISE EXCEPTION 'Produto invalido para devolucao de estoque'; END IF;
    NEW.product_sku := COALESCE(NULLIF(trim(product.sku),''), 'Sem SKU');
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'reintegrado_estoque' THEN
    IF NEW.product_id IS NULL THEN RAISE EXCEPTION 'Reintegracao exige produto vinculado ao estoque'; END IF;
    IF NEW.stock_restored_at IS NULL THEN
      UPDATE public.partner_products SET stock = COALESCE(stock,0) + NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
      INSERT INTO public.stock_movements(user_id,product_id,product_name,type,quantity,reason,branch_id)
        VALUES(NEW.user_id,NEW.product_id,product.name,'entrada',NEW.quantity,'Devolucao RMA #' || NEW.id::text,NEW.branch_id);
      NEW.stock_restored_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION partner_rma_private.guard_return() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_rma_sale_return BEFORE INSERT OR UPDATE OR DELETE ON public.rma_requests_v2
  FOR EACH ROW EXECUTE FUNCTION partner_rma_private.guard_return();

-- Stop sale cancellation/deletion from restoring the same physical items a second time.
CREATE FUNCTION partner_rma_private.protect_sale() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(OLD.user_id,OLD.branch_id,OLD.items,OLD.status) IS NOT DISTINCT FROM ROW(NEW.user_id,NEW.branch_id,NEW.items,NEW.status) THEN RETURN NEW; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.rma_requests_v2 WHERE sale_id = OLD.id) THEN
    RAISE EXCEPTION 'Venda com devolucao nao pode ser cancelada, excluida ou ter seus itens alterados';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION partner_rma_private.protect_sale() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_sale_with_return BEFORE UPDATE OR DELETE ON public.partner_sales
  FOR EACH ROW EXECUTE FUNCTION partner_rma_private.protect_sale();
COMMIT;
