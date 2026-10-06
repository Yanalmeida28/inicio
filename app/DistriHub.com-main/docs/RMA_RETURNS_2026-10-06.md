# Devoluções vinculadas à venda

A solicitação de RMA agora guarda a venda, o índice do item, o produto, o cliente e a quantidade devolvida. O histórico de compras no cadastro e no perfil do cliente, além do histórico de vendas, mostra a quantidade devolvida e identifica devoluções parciais ou totais.

A venda mantém seus itens, status financeiro, total e faturas originais. Um RMA registra o retorno físico; não executa reembolso nem reduz contas a receber. O filtro “Devolução” no histórico usa os RMAs vinculados.

O banco valida empresa, filial, produto e quantidade comprada, com bloqueio da venda para serializar devoluções concorrentes. Ao avançar de “Retornou ao Fornecedor” para “Reintegrado ao Estoque”, o produto recebe a quantidade e uma movimentação de entrada com referência ao RMA, na mesma transação. Repetir a atualização não duplica a entrada. O limite de crédito do cliente não participa dessa operação.

Devoluções vinculadas à venda ou com entrada registrada permanecem no histórico. A venda com devolução não pode ser cancelada, excluída ou ter seus itens alterados, evitando estorno duplicado de estoque. Uma entrada manual pode selecionar explicitamente um produto da filial; texto livre de SKU não autoriza reintegração automática.

Referências antigas no formato exato `Venda #<UUID>` são vinculadas somente se houver um único item correspondente por nome/SKU, na mesma empresa/filial, e saldo suficiente. A migração não reproduz entradas de estoque antigas. Registros sem correspondência segura permanecem sem vínculo.

## Banco e publicação

A migração `20261006165722_link_rma_sale_items_and_stock.sql` foi aplicada ao projeto Supabase configurado no `.env`. Esse projeto não tinha registros em `rma_requests_v2` antes da alteração. A verificação transacional no banco usou uma venda existente e confirmou uma única entrada de estoque e preservação do total; todos os dados desse teste foram revertidos.

O pacote `distrihub-devolucoes-2026-10-06.zip` contém o conteúdo de `dist`, incluindo `.htaccess`, pronto para a raiz pública da hospedagem. A interface utiliza o novo fluxo após publicação na hospedagem; o workflow `Implantar DistriHub` publica automaticamente os envios à branch `main`.

## Verificação

- TypeScript sem erros; compilação Vite concluída.
- Suíte existente com 124 testes aprovada, incluindo as novas verificações de banco e histórico; teste adicional do formulário aprovado depois disso.
- Formulário preserva o rascunho e apresenta o erro quando o salvamento falha.
- Testes SQL cobrem limite de quantidade, vínculo incorreto, tentativas de alterar quantidade/entrada, transições inválidas, exclusão/cancelamento, reintegração manual e rollback conjunto de status/estoque.
- Consultor de segurança não apontou as novas funções privadas ou as políticas de RMA. Avisos anteriores do banco não foram alterados.
- ESLint dos arquivos alterados encontrou erros e avisos já existentes em `PartnerPanel.tsx`, `usePartnerData.ts` e no estado `editDefect` de `RmaModule.tsx`.
