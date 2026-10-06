# Layout do dashboard administrativo

As grades agora se adaptam à largura efetivamente disponível entre as barras laterais, usando consultas de contêiner. Quando falta espaço, o menu interno e os gráficos passam para uma coluna. Cartões de indicadores e métricas de CRM redistribuem suas colunas automaticamente.

Filtros, legendas, nomes de categorias e valores monetários podem quebrar linha. As tabelas continuam com rolagem horizontal dentro de seus próprios contêineres. As alterações são limitadas ao módulo administrativo.

O gráfico diário reserva espaço para os rótulos monetários e inclui valores líquidos negativos na escala vertical, evitando que a curva ou os valores saiam do SVG.

Verificação: o componente real foi renderizado com dados fictícios, nomes longos, receitas de milhões de reais e lucro negativo. O Chrome headless verificou larguras úteis de 320, 500, 752, 1008, 1350 e 1904 pixels, sem transbordamento dos cartões, filtros ou legendas e sem rótulos/pontos fora do gráfico. TypeScript e compilação Vite passaram. ESLint ainda aponta quatro erros e três avisos anteriores no arquivo `AdminModule.tsx`.

O pacote `distrihub-dashboard-2026-10-06.zip` inclui a interface atualizada e a correção anterior de devoluções, pronto para publicar na raiz pública da hospedagem. A publicação automática na Hostinger ocorre pelo workflow `Implantar DistriHub` após o envio à branch `main`.
