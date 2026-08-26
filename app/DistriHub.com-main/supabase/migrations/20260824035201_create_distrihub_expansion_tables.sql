/*
# DistriHub B2B — Expansão de tabelas para ERP multi-loja, admin, rotas e checkout

## Novas Tabelas

### 1. partner_branches (Filiais do lojista)
### 2. partner_categories (Categorias de produtos/serviços)
### 3. partner_suppliers (Fornecedores)
### 4. partner_salespeople (Vendedores/Técnicos com comissão)
### 5. partner_combos (Kits/Bundles)
### 6. partner_modifiers (Variações/adicionais)
### 7. partner_invoices (Faturas B2B recorrentes)
### 8. delivery_routes (Rotas de entrega local)
### 9. delivery_rates (Taxas de motoboy por bairro)
### 10. admin_lojistas (Gestão de lojistas pelo admin)
### 11. b2b_orders (Pedidos B2B da distribuidora)

## RLS
- Tabelas do lojista: TO authenticated, owner-scoped por user_id
- Tabelas admin (admin_lojistas, delivery_routes, delivery_rates, b2b_orders): TO authenticated
- partner_branches: owner-scoped
*/
