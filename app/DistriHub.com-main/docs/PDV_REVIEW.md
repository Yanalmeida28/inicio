# Correções locais do PDV — revisão

Preparado em 28/09/2026 sobre `main`, commit `9fd109848fa5a8ef93de51f46f0a47c955ad128c`.
Nenhuma alteração foi aplicada ao projeto Supabase. A migration foi executada apenas em PostgreSQL efêmero em memória, com schema reduzido e dados sintéticos de testes.

## Arquivos alterados

- `src/components/PartnerPanel.tsx`: carregamento autorizado do PDV, aviso de sincronização e recuperação de tentativa pendente.
- `src/components/partner/PdvModule.tsx`: crédito calculado pelo backend, proteção síncrona contra clique duplo e erros da finalização de pré-venda.
- `src/components/partner/OpenOrdersModule.tsx`: tratamento de erro/processamento na finalização pelo fluxo de pedidos.
- `src/hooks/usePartnerData.ts`: tentativa persistida, reconciliação de dados, validação comum de faturado e remoção da baixa/movimentação inventada no React.
- `src/types.ts`: estados `parcial` e `cancelada` de `PartnerInvoice`, existentes em produção.

## Arquivos criados

- `src/lib/pdv.ts`: validação de crédito, classificação de erro e armazenamento restrito da tentativa.
- `supabase/migrations/20260928044542_fix_pdv_sales_reconciliation.sql`.
- `supabase/tests/pdv.test.mjs`: testes SQL e do armazenamento da tentativa.
- `supabase/tests/pdv-hook.test.mjs`: testes React com transporte Supabase simulado.
- `supabase/tests/fixtures/pdv_production.sql`: definições reais capturadas de produção, sem dados de usuários.
- `supabase/tests/fixtures/pdv_schema.sql`: schema reduzido para os testes.
- `supabase/tests/package.json` e `package-lock.json`: dependências isoladas de testes; o package/lock do aplicativo não foi alterado.
- Este relatório, `pdv-review.diff` e `pdv-rpc-vs-production.diff`.

## Migration criada

A migration parte de `pg_get_functiondef` de produção, consultado novamente nesta etapa. Não usa uma migration histórica como implementação-base.

MD5 das definições originais:

- `execute_partner_sale_mutation`: `ff8ec2a31ff5531cab50ff321e96c8f3`.
- `execute_partner_sale_delete`: `69da6ffaf9cedbc1759717dec51e395d`.

Uma guarda interrompe a migration se essas funções tiverem mudado. Nesse caso, é necessário comparar a nova definição e preparar novamente a alteração.

A função de venda recebe `p_commercial_salesperson_id uuid DEFAULT NULL`, separado do operador que autoriza. A assinatura antiga é removida dentro da mesma transação para evitar ambiguidade de overload no PostgREST. Chamadas existentes com os 15 argumentos continuam válidas; isso foi testado. Os grants anteriores de execução da função de venda foram preservados. Nenhuma dependência catalogada da assinatura antiga foi encontrada na consulta de produção.

## Correção 1 — Cancelamento faturado

- **Antes:** a venda era cancelada e o estoque devolvido, mas a fatura permanecia cobrando e consumindo crédito.
- **Depois:** a RPC bloqueia a fatura com `FOR UPDATE`. Uma fatura `aberta`, com `paid_amount = 0`, passa para `cancelada`; o registro e o vínculo com a venda permanecem.
- **Proteção:** qualquer recebimento positivo, ou status `parcial`/`paga`, bloqueia o cancelamento com mensagem explícita sobre a necessidade de estorno financeiro. Uma venda faturada sem fatura também é bloqueada para conciliação.
- A verificação financeira ocorre antes da devolução de estoque. Fatura, venda, entrada de estoque e auditoria pertencem à mesma transação.
- Fatura já cancelada sem recebimentos é preservada. A transição da venda impede segunda devolução.
- Nenhum recebimento é apagado ou restituído artificialmente. Não foi criado um fluxo de reembolso.
- Não há saneamento retroativo de faturas ligadas a vendas canceladas antes desta correção.

## Correção 2 — Funcionário

