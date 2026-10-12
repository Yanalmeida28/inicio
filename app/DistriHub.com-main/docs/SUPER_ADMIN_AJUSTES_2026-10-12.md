# Super Admin — ajustes de 12/10/2026

- Visão geral inicial: empresas, acessos, vencimentos nos próximos sete dias, cobranças pendentes, previsão mensal recorrente, suporte e solicitações pendentes.
- Clientes: busca por empresa/e-mail/documento/telefone, filtros comerciais e de plano, ficha detalhada e atualização manual.
- Acessos: filtros por plano, teste e vencimentos; datas de teste, pagamento, liberação manual e tolerância; explicação da liberação/bloqueio.
- Financeiro: filtro por empresa/status/período, recebimentos por mês, detalhamento por empresa e receita recorrente prevista apenas para planos pagos ativos com renovação automática.
- Faturas: filtros, exportação CSV protegida contra fórmulas e detalhes de identificação/pagamento/cancelamento.
- Histórico SaaS: operador, data, ação, motivo e detalhes; páginas de 100 registros, filtros locais à página.
- Suporte: busca, filtros de pendentes/encerrados/prioridade alta, contador de pendências, prioridade persistida, encerramento/reabertura. Nova mensagem após encerramento torna a conversa aberta novamente.
- Planos: filtros, confirmação com motivo obrigatório, motivo persistido e atualização da gestão de clientes após decisão.
- Celular: tabelas de clientes, acessos, faturas e planos exibidas como cartões com campos identificados e ações de toque.

## Verificação

- TypeScript e build Vite aprovados.
- 15 testes aprovados: controles SaaS existentes, cálculo de vencimentos, período em São Paulo, receitas mensais e previsão recorrente.
- Edge com dados fictícios: 32 verificações de telas em 320, 390, 768 e 1366 px, sem erros de execução ou transbordamento da página. Resultados e capturas em `admin-review/`.
- Migração `20261012181517_complete_super_admin_workspace.sql` aplicada ao projeto DistriHub.com; arquivo local alinhado à versão registrada no banco.
- Banco: consultas do administrador permitidas; tabelas e RPCs protegidas contra conta não administradora. Prioridade, encerramento e reabertura testados em transação revertida, sem deixar dados de teste.

A interface foi compilada localmente. Nenhuma publicação do frontend foi executada nesta tarefa. A conferência visual usa dados fictícios; não valida o login e o gateway de pagamento em produção.
