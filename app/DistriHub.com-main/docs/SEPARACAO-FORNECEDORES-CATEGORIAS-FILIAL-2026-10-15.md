# Fornecedores e categorias por filial

O usuário confirmou que os cadastros do Saunier Atacado aparecem indevidamente no Varejo. O banco não possuía filial nos dois cadastros, e o painel fornecia as listas completas da empresa.

Preparada migração que adiciona filial a fornecedores/categorias, índices para os vínculos, restrição de acesso por filial para funcionários e validação do vínculo empresa/filial. Cadastros atribuídos não podem ser transferidos silenciosamente para outra unidade. Produtos não podem ser vinculados a fornecedor de outra filial.

A nova RPC de fornecedores recebe filial explícita, preserva a autorização do operador e o registro de auditoria e devolve a linha confirmada. O cliente deixa de inventar um fornecedor local quando o retorno é inválido. A importação XML procura e cria o fornecedor dentro da filial da NF-e; o mesmo documento em duas filiais corresponde a cadastros separados.

O painel aplica filtro estrito de filial a categorias e fornecedores antes de fornecê-los a Cadastros e Administrativo. Registros sem filial não são tratados como compartilhados. A visão consolidada continua disponível ao proprietário; nela é possível atribuir cadastros legados sem filial. Novos cadastros exigem escolher uma filial, inclusive na visão consolidada.

Migração de dados: empresas com uma única filial recebem associação determinística; categorias utilizadas exclusivamente em uma filial seguem a utilização existente. Nos registros Saunier, conforme a confirmação do usuário, o legado ainda sem filial fica no Atacado. A empresa é identificada pelo par único de nomes de filiais; ambiguidade ou vínculo de fornecedor a produto de outra filial interrompe a migração. Nenhum cadastro é excluído. Outros legados ambíguos permanecem sem filial para atribuição explícita pelo proprietário.

Produção consultada apenas para leitura: Atacado com 734 produtos; Varejo sem produtos. A correção de dados e a migração **ainda não foram aplicadas em produção**.

Migração local gerada pela CLI: `20261015191735_isolate_supplier_category_branches.sql`. Ao publicar via MCP, aplicar antes do frontend, consultar a versão efetivamente registrada em schema_migrations e alinhar o nome local/referências de testes antes do commit, evitando um registro duplicado no próximo uso da CLI.

Testes específicos aprovados: associação do legado Saunier ao Atacado; criação/edição por filial; bloqueio de transferência; importação do mesmo fornecedor em filiais diferentes; bloqueio de produto com fornecedor de outra filial; leitura e escrita de funcionários; recusa anônima; filtro imediato ao trocar de filial; exigência de filial na visão consolidada; confirmação real da gravação.

Validação geral: 530 testes passaram; TypeScript, lint sem avisos e build aprovados. A migração foi executada em banco de testes isolado; a consulta e o uso de produção permaneceram apenas para leitura.

Alteração local, pendente de publicação junto com a migração.