- **Antes:** operador nulo fazia a RPC usar o usuário autenticado do funcionário como empresa.
- **Depois:** um adaptador exclusivo do PDV resolve o vínculo por `partner_salespeople.auth_user_id`, incluindo empresa, vendedor, papel, filial e ativação. Vínculo ambíguo ou inativo é rejeitado.
- **Empresa/filial:** permanecem as verificações da filial pertencente à empresa, do cliente, dos produtos e da venda. Gerente/vendedor sem filial ou solicitando outra filial são bloqueados. A verificação de papel para concluir acompanha os papéis do PDV: administrador, gerente, caixa e vendedor. Cancelamento/exclusão seguem limitados a administrador e gerente.
- `resolve_partner_operator()` foi lida em produção. Seu contrato exige PIN para o operador explícito e não resolve funcionário com operador nulo. Ela também restringe o proprietário ao operador sem `auth_user_id`, diferentemente da RPC de venda instalada. Alterá-la globalmente poderia afetar outros módulos.
- O adaptador preserva a validação explícita de operador/PIN da venda de produção e usa o resolver compartilhado para o proprietário. A sessão própria de funcionário é autenticada pelo vínculo, sem persistir PIN.
- O adaptador é `SECURITY INVOKER`, sem execução concedida a clientes; é utilizado pelas funções autorizadas. A função de exclusão recebeu apenas a adaptação de identidade, mantendo a exclusão limitada a `pre_venda`.
- A atribuição comercial é validada na empresa/filial e preservada na conclusão da pré-venda e na fatura. A movimentação posterior do vendedor entre filiais não bloqueia estorno ou retry de uma venda histórica.

## Correção 3 — Idempotência

- **Antes:** a falha na leitura da fatura depois da RPC causava erro de checkout; a tentativa seguinte gerava outra venda.
- **Depois:** a tentativa mantém o ID e os dados comerciais em `sessionStorage`, separados por usuário/empresa e aba. Apenas campos explicitamente permitidos são persistidos; operador/PIN, JWT e chaves não fazem parte desse armazenamento.
- **Retry:** `Recuperar venda pendente` reutiliza os dados e o ID originais. Um carrinho diferente é bloqueado enquanto o resultado anterior é incerto.
- A RPC usa um advisory lock transacional por ID antes de buscar a venda com `FOR UPDATE`. Repetir uma venda concluída com os mesmos dados retorna o ID, sem nova baixa, fatura ou auditoria. Dados diferentes continuam rejeitados.
- Rejeição definitiva da primeira chamada por erro SQL conhecido libera a tentativa não gravada. Falha de transporte, erro de conexão ou resultado incerto mantém a tentativa para recuperação.
- Depois da confirmação da RPC, falha de sincronização gera aviso de operação confirmada, sem rejeitar a promessa do checkout. O carrinho é encerrado normalmente.
- Há bloqueio síncrono de clique duplo no checkout e no hook. A proteção existente ao adicionar itens foi preservada.
- Limite: o armazenamento é por aba e persiste em reload, não é um registro durável independente do navegador. Limpar o armazenamento/fechar a aba e reconstruir uma venda é uma nova operação. Tentativas incertas que não possam ser recuperadas permanecem bloqueadas para conciliação; não há botão que descarte silenciosamente a incerteza.

## Correção 4 — Sincronização

- **Crédito:** o PDV usa o saldo autorizado pelo backend para o cliente na empresa inteira, incluindo saldo parcial. Nenhum filtro de filial é aplicado à soma da dívida.
- **Invoices:** criação direta, finalização e cancelamento conciliam a lista com o banco. O tipo TypeScript aceita os quatro estados reais de produção.
- **Estoque:** a atualização vem dos produtos e movimentos persistidos. O frontend não escreve estoque nem reconstrói movimentos após a finalização, inclusive para serviços.
- **Pré-venda:** o hook comum valida cliente, permissão de crédito, saldo e total antes da RPC. Os dois modais exibem a rejeição e bloqueiam a confirmação enquanto processam. A RPC continua com a autoridade final e seus locks.
- **Leitura autorizada:** `get_partner_pdv_snapshot` retorna produtos/movimentos da filial, vendas conforme a autorização existente, faturas dessas vendas e totais de crédito dos clientes permitidos. Não devolve linhas de faturas de outras filiais ao funcionário.
- A nova leitura precisa de `SECURITY DEFINER` para calcular o saldo empresarial sem abrir leitura irrestrita de faturas pela RLS. Ela autentica e resolve a identidade, valida papel/empresa/filial, usa `search_path = ''` e permite execução somente a `authenticated`.
- Falha de sincronização limpa o crédito local disponível para validação e exibe aviso. `Atualizar dados do PDV` permite reconciliar novamente. PIX/dinheiro/cartão continuam sem exigir crédito.

## Revisão de segurança e escopo

