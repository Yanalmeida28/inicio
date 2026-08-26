/*
# Painel B2B "Sou Lojista" — Tabelas para gestão de assistências técnicas parceiras

## Visão Geral
Cria a estrutura de dados para o painel B2B da DistriHub, permitindo que lojistas e
assistências técnicas parceiras personalizem suas lojas (white-label), gerenciem
solicitações de garantia/RMA, controlem estoque multi-loja e acompanhem saldo de
crédito acumulado em garantias aprovadas.

## Novas Tabelas

### 1. branches (Filiais do lojista)
- `id` (uuid, pk) — identificador único
- `name` (text) — nome da filial (ex: "Loja 1 - Centro")
- `address` (text) — endereço da filial
- `is_active` (boolean, default true) — se a filial está ativa
- `created_at` (timestamptz) — data de criação

### 2. store_settings (Personalização White-Label)
- `id` (uuid, pk)
- `logo_url` (text) — URL do logotipo enviado
- `primary_color` (text) — cor primária do tema (hex)
- `nav_color` (text) — cor da barra de navegação (hex)
- `banner_url` (text) — URL do banner promocional
- `internal_notice` (text) — aviso interno exibido no painel
- `updated_at` (timestamptz) — última atualização

### 3. rma_requests (Solicitações de Garantia/Devolução)
- `id` (uuid, pk)
- `product_name` (text) — nome do produto selecionado
- `product_sku` (text) — SKU do produto
- `batch_or_order` (text) — número do lote ou pedido
- `defect_description` (text) — descrição do defeito
- `media_url` (text) — URL da foto/vídeo enviado
- `status` (text) — status: 'analise' | 'aprovado_fornecedor' | 'reintegrado_estoque' | 'credito_gerado'
- `credit_amount` (numeric, default 0) — valor de crédito gerado quando aprovado
- `branch_id` (uuid, fk → branches) — filial vinculada
- `created_at` (timestamptz) — data da solicitação
- `updated_at` (timestamptz) — última atualização de status

### 4. local_stock (Estoque local da filial)
- `id` (uuid, pk)
- `product_sku` (text) — SKU do produto
- `product_name` (text) — nome do produto
- `quantity` (integer, default 0) — quantidade em estoque local
- `branch_id` (uuid, fk → branches) — filial que possui o estoque
- `delivery_status` (text) — 'pendente' | 'entregue' — status do pedido da distribuidora
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### 5. wallet_balance (Saldo do lojista)
- `id` (uuid, pk)
- `balance` (numeric, default 0) — saldo total acumulado em garantias aprovadas
- `updated_at` (timestamptz)

## Segurança (RLS)
- App sem tela de login → single-tenant. Todas as tabelas usam `TO anon, authenticated`
  com `USING (true)` / `WITH CHECK (true)` pois os dados são intencionalmente
  compartilhados dentro do painel B2B (não há isolamento por usuário neste momento).
- RLS habilitado em todas as tabelas.
- 4 políticas por tabela (SELECT, INSERT, UPDATE, DELETE).

## Notas
1. O saldo (wallet_balance) é atualizado quando um RMA muda para status 'credito_gerado'.
2. O estoque local é incrementado automaticamente quando um pedido é marcado como 'entregue'.
3. Dados iniciais (seed) são inseridos: 1 wallet_balance com saldo 0, 2 branches de exemplo.
*/
