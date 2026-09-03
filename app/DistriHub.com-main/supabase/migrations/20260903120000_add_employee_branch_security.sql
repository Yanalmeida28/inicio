-- Migration: Adicionar restrição e controle de acesso de funcionários por filial
-- Data: 2026-09-03

-- 1. Adiciona coluna branch_id em partner_salespeople se não existir
ALTER TABLE partner_salespeople ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES partner_branches(id) ON DELETE SET NULL;

-- 2. Índices para otimização de consultas e integridade por filial
CREATE INDEX IF NOT EXISTS idx_partner_salespeople_branch ON partner_salespeople(user_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_partner_products_branch ON partner_products(user_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_partner_sales_branch ON partner_sales(user_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_partner_customers_branch ON partner_customers(user_id, branch_id);

-- 3. Função de verificação de integridade no banco de dados (Trigger)
-- Impede que vendas sejam vinculadas a funcionários de outra filial, garantindo segurança real no backend
CREATE OR REPLACE FUNCTION check_salesperson_branch_integrity()
RETURNS TRIGGER AS $$
DECLARE
  v_sp_branch_id uuid;
BEGIN
  IF NEW.salesperson_id IS NOT NULL THEN
    SELECT branch_id INTO v_sp_branch_id
    FROM partner_salespeople
    WHERE id = NEW.salesperson_id;

    IF v_sp_branch_id IS NOT NULL AND NEW.branch_id IS NOT NULL AND v_sp_branch_id <> NEW.branch_id THEN
      RAISE EXCEPTION 'Acesso negado: o funcionário não pertence à filial selecionada para a operação.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger na tabela partner_sales
DROP TRIGGER IF EXISTS trg_check_sale_salesperson_branch ON partner_sales;
CREATE TRIGGER trg_check_sale_salesperson_branch
  BEFORE INSERT OR UPDATE ON partner_sales
  FOR EACH ROW
  EXECUTE FUNCTION check_salesperson_branch_integrity();
