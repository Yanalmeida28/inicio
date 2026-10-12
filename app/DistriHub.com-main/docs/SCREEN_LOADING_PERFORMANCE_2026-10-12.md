# Carregamento das telas

Os módulos passam a carregar somente as coleções necessárias à tela ativa. Cadastros considera também a aba interna. A abertura de Produtos faz 7 consultas de dados, contra as 20 anteriores, conforme teste do hook. Presença, autenticação e assinatura continuam com suas verificações próprias.

As coleções carregadas são reaproveitadas por 30 segundos na mesma identidade, empresa e filial. Consultas simultâneas iguais compartilham a requisição; respostas antigas não substituem dados de outro contexto. Eventos continuam atualizando coleções já carregadas. O caixa só faz leituras automáticas nos módulos que o utilizam e mantém a conferência no fechamento da venda.

O histórico usa páginas de 25 vendas. Contagem e total concluído são calculados no servidor para todo o período filtrado, com datas de São Paulo, busca e situação. A função preserva os controles existentes de assinatura, empresa, filial e atribuição das vendas a colaboradores. Os relatórios continuam buscando todas as páginas necessárias para seus totais.

Reposição confirma o estoque pela operação existente e consulta apenas o produto alterado. Recebimentos e devoluções atualizam as coleções financeiras envolvidas. Rascunhos dos módulos permanecem montados durante a navegação.

Verificação: testes do carregamento por módulo, cache, concorrência, falha e recuperação, mais de mil vendas/faturas, atualização de produto, paginação, filtros, permissões, respostas atrasadas e preservação de rascunhos. Também foram executados TypeScript, lint e build de produção. A redução de consultas é demonstrada nos testes; a latência com usuários simultâneos em produção ainda exige medição.
