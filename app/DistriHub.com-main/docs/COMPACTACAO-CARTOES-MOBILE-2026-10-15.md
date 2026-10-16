# Compactação adicional dos cartões no celular

Revisão de espaço até 768px: indicadores com preenchimento de 10px, ícones de 32px e números de 17px; resumos com margens menores; indicadores administrativos com espaços reduzidos. Entregas, faturas, recebimentos e pré-vendas usam cartões com 10px de preenchimento, intervalos de 8px, campos mais próximos e sem rótulo duplicado de ações. Histórico de vendas com intervalos e preenchimento menores.

Mantém todos os campos, contraste, dados e botões com área mínima de toque de 44px. Somente CSS, sem mudar regras ou persistência. Cadastros já tem compactação própria pendente.

Build aprovado. Conferência em Edge oculto com dados fictícios: 48 cenários combinando telas de 320, 390, 768 e 1366px com Entregas, Financeiro, Administrativo, clientes e pré-vendas, incluindo vazios, perfil logística, detalhes, histórico e amortização. Sem excesso horizontal e sem erros de execução nos cenários. Captura de Entregas em 390px inspecionada visualmente. Histórico de vendas recebeu apenas redução de espaçamento, sem cenário visual específico nesta revisão.

Pendente de publicação, junto da compactação de Cadastros e da proteção do PIN na troca de operador.
