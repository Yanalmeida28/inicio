# Correções de PDV e pré-vendas — 14/10/2026

## Entrega

Correções implementadas no mesmo projeto das correções de Cadastro. Migração `20261014210022_fix_pdv_presales_and_customer_price_tables` aplicada no Supabase DistriHub.com. Build conjunto pronto em `dist/`. Frontend ainda não publicado.

## Mudanças

- A tentativa persistida guarda o escopo original do rascunho, sem PIN ou token. Após recuperação confirmada, a tela apaga o carrinho e os campos apenas daquela venda/pré-venda antes de remontar. Rascunhos de outros formulários e filiais permanecem. A tela identifica a operação recuperada.
- A pré-venda usa bloqueio síncrono e desabilita o formulário durante o salvamento, enquanto existe resultado pendente ou quando a tela não está ativa. Erros preservam os campos para tentativa posterior.
- A confirmação de pré-venda salva fica fora do carrinho, permanece visível após esvaziá-lo e inclui o ID retornado pela gravação quando disponível.
- Clientes inativos não aparecem na pesquisa nem na troca de cliente de pedidos. Validação de preço e trigger no banco impedem novas vendas/edições de cotação e finalização de pré-vendas de clientes inativos. Histórico e cancelamento não são bloqueados somente por inatividade; continuam respeitando as proteções financeiras existentes.
- A tabela cadastrada no cliente passa a escolher o preço, independentemente do tipo comercial Varejo/Atacado. Cliente sem tabela explícita mantém a regra anterior pelo tipo. Selecionar outro cliente recalcula o carrinho completo.
- Premium tem preço próprio por produto, conforme solicitado. Campo opcional de Preço Premium adicionado à criação/edição de produtos e serviços; aceita zero explícito e pode ser removido. Produto sem esse preço não pode ser usado na tabela Premium; a tela explica o motivo.
- Banco e editor de itens do pedido usam a mesma regra de tabelas. Preços negociados continuam limitados aos papéis autorizados. Cotações existentes continuam com os preços autorizados congelados até uma edição explícita; finalização não recalcula silenciosamente a cotação.
- Nova função de produto inclui Premium na mesma transação da mutação. A entrada pública é SECURITY INVOKER, a implementação fica em esquema privado, chamadas anônimas são recusadas e a empresa/filial são resolvidas no servidor.

## Validação

- Suíte conjunta de Cadastro e PDV: **408 testes passaram, zero falhas**.
- Após os últimos ajustes de mensagem e exibição: **24 testes de regressão passaram**, zero falhas.
- TypeScript, lint com zero avisos e build final passaram.
- Testes novos usam o hook real de rascunhos e os componentes reais para comprovar limpeza após recuperação, preservação de outro orçamento, bloqueio durante resposta lenta, bloqueio de operação pendente e aplicação de Premium.
- Banco local fictício comprova Varejo/Atacado/Premium, preço ausente, zero explícito, valores inválidos, identidade de outra empresa e rollback de finalização com cliente inativo.
- Supabase conferido após aplicação: coluna Premium, trigger de cliente ativo, função de produto e permissões implantados. Chamada sem autenticação foi rejeitada sem gravar produto.
- Advisor de segurança sem novos apontamentos em relação à situação anterior. Os avisos gerais preexistentes permaneceram com as mesmas contagens.

Não foram criadas vendas ou clientes reais nos testes. A homologação interativa do site publicado permanece para a etapa de publicação conjunta.

## Publicação

Publicar o frontend deste projeto com Cadastro, PDV e pré-vendas juntos. As duas migrações já estão aplicadas no Supabase. Conferir após deploy: nova versão carregada no navegador, produto com preço Premium, cliente com tabela Premium, salvamento/recarga de Cadastro e fluxo de venda/pré-venda em ambiente de homologação.
