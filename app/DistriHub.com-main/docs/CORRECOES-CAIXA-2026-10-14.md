# Correções do Caixa — 14/10/2026

## Operação por gerente e proprietário

- Novo seletor **Caixa para operar** permite escolher o caixa aberto do funcionário e continuar autenticado como gerente/proprietário.
- Caixa exibe as vendas da sessão consultada, retornadas pelo próprio RPC autorizado, mesmo quando ainda não estavam carregadas no painel.
- Atalho **Ir ao PDV** mantém o caixa selecionado para finalizar vendas e pré-vendas. O responsável comercial da pré-venda é preservado.
- Gerente/proprietário pode registrar suprimento, sangria, devolução e fechamento no caixa escolhido. Diferenças de fechamento continuam exigindo justificativa.
- O funcionário permanece titular da sessão. O responsável pela ação fica registrado na auditoria.
- Gerente continua limitado à filial autorizada; outra empresa, colaborador inativo e caixa/vendedor sem função gerencial não recebem acesso de supervisão.
- Escolha da sessão é explícita, sem pedir o PIN do funcionário. Ao trocar filial, identidade ou operador, a escolha é limpa.

## Falhas corrigidas

- Devolução em dinheiro compara o valor solicitado com o dinheiro disponível na sessão, sob o bloqueio transacional. PIX/cartão mantêm suas próprias regras. Repetições de devoluções já confirmadas continuam permitidas sem duplicação, inclusive após fechar o caixa.
- Recuperação com rejeição definitiva consulta a operação no servidor. Se confirmada, encerra a pendência; se não registrada, aposenta o UUID antigo antes de liberar nova tentativa. Requisição atrasada com UUID aposentado não pode ser gravada. Falha de conexão/conciliação mantém a tentativa pendente.
- Campos de abertura, movimentação, devolução, fechamento e autorização são limpos ao trocar de contexto. Respostas antigas não exibem erro no novo contexto.
- Caixa atualiza ao ativar a aba, após mudanças nas vendas, ao retornar à janela e após operações financeiras. Aba oculta não mantém leituras por eventos de foco.
- Solicitações pendentes bloqueiam os formulários e a troca de caixa. Falha de armazenamento não deixa a trava de envio presa.

## Validação

- Suíte geral: **427 testes passaram**, zero falhas.
- Após os últimos ajustes: **98 testes de regressão passaram**, zero falhas, incluindo teste adicional de devolução PIX e supervisor inativo.
- TypeScript, ESLint com zero avisos e build passaram.
- Testes de banco local usam funções reais e comprovam operação pelo proprietário e por gerente autenticado, associação à sessão do funcionário, repetição idempotente, fechamento, permissões, saldo insuficiente e aposentadoria de identificadores.
- Testes de componentes/hooks comprovam escolha do caixa, endpoint supervisionado, identidade real, vendas no relatório, recuperação, isolamento dos campos e atualização do saldo.

## Implantação

- Migração `20261014224645_fix_cash_supervision_recovery_and_balance` aplicada no Supabase e conferida.
- Quatro endpoints novos públicos usam SECURITY INVOKER e negam execução anônima. Implementações privilegiadas ficam em schema privado; ledger de conciliação tem RLS, política de negação e nenhuma permissão direta ao cliente.
- Advisor de segurança manteve as contagens anteriores: 13 avisos de RLS sem políticas, 2 funções definer executáveis por anon, 72 por authenticated e 1 aviso de proteção de senhas. Nenhum apontamento novo.
- Nenhuma venda, sessão, fechamento ou devolução real foi criada nos testes.
- **Frontend ainda não publicado.** A disponibilização do novo seletor requer publicar este projeto.
