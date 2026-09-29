# PDV — preço autoritativo no backend

Base: `676c09fbce1ad514247cca749a40c8b9c1c551e9`, branch `main`.
Retomada do WIP local `490f6764f3033b07950d1622e0d5c457d3167033`, posterior à base publicada acima. As correções desta retomada permanecem sem novo commit, push, deploy ou aplicação no Supabase.
O relatório `PDV_REVIEW.md` e seus diffs permanecem como registro da etapa anterior.

## 1. Regra encontrada

Inspecionados o schema real, constraints, funções e triggers por consultas somente de leitura ao projeto DistriHub.com (`kcxefjgchxhvcfppglvp`). Nenhum dado pessoal foi necessário.

O PDV escolhe a tabela pela classificação `customer_type`. Com cliente cadastrado, usa `atacado` somente quando o cadastro tem esse valor; nos demais casos usa `varejo`. Sem cliente, o operador pode escolher varejo ou atacado. O frontend permite explicitamente ambos sem cadastro. Faturado continua exigindo cliente e autorização de crédito.

O subtotal é quantidade inteira multiplicada pelo preço unitário. O total é a soma dos subtotais. Não há frete, tributo, desconto ou acréscimo no cálculo deste PDV.

## 2. Tabelas e colunas reais

| Tabela | Colunas relevantes |
|---|---|
| partner_products | id, user_id, branch_id, sale_price NUMERIC(10,2), wholesale_price NUMERIC, stock INTEGER, is_service BOOLEAN nullable |
| partner_customers | id, user_id, branch_id, customer_type, price_table, customer_group, credit_limit NUMERIC(10,2), allow_credit, is_active |
| partner_sales | id, user_id, branch_id, customer_id, customer_type, items JSONB, total NUMERIC(10,2), status, origin, salesperson_id |
| partner_invoices | sale_id, customer_id, amount NUMERIC(10,2), paid_amount NUMERIC, status, branch_id, salesperson_id |
| partner_permission_overrides / permission_overrides | discount_override_limit, sem uso no cálculo do PDV |

Constraints reais exigem sale_price e wholesale_price não negativos e com duas casas decimais; wholesale_price permite NULL. Não existe coluna de produto ativo em partner_products. Não foi inventado esse filtro. Serviços pertencem à mesma tabela de produtos. service_order_items é outro fluxo e não fornece preço para o PDV.

Não foi encontrada tabela de preços por cliente. Existem preços de combos e modificadores em outras tabelas, mas PdvModule não os utiliza para montar itens ou calcular total.

## 3. Varejo

Usa `partner_products.sale_price`. Preço zero é aceito quando é o valor persistido no catálogo. Produto deve existir na empresa e filial da venda.

## 4. Atacado/B2B

Usa `wholesale_price` quando positivo; caso contrário usa `sale_price`, exatamente como o frontend existente. O tipo informado para um cliente cadastrado deve corresponder ao cadastro. A classificação de uma cotação já validada é preservada na finalização.

Divergência documentada: `price_table` permite varejo/atacado/premium no cadastro, mas o PDV e a RPC de produção não o consultam. Não há contrato que defina prioridade entre price_table e customer_type nem preços premium persistidos. Esta alteração preserva customer_type e não inventa uma tabela premium. A definição de outra regra comercial exige etapa própria.

## 5. Serviços

Mesmo preço de catálogo e validação financeira dos produtos físicos. A validação de pricing não escreve estoque. Os blocos anteriores de estoque, serviços, NULL e cancelamento foram comparados literalmente entre as migrations e permanecem iguais.

## 6. Descontos

O PDV atual não oferece entrada de desconto ou edição manual de preço. partner_sales não tem coluna de desconto. Há limites de desconto no cadastro de permissões, mas não existe vínculo implementado entre esses limites, a venda e uma autorização persistida.

Não foi criado desconto autorizado fictício. Preço unitário diferente do catálogo e campos extras de desconto no item são rejeitados. `subtotal`, se enviado, deve corresponder ao produto da quantidade pelo preço autorizado. Um fluxo futuro de desconto precisa definir base, unidade, limite e autorização persistida antes de ser permitido.

## 7. Pré-venda

Comportamento observado: createPreSale grava itens/preços/total e finalizePreSale reenvia esses mesmos dados. Não recalcula preços vigentes. Portanto, novas pré-vendas validadas preservam sua cotação, inclusive se preços ou classificação do cliente mudarem depois.

