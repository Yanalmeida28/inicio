# Pré-vendas e clientes em cartões no celular

Pré-vendas pendentes passam de tabela a cartões até 768px, com cliente, itens, total com frete, rastreabilidade, pagamento, data e ações. Remove rolagem interna da lista no celular e adiciona texto ao botão de cancelar. Callbacks e regras de finalização/resgate não mudam.

Clientes já usavam cartões até 620px. Cobertura ampliada até 768px; ações agora ocupam uma linha com botão Opções de tamanho confortável. Tabela recebe nome acessível. Computador mantém tabelas.

Validação: 14 testes de cadastro/perfil e recuperação de pré-vendas passaram; build aprovado. Edge: 12 cenários de pré-vendas, clientes e lista vazia em 320, 390, 768 e 1366px, sem excesso horizontal. Confirmados resgate para PDV e menu do cliente. Capturas de 390px inspecionadas, somente dados fictícios. Artefatos locais em docs/presale-customer-review.

Pendente de publicação, junto dos ajustes anteriores de Entregas, Financeiro e Administrativo.
