-- Bind salespeople to their own company and assigned branch before a sale is written.

CREATE OR REPLACE FUNCTION public.check_salesperson_branch_integrity()
RETURNS TRIGGER AS $$
DECLARE
  v_salesperson_branch_id uuid;
BEGIN
  IF NEW.salesperson_id IS NOT NULL THEN
    SELECT branch_id INTO v_salesperson_branch_id
    FROM public.partner_salespeople
    WHERE id = NEW.salesperson_id AND user_id = NEW.user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Acesso negado: o funcionário não pertence a esta empresa.';
    END IF;

    IF v_salesperson_branch_id IS NOT NULL
      AND NEW.branch_id IS NOT NULL
      AND v_salesperson_branch_id <> NEW.branch_id THEN
      RAISE EXCEPTION 'Acesso negado: o funcionário não pertence à filial selecionada para a operação.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_check_sale_salesperson_branch ON partner_sales;
CREATE TRIGGER trg_check_sale_salesperson_branch
  BEFORE INSERT OR UPDATE ON partner_sales
  FOR EACH ROW EXECUTE FUNCTION public.check_salesperson_branch_integrity();