Problema de confiança: as pré-vendas antigas armazenavam valores fornecidos pelo navegador. Persistência antiga não prova autorização financeira. Não é seguro aceitar todos esses preços como cotações autorizadas.

Proposta implementada para esse conflito:

- Nova pré-venda: validar catálogo e gravar cotação protegida na mesma transação.
- Finalização: exigir os mesmos itens, cliente, classificação e total; usar o total da cotação protegida.
- Pré-venda antiga sem cotação protegida: validar os valores antigos contra o catálogo atual. Se divergirem, bloquear; não substituir preços ou alterar o total silenciosamente.
- Uma divergência antiga requer revisão comercial e uma nova cotação explícita. Não houve backfill ou alteração de vendas antigas.

## 8. Vulnerabilidade anterior

A RPC aceitava p_total e unit_price fornecidos pelo cliente, verificava basicamente que total não era negativo e usava p_total em venda, limite de crédito e invoice. O navegador podia enviar total menor, mantendo itens reais e consumindo menos crédito que o devido.

## 9. Correção implementada

`validate_partner_pdv_prices` calcula em NUMERIC, usando catálogo persistido. Valida empresa, filial, cliente, classificação, produto, preço unitário, quantidade positiva inteira, subtotal opcional e total. Rejeita carrinho vazio, campos não suportados, valores não finitos, preços negativos/subcentavos e estouro de capacidade. Valida cada linha antes de agregar quantidades, evitando compensar uma quantidade negativa com outra positiva.

Os produtos são bloqueados em ordem de UUID, como no estoque, impedindo mudança de catálogo durante a validação. `p_total` permanece um valor declarado e deve ser exatamente igual ao total autorizado. O total calculado é usado em crédito, venda e invoice.

`partner_pdv_price_snapshots` guarda cotações validadas pela RPC. Possui RLS e nenhum acesso concedido a PUBLIC/anon/authenticated. A FK diferida permite criar a prova antes da venda na mesma transação e remove a prova ao excluir uma pré-venda. Cancelamento conserva o histórico.

O trigger `guard_partner_pdv_price_snapshot` impede INSERT/alteração financeira direta de venda PDV sem cotação correspondente. Também bloqueia finalização direta de pré-venda antiga sem prova. Não altera policies existentes nem expõe a tabela no frontend. Operações financeiras sem mudança dos valores de uma venda histórica continuam possíveis.

Frontend: apenas a soma do checkout e da pré-venda passa a trabalhar em centavos inteiros, evitando declarar 0.30000000000000004 para 3 × 0.10. Isso não autoriza preços: o backend continua verificando cada item.

## 10. Assinatura final

```sql
public.execute_partner_sale_mutation(
  p_salesperson_id uuid,
  p_pin text,
  p_sale_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_items jsonb,
  p_total numeric,
  p_imei text,
  p_serial_number text,
  p_payment_method text,
  p_branch_id uuid,
  p_status text,
  p_origin text,
  p_customer_type text,
  p_delivery_type text,
  p_commercial_salesperson_id uuid DEFAULT NULL
) RETURNS uuid
```

## 11. Compatibilidade

Mesma assinatura da correção anterior, sem novo overload. Chamadas de 15 argumentos continuam funcionando e são testadas. CREATE OR REPLACE preserva grants authenticated/service_role e SECURITY DEFINER com search_path vazio. Resolver de identidade, PIN, vendedor comercial, cancelamento e exclusão não foram alterados.

Payloads financeiros inconsistentes, quantidades fracionárias, campos extras não suportados e totais com ruído de ponto flutuante passam a ser rejeitados. Callers precisam declarar centavos exatos. O frontend foi ajustado para isso. Não há novo parâmetro obrigatório nem chamada adicional do frontend.

## 12. Arquivos modificados

Relativos ao app:

- `src/components/partner/PdvModule.tsx`
- `src/lib/pdv.ts`
- `supabase/tests/fixtures/pdv_schema.sql`
- `supabase/tests/pdv.test.mjs`

Novos:

- `supabase/migrations/20260928195329_enforce_pdv_authoritative_pricing.sql`
- `docs/PDV_PRICING_REVIEW.md`

`inicio/pdv-migration.txt` permanece intacto e fora do Git. A CLI criou um arquivo temporário de versão, removido nesta etapa; não integra a correção.

## 13. Migration final

