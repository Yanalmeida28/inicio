# Ajustes de relatórios, CRM, financeiro, RMA e entregas

## Comportamento implementado

- Relatórios: filtros por cliente, vendedor, pagamento e produto, detalhamento das vendas e exportação com o período/filtros aplicados. O filtro de produto seleciona pedidos que contêm o produto, mantendo o total completo dessas vendas, conforme a indicação na tela.
- Custos: novas vendas concluídas recebem fotografia de custos no servidor. Mudanças no cadastro não alteram o custo dessas vendas. Vendas anteriores sem fotografia continuam estimadas pelo cadastro; nenhum custo histórico foi inventado ou regravado.
- Administrativo: crédito de RMA deixa de ser contado como dinheiro recebido. Vendas liquidadas com RMA também são excluídas das entradas imediatas. DRE passa a ser identificada como simulação e lucro bruto estimado recebe o nome correspondente.
- CRM: ficha com contato, compras recentes, saldo/vencido, segmentação de inativos/sem compras/retornos pendentes, tarefas por cliente/filial com data, responsável, observações e conclusão. O envio de WhatsApp permanece manual; não se registra envio automático. A mensagem de aniversário não promete um cupom inexistente.
- Financeiro: recebimentos usam identificador persistido por usuário, empresa e fatura. Nova tentativa após resposta perdida/recarregamento reutiliza o identificador. O servidor serializa a operação, rejeita mudança de valor com o mesmo identificador e não repete o recebimento. Recebimentos legítimos iguais continuam possíveis com identificadores distintos. Histórico mostra registros de dinheiro recebido e crédito separado. Vencimento hoje não é tratado como atraso pela hora do dia.
- Contas de clientes: coluna de dinheiro recebido desconta créditos; contas a receber identificam o agregado total como liquidação em dinheiro/crédito.
- RMA: fotos antes/depois e mídia de defeito são enviadas para bucket privado, vinculadas à solicitação e abertas por URL temporária. Limite de 20 MB/arquivo e três anexos; tipos JPEG/PNG/WebP/HEIC/MP4/WebM. Nova tentativa na mesma tela recupera a solicitação enviada, mantendo o formulário bloqueado para preservar o conteúdo incerto.
- Entregas: novas vendas preservam endereço/contato do cliente. Pedidos antigos sem endereço podem receber o endereço atual na edição, para conferência antes de salvar. Detalhes incluem previsão, recebedor, motivo de falha, observações e histórico. Há busca por cliente/pedido e filtros por entregador/previsão. Valor em rota só soma em rota; fila ativa inclui pendentes/em rota; itens contam unidades. Falhas podem ser reagendadas pelos detalhes, preservando histórico.

## Banco e autorização

Migração: `20261011231054_complete_operational_modules.sql`. Nenhuma linha comercial antiga foi reclassificada ou excluída. A tabela de repetição de recebimentos fica em schema privado; RPC chama a autorização financeira existente. A RPC de detalhes de entrega chama a autorização já existente, incluindo operador, empresa, filial e atribuição do entregador.

CRM possui RLS por empresa/filial e plano, valida cliente/responsável/filial na inserção e só permite atualização de status/data de conclusão. Datas de criação/conclusão são registradas pelo servidor. Os anexos ficam privados e a leitura compartilhada exige acesso à solicitação correspondente.

Advisors após migração: os dois novos avisos de funções `SECURITY DEFINER` autenticadas são esperados para as RPCs que precisam de autorização transacional. A revisão confirmou delegação às verificações existentes, schema de repetição privado e nenhum EXECUTE anônimo nas novas RPCs. [Orientação do Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Verificação

Testes incluem repetição de recebimento, dois pagamentos iguais legítimos, resposta perdida seguida de remontagem, custo/endereço históricos, isolamento entre empresas, RLS de CRM, upload/leitura privada, requisito de recebedor/motivo e indicadores de entrega. TypeScript, lint e build são verificados antes da publicação.

Não foram realizadas cobranças ou vendas reais para testar. Permanecem como evoluções de escopo: integração/conciliação bancária, despesas recorrentes, funil de oportunidades, automação de mensagens, roteirização e comprovante com foto/assinatura. O recebimento nominal/data da entrega foi implementado; não deve ser anunciado como assinatura digital.
