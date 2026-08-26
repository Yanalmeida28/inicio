/*
# Painel B2B "Sou Lojista" — Auth + Tabelas de Gestão Comercial

## Visão Geral
Cria a estrutura de dados para o painel B2B da DistriHub com autenticação de lojistas
e gestão completa de produtos, estoque, clientes, vendas/OS, relatórios e RMA.

## Novas Tabelas

### 1. partner_profiles (Perfil do lojista)
- `id` (uuid, pk, fk → auth.users) — vinculado ao usuário autenticado
- `business_name` (text) — nome da assistência técnica
- `document` (text) — CNPJ ou CPF
- `whatsapp` (text) — WhatsApp de contato
- `created_at` (timestamptz)

### 2. partner_products (Produtos cadastrados pelo lojista)
- `id` (uuid, pk)
- `user_id` (uuid, fk → auth.users) — dono do produto
- `name` (text) — nome da peça/serviço
- `cost_price` (numeric) — preço de custo
- `sale_price` (numeric) — preço de venda
- `image_url` (text) — foto do produto
- `stock` (integer) — quantidade em estoque
- `min_stock` (integer, default 5) — alerta de estoque baixo
- `created_at`, `updated_at` (timestamptz)

### 3. partner_customers (Clientes finais da assistência)
- `id` (uuid, pk)
- `user_id` (uuid, fk → auth.users)
- `name` (text) — nome do cliente
- `phone` (text) — telefone
- `device_model` (text) — aparelho/modelo
- `created_at` (timestamptz)

### 4. partner_sales (Vendas / Ordens de Serviço)
- `id` (uuid, pk)
- `user_id` (uuid, fk → auth.users)
- `customer_id` (uuid, fk → partner_customers)
- `customer_name` (text) — nome do cliente (snapshot)
- `items` (jsonb) — array de {product_id, name, quantity, unit_price}
- `total` (numeric) — valor total da venda
- `status` (text) — 'aberta' | 'concluida' | 'cancelada'
- `created_at` (timestamptz)

### 5. stock_movements (Histórico de entradas e saídas)
- `id` (uuid, pk)
- `user_id` (uuid, fk → auth.users)
- `product_id` (uuid, fk → partner_products)
- `product_name` (text) — nome snapshot
- `type` (text) — 'entrada' | 'saida'
- `quantity` (integer) — quantidade movimentada
- `reason` (text) — motivo (ex: 'venda', 'compra', 'ajuste')
- `created_at` (timestamptz)

### 6. store_settings (White-Label — já existe, adaptada)
- Adiciona `user_id` para vincular ao lojista autenticado.

## Segurança (RLS)
- App COM autenticação → todas as tabelas usam `TO authenticated`
- `user_id` com `DEFAULT auth.uid()` em todas as tabelas de dados do lojista
- Políticas owner-scoped: cada lojista só vê/edita seus próprios dados
- 4 políticas por tabela (SELECT, INSERT, UPDATE, DELETE)

## Notas
1. partner_profiles tem `id = auth.uid()` (1:1 com auth.users)
2. partner_products, partner_customers, partner_sales, stock_movements
   filtram por `user_id = auth.uid()`
3. store_settings agora tem user_id para isolamento por lojista
*/