Segunda migration criada com `supabase migration new enforce_pdv_authoritative_pricing`. A primeira, já commitada, permanece intacta. Isso evita reescrever histórico sem saber se ela foi usada em outro ambiente.

Ordem proposta para revisão futura: primeiro 20260928044542; depois 20260928195329. A segunda exige por hash a RPC resultante da primeira (`a73dc201a8af453d062a95f4953796c4`) e substitui somente execute_partner_sale_mutation, além de criar a tabela de prova, helper e trigger descritos acima. Não executar migrations históricas indiscriminadamente.

As consultas de produção nesta etapa confirmaram ainda a assinatura antiga de 15 argumentos e os hashes anteriores de venda/exclusão. Não havia trigger em partner_sales. Nenhum SQL de escrita foi enviado a produção.

Ambas as novas funções têm search_path vazio e execução revogada dos clientes. Helper: SECURITY INVOKER. Trigger: SECURITY DEFINER para consultar a prova protegida, sem abrir acesso direto à tabela.

DDL e alterações de função são transacionais. Erro aborta a segunda migration inteira. Reversão após aplicação exigiria restaurar a função da primeira migration e revisar a retirada de trigger/provas; não foi executada nem preparada uma reversão destrutiva. Remover provas impediria comprovar as cotações futuras e não deve ser feito automaticamente.

## 14. Testes adicionados

40 testes adicionais de pricing, além dos 35 cenários anteriores. Alguns dados dos testes antigos foram corrigidos no WIP para que unit_price × quantity corresponda ao total e ao catálogo sintético; os objetivos de estoque/crédito/rollback desses testes foram preservados.

Cobertura: total legítimo/adulterado para menos/mais, unit_price e subtotal adulterados, quantidade zero/negativa/fracionária/ausente/excessiva, linhas repetidas, produto inexistente/outra empresa/outra filial, varejo, atacado cadastrado e sem cliente, fallback, preço zero, centavos, NUMERIC, serviços, is_service NULL, faturado, limite insuficiente, pré-venda/finalização, preços alterados depois da cotação, legado sem prova, retry, requisição duplicada, clique duplo, rollback, ausência de baixa/invoice/prova em rejeição, acesso negado ao helper/tabela e tentativa de gravar preço diretamente.

Não existe teste de desconto válido porque não existe esse fluxo no PDV. Há teste de rejeição de campo de desconto e preço manipulado.

## 15. Resultado total

75 testes passaram na retomada; 0 falhas; 0 ignorados. Usam PostgreSQL PGlite efêmero, schema reduzido e dados sintéticos, mais transporte React simulado. Os arquivos SQL foram executados somente nesse banco em memória, sem aplicar migration em projeto Supabase.

O teste com Promise.all submete duas requisições ao mesmo banco em memória; PGlite serializa sua conexão. Não equivale a um teste de duas conexões PostgreSQL concorrentes reais.

## 16. Validações

- `npm.cmd run typecheck`: passou.
- `npm.cmd run build`: passou; aviso existente de chunk acima de 500 kB.
- `npm.cmd run lint`: 57 erros e 10 avisos preexistentes.
- Comparação de lint com HEAD 676c09f nos arquivos TS/TSX tocados: nenhum diagnóstico introduzido.
- `npm.cmd test --prefix supabase/tests`: 75 passaram.
- `git diff --check`: passou.

## 17. Crédito/faturado

Mantidos lock do cliente e soma empresarial de dívida aberta/parcial, inclusive entre filiais. A comparação usa v_authorized_total. Invoice recebe esse mesmo valor e mantém unicidade por sale_id. Falha financeira reverte prova, venda, estoque, movimentos, invoice e auditoria.

## 18. Retry/idempotência

Permanece o advisory lock por sale_id e a comparação completa da operação já concluída. Retry exato retorna antes de consultar preço atual; mudança posterior de catálogo não cria nova venda nem reprecifica a original. Alteração do total/preço/dados originais é rejeitada. Estoque, invoice, prova e auditoria não são duplicados. Não houve alteração no armazenamento de tentativa nem na recuperação do hook.

## 19. Riscos restantes

