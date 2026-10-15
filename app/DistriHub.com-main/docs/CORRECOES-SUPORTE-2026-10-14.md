# Correções de Suporte — 14/10/2026

As sete falhas da auditoria foram corrigidas no projeto. Publicação pendente. A migração abaixo foi criada pela CLI e validada em banco isolado; não foi aplicada em produção nesta etapa.

## Alterações realizadas

1. A atualização administrativa fica vinculada ao identificador do atendimento de origem. Respostas de uma operação ou consulta anterior não substituem o cliente selecionado. Título, conversa e identificador permanecem alinhados ao trocar de cliente durante uma atualização.
2. Cada envio usa um UUID persistido por usuário/conversa/papel na sessão do navegador. Trava síncrona evita envios concorrentes. A nova RPC send_support_message_once retorna a mesma mensagem ao repetir o mesmo UUID e conteúdo; rejeita reutilização com outros dados, outra conta ou outro executor. Uma tentativa sem confirmação é recuperada ao recarregar a página e usa o mesmo UUID.
3. Campo e atalhos ficam bloqueados durante o envio ou enquanto há tentativa sem confirmação. O texto só é limpo após conferir identificador, conta, papel, conteúdo e sequência da resposta, e remover a tentativa persistida. Uma falha não apaga o texto nem cria automaticamente outra identidade de envio.
4. Cada mensagem recebe message_position no banco, sob lock da conversa, independentemente do relógio do navegador. A leitura incremental percorre páginas de 50 desde o cursor confirmado; respostas do envio não avançam esse cursor. Assim, mensagens intermediárias não são puladas após desconexão. A paginação anterior usa um cursor separado. Consultas param quando a aba do parceiro fica oculta e retomam a recuperação ao retornar.
5. O atendimento selecionado recebe atualização independente da lista e de seus filtros/páginas. update_admin_support_state altera somente a ação solicitada, sob lock. Prioridade não apaga encerramento e encerrar não apaga prioridade. O fechamento usa a posição da última mensagem que o administrador confirmou; uma mensagem nova impede encerrar um atendimento desatualizado. Repetir um fechamento já confirmado não encerra mensagens posteriores.
6. Datas de mensagens e encerramentos são definidas pelo banco. O gatilho protege também inserções pelo caminho antigo. A ordem, a reabertura e os contadores de pendências usam a sequência/posição confirmada, inclusive quando existem datas antigas incorretas. O resumo global do Super Admin foi alinhado à caixa de atendimento. Datas antigas são preservadas sem inventar horários.
7. O limite de 1 a 2.000 caracteres é validado no servidor e no navegador. Mensagens antigas maiores continuam legíveis; novas inserções fora do limite são rejeitadas, inclusive pelo acesso direto à tabela.

## Banco e permissões

Migração: supabase/migrations/20261015034207_fix_support_delivery_and_conversation_state.sql.

Novos endpoints públicos usam SECURITY INVOKER e retornam objetos JSON explícitos: send_support_message_once, update_admin_support_state e get_admin_support_conversation. Implementações privilegiadas ficam em partner_support_private e validam a sessão e a autorização. O cliente continua podendo conversar somente na própria conta; apenas Super Admin lê/responde outras contas ou altera atendimento. A sequência fica privada. Escrita direta em admin_support_states é retirada para impedir substituição de estado por dados completos e antigos de um navegador.

A migração preserva conteúdo, datas originais e estados existentes. Mensagens legadas recebem posições determinísticas; fechamentos antigos recebem a posição correspondente à data registrada. Novas posições são atribuídas depois de adquirir o lock da conversa, para que um cursor não pule um envio ainda não confirmado dessa mesma conversa.

A conversa continua individual por conta autenticada. Não foi ampliado acesso de funcionários às conversas dos demais usuários da empresa.

## Validação

Validação final: 486 testes passaram, sem falhas ou casos ignorados. Os oito testes de banco do Suporte passaram, incluindo os contratos JSON das RPCs; os nove novos testes de interface passaram. A validação de interface junto aos testes existentes de auditoria passou com 20 casos. TypeScript, ESLint com zero avisos, build e git diff --check passaram. O teste anterior de paginação foi atualizado para o cursor novo, preservando a verificação de carregar as 120 mensagens sem repetição.

Foram verificados: repetição após resposta incerta, recuperação após recarga, armazenamento indisponível, resultado não confirmado, trava síncrona, campo bloqueado, mais de 50 mensagens novas, paginação anterior, troca de conta/cliente, resposta tardia, atualização de prioridade/encerramento, snapshots desatualizados, isolamento de contas, remetente forjado, datas/tamanho fornecidos pelo cliente, APIs invoker e sequência privada. Os testes de banco incluem leitura de mensagem legada com 2.500 caracteres e data futura, seguida por resposta/encerramento atuais.

Não foram enviadas mensagens reais nem alterados atendimentos em produção. Produção foi consultada apenas para conferir o ponto de integração do contador e o estado anterior dos advisors. A migração e as correções de tela ficam para a próxima publicação.

## Arquivos para a publicação

- src/components/partner/SupportChatModule.tsx
- src/components/AdminSupportInbox.tsx
- src/components/PartnerPanel.tsx
- supabase/migrations/20261015034207_fix_support_delivery_and_conversation_state.sql
- supabase/tests/support-database.test.mjs
- supabase/tests/support-ui.test.mjs
- supabase/tests/audit-fixes.test.mjs
- docs/CORRECOES-SUPORTE-2026-10-14.md

Aplicar a migração antes do frontend. Conferir identificador efetivamente registrado, permissões, contador administrativo e advisors; depois disponibilizar as telas que usam as novas RPCs. Os artefatos temporários de auditoria e edição em docs não fazem parte da publicação.
