# Auditoria do DistriHub — 12/10/2026

Referência: commit publicado `cd8a814321e7f454f6d3b6e8297fd4c877611281`, projeto Supabase `DistriHub.com` e domínio `distrihub.com.br`.

## Conclusão

O aplicativo tem uma base operacional validada, mas ainda precisa de ajustes de integridade de estoque, ordens de serviço, histórico financeiro e catálogo público. A última publicação passou em 336 testes, TypeScript, lint e build; isso não cobre todas as falhas de comunicação, integrações externas ou regras comerciais.

Esta auditoria usou leitura do código publicado, metadados e agregados do banco, funções SQL implantadas, avisos Supabase, consulta npm e reproduções locais com dados fictícios. Não foram criadas vendas, pagamentos, reposições, OS ou cobranças reais. Os achados abaixo distinguem reprodução local, inspeção da implementação e pendências externas.

## Ajustes prioritários

### 1. Alta — reposição de estoque pode duplicar após resposta perdida

Evidência: `src/hooks/usePartnerData.ts:2226`, chamada `execute_partner_stock_replenishment`; formulário em `src/components/partner/CadastrosModule.tsx:2639`. A assinatura e a definição da RPC implantada foram consultadas.

Cada chamada soma a quantidade ao estoque e cria uma entrada. Não existe identificador da tentativa nem consulta de resultado anterior. Se o banco confirmar uma reposição de 10 unidades e a resposta não chegar ao navegador, tentar novamente pode adicionar outras 10 unidades. O bloqueio do botão durante salvamento não resolve a repetição depois do erro.

Correção: identificador persistente por operação, reaproveitado na retentativa; transação que retorna a mesma reposição já confirmada; distinguir duas reposições legítimas iguais. Critério: uma resposta perdida não produz segunda entrada; duas operações distintas continuam permitidas. Risco confirmado pela implementação; não foi provocada duplicação no banco real.

### 2. Alta — criação de OS tem risco semelhante e pode perder fotos

Evidência: `src/components/partner/ServiceOrdersModule.tsx:356`, `:394`, `:440`, `:449` e `:511`; definição implantada de `create_service_order` e índices de `service_orders`.

- A criação gera um novo UUID no servidor em cada chamada, sem identificador de operação, e baixa as peças. Uma nova tentativa após perda da resposta pode criar outra OS e baixar estoque novamente.
- Falha de upload de foto apenas registra erro no console e continua. Erro ao inserir o vínculo em `service_order_photos` não é verificado. Depois, a tela anuncia sucesso e limpa o formulário.
- A RPC usa `auth.uid()` como dono da empresa e valida a filial com esse ID. Para um colaborador autenticado cujo ID é diferente do titular, a criação não aceita uma filial da empresa, mesmo que o módulo OS esteja permitido a esse colaborador.
- A lista atual mostra identificação e valor, mas não oferece o ciclo completo de responsável, aprovação, andamento, conclusão e cancelamento. O checklist obrigatório de tela/touch/câmera também é aplicado a outros segmentos.

Correção: criação recuperável por identificador; retentar anexos sem recriar a OS; conferir cada upload e vínculo; manter os arquivos pendentes; resolver empresa e operador na RPC; implementar o ciclo de atendimento por segmento. Validar uma única baixa de estoque e recuperação das fotos após falha.

### 3. Alta — pedidos B2B dependem de preços enviados pelo navegador

Evidência: `src/lib/b2bOrder.ts`; políticas, constraints e triggers de `public.b2b_orders` consultadas em produção.

O cliente envia `items`, preços, frete e `total`. Os controles consultados verificam identidade, acesso ao módulo e valores não negativos, mas não recalculam preços a partir de um catálogo autorizado. Uma reprodução local com cliente fictício aceitou preço e total zero. Não foi inserido pedido real.

Correção: RPC de pedido que valida empresa, catálogo, produtos, quantidades, preços, frete e estado inicial no servidor; restringir escrita direta dos campos comerciais. Homologar divergências de preço e retentativas antes de usar o fluxo para cobrança ou execução automática. A interface pública desse fluxo está incompleta, conforme o item 6; isso reduz sua exposição pela navegação normal, mas não substitui a proteção da API.

### 4. Alta — margens de vendas antigas podem mudar ao editar o custo atual

Evidência: `src/lib/reportMetrics.ts:87–95`, funções financeiras de `AdminModule.tsx`, agregado consultado em `partner_sales`.

Os relatórios usam o custo gravado na venda quando existe. Para vendas sem esse registro, usam o custo atual do produto. No banco consultado, **68 das 79 vendas concluídas** estavam sem snapshot ou com snapshot vazio; isso não significa que todas tenham CMV afetado, mas exige revisão desse histórico.