- Homologar em PostgreSQL com schema, RLS, triggers e autenticação completos, além de PostgREST.
- Testar duas conexões reais disputando catálogo, estoque, crédito e o mesmo sale_id.
- Revisar operacionalmente as pré-vendas antigas cujo preço não possa ser provado pelo catálogo atual. Ficam bloqueadas; não há aprovação automática de preço histórico.
- price_table/premium e concessão de descontos continuam sem contrato implementado. Não foram ativados.
- Escritas diretas de preços PDV antes aceitas pela RLS passam a exigir a RPC; os callers do aplicativo inspecionados já usam RPC. Validar integrações externas.
- O trigger é limitado ao PDV (origem antiga ou nova pdv); esta etapa não audita preços de outros canais nem transforma as permissões históricas de escrita em uma proteção geral de estoque.
- Usuários com autoridade para alterar o catálogo continuam determinando preços persistidos. Restringir cadastro de produtos é uma revisão de autorização separada.
- Venda histórica concluída não é reprecificada nem saneada por esta etapa.
- Persistência da tentativa continua limitada ao sessionStorage por aba.
- Guard por hash pode exigir revisão se as funções/dependências mudarem antes da aplicação.

## 20–21. Diff e status

HEAD permanece em `490f676`; `origin/main` local permanece em `676c09f`. Os seis arquivos do escopo já integram o WIP. Nesta retomada, somente este relatório, a segunda migration e `supabase/tests/pdv.test.mjs` receberam alterações adicionais, sem staging. O arquivo `pdv-migration.txt` permanece não rastreado e não foi lido nem utilizado.

## 22. Correções e validação da retomada

- Retry exato de pré-venda com cotação protegida retorna sem reconsultar preços ou duplicar auditoria. A comparação inclui todos os dados da operação; pré-venda sem prova continua passando pelo catálogo.
- Quantidades repetidas são agregadas por UUID convertido, também na validação de preço. Formatos textuais equivalentes do mesmo UUID não contornam o limite agregado na pré-venda.
- Seis novos testes cobrem esses casos, total não finito, campos numéricos malformados, adulteração de cada campo financeiro na finalização, serviço atacadista no teto de NUMERIC(10,2), invoice correspondente e INSERT/UPDATE negados na cotação.
- Typecheck e build passaram nesta execução. O build precisou de execução local fora do sandbox por bloqueio de leitura do Vite; manteve apenas o aviso de chunk acima de 500 kB.
- Lint: 57 erros e 10 avisos. Comparação dos diagnósticos dos dois arquivos frontend com `676c09f` confirma ausência de novos diagnósticos.
- Nenhuma consulta ao Supabase de produção foi necessária nesta retomada. As observações de schema de produção nas seções anteriores são o registro da investigação preservada no WIP, não uma nova confirmação.
- A assinatura RPC e seus grants permanecem iguais. Tabelas e funções de aplicação estão qualificadas por schema; funções internas PostgreSQL resolvem em pg_catalog com search_path vazio. Mantidos RLS, revokes dos clientes, helper INVOKER, RPC/trigger DEFINER e transação única.
- Continuam pendentes homologação em PostgreSQL/PostgREST completos e concorrência com conexões reais; PGlite serializa a conexão de teste.

## 23. Correções locais após pré-homologação (2026-09-29)

Base desta rodada: `b9de99562cabfd22720c8a0e22360ed768444dc5`. Nenhuma alteração desta rodada foi staged ou commitada. Os resultados abaixo atualizam a validação de 75 testes registrada anteriormente.

### Tentativa de pré-venda

`createPreSale` passa pelo mesmo `createSale` que já persiste a tentativa em sessionStorage, valida a confirmação pelo UUID, bloqueia submissão simultânea e distingue rejeição definitiva de resposta incerta. O status `pre_venda` faz parte da chave do payload; recuperação não transforma pré-venda em venda concluída. O estado local usa `payment_status=pendente`. A tentativa não guarda PIN, JWT ou campos extras; operação confirmada limpa a tentativa, e uma operação posterior recebe outro UUID. Payload divergente é bloqueado. Recuperação após recarga pode usar a ação existente de recuperar venda pendente.

### Exclusão de cliente e cotação

Produção confirmou `partner_sales.customer_id REFERENCES partner_customers(id) ON DELETE SET NULL`. A cotação recebe a mesma FK. O guard permite desvincular cliente exclusivamente durante trigger aninhado, com cliente anterior já inexistente, novo vínculo NULL e igualdade de todos os demais campos da linha. Uma atualização direta para NULL com cliente existente continua rejeitada. A exclusão atualiza as duas referências atomicamente; itens, quantidade, preço, subtotal, total e classificação permanecem intactos. Uma pré-venda assim desvinculada pode ser finalizada à vista com sua cotação; faturado continua exigindo cliente.

