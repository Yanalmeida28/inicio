# Análise do DistriHub — 07/10/2026

**Atualização:** as correções de sincronização, isolamento de falhas, lint, menu e descrição fiscal foram implementadas após esta análise. Veja [o registro das correções](APP_CORRECTIONS_2026-10-07.md). Os achados abaixo registram a versão anterior.

Base: commit 08265161a6c38f95a844b73080ec44adc352841a.
Escopo: leitura de código, testes automatizados, lint, workflow de publicação e metadados/advisors do Supabase. Nenhuma alteração de comportamento, migration, dado comercial ou publicação foi realizada nesta análise. Este arquivo é o único artefato novo.

## Resultado

Os fluxos de venda, pré-venda, caixa, preços, devoluções e isolamento de acesso têm cobertura automatizada relevante. Os 178 testes passaram. O lint falhou com 53 erros e 11 avisos. Isso não equivale à validação de todos os fluxos no navegador ou à certificação de segurança de todas as RPCs.

## 1. Alta — leituras concorrentes podem substituir um estado recente da venda na tela

Referências: src/hooks/usePartnerData.ts:327, :598, :1628 e :1641.

loadData e refreshPdv escrevem nas mesmas coleções, mas usam contadores independentes: requestIdRef e pdvRequestId. A gravação/finalização da venda não invalida uma leitura geral anterior.

Cenário possível: a sincronização periódica consulta as vendas antes da finalização; enquanto termina de consultar as outras tabelas, a venda é finalizada e refreshPdv mostra o estado concluído. Ao terminar, loadData pode substituir esse estado pelo resultado anterior com pre_venda.

É um risco identificado por inspeção, não uma ocorrência reproduzida nesta análise. Pode explicar uma regressão visual temporária; não comprova que as vendas relatadas anteriormente foram reabertas no banco.

Recomendação: coordenar as versões das leituras e gravações das coleções compartilhadas; invalidar snapshots anteriores após uma mutação e testar respostas fora de ordem.

## 2. Média — sincronização periódica recarrega todo o histórico

Referências: src/hooks/usePartnerData.ts:207, :382–528 e :722.

A cada 30 segundos, synchronize chama loadData(true), que percorre todas as páginas de vendas, produtos, clientes, auditoria, movimentos, faturas e ordens de serviço, incluindo fotos. O proprietário carrega os registros da empresa, independentemente da filial selecionada na interface.

Consequência: volume de consultas, tráfego e memória cresce com o histórico e o número de dispositivos abertos. Não foi realizado benchmark de latência ou custo.

Recomendação: sincronizar inicialmente as coleções operacionais da filial ativa; carregar histórico, auditoria e fotos sob demanda com paginação no servidor. Não usar a leitura integral da empresa como rotina de atualização.

## 3. Média — falha em uma tabela secundária impede atualizar as vendas

Referência: src/hooks/usePartnerData.ts:564–566.

No modo background, qualquer erro em secondaryResults aborta antes de setData. Uma falha em fotos de OS, fornecedores ou auditoria pode impedir o aproveitamento de uma leitura válida de vendas e estoque. A tela preserva os dados antigos e mostra o erro, mas os dados operacionais deixam de ser atualizados.

Recomendação: preservar somente as coleções que falharam, atualizar as demais e indicar quais módulos estão desatualizados.

## 4. Média — lint não passa e não bloqueia a publicação

Referências: package.json; inicio/.github/workflows/deploy.yml.

npm run lint encontrou 53 erros e 11 avisos: imports/variáveis sem uso, tipos any e dependências de hooks, entre outros. O deploy valida TypeScript e testes, mas não executa lint. Nem todo aviso corresponde a um defeito em produção.

Recomendação: corrigir primeiro avisos de hooks e erros de tipagem relevantes; depois limpar o restante e tornar lint obrigatório no workflow.

## 5. Fiscal — capacidade ainda limitada a solicitações pendentes

Referências: src/components/partner/FiscalModule.tsx:193–224, :252 e :535–537.

A interface registra documentos como pending e informa que não foram transmitidos ou autorizados. No código inspecionado não há processador fiscal integrado à SEFAZ. O cabeçalho “Gestão fiscal completa” descreve uma capacidade maior do que a implementada.

Recomendação: ajustar a descrição da tela e concluir a integração/homologação antes de tratar o módulo como emissor de notas autorizadas. Não foi verificado se existe integração externa fora deste repositório.

## Banco e segurança

A consulta de metadados confirmou zero tabelas públicas sem RLS ativado. Isso não comprova que cada política restringe corretamente os dados.

Os advisors retornaram:
- 9 tabelas com RLS e sem políticas: algumas, como caixa e snapshots de preços, são intencionalmente acessadas por RPCs. Não adicionar políticas automaticamente.
- 47 funções SECURITY DEFINER executáveis por authenticated: revisar a autorização de cada função; a capacidade de execução por authenticated não prova vulnerabilidade.
- Proteção contra senhas vazadas desativada. Referência de configuração: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

A validação comercial sensível permanece no servidor nos fluxos cobertos pelos testes. Não foram exercitadas todas as funções com credenciais reais nem feitas tentativas contra contas de terceiros.

A consulta específica de publicação Realtime desta análise falhou por transporte; a verificação anterior da sessão havia encontrado as tabelas de vendas fora da publicação. Não tratei esse estado anterior como nova confirmação.

## Manutenção e detalhe de interface

usePartnerData tem 3.804 linhas, PartnerPanel 2.563 e CadastrosModule 2.765. Separar por domínio ajudaria a reduzir acoplamento e tornar mais previsíveis as alterações em vendas, caixa e cadastros.

SaleActionsMenu.tsx:80 marca a última ação como perigosa pela posição. Quando um menu não tem cancelamento, a última ação pode ser “Enviar por e-mail”, que recebe a cor de perigo. Recomenda-se atributo explícito por ação.

## Verificações e limites

- npm test: 178 passaram, zero falhas.
- npm run lint: 53 erros, 11 avisos.
- TypeScript/build: passaram na última publicação da versão analisada; não foram repetidos nesta análise.
- Advisors e RLS: consultados em produção, somente leitura.
- Sem teste visual autenticado, medição de performance, homologação fiscal ou auditoria completa de todas as permissões.
- Não houve correções ou publicação durante esta análise.

Ordem recomendada: coordenação das leituras de sincronização; isolamento das falhas por coleção; atualização por filial e paginação; correção de lint; revisão dirigida das permissões e conclusão do módulo fiscal.
