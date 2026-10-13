BEGIN;
LOCK TABLE public.rma_requests_v2 IN ACCESS EXCLUSIVE MODE NOWAIT;
ALTER TABLE public.rma_requests_v2 ADD COLUMN destination text NOT NULL DEFAULT 'avaliacao'
  CHECK (destination IN ('avaliacao','avaria','fornecedor','estoque'));
-- Backfill without replaying stock movements. Keep unknown legacy destinations in evaluation.
ALTER TABLE public.rma_requests_v2 DISABLE TRIGGER guard_rma_sale_return;
UPDATE public.rma_requests_v2 SET destination = CASE
  WHEN stock_restored_at IS NOT NULL OR status='reintegrado_estoque' THEN 'estoque'
  WHEN status='retornou_fornecedor' THEN 'fornecedor' ELSE 'avaliacao' END;
ALTER TABLE public.rma_requests_v2 ENABLE TRIGGER guard_rma_sale_return;
CREATE OR REPLACE FUNCTION partner_rma_private.guard_return() RETURNS trigger
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
  IF TG_OP = 'UPDATE' THEN
    -- Compatibility with old clients; destination changes use their own field.
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('retornou_fornecedor','reintegrado_estoque')
      AND NEW.destination IS NOT DISTINCT FROM OLD.destination THEN
      NEW.destination := CASE NEW.status WHEN 'retornou_fornecedor' THEN 'fornecedor' ELSE 'estoque' END;
    END IF;
    IF OLD.destination = 'estoque' AND NEW.destination <> 'estoque' THEN
      RAISE EXCEPTION 'Peca ja reintegrada ao estoque; destino nao pode ser alterado';
    END IF;
    IF OLD.credit_amount > 0 AND NEW.status <> 'credito_gerado' THEN
      RAISE EXCEPTION 'Credito ja gerado deve permanecer no historico';
    END IF;
    IF NEW.status <> 'credito_gerado' THEN
      NEW.status := CASE NEW.destination WHEN 'estoque' THEN 'reintegrado_estoque'
        WHEN 'fornecedor' THEN 'retornou_fornecedor' ELSE 'aguardando_troca' END;
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.destination <> 'avaliacao' THEN RAISE EXCEPTION 'Nova devolucao deve iniciar em avaliacao'; END IF;
    IF NEW.stock_restored_at IS NOT NULL OR NEW.status <> 'aguardando_troca' THEN
      RAISE EXCEPTION 'Nova devolucao deve iniciar aguardando troca';
    END IF;
  ELSE
    IF ROW(NEW.user_id,NEW.branch_id,NEW.sale_id,NEW.sale_item_index,NEW.product_id,NEW.customer_id,NEW.quantity,NEW.stock_restored_at)
      IS DISTINCT FROM ROW(OLD.user_id,OLD.branch_id,OLD.sale_id,OLD.sale_item_index,OLD.product_id,OLD.customer_id,OLD.quantity,OLD.stock_restored_at) THEN
      RAISE EXCEPTION 'Vinculo, quantidade e entrada da devolucao nao podem ser alterados';
    END IF;

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
  IF TG_OP = 'UPDATE' AND OLD.destination IS DISTINCT FROM NEW.destination AND NEW.destination = 'estoque' THEN
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

CREATE OR REPLACE FUNCTION partner_rma_private.guard_credit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op record; sold public.partner_sales%ROWTYPE; maximum numeric;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.credit_amount <> 0 OR NEW.credited_at IS NOT NULL THEN RAISE EXCEPTION 'Credito deve ser gerado depois da reintegracao'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.credit_amount > 0 THEN
  IF NEW.credit_amount IS DISTINCT FROM OLD.credit_amount OR NEW.credited_at IS DISTINCT FROM OLD.credited_at
  THEN RAISE EXCEPTION 'Credito ja gerado e imutavel'; END IF;
 ELSIF NEW.credit_amount > 0 THEN
  PERFORM partner_subscription_private.require_actor('rma');
  SELECT * INTO op FROM public.resolve_partner_pdv_operator(NULL,NULL,NEW.branch_id);
  IF op.company_id IS DISTINCT FROM NEW.user_id OR op.role NOT IN ('administrador','gerente') THEN RAISE EXCEPTION 'Sem permissao para gerar credito'; END IF;
  IF NEW.status <> 'credito_gerado'
   OR NEW.sale_id IS NULL OR NEW.customer_id IS NULL THEN RAISE EXCEPTION 'Credito exige devolucao vinculada a venda e cliente'; END IF;
  SELECT * INTO sold FROM public.partner_sales WHERE id=NEW.sale_id;
  maximum := round((sold.items->NEW.sale_item_index->>'unit_price')::numeric * NEW.quantity,2);
  IF maximum IS NULL OR NEW.credit_amount > maximum THEN RAISE EXCEPTION 'Credito excede o valor dos itens devolvidos'; END IF;
  NEW.credited_at := now();
 ELSIF NEW.credited_at IS NOT NULL OR (NEW.status='credito_gerado' AND OLD.status IS DISTINCT FROM NEW.status) THEN
  RAISE EXCEPTION 'Informe o valor do credito antes de finalizar';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION partner_rma_private.guard_credit() FROM PUBLIC,anon,authenticated;

COMMIT;
