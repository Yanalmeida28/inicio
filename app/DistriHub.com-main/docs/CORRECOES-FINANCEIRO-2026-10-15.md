# Financeiro — correções de 15/10/2026

Estado: correções implementadas localmente; publicação pendente. Não há alteração de schema nem migration nesta entrega. Nenhum registro financeiro real foi criado, recebido, pago, abatido ou reembolsado para validar o trabalho.

## Sete achados corrigidos

1. **Recuperação de recebimento quitado.** A tentativa persistida é consultada antes de validar o saldo de uma nova operação. A recuperação repete valor e UUID originais, mesmo quando o título já aparece pago ou não está no cache. A RPC continua validando empresa, autenticação e operação no servidor. Tentativas antigas no formato anterior são descobertas pelo armazenamento do navegador. A interface oferece recuperação independente dos botões do título aberto.
2. **Pagamento e criação de contas.** Payload e UUID persistem em localStorage por executor/empresa e tipo de operação. Remontar, trocar de filial ou reabrir um formulário não produz outra identidade para uma operação incerta. Payload diferente é recusado; a recuperação usa exatamente a conta e o valor originais. Travas síncronas evitam submissão concorrente. Resposta sem identificador confirmado conserva a tentativa. Uma falha ao atualizar a lista depois da confirmação não transforma o pagamento em uma operação fracassada; o erro de leitura continua visível e os dados não são inventados.
3. **Crédito RMA.** O hook preserva RMA, fatura, valor e identificador do abatimento. Reabrir o modal não substitui a identidade de um envio incerto. O painel de recuperação fica acessível tanto na tela quanto dentro do modal. A confirmação confere o identificador retornado; após confirmação, faturas e RMAs são atualizados. Rejeição definitiva da primeira tentativa libera a correção do pedido; resultado incerto continua pendente.
4. **Contexto dos formulários.** Financeiro e Contas reiniciam rascunhos ao mudar empresa/filial/operador. Sair da aba fecha os editores; respostas antigas não alteram o contexto novo. O módulo administrativo fornece os contextos e remonta Contas/Fiado/Fluxo por filial. A persistência da operação incerta é independente do formulário descartado.
5. **Vencimento civil.** Financeiro formata a data sem convertê-la de meia-noite UTC para o dia anterior. Fluxo usa America/Sao_Paulo para agrupar instantes por dia, preservando datas civis sem hora.
6. **Faturas canceladas.** Financeiro usa as mesmas funções `accountBalance` e `accountPaid` de Contas a Receber. Canceladas exibem saldo e valor liquidado zerados e não compõem o total faturado ativo; seus registros continuam visíveis no filtro Todas.
7. **Reembolsos no realizado.** Fluxo carrega todas as páginas dos registros RMA da empresa e filtra a filial. Somente valores efetivamente reembolsados geram saída, com a data do servidor. Identidade de reembolso (ou do RMA legado) evita contagem duplicada. Não se soma novamente o movimento de Caixa da mesma devolução. Créditos RMA não viram saída/entrada de dinheiro. Erro na leitura de reembolsos deixa o resultado indisponível; não apresenta um saldo falsamente completo. Registros sem data comprovada seguem a indicação de movimentos sem data, sem inventar horário. O previsto continua baseado nos vencimentos e saldos pendentes.

## Validação

Validação final concluída: **504 testes aprovados**, zero falhas ou testes ignorados (`financeiro-completo-final.log`). TypeScript, lint sem avisos e build aprovados (`financeiro-typecheck-final.log`, `financeiro-lint-final.log`, `financeiro-build-final.log`). Verificação de diferenças sem erros de whitespace. A execução final inclui os sete testes de `financial-corrections.test.mjs` e os dois novos cenários de recuperação no hook.

Os novos testes exercitam componentes/hook reais com respostas isoladas: quitação já paga após resposta perdida, recuperação de abatimento e de pagamento após remontagem, alteração de payload bloqueada, leitura falhando após confirmação, resposta não confirmada, armazenamento indisponível, isolamento entre usuários, descoberta de tentativa legada, troca de filial durante envio, cliques repetidos, datas brasileiras, fatura cancelada, paginação de reembolsos, deduplicação e saldo final de R$60 para venda R$100 menos reembolso R$40.

As definições dos campos usados na consulta de RMA foram confirmadas em produção por leitura de metadata. As RPCs existentes de pagamento/abatimento já suportam repetição idempotente; os testes de banco da auditoria demonstraram esse contrato. As correções preservam essa API e as permissões atuais de proprietário, empresa, cliente, filial e assinatura.

## Publicação futura

Publicar somente os arquivos de implementação, testes e este relatório. Scripts de reprodução de auditoria, logs, perfis de navegador e artefatos de outras etapas não fazem parte desta entrega. Tentativas antigas de Contas/RMA que nunca tiveram UUID persistido não são reconstruídas nem geram baixas automáticas.