Reprodução: a mesma venda antiga de 3 unidades apresentou CMV de R$ 30 com custo de R$ 10 e CMV de R$ 300 após alterar o custo para R$ 100. Vendas novas já têm mecanismo de snapshot.

Correção: sinalizar margens antigas como estimadas; recuperar custo histórico apenas a partir de registros confiáveis. Não preencher retrospectivamente o custo atual como se fosse o custo original. Separar apuração histórica confiável de estimativas.

### 5. Média — classificação ABC está incorreta nos limites e sem vendas

Evidência: `src/components/partner/CadastrosModule.tsx:2616–2624`. Reprodução executou o bloco real da classificação com dados fictícios.

- Produto com R$ 950 de receita em um total de R$ 1.000: **Classe C**, embora represente 95% da receita.
- Produto sem nenhuma venda: **Classe A**, porque o acumulado zero entra na condição `<= 70`.

O algoritmo escolhe a classe depois de somar a receita do próprio produto. Assim, o item que ultrapassa um limite pode cair fora da faixa que ele deveria completar. Sem receita, divide por 1 e classifica todos os produtos como A, podendo produzir alertas inadequados de alto giro.

Correção: definir a regra comercial dos itens que cruzam os limites; atribuir a faixa antes do avanço acumulado, preservando o primeiro produto relevante na classe A; tratar produtos sem vendas como sem classificação por receita. Validar um único produto, faturamento concentrado, ausência de vendas e limites de 70%/90%. Os cartões no celular funcionam, mas exibem essa classificação calculada.

### 6. Alta para concluir a funcionalidade — catálogo público e carrinho estão desconectados

Evidência: `src/App.tsx`, `src/components/PublicCatalogPage.tsx:154`, `src/hooks/useProducts.ts:28`, metadados de tabelas.

- `PublicCatalogPage` não é montado pelo App; não há tratamento da rota de catálogo.
- O botão “Adicionar ao pedido” do componente público não tem ação.
- O carrinho do App começa fechado e suas chamadas `setCartOpen` apenas fecham o carrinho.
- O hook antigo `useProducts` consulta `products`, tabela ausente no banco atual. Há `partner_products` e `public_catalog_products`, que não devem ser tratadas automaticamente como equivalentes.

Correção: escolher o contrato de catálogo, montar a rota pública, ligar produtos/carrinho e concluir o pedido com precificação segura. Critério: abrir o link sem login, adicionar produto, finalizar um único pedido e recuperar o resultado após falha.

## Outros ajustes confirmados

| Área | Evidência e impacto | Ajuste |
|---|---|---|
| Suporte | `AdminSupportModule.tsx:33` e `SupportChatModule.tsx:40`: consultas sem paginação, repetidas a cada 10 segundos. Com volume acima do limite da API, conversas ou mensagens recentes podem ficar fora do resultado. Havia apenas 2 mensagens no momento da auditoria, portanto não foi constatado prejuízo atual por volume. | Consultar últimas conversas no servidor, paginar mensagens e carregar histórico sob demanda. |
| Visão geral do Super Admin | `AdminActivityModule.tsx:40`: pendências são lidas somente ao montar o componente. O botão “Atualizar” em `AdminSaasModule` atualiza assinaturas/faturas, mas não dispara nova consulta desse resumo. | Atualizar todos os indicadores pelo mesmo comando; mostrar data da atualização e opção de tentar novamente. |
| E-mail da conta | `SettingsModule.tsx:159`: campo editável, mas `handleSave` não usa seu valor e não chama alteração do e-mail de autenticação. | Implementar alteração com confirmação ou tornar o campo somente leitura. |
| Importação | `ImportExportModule.tsx:816` aceita XML/PDF no seletor, mas `:419–424` rejeita esses formatos. Há entrada XML em outro fluxo de cadastros, o que não significa suporte nesse importador. | Alinhar formatos aceitos com os importadores implementados e orientar o fluxo correto. |
| Fiscal | O módulo salva pedidos pendentes e informa que falta transmissão. As funções Edge listadas não incluem um processador fiscal. | Integrar provedor/certificado, transmissão, rejeições, autorização e documentos resultantes; validar em homologação apropriada. A emissão fiscal real ainda não está completa. |
| DRE | `AdminModule.tsx:1318–1325` usa percentuais estimados de impostos e despesas. O resultado já está rotulado como simulado. | Conectar despesas e regras reais antes de tratar esse valor como lucro apurado. |
| Google / descoberta | `robots.txt` e `sitemap.xml` publicados retornaram HTTP 200 com `text/html` e o HTML do aplicativo, em vez dos arquivos esperados. A página principal permite indexação e tem canonical. | Publicar os arquivos corretos e validar propriedade/indexação no Search Console. Não é necessário criar outro site. |

