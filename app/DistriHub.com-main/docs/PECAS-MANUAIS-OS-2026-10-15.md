# Peça manual na criação da ordem de serviço

Adicionada a seção **Peça manual / comprada de terceiros**, com descrição, quantidade e preço unitário cobrado. O campo de inclusão aceita preço em formato brasileiro, inclusive valores colados como `R$ 1.234,56`. As peças entram na lista da OS e permitem ajustar quantidade/preço ou remover cada linha separadamente. A descrição e o valor permanecem nos detalhes salvos e na recuperação de uma tentativa pendente.

O backend passa a aceitar itens com `product_id` nulo, descrição válida e `stock_consumed=false`. Eles compõem peças/total e a fatura da OS, sem criar cadastro, baixar estoque ou devolver estoque no cancelamento. O valor informado é o preço cobrado na OS; não gera conta a pagar nem registra automaticamente uma compra de fornecedor. Peças do catálogo mantêm autorização e baixa de estoque anteriores.

A alteração é na criação da OS; não acrescenta edição das peças de uma OS já gravada. Pedidos idempotentes existentes continuam compatíveis. A recuperação preserva identificador e conteúdo da solicitação, impedindo duplicação após perda de resposta.

Migração gerada pela CLI Supabase: `20261015183456_service_order_manual_parts.sql`. Apenas relaxa a obrigatoriedade de produto para itens manuais e acrescenta a restrição que exige descrição e ausência de baixa. Preserva autenticação, validação da filial, controle SaaS, permissões e RLS. A migração e o frontend ainda aguardam publicação; não houve criação de OS ou movimentação em dados reais.

Testes específicos: inclusão/edição/remoção independente, preço brasileiro, validação de campos, recuperação após remontagem, criação mista, cobrança, cancelamento, rollback completo e rejeição de outra empresa. Os 23 testes de operações e regressão de OS passaram. Validação geral: 523 testes passaram; TypeScript, lint sem avisos e build aprovados.
