# Correções do Histórico — 14/10/2026

As sete falhas da auditoria foram corrigidas no projeto. Publicação pendente, junto às correções de Ordens de Serviço. A migração de Histórico foi aplicada em produção como 20261015013718 e conferida antes da publicação do frontend.

## Alterações

1. Gerentes e proprietários autenticados confirmam o cancelamento sem exigir outro cadastro de supervisor. A identidade e as permissões são novamente validadas no servidor.
2. Caixa/vendedor informam um supervisor separado do executor. A nova RPC cancel_partner_history_sale valida PIN, atividade, empresa, filial e acesso ao módulo; registra executor e autorizador separadamente na auditoria. Não modifica a identidade da sessão nem enfraquece o endpoint antigo.
3. partner_sales.completed_at é registrado por trigger na conclusão, inclusive de serviços e pré-vendas de dias anteriores. O horário é definido pelo banco e preservado nas alterações/cancelamentos. Registros antigos recebem a primeira evidência de saída de estoque ou lançamento de venda em caixa da mesma empresa/filial. Quando não existe evidência recuperável, o campo permanece nulo e o Histórico mantém o fallback da data disponível.
4. A tela é remontada ao trocar empresa, filial, operador ou papel. Ao sair da aba, remove a autorização e invalida respostas pendentes. Uma resposta de contexto antigo não fecha nem altera o modal atual.
5. Retirada a ação Apagar Venda do Histórico. O cancelamento preserva os registros.
6. Travas síncronas na tela e no hook evitam requisições concorrentes. Backdrop, fechamento e credenciais ficam bloqueados durante o envio. O banco devolve o mesmo resultado em uma repetição já cancelada, sem novo estoque, estorno ou auditoria de autorização.
7. Datas iniciais, Hoje e filtros locais usam America/Sao_Paulo, assim como a consulta e a apresentação.

## Proteções financeiras

A reversão utiliza uma cópia privada e restrita a cancelamento da implementação autoritativa atual de estoque/faturas, com autorização de supervisor separada. A migração verifica os pontos de integração antes de gerar essa função. Apenas o endpoint validado pode chamá-la; anon e authenticated não recebem acesso direto ao resolvedor ou à implementação interna.

A operação preserva a ordem de bloqueios de venda/caixa/estoque. Os gatilhos financeiros existentes continuam rejeitando caixa fechado e devolução financeira. Faturas com recebimentos continuam bloqueadas; fatura aberta sem recebimento pode ser cancelada. Devoluções físicas válidas também exigem seu fluxo próprio. A RPC recebe identificador e filial, carrega os dados da venda no banco e não confia em preços/itens enviados pelo navegador.

A revisão seguiu as skills Supabase e Supabase Postgres Best Practices, incluindo privilégios mínimos e ordem consistente de locks. Não houve alteração de dados comerciais em produção durante as correções.

## Arquivos desta correção

- src/components/partner/SalesHistoryModule.tsx
- src/components/PartnerPanel.tsx (também contém a alteração pendente de OS)
- src/hooks/usePartnerData.ts
- supabase/migrations/20261015013718_fix_sales_history_cancellation_and_completion.sql
- supabase/tests/history-page-ui.test.mjs
- supabase/tests/cash-register.test.mjs
- supabase/tests/pdv-hook.test.mjs

## Validação

Validação final: 469 testes passaram, sem falhas ou casos ignorados. A suíte de caixa foi também executada com a migração de números de venda atualmente usada em produção: 56 testes passaram, incluindo busca por número após a alteração de datas. Os testes de hook passaram com 42 casos; os de interface do Histórico passaram com 13 casos. A suíte completa inclui os testes pendentes de Ordens de Serviço.

TypeScript, ESLint, build e git diff --check passaram na validação final. Os pontos de integração da migração foram também conferidos nas definições de produção por consulta somente de leitura.

Não foi realizada homologação manual com credenciais reais dos três papéis. A aprovação desta etapa se refere às verificações automatizadas e à revisão do código, não à publicação.

## Publicação posterior

Migração 20261015013718_fix_sales_history_cancellation_and_completion aplicada e conferida: campo/gatilho de conclusão presentes, consulta atualizada, RPC pública invoker, execução autenticada permitida, execução anônima negada e resolvedor privado. Advisors mantiveram as contagens anteriores, sem apontamentos novos. A migração de OS 20261015010204_fix_service_order_customer_and_billing já foi aplicada na etapa anterior e não deve ser reaplicada.

Publicar o frontend com as correções pendentes de OS e Histórico usando a lista explícita de arquivos; não incluir artefatos temporários de auditoria e browser. Não registrar PIN em logs. Não realizar cancelamentos de vendas reais para validar a publicação.
