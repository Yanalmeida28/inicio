# Caixa e operador na finalização

O caixa é separado por empresa, filial e operador. Proprietários e gerentes podem consultar o histórico de outros operadores; essa consulta não autoriza lançar uma venda no caixa exibido no relatório.

A seleção de operador e filial agora é lembrada na sessão do navegador, por conta. Ao recarregar uma sessão de proprietário que operava com um funcionário selecionado, a tela solicita novamente o PIN. O PIN não é persistido. Funcionários continuam usando a identidade da própria sessão autenticada.

O PDV consulta `read_partner_cash_register` com o mesmo operador e filial usados para finalizar a venda. Mostra o caixa próprio, informa quando há apenas caixa de outro operador e permite ao proprietário abrir a confirmação de operador a partir desse aviso. O caixa é consultado novamente ao voltar à tela, focar a janela e antes de iniciar uma finalização nova. Uma mudança de operador/filial durante a consulta interrompe a finalização. Pedidos com resultado incerto mantêm a recuperação idempotente existente, inclusive após fechamento do caixa.

A aba Caixa diferencia relatório consultado de caixa do operador atual. Não houve mudança na exigência de caixa aberto do banco, no saldo, nos movimentos ou no isolamento entre operadores. Nenhuma migration adicional é necessária.

Verificação: testes de contexto de caixa, armazenamento sem PIN, isolamento por conta, consulta antes de finalizar e necessidade de nova autorização após recarregar; suíte de caixa/PDV existente; TypeScript e compilação.
