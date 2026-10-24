# Correções do leitor do PDV

O carrinho podia receber uma leitura enquanto a venda estava sendo gravada: o item não entrava no pedido enviado e desaparecia na confirmação. Leituras no mesmo ciclo de atualização também podiam exceder o estoque mostrado na tela.

## Comportamento corrigido

- Teclado/leitor, câmera, produtos, quantidades e demais campos ficam bloqueados durante finalização ou enquanto existir operação pendente de recuperação.
- Guardas síncronas impedem callbacks antigos de alterar o carrinho mesmo antes da atualização visual dos controles.
- Todas as alterações do carrinho usam uma fotografia síncrona de seu estado. A quantidade é validada sobre esse estado, e a finalização captura os mesmos itens e total.
- O painel informa ao PDV quando ele está ativo. A câmera fecha ao sair do módulo, entrar em outra subaba/pré-venda, trocar filial, ocultar a página, iniciar finalização ou desativar a função.
- A decodificação usa os controles fornecidos pelo callback para interromper imediatamente o leitor. O encerramento também cobre permissão/inicialização que termine depois de fechar o modal.
- SKU continua sendo o identificador pesquisado. Não foi criado campo EAN separado nem alterado o banco.

## Verificação

Dez testes novos simulam estoque limitado/leituras legítimas rápidas, finalização, recuperação pendente, saída do PDV, página oculta, repetição de frame, fechamento durante inicialização e erros de segurança/permissão/câmera ocupada. Testes usam o componente real com câmera/decodificador simulados. TypeScript, lint, suíte completa e build fazem parte da publicação.

A leitura óptica com câmera física ainda exige homologação no celular/navegador utilizado. Os testes não substituem essa etapa.
