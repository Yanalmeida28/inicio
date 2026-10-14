# Correções de Pedidos em aberto — 14/10/2026

## Sete falhas corrigidas

1. Proprietário e gerente podem autorizar cancelamento/exclusão pelo próprio acesso, sem exigir cadastro de outro responsável ou PIN do funcionário.
2. Funcionário informa o PIN de um supervisor separado do operador autenticado. Servidor valida atividade, papel, empresa, filial e PIN; auditoria registra operador e autorizador. O resolver geral de identidade não foi enfraquecido.
3. Filtros comparam o dia comercial em `America/Sao_Paulo`, incluindo o dia final completo e excluindo os dias vizinhos. Intervalo invertido gera erro visível.
4. Pedidos são isolados por empresa, filial e operador na integração do painel. Modal fecha quando o pedido deixa a lista autorizada ou a tela fica inativa. O alvo é atualizado com o pedido atual antes de confirmar.
5. Finalização bloqueia X, backdrop, pagamento e troca de pedido enquanto aguarda. Respostas de componentes desmontados são ignoradas e a confirmação mostra o identificador do pedido.
6. Cancelar e apagar compartilham uma trava síncrona. Campos e fechamento do modal ficam bloqueados durante o envio; o hook também serializa ações concorrentes.
7. Editor exibe subtotal dos produtos, frete e total efetivamente cobrado. O frete é preservado ao editar os itens.

## Proteções mantidas

- Fluxo novo é limitado a pedidos abertos e não permite cancelar ou apagar vendas concluídas.
- Pedido com pagamento online, status pago, fatura ou lançamento de Caixa exige o fluxo financeiro correspondente.
- Apenas pré-vendas sem lançamentos podem ser apagadas; pedidos legados abertos podem ser cancelados para preservar histórico.
- Operação em outra empresa/filial, supervisor inativo, papel inadequado e PIN incorreto são rejeitados.
- Frontend só altera a lista após receber o mesmo ID como confirmação do servidor.

## Validação

- Suíte completa: **442 testes passaram**, zero falhas.
- Após último ajuste de filtragem dos responsáveis: **10 testes da interface passaram**, zero falhas.
- TypeScript, ESLint com zero avisos, build e `git diff --check` passaram.
- Banco local com funções reais confirmou proprietário, gerente autenticado, funcionário com supervisor, rejeições e preservação de estoque/Caixa.
- Testes de componente/hook confirmaram datas, autorização, trava contra cliques duplicados, modais, isolamento, totais e atualização somente após confirmação.

## Banco e publicação

- Migração `20261014230708_fix_open_order_authorization` aplicada no Supabase e conferida.
- Endpoint público `mutate_partner_open_order` é SECURITY INVOKER, nega execução anônima e delega à implementação autorizada em schema privado.
- Advisor de segurança manteve todas as contagens anteriores, sem apontamentos novos.
- Nenhum pedido, venda, pagamento, estoque ou Caixa real foi alterado para testar.
- **Frontend ainda não publicado.** Publicar o projeto para disponibilizar a nova interface e o fluxo de autorização.
