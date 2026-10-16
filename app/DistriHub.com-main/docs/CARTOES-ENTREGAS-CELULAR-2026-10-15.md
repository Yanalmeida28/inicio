# Cartões de gestão de entregas no celular

Até 768px, cada entrega é apresentada em cartão com cliente, pedido, endereço, contato, previsão, itens, total, entregador, status e ações. O seletor de entregador ocupa a largura disponível; ações com texto e área mínima de toque de 44px. Filtros se empilham e abas quebram linha. Acima de 768px permanece a tabela.

Reaproveita os estilos de cartões das listas de cadastro, sem duplicar dados ou ações. Permissões, gravação, repetição de tentativa e regras de entrega não foram alteradas. O seletor de motorista recebe nome acessível por pedido.

Validação: 9 testes de entregas passaram; TypeScript, lint do componente e build aprovados. Navegador Edge com dados fictícios: 12 cenários, combinando administrador, logística e lista vazia em 320, 390, 768 e 1366px. Sem excesso horizontal, detalhes acessíveis e endereço somente para leitura no perfil de logística. Captura de 390px inspecionada visualmente. Artefatos locais em docs/delivery-cards-review.

Alteração local ainda não publicada.
