# Correções de integridade e histórico de OS — 21/10/2026

Os cinco achados da análise foram corrigidos. A migração `20261021043934_enforce_frontend_business_invariants.sql` foi aplicada ao projeto Supabase DistriHub.com.

## Comportamento entregue

- Clientes: validação no banco de limite de crédito finito e não negativo, nome obrigatório, CPF/CNPJ informado e vínculos com filial e vendedor da empresa. Validação de documento se aplica à inserção e à alteração do documento/tipo; documentos antigos não são inventados ou reescritos em edições de outros campos.
- CRM: inserções e atualizações verificam empresa e filial do cliente e responsável. A conclusão normal da tarefa mantém seu registro de horário no servidor.
- Modificadores: produto deve pertencer à empresa e ajuste deve ser finito. Ajustes negativos e modificadores globais continuam permitidos.
- OS: checklist completo de entrada e registro de ciência são obrigatórios no banco. Checklist de saída é obrigatório para finalizar, inclusive nas OS antigas ainda abertas. Respostas são armazenadas em JSON, com versão, autor e horário do servidor.
- Garantia: o banco copia o termo vigente para cada nova OS. A impressão usa essa cópia, inclusive quando vazia. OS antigas sem cópia mostram a ausência do termo histórico, sem substituir pelo texto atual.
- Tentativas: repetição de uma OS já criada mantém o mesmo resultado e não repete a baixa de estoque. Se o servidor rejeitar definitivamente uma tentativa por checklist inválido ou garantia alterada, o formulário libera a revisão e exige nova ciência. Erros de rede preservam a tentativa original.
- O formulário apresenta o termo junto da confirmação. Alterar o termo durante o preenchimento exige confirmar novamente; uma tentativa pendente conserva o texto originalmente enviado.

O registro de ciência identifica o operador que a informou, não equivale a assinatura digital do cliente. As OS antigas não receberam aceite, checklist de entrada ou termo retroativo.

## Implementação

As validações são triggers em todos os caminhos de escrita, mantendo RLS e as autorizações já existentes. As funções internas ficam em schemas privados, sem execução por `anon` ou `authenticated`. A RPC pública de criação continua restrita a usuários autenticados e conserva os controles de empresa, filial, estoque e idempotência.

O protocolo textual de checklist já utilizado é validado integralmente no servidor e convertido em JSON. Assim, navegadores já abertos e tentativas antigas continuam compatíveis quando contêm a vistoria completa. As assinaturas das RPCs existentes foram preservadas.

A RPC de edição de cliente foi ajustada para alterar filial e vendedor na mesma instrução, evitando um estado intermediário incompatível com as novas validações.

## Verificação

- Suíte completa: 687 testes aprovados, sem falhas.
- Após o último ajuste visual: 34 testes direcionados de integridade, recuperação, checklist e impressão aprovados.
- TypeScript, lint sem avisos e build aprovados.
- Dados fictícios reproduzem as falhas originais e comprovam sua rejeição, além de controles positivos de acesso, vínculos válidos, ajustes negativos, conclusão normal, compatibilidade histórica e idempotência.
- Consulta agregada anterior à migração: nenhum vínculo inválido, limite inválido ou modificador inválido nos campos verificados em produção.
- Verificação posterior em produção: quatro triggers instaladas, onze colunas adicionadas; CPF/CNPJ válidos aceitos e CPF repetido recusado pela função de validação; criação indisponível para anônimos e disponível para autenticados; helper interno sem permissão de execução pelo frontend.
- Consultor de segurança: nenhuma categoria nova ou aumento nas contagens de avisos em relação ao estado anterior. O aviso preexistente de proteção contra senhas vazadas desativada permanece fora destas correções: [orientação do Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Testes novos: `supabase/tests/frontend-boundary.test.mjs`, com definições anteriores capturadas no fixture `supabase/tests/fixtures/frontend-boundary-metadata.json`. Nenhuma linha comercial ou credencial foi incluída no fixture. As operações sintéticas foram executadas localmente; em produção foram aplicadas a migração e verificações de metadados/funções puras.
