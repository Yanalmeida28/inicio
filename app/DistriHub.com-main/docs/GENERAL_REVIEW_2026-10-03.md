# Análise geral do DistriHub — 03/10/2026

## Escopo e resultado

Revisão do código do workspace, do workflow de publicação e de metadados/permissões do banco de produção. Consultas ao banco foram somente de leitura; não foram alterados dados, funções ou permissões. Não foram executadas cobranças, emissões fiscais ou testes visuais com contas reais.

Há alterações locais de suporte/admin que ainda não fazem parte da última publicação. Os achados abaixo sobre Configurações, Fiscal, Pedidos, Caixa e Filiais correspondem aos componentes do fluxo publicado; os resultados de lint e TypeScript abrangem o workspace atual.

A base de PDV/estoque/crédito tem controles relevantes e testes automatizados. Há, porém, duas falhas de autorização confirmadas no banco e incompatibilidades de integração que precisam de prioridade antes de expandir o uso comercial.

## Achados por prioridade

### 1. Crítico — privilégios de leitura na view financeira administrativa; exposição pela API depende da configuração do schema

Objeto de produção: `public.admin_financial_months`.

A view agrega vendas por empresa e mês sem filtro de identidade. A consulta de metadados confirmou: proprietário `postgres`, proprietário com bypass de RLS, ausência de `security_invoker=true`, e privilégio SELECT tanto para `anon` quanto para `authenticated`. O advisor do Supabase também acusa `security_definer_view` com nível ERROR.

Isso oferece leitura de totais financeiros por empresa a papéis que não deveriam acessar uma visão administrativa. Não foram extraídos valores financeiros reais durante a revisão. A exposição através da API externa depende também da configuração de schemas da Data API; as permissões perigosas no banco estão confirmadas.

Correção proposta: retirar o acesso direto de clientes à view e fornecer uma consulta administrativa com autorização explícita. Se a view tiver uso por lojistas, aplicar autorização por empresa e segurança de invocador, com testes para proprietário, funcionário, outra empresa e visitante.

Referência oficial: https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view

### 2. Alta — proprietário pode alterar plano e ativar sua assinatura sem pagamento validado

Código: `src/components/partner/SettingsModule.tsx`, função `handlePlanChange`.

O navegador atualiza `subscription_plan`, define `subscription_status='ativa'` e calcula `next_billing_date` diretamente na tabela `partner_profiles`. No banco de produção, `authenticated` possui UPDATE nessas colunas e a política permite editar o próprio perfil. Não há trigger de UPDATE no perfil conferindo pagamento ou aprovação administrativa.

A política separa contas, mas não protege os campos comerciais dentro da própria conta. Um proprietário pode declarar a assinatura ativa sem passar por um processo de cobrança confirmado. A análise não demonstra que todos os recursos comerciais estejam liberados por esse campo; demonstra que o estado da assinatura pode ser alterado pelo cliente.

Correção proposta: permitir ao cliente apenas solicitar uma mudança de plano; aplicar plano, status e renovação no servidor após cobrança confirmada ou ação administrativa autorizada. Restringir também os privilégios das colunas, não apenas esconder os controles na tela.

### 3. Alta — chamadas fiscais não correspondem às funções do banco publicado

Código: `src/components/partner/FiscalModule.tsx`, `handleEmit` e `handleInutilization`; `src/services/fiscalService.ts`.

O frontend envia parâmetros como `p_user_id`, `p_branch_id`, `p_series`, `p_number` e `p_provider_response` para `record_fiscal_document`. A assinatura existente em produção é `p_document_id, p_document_type, p_status, p_document_number, p_access_key, p_payload`. Não foi encontrada outra sobrecarga compatível.

A inutilização envia parâmetros individuais, enquanto `create_fiscal_inutilization` recebe apenas `p_data jsonb`. Essas chamadas não encontram uma função compatível na API. Além disso, `handleEmit` retorna ao encontrar erro sem mostrar a mensagem ao operador.

Correção proposta: alinhar os contratos, apresentar erros e testar a API com payloads reais de homologação. O fluxo examinado registra uma solicitação pendente; isso não comprova emissão autorizada por um provedor fiscal. A mensagem de sucesso da tela já diferencia solicitação de autorização.

As consultas de documentos e regras em `fiscalService.ts` exigem uma filial no argumento, mas não aplicam filtro por filial. O isolamento de leitura para funcionários também merece revisão: a política de SELECT em `fiscal_documents` usa apenas `auth.uid()=user_id`.

### 4. Alta — Configurações pode exibir sucesso após falha de gravação

Código: `src/components/partner/SettingsModule.tsx`, `handleSave`; `src/hooks/usePartnerData.ts`, `updateProfile`.

`handleSave` chama o callback assíncrono `onProfileUpdate` sem aguardar. Depois faz outra gravação direta, sem conferir o `error` devolvido, e marca `saved=true`. Uma falha pode resultar em aviso de sucesso, erro assíncrono não tratado ou estado local divergente.

