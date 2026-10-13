# Destino das peças devolvidas

O botão Avançar foi substituído por Escolher destino, com confirmação: avaliação, avaria, fornecedor ou estoque disponível. Abrir a solicitação não adiciona estoque. Apenas confirmar estoque reintegra a quantidade, uma única vez. Uma peça reintegrada não pode trocar de destino sem uma operação de estoque específica.

Crédito ao cliente é uma ação separada, disponível para administrador/gerente em devoluções vinculadas a venda e cliente. Pode ser gerado com a peça em avaliação ou no fornecedor, sem entrada indevida no estoque. Os limites de valor, permissões e aplicações em faturas permanecem preservados.

A migração adiciona destination e conserva os registros existentes sem repetir movimentos. Destinos antigos sem comprovação ficam em avaliação; registros reintegrados permanecem no estoque. Compatibilidade com chamadas antigas de status foi mantida.

Migrações aplicadas e interface publicada em 13/10/2026, na versão eb3cdd1. O painel inclui filtros e totais por destino, créditos e reembolsos. A suite completa dessa publicação passou em 382 testes.

## Reembolso

O RMA oferece Reembolsar cliente para administrador/gerente, separado do destino da peça. O formulário pede valor, forma do recebimento a estornar (dinheiro, PIX ou cartão) e motivo/comprovante. Trata-se do registro de um pagamento já realizado ou estorno confirmado no provedor; não executa transferências nem chamadas ao gateway.

O servidor exige caixa aberto do operador na filial, recebimento original elegível naquela forma, venda e cliente vinculados, limite do item devolvido e saldo disponível do recebimento. Pode usar o caixa original ainda aberto ou outro caixa aberto depois do fechamento. Caixas fechados não são alterados. Vendas faturadas sem recebimento original no Caixa não são elegíveis por este fluxo.

O lançamento de saída e a confirmação do RMA são atômicos. Cada RMA aceita um reembolso; a tentativa preservada no armazenamento local do navegador recupera o mesmo UUID após falha ou recarga. Não são guardados PINs ou tokens. Reembolso confirmado é imutável e impede gerar crédito na mesma solicitação. Créditos e reembolsos também são limitados conjuntamente pelo valor da venda, incluindo devoluções financeiras feitas diretamente no Caixa.

A lista de RMA mostra valor, forma e data do reembolso, e o Financeiro mostra seu histórico. A devolução dos itens permanece vinculada à venda original, sem cancelar nem recriar a compra. O destino e o estoque ficam independentes do reembolso.

Validação local: 46 testes de RMA/créditos/reembolso/Caixa, TypeScript, lint e build. Cenários novos cobrem resposta perdida, recarga, cliques simultâneos, rejeição definitiva, permissões, caixa fechado, valor excedido, forma sem recebimento, tentativa repetida, alteração de dados confirmados, manutenção de estoque, falha na confirmação com rollback da saída e compensação excedente por crédito após reembolso no Caixa.

Validação inclui migração sem movimentar estoque, crédito com peça no fornecedor, reintegração depois do crédito, repetição sem duplicação, bloqueio de mudança após reintegração, outra empresa rejeitada e seleção de destino preservada após falha.