### Recebimentos: contrato real e correção mínima

Definição consultada em produção: `public.record_partner_invoice_payment(p_invoice_id uuid, p_amount numeric) RETURNS uuid`, SECURITY DEFINER, search_path vazio, EXECUTE para authenticated/service_role, sem acesso PUBLIC/anon. Hash: `0b74bf64cd8f96a3d7201b578c2cf534`.

A função exige auth.uid(), bloqueia a invoice com FOR UPDATE e filtra `invoice.user_id=auth.uid()`. Portanto o contrato existente é de owner; vínculo de funcionário por `partner_salespeople.auth_user_id` não concede recebimentos. Owner opera as filiais de sua empresa; outra empresa não é autorizada. Não foi ampliado esse contrato nem criado parâmetro de identidade fornecido pelo cliente.

`partner_profiles.id` é UUID e identifica o owner. A coluna `partner_profiles.user_id` não existe. A migration local `20260929181116_fix_partner_invoice_payment_profile.sql`, criada pela CLI, substitui somente essa referência e rejeita recebimentos não finitos, não positivos ou com subcentavos. Preserva assinatura, grants, lock, saldo, recebimento parcial/total, paid_at e auditoria transacional. O guard exige o hash da definição real antes da substituição. O fixture `pdv_payment_production.sql` preserva a definição consultada, sem dados reais.

A RPC de recebimentos NÃO tem chave de idempotência: duas chamadas parciais iguais são dois recebimentos, enquanto houver saldo. Não foi inventado retry automático. Em resposta incerta, reconciliar o saldo antes de repetir. O teste explicita esse contrato; saldo integral já pago rejeita nova cobrança.

### Verificação e nova pré-homologação

- 88 testes passaram; zero falhas/ignorados, incluindo os 75 anteriores. O frontend calcula o saldo de recebimento em centavos inteiros, evitando subcentavos de ponto flutuante ao quitar uma invoice decimal.
- Testes novos: pré-venda após recarga/resposta perdida, UUID/payload persistidos sem credenciais, rejeição definitiva/incerta, clique simultâneo, FK real de exclusão de cliente, proteção financeira posterior, recebimentos abertos/parciais/totais, owner/funcionário/outra empresa, valores inválidos e rollback de auditoria.
- Typecheck, build e diff-check passaram. Build conserva o aviso de chunk acima de 500 kB.
- Lint somente em `src/hooks/usePartnerData.ts`: 12 erros e 4 avisos preexistentes; comparação com HEAD não encontrou diagnóstico introduzido (antes: 12 erros e 5 avisos). Sem limpeza geral.
- Reconsulta somente de leitura confirmou assinaturas/hashes das três RPCs de produção, perfil por id UUID, FK SET NULL, índice único válido de invoice por venda e ausência de permissão UPDATE direta em vendas para authenticated.
- Os guards da primeira migration e da correção de recebimentos correspondem à produção. A execução em memória da primeira seguida da segunda confirmou o guard intermediário da RPC. Não há novo overload.
- Primeira migration: PRONTA para homologação controlada. Segunda migration corrigida: PRONTA para homologação controlada. Recebimentos: PRONTO para homologação controlada com o contrato owner-only existente. Nenhuma migration aplicada em projeto Supabase.

### Pendências preservadas

PGlite não substitui homologação com conexões PostgreSQL concorrentes e PostgREST reais. A tentativa permanece por identidade/empresa e por aba em sessionStorage; não cobre perda desse armazenamento ou nova aba. Permissões existentes de pin_hash continuam pendência separada e não foram alteradas. A invoice histórica aberta ligada a venda cancelada não foi corrigida. Não houve backfill de cotação, limpeza histórica ou escrita em produção.

## Confirmações

BANCO DE PRODUÇÃO ALTERADO: NÃO

MIGRATION APLICADA: NÃO (nenhum projeto Supabase; somente testes efêmeros)

COMMIT: NÃO

PUSH: NÃO

DEPLOY MANUAL: NÃO

Referências de implementação: [funções Supabase e permissões](https://supabase.com/docs/guides/database/functions), [NUMERIC do PostgreSQL](https://www.postgresql.org/docs/current/datatype-numeric.html). A regra comercial veio do schema/contratos reais e do frontend inspecionado, não dessas referências gerais.
