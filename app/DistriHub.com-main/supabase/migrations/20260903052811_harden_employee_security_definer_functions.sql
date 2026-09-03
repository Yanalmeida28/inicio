-- Harden trigger functions that enforce company and branch ownership.

CREATE OR REPLACE FUNCTION public.check_record_branch_company_integrity()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE')
    AND NEW.branch_id IS NOT NULL
    AND NEW.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.partner_branches
      WHERE id = NEW.branch_id AND user_id = NEW.user_id
    ) THEN
    RAISE EXCEPTION 'Acesso negado: a filial informada não pertence a esta empresa.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_check_product_branch_integrity ON partner_products;
CREATE TRIGGER trg_check_product_branch_integrity
  BEFORE INSERT OR UPDATE ON partner_products
  FOR EACH ROW EXECUTE FUNCTION public.check_record_branch_company_integrity();