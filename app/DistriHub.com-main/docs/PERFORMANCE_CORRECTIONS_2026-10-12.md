# Otimização de desempenho — 12/10/2026

## Alterações aplicadas no banco

- Otimizadas 18 políticas de acesso: `auth.uid()` passa a ser avaliado como subconsulta independente da linha, permitindo ao Postgres calcular a identidade uma vez por instrução. O cálculo de Super Admin nas três políticas restritivas de OS também foi tratado dessa forma.
- Consolidada a leitura de mensagens de suporte em uma política que conserva as regras de cliente e de Super Admin.
- Consolidado o envio de mensagens, preservando a obrigação de cliente enviar como `cliente` e Super Admin responder como `suporte`.
- Removida a política fiscal de proprietário duplicada: a política de empresa/filial já contém a mesma condição do proprietário.
- Mantidas as políticas restritivas de assinatura, escopo de empresa/filial e permissões SQL existentes.
- A migração verifica a definição e o tipo das políticas antes de alterá-las. Se alguma regra tiver mudado desde a revisão, a operação aborta integralmente.

Os 19 índices de chaves estrangeiras ausentes já tinham sido criados na publicação anterior. Índices marcados como sem uso recente foram mantidos: esse aviso não comprova que sejam desnecessários.

## Verificação

- 353 testes aprovados na bateria completa do projeto.
- Comparada a matriz de leitura antes/depois para proprietário, outra empresa, colaborador de filial, administrador da empresa, Super Admin, usuário sem vínculo, identidade ausente e assinatura bloqueada, em Postgres local.
- Confirmados os bloqueios de mensagens em nome de outro cliente e de alteração indevida do tipo de remetente.
- Confirmado que a migração rejeita definições de políticas diferentes das revisadas.
- Consulta de teste com 10.000 registros passou a apresentar `InitPlan` para a identificação, preservando o resultado. Isso comprova a avaliação por instrução; não representa medição do tempo de resposta total do aplicativo.
- No banco remoto, as assinaturas dos conjuntos de IDs visíveis foram comparadas antes/depois para proprietários de filiais, colaboradores ativos vinculados e uma identidade sem vínculo. A simulação terminou com ROLLBACK e confirmou conjuntos idênticos. Em seguida, a mesma migração foi aplicada definitivamente.
- Advisor após a alteração: zero avisos `auth_rls_initplan`, zero `multiple_permissive_policies` e zero `unindexed_foreign_keys`. Restam avisos informativos de índices sem uso observado, sujeitos a medição ao longo do uso real.

A alteração já está ativa no banco e não exige republicação do aplicativo para fazer efeito. Nenhuma venda, cliente, estoque ou informação financeira foi modificada. A medição de latência sob carga real continua sendo necessária para quantificar o ganho percebido pelo usuário.

Referências: [desempenho de RLS no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) e [advisor de identificação por linha](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan).
