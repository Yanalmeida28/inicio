# Cupom conforme a personalização

A correção anterior identificava a filial da venda, mas o conector continuava removendo imagens e estilos. Além disso, a prévia era um desenho independente do cupom real.

Agora a prévia usa `printSale` em modo sem impressão, no documento isolado de um iframe, com os dados de exemplo e a personalização em edição. Nome, documento e endereço da loja vêm do contexto exibido. A prévia não envia pedidos ao conector nem abre a impressão. As vendas continuam usando os dados reais e as preferências salvas.

O padrão passa a ser a impressão personalizada pelo navegador, inclusive para impressoras já conectadas. A configuração local antiga é preservada, mas não ativa texto simples automaticamente. Para imprimir pelo conector sem diálogo é necessário escolher explicitamente texto simples, com indicação de que logo e formatação não são preservados. Salvar uma impressora após o teste de conexão mantém o modo personalizado.

Este ajuste preserva o documento com logo, largura, tamanho da fonte e disposição. A seleção da impressora ocorre no diálogo do navegador. Papel compatível, escala de 100% e cabeçalhos/rodapés do navegador desativados continuam necessários. Não foi adicionado suporte gráfico ao conector Windows e não houve teste físico.

Validação: 515 testes passaram; TypeScript, lint sem avisos e build aprovados. Cobertura adicional para impressora previamente conectada, modo personalizado, escolha explícita de texto simples e prévia usando o gerador real sem impressão. A prévia também foi verificada com a personalização em edição.

Alteração local, ainda não publicada.
