# Filial no cadastro de cliente pelo administrador

O banco resolvia o operador administrador com a filial do seu cadastro, inclusive nula, ignorando o contexto solicitado pela tela. Confirmado em produção um operador administrador ativo sem filial vinculada. Não foram alterados acessos ou dados de clientes na investigação.

A migração 20261016001415_fix_admin_customer_branch_context.sql ajusta somente execute_partner_customer_mutation: após autenticar operador/PIN, administradores usam a filial solicitada ou a do cliente existente. A validação de pertencimento à empresa, bloqueio de filial ausente para novos clientes, preservação de clientes compartilhados e restrições de gerentes continuam vigentes. Não muda globalmente o resolvedor de operadores nem concede permissões.

Sete testes SQL passaram: administrador com/sem filial própria, duas filiais selecionadas, filial externa, PIN inválido, criação sem contexto, restrição de gerente e regressões de crédito/cliente compartilhado.

Correção local, pendente de publicação e aplicação da migração em produção.