O callback em `usePartnerData` ainda filtra `partner_profiles` por `user_id`, enquanto a estrutura de produção consultada usa `id` como identificador e não possui coluna `user_id`.

Correção proposta: uma única gravação, aguardada e com filtro correto; só atualizar estado e mostrar sucesso depois da confirmação. Mostrar a falha ao usuário.

### 5. Média — pedidos filtrados ficam desatualizados e um filtro não funciona

Código: `src/components/partner/OpenOrdersModule.tsx`.

O resultado de pesquisa é salvo como um array de vendas em `searchResults`. Depois de finalizar ou cancelar um pedido, a lista original muda, mas esse array não é recalculado. Um pedido pode continuar aparecendo em aberto e os totais podem refletir o estado antigo.

O select de “Status do pagamento” não possui estado nem `onChange`; a pesquisa não usa seu valor. O filtro oferece ainda Concluída/Cancelada, embora sua fonte seja uma lista que já contém somente pedidos abertos.

Correção proposta: guardar os critérios de pesquisa e derivar os resultados da lista atual, implementando efetivamente o filtro de pagamento e removendo opções incompatíveis com a tela.

### 6. Média — Caixa precisa de um fluxo de devolução após fechamento

Código: `supabase/migrations/20261003182612_partner_cash_register.sql`, `reverse_sale`; `src/components/partner/CashRegisterModule.tsx`.

O fechamento preserva o histórico e impede cancelamento de vendas ligadas a um caixa fechado. Isso é uma proteção intencional, mas significa que uma devolução no dia seguinte ainda não tem um fluxo financeiro próprio neste módulo.

Correção proposta: registrar devolução/estorno em uma sessão posterior, vinculando a venda original e exigindo autorização, sem recalcular o caixa já fechado. Diferenciar cancelamento antes do fechamento e devolução posterior.

PIX e cartão são exibidos separadamente, mas não há campos de conferência própria ou conciliação bancária automática. O fechamento atual confere dinheiro físico.

### 7. Média — limite de filiais e planos prometidos divergem

Código: `src/components/partner/MultiStoreModule.tsx` e `SettingsModule.tsx`.

O botão Nova filial desaparece quando existem quatro filiais, independentemente do plano. As descrições comerciais mostram Básico com uma loja, Profissional com até três e Enterprise com lojas ilimitadas. A interface não aplica essa regra de maneira consistente.

Correção proposta: definir um único limite por plano, validar no servidor e usar a mesma informação na interface. Esta revisão não verificou uma regra de quota equivalente em todas as funções de criação de filial.

### 8. Média — carregamento amplo e ausência de paginação explícita

Código: `src/hooks/usePartnerData.ts`, carregamento inicial; `read_partner_cash_register` na migration de caixa.

O carregamento inicial busca várias tabelas completas com `select('*')`, incluindo históricos e registros de auditoria. O Caixa agrega todas as sessões e movimentações do escopo em uma única resposta.

Há risco de lentidão conforme o volume cresce e de históricos incompletos quando a API impõe um limite de linhas. O limite efetivo da Data API não foi confirmado nesta revisão; não se afirma que dados já estejam sendo truncados.

Correção proposta: paginação, filtros de período no servidor e carregamento por módulo. Fazer consultas agregadas específicas para relatórios em vez de calcular totais somente sobre os arrays carregados.

### 9. Média — publicação não exige TypeScript e testes

Arquivo: `.github/workflows/deploy.yml`.

O workflow instala dependências, valida variáveis e executa `vite build`, mas não executa `typecheck`, lint ou os testes de `supabase/tests`. Um build Vite não substitui a análise de tipos. SQL também não é aplicado pelo workflow; alterações de banco e frontend precisam continuar coordenadas.

Correção proposta: checks obrigatórios de TypeScript e testes antes da publicação, estratégia explícita de migrations e validação de contratos entre frontend e banco.

### 10. Baixa a média — manutenção e experiência de uso

O lint atual termina com 58 erros e 12 avisos, principalmente variáveis não usadas, uso de `any` e dependências de hooks. São pendências de qualidade; não significam 58 falhas funcionais confirmadas.

Há muitos `window.alert`/`window.confirm`, arquivos grandes e estilos repetidos. O conflito recém-corrigido da pesquisa de produtos mostra o risco de reutilizar classes genéricas para controles diferentes.

Correção proposta: padronizar mensagens e confirmações, dividir módulos grandes e usar classes específicas por componente. A troca de filial no topo também deve orientar o operador sobre carrinhos ainda preenchidos: o PDV mantém o carrinho ao trocar filial; o backend valida a filial dos produtos, mas a experiência pode terminar em rejeição confusa.

## Pontos positivos e verificação

- TypeScript: passou nesta revisão.
- Testes automatizados: 103 passaram, cobrindo principalmente PDV, preços, estoque, crédito, recuperação de requisições, recebimentos e Caixa.
- Venda/estoque/fatura e lançamento no caixa são coordenados no banco, com proteção contra duplicação de venda e rollback de falhas.
- Pré-vendas não entram no caixa antes da finalização; faturado não aumenta o dinheiro físico.
- Identidade do funcionário e PIN são validados no servidor nos fluxos centrais examinados.
- A seleção global de filial e o gerenciamento em Configurações simplificaram a navegação.
- A última publicação já passou pelo build. Nesta revisão foram repetidos TypeScript, lint e testes, sem publicar alterações.

