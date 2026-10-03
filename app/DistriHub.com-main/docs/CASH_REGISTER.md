# Controle de caixa

O menu Caixa controla sessões por empresa, filial e operador autenticado. A seleção de um vendedor comercial na venda não altera o operador do caixa. Administradores e gerentes consultam todos os caixas da filial; outros operadores consultam apenas os próprios.

## Fluxo

- Abrir com o dinheiro inicial de troco, inclusive zero.
- Finalizar vendas e pré-vendas somente com caixa aberto. O lançamento financeiro ocorre na mesma transação da venda, estoque e fatura, usando a RPC existente.
- PIX, cartão e faturado são apresentados separadamente. Faturado representa contas a receber, sem incrementar dinheiro disponível.
- Suprimentos acrescentam dinheiro. Sangrias exigem motivo e autorização de administrador/gerente, além de saldo suficiente.
- Fechar informando o dinheiro contado. O servidor calcula abertura + dinheiro líquido, salva totais e diferença. Diferenças exigem justificativa e autorização.
- Consultar histórico e imprimir relatório. A contagem é de dinheiro físico; PIX e cartão constam para conferência, sem campo de contagem própria.

## Integridade e limites

Pré-vendas não movimentam caixa. Vendas anteriores à ativação não são atribuídas retroativamente. Repetições de uma venda confirmada não lançam outra movimentação, mesmo após o fechamento. Sangrias, suprimentos, aberturas e fechamentos usam identificadores próprios; requisições incertas são preservadas no sessionStorage, sem PIN, para confirmação com o mesmo identificador.

Cancelamentos de vendas de um caixa aberto geram estorno no caixa original. Vendas vinculadas a caixa fechado não podem ser canceladas nesta implementação. É necessário um fluxo separado de devolução em caixa posterior para suportar esse caso; um fechamento não é recalculado depois de confirmado. Exclusões de vendas concluídas já são proibidas pelo contrato existente.

## Ativação

A migration `supabase/migrations/20261003182612_partner_cash_register.sql` e o frontend devem ser disponibilizados em conjunto. O workflow da Hostinger publica o frontend, mas não aplica SQL. Não executar todas as migrations históricas para ativar esta função.

A migration transfere a implementação financeira atual para um schema privado e mantém a mesma assinatura pública em um wrapper com controle de caixa. Usa os resolvedores de identidade e PIN existentes; não modifica sua lógica nem os algoritmos de preço, estoque e crédito.

Após ativar, cada operador deve selecionar sua filial, abrir Caixa e informar o troco inicial antes de finalizar a próxima venda. Sem a migration, a nova tela informa a falha de consulta e não simula dados locais.

## Validação

`npm run typecheck`, `npm run build` e `npm test` em `supabase/tests`. Os testes de caixa usam PostgreSQL efêmero (PGlite), as fixtures do contrato de produção e a implementação real de preço/estoque/crédito. Não escrevem dados de venda no projeto de produção.
