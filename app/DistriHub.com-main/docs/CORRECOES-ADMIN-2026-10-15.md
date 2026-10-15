# Admin da loja — correções de 15/10/2026

Estado: sete correções implementadas localmente; publicação pendente. Esta entrega não exige migration nem altera dados reais de vendas, caixa, tributos ou terminais.

## Correções

1. **Conclusão da venda.** Dashboard, comparativos, gráfico, CRM e exportação usam `completed_at` válido e preservam `created_at` como fallback para registros antigos. Somente vendas concluídas compõem as receitas.
2. **Períodos civis.** Auxiliar compartilhado calcula limites em America/Sao_Paulo, independentemente do fuso do navegador. Início inclusivo e fim exclusivo do dia seguinte incluem os últimos milissegundos. Datas inválidas, ausentes ou invertidas exibem alerta, ocultam os resultados e desabilitam exportações. Comparativo anterior cobre o mesmo número de dias civis. O período impresso no PDF também foi alinhado.
3. **Gráfico completo.** Intervalos superiores a 90 dias são agrupados em até 90 pontos cobrindo toda a seleção. Nenhuma venda do fim do período é descartada; a interface explica o agrupamento. Os totais do gráfico permanecem iguais aos indicadores.
4. **CRM histórico.** Última compra, inatividade de 30 dias e LTV usam todo o histórico autorizado da filial. Selecionar Hoje não torna inativo quem comprou ontem. LTV foi identificado como histórico; clientes ativos são contados pela última compra nos últimos 30 dias.
5. **Resumo dos movimentos.** Resumo executivo e Fluxo Financeiro usam o mesmo carregador de recebimentos, pagamentos e reembolsos e a mesma composição de movimentos. Frete recebido entra no movimento financeiro sem alterar receita de mercadorias. Reembolsos confirmados entram como saída uma vez. A leitura consome todas as páginas, respeita empresa/filial, descarta respostas antigas e deixa o saldo indisponível em caso de falha. A simulação de DRE permanece identificada e separada do caixa.
6. **Terminais.** A tela reinicia por empresa/filial. Cada leitura tem uma versão e respostas antigas são descartadas. Ocultar a aba encerra a consulta periódica e invalida resultados pendentes. Falhas de leitura exibem erro e não se apresentam como lista vazia confirmada; registro pendente não atualiza a interface de outro contexto.
7. **Permissões internas.** PartnerPanel fornece a combinação efetiva de papel, bloqueios do colaborador e assinatura para Cadastros, Relatórios, Fiscal, Financeiro e Configurações. Admin filtra as seções e verifica a seção atual antes de montar o conteúdo. Revogar acesso com a seção aberta retira o conteúdo imediatamente. `renderCadastros` também verifica o acesso ao módulo; gestão de colaboradores mantém sua regra específica do Administrativo. Ações de proprietário continuam restritas ao proprietário. As verificações das RPCs no servidor permanecem preservadas.

## Verificação

- Seis novos testes em `admin-corrections.test.mjs` cobrem limites brasileiros, intervalos inválidos, conclusão da venda, gráfico completo, CRM, revogação de acesso, resumo de R$75 (venda R$100 + frete R$15 − reembolso R$40), falha de consulta e respostas de terminais fora de ordem.
- Treze testes focados de Admin/Financeiro aprovados (`admin-correcoes-focado.log`).
- Dezessete testes de Admin e exportação aprovados (`admin-exportacoes-focado.log`); a fixture existente de PDF/CSV foi atualizada para carregar o novo auxiliar de datas real.
- Validação completa final: **510 testes aprovados**, zero falhas ou ignorados (`admin-completo-final.log`). TypeScript, lint sem avisos e build aprovados (`admin-typecheck-final.log`, `admin-lint-final.log`, `admin-build-final.log`). Verificação das diferenças sem erros de whitespace.

Testes usam componentes e hooks reais com respostas isoladas; não cadastram terminais reais, não emitem documentos fiscais e não executam operações financeiras reais. A autorização de escrita do banco não foi ampliada.

## Publicação futura

Incluir apenas implementação, auxiliares/hooks compartilhados, testes e este relatório. Scripts de auditoria, scripts temporários de edição, logs e artefatos de outras revisões não fazem parte da entrega. Super Admin da plataforma não é o escopo destas correções.
