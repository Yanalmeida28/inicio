# PDV — preço autoritativo no backend

Base: `676c09fbce1ad514247cca749a40c8b9c1c551e9`, branch `main`.
Esta etapa é local, sem commit, push, deploy ou aplicação no Supabase.
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

34 testes adicionais de pricing, além dos 35 cenários anteriores. Alguns dados dos testes antigos foram corrigidos para que unit_price × quantity corresponda ao total e ao catálogo sintético; os objetivos de estoque/crédito/rollback desses testes foram preservados.

Cobertura: total legítimo/adulterado para menos/mais, unit_price e subtotal adulterados, quantidade zero/negativa/fracionária/ausente/excessiva, linhas repetidas, produto inexistente/outra empresa/outra filial, varejo, atacado cadastrado e sem cliente, fallback, preço zero, centavos, NUMERIC, serviços, is_service NULL, faturado, limite insuficiente, pré-venda/finalização, preços alterados depois da cotação, legado sem prova, retry, requisição duplicada, clique duplo, rollback, ausência de baixa/invoice/prova em rejeição, acesso negado ao helper/tabela e tentativa de gravar preço diretamente.

Não existe teste de desconto válido porque não existe esse fluxo no PDV. Há teste de rejeição de campo de desconto e preço manipulado.

## 15. Resultado total

69 testes passaram; 0 falhas; 0 ignorados. Usam PostgreSQL PGlite efêmero, schema reduzido e dados sintéticos, mais transporte React simulado. As migrations foram executadas somente nesse banco em memória.

O teste com Promise.all submete duas requisições ao mesmo banco em memória; PGlite serializa sua conexão. Não equivale a um teste de duas conexões PostgreSQL concorrentes reais.

## 16. Validações

- `npm.cmd run typecheck`: passou.
- `npm.cmd run build`: passou; aviso existente de chunk acima de 500 kB.
- `npm.cmd run lint`: 57 erros e 10 avisos preexistentes.
- Comparação de lint com HEAD 676c09f nos arquivos TS/TSX tocados: nenhum diagnóstico introduzido.
- `npm.cmd test --prefix supabase/tests`: 69 passaram.
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

O relatório final no chat registra `git diff --stat` e `git status --short` após esta documentação. O diff rastreado não inclui esta documentação nem a segunda migration enquanto permanecerem untracked. Nenhum arquivo foi staged.

## Confirmações

BANCO DE PRODUÇÃO ALTERADO: NÃO

MIGRATION APLICADA: NÃO (nenhum projeto Supabase; somente testes efêmeros)

COMMIT: NÃO

PUSH: NÃO

DEPLOY MANUAL: NÃO

Referências de implementação: [funções Supabase e permissões](https://supabase.com/docs/guides/database/functions), [NUMERIC do PostgreSQL](https://www.postgresql.org/docs/current/datatype-numeric.html). A regra comercial veio do schema/contratos reais e do frontend inspecionado, não dessas referências gerais.
