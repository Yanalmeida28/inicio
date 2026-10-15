# Correções de Ordens de Serviço — 14/10/2026

## Sete ajustes

1. **Cliente após faturamento:** banco bloqueia troca ou remoção se existir fatura da OS. Proteção aplicada também à API antiga, sob o bloqueio transacional da OS que é compartilhado com a cobrança. Nenhuma cobrança existente foi alterada.
2. **Detalhes de outra OS:** componente é isolado por empresa, filial e ID. Técnico, situação, aprovação, cliente, fotos e cobrança reiniciam ao abrir outra OS. Resultado de workflow precisa confirmar ID, empresa e filial; resposta de componente desmontado não altera a nova tela.
3. **Lista de outra filial:** módulo é isolado por identidade/empresa/filial e ignora leituras antigas. Confirmações de criação/edição invalidam leituras anteriores. Tela inativa não inicia nova leitura e fecha detalhes.
4. **Falha de carregamento:** tela separa carregando, erro e lista vazia. Erro fica visível com botão para tentar novamente; não anuncia lista vazia em caso de falha. Detalhes também permitem recarregar e só liberam edição após conferir a cobrança.
5. **Remoção explícita de cliente:** novo endpoint recebe `p_clear_customer` e limpa ID/nome antes do faturamento. API antiga preserva o significado de NULL omitido, evitando remover clientes de chamadas existentes. Solicitação contraditória é rejeitada.
6. **Alterações durante envio:** fieldset bloqueia o formulário completo durante criação e preparação de fotos. Travas síncronas protegem envio e edição de peças; não é possível abrir outra OS durante a criação. Recuperação reutiliza o UUID e payload originais.
7. **Armazenamento bloqueado:** acesso ao localStorage ocorre dentro do try/finally. Falha fica visível, libera o envio e preserva dados. Tentativa pendente malformada não é apagada automaticamente, nem substituída por criação sem rastreio.

## Validação

- **454 testes passaram**, zero falhas na suíte completa.
- Após os últimos ajustes: **13 testes de interface e recuperação passaram**, zero falhas.
- TypeScript, ESLint com zero avisos, build e `git diff --check` passaram.
- Banco local confirmou remoção e reatribuição antes do faturamento, compatibilidade da API antiga, rejeição de outra empresa, bloqueio após faturamento e preservação de estoque/recebimentos.
- Componentes reais confirmaram troca de OS/filial, descarte de resposta antiga, erro/recuperação da lista, trava do formulário, armazenamento bloqueado e repetição da mesma criação incerta.
- Consulta somente de leitura em produção encontrou **zero divergências de cliente entre OS e fatura**.

## Implantação

- Migração `20261015010204_fix_service_order_customer_and_billing` aplicada no Supabase e conferida. O timestamp da migração é UTC; esta documentação usa a data de São Paulo.
- Novo endpoint `update_service_order_workflow_checked` usa SECURITY INVOKER; implementação autorizada fica em schema privado. Execução anônima negada e autenticada concedida.
- Advisor de segurança manteve as contagens anteriores, sem apontamentos novos.
- Nenhuma OS, fatura, foto, cliente, estoque ou Caixa real foi criado/alterado para testar.
- **Frontend ainda não publicado.** Publicar o projeto para disponibilizar todos os ajustes da interface.