- Nenhuma chave, JWT ou credencial de produção incluída no diff.
- `pin_hash` aparece somente como nome de coluna no SQL do servidor/fixture; nenhum valor é retornado ao frontend.
- `service_role` aparece apenas como nome do papel cujo grant preexistente foi preservado, nunca como chave.
- Nenhuma policy RLS alterada. Nenhuma tabela nova em produção proposta.
- `search_path` seguro preservado nas RPCs e definido nas funções novas.
- Bloco de crédito da RPC comparado literalmente com produção: sem alteração, incluindo `FOR UPDATE`.
- Locks e regras de baixa física/estoque negativo preservados. A leitura da venda segue com `FOR UPDATE`; foi adicionado lock da fatura no cancelamento e lock por ID para retry.
- `p_total` continua sendo o valor recebido e validado como antes. Recalcular preços, descontos e tabelas varejo/atacado é uma pendência separada, não implementada.
- Não houve mudança em autenticação global, recebimento financeiro, cadastro de produtos ou regras globais de serviços. No trecho de baixa do PDV, `is_service = NULL` agora é tratado como produto físico, de modo consistente com validação, movimento e devolução. A alteração posterior da classificação do produto continua fora desta etapa.

## Testes

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | Passou |
| `npm run build` | Passou; aviso de chunk acima de 500 kB |
| `npm run lint` | 57 erros e 10 avisos preexistentes; baseline: 57 erros e 13 avisos |
| Comparação de diagnósticos dos arquivos editados com `HEAD` | Nenhum diagnóstico novo |
| `npm test`, em `supabase/tests` | 35 testes passaram na retomada |

Os testes cobrem meios de pagamento, crédito parcial entre filiais, rollback de falha da fatura, pré-venda, serviços, quantidades repetidas, cancelamento com/sem recebimentos, permissões, atribuição comercial, compatibilidade da chamada antiga, recuperação de rede e clique duplo.

Os testes SQL usam PGlite com dados sintéticos e schema reduzido. Os testes React usam transporte simulado. Não substituem homologação com o schema completo, autenticação real, navegador e duas sessões concorrentes. Nenhuma venda de teste foi executada no Supabase. O teste em memória não é uma aplicação da migration a um projeto Supabase.

Para repetir os testes locais:

```text
cd app/DistriHub.com-main
npm run typecheck
npm run build
npm run lint
cd supabase/tests
npm ci
npm test
```

## Diff para revisão

- [Diff do frontend e migration completa](pdv-review.diff).
- [Diff das RPCs alteradas contra suas definições de produção](pdv-rpc-vs-production.diff). Esse comparativo não inclui as duas funções novas; elas estão na migration completa.

O frontend preparado depende da migration nova para a leitura autorizada e o argumento comercial. Não deve ser publicado isoladamente antes da revisão do conjunto. Nenhum comando de aplicação foi executado ou agendado.

BANCO DE PRODUÇÃO ALTERADO: NÃO  
MIGRATION APLICADA: NÃO (nenhum projeto Supabase)  
COMMIT: NÃO  
PUSH: NÃO  
DEPLOY: NÃO

## Relatório da retomada — 28/09/2026

### 1. Status

Correção local concluída e validada por 35 testes. Homologação com schema completo, PostgREST, autenticação real e concorrência ainda pendente. Não foi demonstrado funcionamento ponta a ponta em produção nem autorizada a aplicação.

### 2. Estado encontrado

Os cinco arquivos rastreados já continham as mudanças de frontend descritas acima. A migration, helper, duas suítes, fixtures, dependências de teste e três documentos também já existiam. O relatório anterior já registrava 31 testes; esse resultado foi conferido novamente, sem ser presumido como evidência atual.

O repositório está em `inicio/`, abaixo da pasta inicial. Também havia `inicio/pdv-migration.txt`, uma cópia anterior da migration, não mencionada na lista inicial. Foi preservada sem edição; não deve ser usada como artefato de aplicação. A proposta atual está exclusivamente em `supabase/migrations/20260928044542_fix_pdv_sales_reconciliation.sql`.

### 3. O que foi terminado agora

- Corrigida a baixa que ainda usava `NOT is_service`, apesar de a coluna aceitar NULL em produção. Agora usa `NOT COALESCE(is_service,false)`.
- Recuperação preserva o vendedor comercial original, inclusive NULL, quando muda o operador autorizador. Isso foi corrigido no hook e na escolha do vendedor pela RPC para uma venda existente.
- Adicionados quatro testes: produto com classificação NULL; retry SQL com outro autorizador; recuperação no hook com outro autorizador; bloqueio de fatura aberta com recebimento positivo.
- Reexecutadas as verificações e atualizados os dois diffs para revisão.

### 4. Arquivos exatos

Rastreados modificados, relativos a `app/DistriHub.com-main/`:

