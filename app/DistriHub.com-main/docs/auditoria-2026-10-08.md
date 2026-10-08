# Auditoria do aplicativo — 08/10/2026

Escopo: navegação, recuperação de formulários, PDV, Cadastros no Administrativo, dependências de produção e consulta de segurança do Supabase. Esta revisão não equivale a um teste de invasão ou à revisão de todas as funções do banco.

## Correções confirmadas

- **Rascunhos entre contextos:** a troca de usuário/filial sem remontar o componente podia escrever o valor anterior na chave do novo contexto. O hook agora recupera o rascunho da chave correta e impede essa cópia.
- **Dados incompatíveis:** JSON válido com tipo errado, como texto no lugar do carrinho, podia quebrar o formulário. Agora o tipo é validado e o formulário recupera os valores iniciais com uma mensagem de erro.
- **Cadastros no Administrativo:** a tela de Clientes era marcada como inativa mesmo quando aberta pelo Administrativo. Corrigida a identificação da tela ativa, inclusive para os seletores de Produtos.
- **PIN no banco:** `set_partner_salesperson_pin` referenciava `is_active` e `updated_at`, inexistentes em `partner_salespeople`. Corrigidas as referências, mantidas as regras de empresa/função e adicionada a checagem de acesso ao Administrativo.
- **Dependências de produção:** atualizados `ws` para 8.22.0 e SheetJS para 0.20.3. A versão SheetJS vem do [canal oficial recomendado](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/). A auditoria de dependências de produção retornou zero vulnerabilidades conhecidas.

## Validação

- TypeScript e lint passaram.
- 227 testes automatizados passaram, incluindo os novos casos de troca de escopo e rascunhos incompatíveis.
- Build de produção passou.
- Alteração de PIN e recusa de outro usuário verificadas no banco; a transação foi revertida e nenhum PIN de teste foi mantido.

## Pontos que continuam em revisão

- A proteção de senhas vazadas está desativada no Supabase Auth. [Configuração recomendada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- O advisor lista 55 funções SECURITY DEFINER executáveis por usuários autenticados. Essa exposição é necessária para várias RPCs do app; o aviso não comprova uma falha, mas exige revisão individual das verificações internas. Esta rodada revisou funções de PIN, auditoria e pagamentos e as proteções recentes de módulos. [Explicação do aviso](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Há 12 tabelas com RLS sem políticas. Isso bloqueia acesso direto pelo cliente; não foram liberadas permissões indiscriminadamente. [Explicação](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- A auditoria de dependências de desenvolvimento também retorna avisos. Zero vulnerabilidades de produção não significa zero avisos em ferramentas de desenvolvimento.
- Pagamentos reais, envio de notas fiscais e testes com sessões reais de cada função não foram executados nesta rodada.