Os testes não constituem cobertura completa de todos os módulos nem comprovação de integrações externas em produção.

## Outros avisos do Supabase

A proteção contra senhas vazadas está desativada: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Há avisos de funções `SECURITY DEFINER` executáveis por usuários autenticados. Isso exige revisar cada função, mas não comprova uma vulnerabilidade em todas elas; funções RPC com autorização explícita podem usar esse padrão intencionalmente: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

Há tabelas com RLS sem políticas. No Caixa, isso é intencional: acesso direto foi revogado e as operações passam por RPCs que validam o operador. Para as demais tabelas, confirmar o modelo desejado antes de criar políticas genéricas: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Ordem recomendada

1. Restringir a visão financeira administrativa e os campos comerciais da assinatura.
2. Corrigir os contratos fiscais e a gravação de Configurações.
3. Corrigir filtros/atualização dos pedidos e criar devoluções após fechamento.
4. Unificar quotas por plano e reforçar os checks da publicação.
5. Paginar históricos e melhorar mensagens, componentes e estilos.

## Revalidação e pendências de publicação

### Correções locais desta etapa

- `20261003190000_secure_financial_subscription_fiscal_and_branch_flows.sql` mantém a assinatura original de `record_fiscal_document` e o default legado `nfe`; restringe INSERT/UPDATE/DELETE de perfil para o cadastro normal e os campos permitidos; remove a leitura direta de `admin_financial_months`; cria consulta administrativa protegida para solicitações de plano; impede solicitações pendentes duplicadas; e faz a aprovação alterar somente `subscription_plan`, sem declarar pagamento ou assinatura ativa.
- O painel Super Admin ganhou uma lista de solicitações com empresa, planos, data, status e ações de aprovar/rejeitar. A autorização é revalidada no banco com o mesmo RPC `is_super_admin()` que o painel já usa. O perfil do cliente acompanha mudanças por Realtime e reconsulta ao retornar à aba.
- `20261003193000_add_post_close_cash_refunds.sql` e o fluxo do Caixa preservam a recuperação idempotente, a validação de empresa/filial/operador, os limites financeiros, o PIN/autorização e o bloqueio de cancelamento duplicado.
- Solicitações de cancelamento fiscal agora permanecem `pending`; a interface deixa claro que a solicitação não foi transmitida nem autorizada enquanto não houver provedor.

### Validação local realizada

- `npm run typecheck`: passou.
- `npm test`: 111 testes passaram, nenhum falhou.
- `npm run build`: passou.
- Os testes SQL/PGlite aplicaram as migrations no schema de teste e verificaram defaults fiscais, privilégios de perfil, solicitações repetidas, autorização administrativa, aprovação/rejeição sem alterar pagamento, view financeira e devoluções. Isso não equivale a aplicação ou validação no banco de produção.
- Smoke test no navegador local: página inicial e telas de login/cadastro abriram. Não foram enviados cadastros, não foi autenticada uma conta real e não foram exercitados os fluxos de perfil, painel administrativo ou caixa em um banco real.

### Bloqueios externos — nada aplicado/publicado

- As migrations `20261003190000_secure_financial_subscription_fiscal_and_branch_flows.sql` e `20261003193000_add_post_close_cash_refunds.sql` **não foram aplicadas**. O ambiente não tem Supabase CLI, vínculo local de projeto nem token de acesso ao banco. Não foi possível confirmar o schema real, o estado de migrações, dados de solicitações pendentes preexistentes, funções de autorização efetivamente instaladas ou permissões em produção. A migration aborta intencionalmente caso encontre solicitações de plano pendentes duplicadas.
- O workflow de qualidade e o deploy **não foram executados remotamente**; as alterações não foram enviadas ao GitHub. A publicação deve aguardar confirmação de compatibilidade e aplicação das migrations no banco.
- Na configuração local revisada, a pasta `supabase/functions` contém apenas funções de pagamento; não há processador fiscal, endpoint ou contrato de provedor fiscal configurado. Não foram localizadas credenciais fiscais ou certificado no ambiente local. Portanto, faltam escolher/conectar um provedor fiscal, obter o endpoint e as credenciais do provedor e fornecer o certificado/segredo fiscal exigido por ele em armazenamento exclusivamente servidor. O formato exato do certificado e a autenticação do webhook dependem do provedor escolhido. Não foi simulada emissão, cancelamento ou inutilização, nem apresentada autorização fiscal como concluída. Não foi possível consultar secrets remotos do Supabase para afirmar se algum está configurado fora deste workspace.
- A homologação fiscal, os fluxos reais de cadastro/edição, aprovação/rejeição e caixa/devolução no navegador, a verificação real da assinatura de `is_super_admin()` e a publicação continuam pendentes de acesso autorizado ao ambiente e das credenciais/provedor acima.