## Pendências que exigem confirmação externa

- **Agendamento do worker de cobranças:** a função `saas-provider-jobs` está ativa; o banco não tem `cron.job` e os workflows não têm agendamento. A documentação local ainda registra essa configuração como pendente. Não havia jobs na consulta. Isso não prova ausência de um agendador externo. Confirmar sua existência, frequência e resultado; testar falha e retomada de cancelamentos no gateway sem criar cobranças de teste em produção.
- **Homologação por perfil e dispositivo:** validar titular, gerente e colaborador em empresas/filiais diferentes, restauração de sessão, impressão, PIN e gerenciadores de senha. A leitura não substitui essas sessões de teste.
- **Volume:** a carga inicial/manual do hook percorre coleções inteiras paginadas. Medir com volume real e passar histórico, auditoria e fotos para carregamento sob demanda. Não foi feito teste de carga.

## Segurança e dependências

- As tabelas públicas examinadas têm RLS habilitado. Os avisos de funções privilegiadas não equivalem, por si só, a falhas exploráveis. A função de acesso SaaS consultada verifica vínculo com a empresa; as novas políticas de histórico e suporte restringem acesso ao Super Admin.
- O Supabase aponta proteção contra senhas vazadas desativada. [Orientação oficial](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Avisos de segurança: 11 tabelas com RLS sem políticas, 1 função privilegiada acessível anonimamente e 62 funções privilegiadas acessíveis a usuários autenticados. Parte é intencional, como leitura pública do catálogo e operações por RPC. Revisar autorização por função, sem liberar tabelas apenas para remover avisos. [RLS sem políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [funções anônimas](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [funções autenticadas](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- `npm audit` atual: **32 avisos — 24 altos, 6 moderados, 2 baixos e nenhum crítico**. A lista inclui ferramentas de desenvolvimento/build como Vite, PostCSS e Tailwind; o total não significa 32 vulnerabilidades exploráveis pelo visitante. Atualizar dependências com testes e atenção às migrações maiores; não usar correção forçada indiscriminada.
- Avisos de desempenho: 18 chaves estrangeiras sem índice, 15 políticas com avaliação de autenticação por linha e 3 casos de políticas permissivas sobrepostas. São oportunidades de revisão, sem medição de lentidão nesta auditoria. [Índices de FKs](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [avaliação de RLS](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan), [políticas sobrepostas](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies). Índices marcados como pouco usados não devem ser removidos automaticamente.

## Melhorias anteriores verificadas no código atual

- Recebimentos parciais usam `record_partner_invoice_payment_once` e identificador preservado em armazenamento local.
- Créditos de RMA são separados de recebimentos em dinheiro por `invoiceCashReceived`.
- RMA transmite anexos para bucket privado e possui identificador de criação.
- Vendas novas possuem snapshot de custo; a pendência é o histórico anterior.
- Entregas têm endereço, contato e detalhes persistidos.
- Cadastro trata ausência de sessão após inscrição e orienta confirmação de e-mail.
- Super Admin tem filtros, histórico, motivos, suporte organizado e cartões responsivos.
- HTTP já redireciona para HTTPS; o domínio responde com e sem `www`. A causa do comportamento relatado em um navegador específico ainda depende da mensagem de erro ou reprodução nesse dispositivo.

## Ordem de execução recomendada

1. Proteger reposição de estoque e criação de OS contra retentativas; recuperar anexos de OS.
2. Corrigir a curva ABC e a identificação de margens históricas estimadas.
3. Concluir catálogo/carrinho com validação comercial no servidor.
4. Confirmar processamento contínuo das cobranças e corrigir suporte/atualização de indicadores.
5. Alinhar e-mail, importadores, SEO e atualizar dependências.
6. Concluir ciclo de OS e integração fiscal, com homologação de operação e permissões.

## Artefatos

- [Reproduções locais](publish-superadmin-2026-10-12/app/DistriHub.com-main/docs/audit-reproductions-2026-10-12.mjs).
- [Resultados das reproduções](publish-superadmin-2026-10-12/app/DistriHub.com-main/docs/audit-reproductions-2026-10-12.json).
- [Resultado npm audit](publish-superadmin-2026-10-12/app/DistriHub.com-main/docs/audit-dependencies-2026-10-12.json).
- [Implantação da versão analisada](https://github.com/Yanalmeida28/inicio/actions/runs/38291203908).

Limites: auditoria dirigida, sem pentest completo, teste de carga, fluxo fiscal real, cobrança no gateway ou criação de operações comerciais. Não certifica ausência de outros problemas.
