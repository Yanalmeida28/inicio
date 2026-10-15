# Correções de cliente da OS e confirmação de desativação

Base atualizada por fast-forward até `f343ee55407ecd4792cafe321e67382465aa9229`, preservando os ajustes do usuário de filial, contato e cliente manual.

## Cobrança do cliente manual

A fatura passa a aceitar uma OS com cliente informado manualmente, desde que tenha nome, valor positivo, aprovação, situação pronta/finalizada e vencimento. O nome é preservado na fatura, sem criar cadastro genérico de cliente nem atribuir a cobrança a outra pessoa. A autorização da filial e do Financeiro, o bloqueio de troca de cliente após faturamento e a emissão única continuam vigentes. A cobrança sem cliente e sem nome continua bloqueada.

O recebimento de faturas sem vínculo de cadastro foi conferido no contrato aplicado e testado com pagamentos parcial/total e repetição idempotente.

## Contatos após troca de cliente

Os detalhes usam os contatos manuais somente enquanto a identidade atual for a manual original. Selecionar outro cliente não reaproveita telefone, endereço ou e-mail antigos, inclusive antes de salvar. Dados antigos indevidos também não aparecem ao reabrir uma OS já vinculada a cadastro.

Um gatilho limpa os três contatos quando customer_id muda no banco, abrangendo a API de workflow antiga e a atual. Alterar apenas situação ou observação preserva o contato manual.

## Desativação do funcionário

A interface só marca active=false depois de conferir id, empresa e active=false na linha devolvida. Aceita objeto ou uma única linha em array, preservando compatibilidade de representação da RPC. Resposta vazia, UUID isolado, múltiplas linhas, outra empresa, outro funcionário ou funcionário ainda ativo não são anunciados como sucesso. O histórico permanece e as permissões existentes não são alteradas.

Migração gerada pela CLI: `20261015213923_fix_service_order_manual_billing_and_contacts.sql`. Pendente de aplicação em produção junto com a publicação. Nenhuma OS, cobrança, contato ou conta real foi alterada durante os testes.

Validação final: 543 testes passaram; TypeScript, lint sem avisos e build aprovados. O contrato de recebimento e o gatilho de lançamentos do banco aplicado foram conferidos em leitura e aceitam fatura sem vínculo de cadastro, preservando nome e identificação da fatura. A cobrança não cria automaticamente uma conta de crédito de cliente.