1. `src/components/PartnerPanel.tsx`
2. `src/components/partner/OpenOrdersModule.tsx`
3. `src/components/partner/PdvModule.tsx`
4. `src/hooks/usePartnerData.ts`
5. `src/types.ts`

Arquivos novos já presentes na retomada, ainda sem rastreamento:

1. `docs/PDV_REVIEW.md`
2. `docs/pdv-review.diff`
3. `docs/pdv-rpc-vs-production.diff`
4. `src/lib/pdv.ts`
5. `supabase/migrations/20260928044542_fix_pdv_sales_reconciliation.sql`
6. `supabase/tests/fixtures/pdv_production.sql`
7. `supabase/tests/fixtures/pdv_schema.sql`
8. `supabase/tests/package.json`
9. `supabase/tests/package-lock.json`
10. `supabase/tests/pdv-hook.test.mjs`
11. `supabase/tests/pdv.test.mjs`
12. `../../pdv-migration.txt` (relativo ao app; cópia anterior preservada).

Nesta retomada foram editados somente o hook, a migration, as duas suítes, este relatório e os dois diffs. Dependências e fixtures foram preservadas.

### 5. Migration, contratos e reversibilidade

Assinatura anterior de `public.execute_partner_sale_mutation`:

```sql
(p_salesperson_id uuid, p_pin text, p_sale_id uuid,
 p_customer_id uuid, p_customer_name text, p_items jsonb,
 p_total numeric, p_imei text, p_serial_number text,
 p_payment_method text, p_branch_id uuid, p_status text,
 p_origin text, p_customer_type text, p_delivery_type text)
RETURNS uuid
```

A nova assinatura mantém esses 15 argumentos, na mesma ordem, e acrescenta `p_commercial_salesperson_id uuid DEFAULT NULL`. A antiga é removida sem CASCADE na mesma transação. Não fica um overload antigo concorrente. O teste de 15 argumentos passa; a resolução HTTP pelo PostgREST ainda precisa de homologação.

`execute_partner_sale_delete(p_salesperson_id uuid, p_pin text, p_sale_id uuid) RETURNS uuid` mantém a assinatura. Ambas são SECURITY DEFINER, com `search_path = ''`; venda concede EXECUTE a authenticated e service_role, retirando PUBLIC/anon. Exclusão conserva os grants existentes por CREATE OR REPLACE, confirmados em produção como postgres/authenticated/service_role.

Novas funções:

- `resolve_partner_pdv_operator(uuid,text,uuid) RETURNS TABLE(company_id uuid,salesperson_id uuid,role text,branch_id uuid)`: SECURITY INVOKER, `search_path = ''`, execução revogada de PUBLIC/anon/authenticated.
- `get_partner_pdv_snapshot(p_branch_id uuid) RETURNS jsonb`: SECURITY DEFINER, `search_path = ''`, EXECUTE somente para authenticated entre os papéis de cliente; PUBLIC/anon revogados.

As consultas somente de leitura reconfirmaram hashes, grants e a definição real do resolver compartilhado e do helper de leitura de vendas. Nenhuma dependência catalogada da assinatura antiga foi encontrada. Nenhuma policy foi alterada. Clientes, produtos, vendas, vendedor comercial e filial são verificados dentro da empresa resolvida; leitura de vendas/faturas conserva o filtro do helper existente. Crédito agrega dívida empresarial sem retornar faturas de outra filial.

Reversibilidade: erro durante a migration aborta a transação, inclusive DROP/CREATE. Depois de aplicada e confirmada, desfazer exige uma migration inversa revisada e coordenação com a versão do frontend: remover a assinatura de 16 argumentos, restaurar definições/grants anteriores e remover os helpers sem dependências. Não foi criada nem executada essa reversão. Restaurar código não deve reabrir faturas canceladas, apagar histórico ou desfazer vendas reais. Reintroduziria também os defeitos anteriores; preferir correção adiante após análise.

### 6. Frontend revisado

| Fluxo | Estado final |
|---|---|
| createSale | ID e payload persistidos por tentativa; resposta confirmada encerra checkout mesmo com falha de sincronização |
| createPreSale | Continua criando pré-venda sem baixa; envia vendedor comercial separado do operador |
| finalizePreSale | Validação UX comum de faturado, RPC autoritativa e leitura de estoque/movimentos/invoice/crédito persistidos |
| cancelSale | RPC decide cancelamento financeiro/estoque; estado local indica confirmação e depois reconcilia |
| deleteSale | Usa RPC que só permite excluir pré-venda; concluídas/canceladas preservadas |
| Crédito/invoices | Snapshot autorizado, dívida aberta/parcial na empresa; ausência de snapshot bloqueia UX do faturado |
| Estoque/movimentos | Sem segunda baixa ou movimento sintético no frontend |
| Retry | Mesmo ID e dados originais; carrinho diferente bloqueado enquanto há resultado incerto |
| Operador/vendedor | Operador/PIN autorizam; atribuição comercial é campo separado e permanece estável no retry |

