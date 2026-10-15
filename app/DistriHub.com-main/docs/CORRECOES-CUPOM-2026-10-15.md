# Cupom: identificação da filial da venda

PDV, Pedidos e Histórico forneciam o endereço da filial selecionada na tela para qualquer cupom. Reimprimir uma venda de outra filial ou pela visão consolidada podia apresentar identificação incorreta ou incompleta.

Os três caminhos agora fornecem as filiais autorizadas ao gerador de cupom. O gerador resolve nome e endereço pelo `branch_id` da venda, tanto na impressão direta quanto pelo navegador. Quando a filial não é encontrada, mantém o nome da empresa e omite o endereço, sem usar outra unidade.

Cabeçalho e rodapé continuam seguindo a personalização salva da empresa. Não foram inventados textos nem alteradas preferências persistidas. A configuração consultada da Saunier não continha cabeçalho ou rodapé e estava com a exibição de CNPJ/endereço desativada. Essas preferências continuam compartilhadas entre as filiais da empresa.

Validação: 14 testes de cupom/impressão direta passaram, incluindo cabeçalho e rodapé completos nos dois modos, Atacado/Varejo e filial desconhecida. Não houve impressão física na máquina do usuário. Alteração local, pendente de publicação.
