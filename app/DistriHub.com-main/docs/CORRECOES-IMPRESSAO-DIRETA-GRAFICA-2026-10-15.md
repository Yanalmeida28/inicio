# Impressão direta com a personalização

O modo `image` gera um PNG do mesmo documento usado na prévia e na impressão pelo navegador, com 203 pontos por polegada e papel de 58 ou 80 mm. A geração ocorre em um iframe fora da tela, que é removido ao terminar ou falhar. Logos remotos são incorporados antes da captura; falhas não enviam um cupom sem logo. O renderizador utilizado é html2canvas 1.4.1, carregado separadamente do fluxo padrão.

O protocolo `receipt-png-v1` exige Conector v2. A consulta de versão ocorre antes de enviar o pedido. O aplicativo mantém o modo atual até o usuário testar a impressão gráfica e confirmar o resultado no papel. Alterar impressora, papel ou modo invalida o teste. O papel deve coincidir com a personalização; divergência bloqueia o envio. Etiquetas continuam pelo navegador.

Pedidos gráficos simultâneos iguais compartilham a mesma preparação e envio. O protocolo conserva UUID e confirmação de fila. Falhas de comunicação após o envio não repetem automaticamente o pedido nem abrem outro caminho de impressão.

O conector valida formato PNG, tamanho de dados e dimensões antes de decodificar a imagem. Desenha o cupom na área imprimível do driver, conservando as proporções e dividindo imagens longas em páginas sem descartar o restante. Mantém o suporte aos cupons em texto dos clientes anteriores. A impressão térmica depende do driver para escala física, monocromia e corte; não foi feito teste físico no equipamento do usuário.

O instalador substitui a instância instalada no mesmo caminho e inicia a versão atualizada. O ZIP em `public/downloads/Conector-DistriHub.zip` inclui as quatro fontes do conector e é conferido byte a byte pelo gerador de pacote. Não foi instalado nem iniciado o conector nesta sessão.

Validação de navegador com conector simulado: 58 e 80 mm, fontes 10 e 16, logo, 45 produtos, zero janelas abertas, um envio por clique simultâneo e bloqueio de versão antiga. Imagens de evidência em `docs/receipt-image-review/`. O C# compilou no Windows e os scripts PowerShell passaram pela análise sintática. Nenhuma impressora foi acessada.

Para ativar depois da publicação: baixar o ZIP atualizado, extrair, executar `Instalar.cmd`, buscar a impressora em Configurações, escolher o papel e **Personalizado direto**, imprimir o teste e confirmar que saiu corretamente. Repetir em cada computador que imprime.

Referências técnicas: https://html2canvas.hertzen.com/configuration e https://learn.microsoft.com/en-us/dotnet/api/system.drawing.printing.printdocument.printpage.

Validação final: 517 testes passaram, TypeScript, lint sem avisos e build aprovados. Pacote SHA256: `8BBEC5B2D4D214EF363F99D2532A2DC2CCA30D9A4C37EAEE59A4ECE26C924EA8`.

Alteração local; ainda não publicada.
