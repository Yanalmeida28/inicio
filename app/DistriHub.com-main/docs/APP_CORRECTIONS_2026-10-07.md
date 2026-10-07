# Correções da análise — 07/10/2026

## Alterações implementadas

- Leituras completas, snapshots do PDV, gravações locais e eventos Realtime agora usam versões por coleção. Uma resposta antiga não substitui uma venda que já foi atualizada. Eventos antigos de pré-venda também não desfazem uma conclusão ou cancelamento confirmado.
- Falhas nas consultas secundárias preservam somente suas coleções. Vendas e estoque válidos continuam sendo atualizados, com aviso sobre atualização parcial.
- Realtime aplica alterações individuais em vendas, produtos, faturas, movimentos de estoque, pedidos e RMAs. As consultas completas periódicas da empresa foram removidas. Conexões do proprietário usam reconciliação da filial em reconexões, retorno à aba e eventos financeiros; falhas do canal ativam a conferência a cada 30 segundos.
- Contas de funcionários mantêm a conferência autorizada da filial a cada 30 segundos: suas políticas RLS não fornecem todos os eventos que a RPC autorizada pode consultar. Não foram ampliadas permissões de tabelas para contornar essa diferença.
- O crédito é atualizado pela consulta autorizada depois de eventos financeiros, pois o saldo considera faturas de todas as filiais.
- Imports e estados não utilizados foram removidos, campos `any` receberam tipos explícitos e dependências de hooks foram corrigidas. Lint agora é obrigatório, sem avisos, tanto no workflow de qualidade quanto no deploy.
- A cor de perigo dos menus passou a depender da natureza da ação, em vez da posição do item.
- A descrição do Fiscal passou a informar que a tela prepara solicitações e depende de integração para transmitir e autorizar notas.

## Banco

A migration `20261007225703_enable_partner_operational_realtime.sql` foi aplicada e verificada em produção. Ela adiciona seis tabelas à publicação Realtime, exige RLS já ativado e não altera políticas nem privilégios. A versão do arquivo foi alinhada à registrada pelo Supabase.

Referência oficial: [Postgres Changes e RLS](https://supabase.com/docs/guides/realtime/postgres-changes).

## Verificação

- Lint passou com zero erros e zero avisos.
- TypeScript e build passaram.
- A suíte completa passou com 183 testes antes da última adição; os 21 testes do hook, incluindo o caso adicional de funcionários, passaram após as alterações finais. O deploy executa novamente toda a suíte, TypeScript, lint e build antes do envio à Hostinger.
- Novos casos cobrem respostas fora de ordem, gravações locais concorrentes, Realtime, exclusão por ID conhecido, isolamento de empresa/filial, falha secundária e fallback de funcionários.
- A publicação Realtime foi consultada após a migration. Os advisors mantiveram os mesmos avisos preexistentes; nenhum privilégio adicional foi concedido.

## Dependências e limites

A emissão autorizada de NF-e/NFC-e exige escolher o provedor fiscal, configurar credenciais/certificado no servidor e homologar a transmissão. Foi solicitada a identificação do provedor para continuar essa etapa.

A proteção contra senhas vazadas continua desativada no Supabase Auth. Sua ativação exige uma ferramenta de configuração do Auth ou o painel do projeto; a conexão disponível nesta sessão não fornece essa operação. [Configuração oficial](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Os avisos de funções SECURITY DEFINER não comprovam vulnerabilidade. As regras de leitura das seis tabelas publicadas foram conferidas e preservadas. A revisão integral de todas as RPCs e a homologação fiscal não são substituídas pelos testes executados.

O histórico inicial e a atualização manual ainda percorrem as páginas existentes. Paginação visual sob demanda e divisão dos componentes grandes são evoluções adicionais; esta correção elimina o recarregamento periódico da empresa inteira e extrai as regras de sincronização para `src/lib/partnerSync.ts`.

Não foi realizado teste visual com uma conta real nesta sessão.
