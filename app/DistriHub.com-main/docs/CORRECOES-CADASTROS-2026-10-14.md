# Correções do módulo Cadastros — 14/10/2026

## Estado da entrega

Código corrigido no projeto local. Migração `20261014201623_fix_cadastros_xml_customer_and_permissions` aplicada e registrada no Supabase DistriHub.com. Frontend ainda não publicado no domínio; o build local está pronto em `dist/`.

## Correções

- XML: decimais com ponto mantêm o valor correto (`12.50` → `12.5`, `2.0000` → `2`). Valores ambíguos são rejeitados. A nota precisa ter chave, emitente e itens válidos; quantidades fracionadas são recusadas porque o estoque atual usa inteiros.
- Entrada XML: fornecedor identificado pelo documento; produto conciliado pelo SKU dentro da filial; estoque incrementado sem sobrescrever preços de venda de produtos existentes. Novos produtos recebem os preços derivados do custo usados anteriormente. O lote inteiro é transacional. A chave da nota é registrada por empresa/filial, com validação do conteúdo em retentativas. Uma nota repetida retorna o resultado anterior.
- Cliente: atualização completa com lista explícita de campos permitidos, incluindo nome fantasia, inscrições, endereços, vendedor, tabela de preços e contatos. Valores nulos podem limpar campos. A tela usa o registro confirmado pelo servidor. Clientes compartilhados continuam sem filial; alteração de filial é validada no servidor.
- Foto do cliente: upload verificado em bucket privado, vínculo ao cliente validado no servidor, prévia com URL temporária e exibição por URL assinada. Remover foto limpa o vínculo do cadastro. Arquivos não vinculados não são apagados automaticamente, para não eliminar um upload confirmado cujo resultado tenha se perdido. JPG, PNG e WebP de até 2 MB.
- Categorias, kits e modificadores: colaboradores ativos com acesso a Cadastros podem gravar registros autorizados. Kits e modificadores conferem a empresa/filial do produto; kits têm validação comercial no banco. A assinatura e os bloqueios do módulo continuam sendo verificados.
- Formulários: categorias, kits, modificadores e XML apresentam falhas e usam bloqueio síncrono de envios concorrentes. Os dados permanecem disponíveis após falha. Produtos selecionados de uma filial anterior são rejeitados no envio de kits/modificadores.
- Total de compras: soma somente vendas concluídas e desconta crédito/reembolso emitido por devolução, sem descontar duas vezes o mesmo valor quando constar nos dois campos. O histórico continua exibindo outros estados.

## Validação

- Suíte completa: **398 testes passaram, zero falhas**.
- Migração final: testes locais adicionais passaram após os ajustes de autorização e preservação de filial.
- TypeScript passou, lint com `--max-warnings 0` passou e build final passou.
- Testes novos: falha e retentativa de upload; campos completos/nulos e resposta confirmada do cliente; envio concorrente; preço negativo e seleção antiga de kit; total de compras; repetição de nota; conciliação de SKU; rollback do lote; acesso de colaboradores e rejeição de outra empresa/filial.
- Supabase: funções, políticas, coluna de documento do fornecedor e RLS da tabela privada conferidos após a aplicação. Chamadas sem autenticação foram rejeitadas sem cadastrar dados.
- As funções públicas novas são `SECURITY INVOKER`; a implementação privilegiada está em esquema privado, com verificações de identidade, módulo, operador, empresa e filial. Execução por `anon` foi revogada.

O advisor manteve os avisos anteriores e acrescentou somente a informação de RLS sem política na tabela privada de recibos XML. Isso é intencional: não há acesso direto concedido a `anon`/`authenticated`, e as operações passam pelas funções autenticadas. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

Não foram inseridos clientes, fornecedores ou notas reais para os testes. Não houve homologação autenticada no site publicado. O histórico de notas importadas pelo fluxo antigo não contém chaves recuperáveis; a proteção contra repetição começa nas notas processadas pelo novo fluxo.
