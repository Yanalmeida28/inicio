# Gestão de Entregas — correções de 15/10/2026

Estado: implementadas e verificadas localmente. Migration não aplicada ao banco remoto e frontend não publicado. Suporte permanece preservado e também pendente de publicação.

## Correções dos oito achados

1. Consulta específica `read_partner_deliveries`: proprietário/administrador no escopo autorizado, gerente na filial e logística somente nas entregas atribuídas. Verifica assinatura, módulo, funcionário ativo, empresa, filial e operador/PIN. Retorno limitado a dados de entrega, sem custos ou pagamentos. Não amplia as políticas gerais de leitura das vendas. Paginação por UUID em páginas de 100, consumidas pela tela.
2. Tela remontada ao trocar empresa, filial, operador ou papel. Rascunho fecha ao sair do módulo e respostas antigas não alteram a tela de outro contexto. Atualização periódica interrompida enquanto o módulo está inativo.
3. Apenas vendas concluídas aparecem e podem ser expedidas. Saída exige endereço e motorista ativo da empresa/filial. Cadastro incompleto abre os detalhes antes da solicitação. Logística não reatribui nem altera endereço/contato.
4. Única API de escrita `mutate_partner_delivery_checked`, com revisão esperada e UUID de tentativa. APIs antigas sem esses controles perdem execução para clientes. Conclusão exige estar em rota e informar recebedor; falha exige motivo; entrega concluída não regride ou troca motorista.
5. Uma atualização atômica produz um evento coerente no histórico, com revisão, ator, endereço, contato e detalhes finais. Dados irrelevantes de falha/conclusão são removidos nas transições. Salvamentos sem mudanças não geram novos eventos.
6. `delivered_at` nasce na transição para entregue e é preservado nas edições posteriores. Nenhuma data histórica é inventada para entregas antigas.
7. Modal captura a revisão ao abrir e envia apenas campos efetivamente alterados. Conflitos impedem sobrescrever alterações recentes. Tentativas incertas persistem no sessionStorage, sem PIN, e repetem o mesmo UUID e payload, inclusive após remontar. Servidor serializa tentativas, devolve resultado previamente confirmado e rejeita reutilização com outros dados.
8. Exibe e pesquisa número comercial da venda, com fallback ao identificador para registros antigos.

Os guardas de assinatura e colaborador são preservados e adaptados exclusivamente para alterações de campos de entrega: usam a permissão `entregas`; mudanças comerciais/financeiras continuam verificando `pdv`. O gatilho de revisão mantém o trabalho original de snapshot de custos/clientes. Atualização direta de entrega concluída pelo cliente exige a operação verificada.

## Validação

- Suíte completa: 493 testes aprovados, zero falhas ou ignorados (`entregas-full.log`).
- Novos testes de leitura e integração do hook, adicionados após o início da suíte completa: execução complementar de 44 testes aprovados (`entregas-hooks.log`). Dois destes testes não estavam na execução completa, totalizando 495 testes distintos verificados.
- Verificação final de Entregas: oito testes aprovados (`entregas-final-focused.log`), incluindo SQL real em PostgreSQL isolado/PGlite com os guardas originais de produção, paginação, limites de filial/papel, acesso negado, revisão, retentativa, recebedor, motivo, histórico e data.
- `npm run typecheck`, `npm run lint` e `npm run build`: aprovados; lint sem avisos.
- Nenhuma venda ou entrega real foi criada ou alterada para testar.

## Publicação pendente

Migration: `supabase/migrations/20261015034214_fix_delivery_authorization_and_workflow.sql`. Aplicar em conjunto com a nova versão do frontend, pois as APIs legadas de Entregas serão desabilitadas. Navegadores com a versão antiga precisarão atualizar a página. Confirmar migração remota e testes de acesso após publicação. Não publicar scripts de auditoria, perfis de navegador ou outros arquivos não relacionados. As correções de Suporte possuem relatório e migration próprios e continuam pendentes.
