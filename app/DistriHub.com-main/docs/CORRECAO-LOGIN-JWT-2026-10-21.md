# Login: tratamento de JWT emitido no futuro — 21/10/2026

## Diagnóstico

O erro informado aparece quando a leitura de `partner_salespeople`, usada para resolver a identidade após o login, é rejeitada. A consulta aos logs identificou uma resposta 401 nessa rota, com token emitido em `2026-10-21T04:50:09Z`. Não foram extraídos tokens completos, senhas ou dados comerciais. A conexão do projeto informa `PostgREST 14.5`.

A mensagem `JWT issued at future` indica rejeição pela verificação temporal do JWT. Existem relatos e uma correção no projeto PostgREST para cache de horário incorreto: [PR 5159](https://github.com/PostgREST/postgrest/pull/5159). Essa referência não comprova que o mesmo defeito é a causa neste projeto. Os dados disponíveis não permitem distinguir definitivamente desvio entre relógios de cache temporal incorreto; não há evidência suficiente para atribuir o erro ao relógio do computador do usuário.

## Correção no aplicativo

- Somente leituras que recebem exatamente `JWT issued at future`, com código `PGRST303` quando informado, recebem três novas tentativas após 1, 2 e 4 segundos.
- O tratamento cobre vínculo do funcionário, identificação do proprietário, perfil da empresa e consulta de permissão `is_super_admin` que antecede a entrada no painel.
- O app só publica identidade e permissões após respostas válidas do servidor. Um erro não é interpretado como ausência de funcionário ou como autorização de proprietário/administrador.
- Após esgotar as tentativas, apresenta mensagem compreensível e botão **Tentar novamente**. A tela de erro de identidade também permite sair da conta.
- Troca de conta, logout e desmontagem invalidam tentativas antigas antes de novas leituras ou atualização da identidade.
- O tratamento não emite novos tokens, não desativa validações de JWT/RLS, não repete escritas e não limpa a sessão automaticamente.

Esta é uma recuperação limitada para falhas passageiras. Se a rejeição temporal persistir no serviço, continuará bloqueando o acesso e exigirá investigação da infraestrutura do Supabase; o frontend não pode corrigir o relógio/cache do servidor.

## Verificação

27 testes direcionados aprovados: recuperação nas três leituras de identidade/perfil, limite das tentativas, recuperação manual, permissão do painel, erros diferentes sem repetição, logout, troca de conta e desmontagem. Casos simulados verificam que não há refresh forçado, logout automático, gravações repetidas ou concessão de acesso antes da confirmação.

Suíte completa: 700 testes aprovados, sem falhas. TypeScript, lint sem avisos e build aprovados.

Não foram alteradas funções, tabelas, RLS ou configuração de autenticação do Supabase. A validação com a conta real depende de nova tentativa de login do usuário; o teste automatizado reproduz a resposta de erro com dados fictícios.