### 7. Testes executados

- `npm.cmd run typecheck`: passou.
- `npm.cmd run build`: passou; primeira tentativa bloqueada pelo sandbox, repetição autorizada fora dele. Aviso de chunk acima de 500 kB.
- `npm.cmd run lint`: 57 erros e 10 avisos.
- `npm.cmd test --prefix supabase/tests`: 35 passaram, nenhum falhou.
- `node pdv-review.cjs` na pasta inicial: passou; nenhum diagnóstico de lint introduzido nos arquivos tocados, nenhuma policy acrescentada, bloco de crédito da produção preservado literalmente. Também regenera os diffs.
- `git diff --check`: passou.

As suítes podem ser repetidas pelo comando acima, usando as dependências já instaladas. Não usam URL, chave ou conexão com produção. PGlite instancia PostgreSQL efêmero em memória; TRUNCATE e DDL ficam nesse banco sintético. As fixtures não devem ser executadas no Supabase de produção.

Cobertura dos critérios 1–20: pagamentos e faturado, pré-venda/finalização, serviços e NULL, idempotência de venda/invoice, falha após confirmação, crédito parcial empresarial, reconciliação, identidade/filial/PIN, vendedor, cancelamento financeiro, rollback e preservação de histórico estão cobertos por testes SQL/hook e inspeção dos callers. A cobertura não demonstra concorrência entre conexões reais ou comportamento do navegador/PostgREST.

### 8. Lint

Nenhum diagnóstico novo, por comparação das mensagens/regras/severidades com HEAD nos arquivos alterados. Os 57 erros e 10 avisos atuais são preexistentes. Há erros fora do escopo em App, AuthScreen, catálogo, administração, entregas e RMA; também permanecem diagnósticos antigos em trechos não alterados de PartnerPanel, usePartnerData e types. Não foi feita limpeza geral.

### 9. Pendências

- Alta prioridade: `p_total`/pricing ainda é confiado ao cliente; recálculo por preços persistidos não foi implementado.
- Não há saneamento retroativo de vendas anteriormente canceladas com dívida aberta.
- Não há estorno financeiro automático de recebimentos.
- Recuperação usa sessionStorage por aba; fechar/limpar a aba perde essa persistência. Tentativas incertas exigem conciliação se não puderem ser recuperadas.
- Criação de pré-venda conserva seu fluxo anterior de UUID por chamada; a persistência de tentativa implementada cobre checkout de venda direta. Não gera estoque/invoice ao salvar pré-venda.

### 10. Riscos antes de produção

- Homologar com schema/triggers/constraints completos e chamadas PostgREST com 15 e 16 argumentos.
- Exercitar sessão real de owner, funcionário e operador/PIN; grants e RLS reais, incluindo as restrições existentes de leitura de vendas por vendedor.
- Executar duas conexões concorrentes para retry do mesmo ID, disputa de estoque/crédito e recebimento versus cancelamento. O teste em memória não demonstra essas interações.
- Guard por hash cobre as duas RPCs antigas, não todas as dependências. Reconfirmar resolver, helper de leitura, grants e schema antes da aplicação.
- Publicação do frontend depende das novas RPCs; coordenar versões. Não publicar este frontend isoladamente.
- Snapshot carrega todos os produtos/movimentos/vendas autorizados da filial; medir custo em uma filial grande.
- Classificação de um produto alterada entre venda e cancelamento continua sendo uma limitação histórica a avaliar separadamente.

### 11. Diff final

`git diff --stat`: 5 arquivos rastreados, 289 inserções e 241 exclusões. Arquivos novos não entram nesse total. Os dois diffs em docs foram regenerados com o estado atual. Nenhuma alteração funcional fora de PDV/vendas/estoque/identidade/reconciliação foi acrescentada; `pdv-migration.txt` já existia e ficou intacto.

### 12. Confirmação final

Migration NÃO aplicada a qualquer projeto Supabase. Banco de produção NÃO alterado. Commit NÃO realizado. Push NÃO realizado. Deploy NÃO realizado. O SQL proposto foi executado somente no banco efêmero dos testes. Trabalho encerrado para revisão humana.

Referência consultada para contratos e permissões de funções: [documentação oficial Supabase](https://supabase.com/docs/guides/database/functions). O [changelog](https://supabase.com/changelog) também foi consultado; não houve upgrade de banco ou dependências nesta tarefa.
