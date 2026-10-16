# Cartões de produtos, serviços e fornecedores no celular

Até 768px, as mesmas linhas da lista se apresentam como cartões: nome em destaque, dados com rótulos, duas colunas que podem quebrar textos longos e ações em área própria com toque mínimo de 44px. Acima de 768px, continuam como tabelas.

Implementação restrita às listas de produtos/serviços e fornecedores. Não duplica registros ou callbacks; preserva busca, menus, edição, exclusão, etiquetas e consulta em outras filiais. Estoque não aplicável em serviços aparece explicitamente.

Verificação em Edge oculto: 12 combinações de módulos e larguras (320, 390, 768 e 1366px), sem excesso horizontal na página ou lista e sem erros de execução. Confirmados menu de produto e edição de fornecedor. TypeScript aprovado e ESLint do componente sem mensagens. Build gerado. Capturas locais e resultados em docs/directory-cards-review, somente com dados fictícios.

Alteração local ainda não publicada. A inclusão de CPF/CNPJ no cadastro inicial também permanece pendente de publicação.
