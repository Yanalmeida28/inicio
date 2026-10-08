# Assinaturas SaaS e Mercado Pago — 07/10/2026

## Implementação

- Básico: R$ 49,90/mês, uma filial; Profissional: R$ 99,90/mês, até três; Enterprise: R$ 199,90/mês, sem limite.
- Novas empresas recebem 14 dias de teste do Básico. A renovação só é habilitada quando o titular inicia o checkout.
- A assinatura é a fonte de autorização no servidor. Políticas restritivas preservam o isolamento existente; triggers também protegem gravações feitas pelas RPCs privilegiadas. Estoque essencial do PDV continua no Básico; reposição, Financeiro, OS, RMA, entregas, Fiscal e personalização seguem os recursos do plano.
- O Super Admin administra planos, isenções, suspensão, liberação por data e cancelamento de cobranças pendentes, sempre com motivo registrado.
- O Financeiro SaaS usa `saas_invoices`, separado das contas comerciais dos lojistas (`partner_invoices`).
- Cancelar renovação conserva o período pago. Isentar uma cobrança pendente libera seu período e encerra a renovação. Cobranças recebidas exigem estorno no Mercado Pago.
- Checkout calcula preço e empresa no servidor. Uma tentativa reservada impede criação duplicada; resultado incerto aguarda confirmação do gateway.
- Webhooks verificam HMAC e consultam o recurso no Mercado Pago. Autorizar a assinatura não equivale a pagar. Eventos antigos não restauram pagamentos estornados.
- Cancelamentos no gateway usam fila com reserva temporária, token de processamento e novas tentativas.

## Controle pelo Super Admin — atualização de 08/10/2026

O Super Admin abre em **Acesso ao aplicativo**. Essa tela lista as empresas com acesso liberado ou bloqueado, permite buscar pelo nome e filtrar contas isentas. A lista de clientes também possui o botão **Controlar acesso** para abrir diretamente a empresa escolhida.

Em **Gerenciar**, o administrador escolhe o plano, se a empresa paga mensalidade ou está isenta, se a isenção inclui acesso completo, a situação da assinatura e a data de liberação administrativa. As ações **Suspender acesso**, **Ativar acesso**, **Isentar cobrança** e **Cancelar renovação** preparam uma alteração que deve ser confirmada com motivo. Nenhuma ação grava somente no navegador: a RPC verifica a identidade do Super Admin e registra a alteração no banco.

Suspender impede as operações da empresa e de seus funcionários, mesmo com período pago ou isenção. Isentar uma empresa suspensa mantém a suspensão. Ao ativar uma conta paga vencida, a tela sugere uma liberação de 30 dias, com data visível e editável antes de confirmar; isso não cria um pagamento. A remoção da isenção pode exigir um plano que comporte o número de filiais e não autoriza automaticamente débito no Mercado Pago.

O status do **Cadastro comercial** continua disponível na lista de clientes. Os controles de uso do aplicativo ficam na tela **Acesso ao aplicativo**.

Esta atualização reutiliza as RPCs administrativas já publicadas e não altera as isenções vigentes. O pacote mais recente é `distrihub-super-admin-2026-10-08.zip`; ele inclui os novos controles e precisa ser publicado na Hostinger para que apareçam no site.

## Banco e funções publicados

As migrations `20261008025310_add_managed_saas_subscriptions.sql` e `20261008025316_enforce_saas_access_and_billing_jobs.sql` foram aplicadas ao projeto `kcxefjgchxhvcfppglvp`.

As duas empresas existentes foram mantidas **isentas, com acesso completo e renovação desativada**, conforme autorização do proprietário. A consulta após a aplicação confirmou acesso ativo, preço zero, nenhum limite de filiais e ausência de próxima cobrança nas duas contas. A isenção foi registrada em `saas_billing_events`.

As funções `saas-checkout`, `saas-webhook` e `saas-provider-jobs` foram publicadas. Elas validam respectivamente a sessão do titular, a assinatura HMAC do Mercado Pago e o segredo de processamento dos jobs. Nenhuma cobrança real foi criada.

O frontend foi atualizado no projeto local; o pacote `distrihub-saas-2026-10-08.zip` contém o build final e o `.htaccess` para a Hostinger. A publicação dessas telas na Hostinger ainda não foi realizada nesta etapa.

## Configurar sua conta Mercado Pago

1. Em [Suas integrações](https://www.mercadopago.com.br/developers/panel/app), crie uma aplicação e obtenha suas credenciais. Use contas e credenciais de teste para homologação.
2. No painel Supabase, em **Edge Functions → Secrets**, cadastre:
   - `MERCADO_PAGO_ACCESS_TOKEN`: Access Token da aplicação.
   - `MERCADO_PAGO_WEBHOOK_SECRET`: chave secreta gerada na configuração de Webhooks.
   - `SAAS_RETURN_URL`: endereço HTTPS do DistriHub para retorno do checkout.
   - `SAAS_JOB_SECRET`: segredo aleatório longo para o agendador de cancelamentos.
   Essas credenciais ficam no servidor, nunca no frontend ou em mensagens de chat.
3. No Mercado Pago, configure a URL `https://kcxefjgchxhvcfppglvp.supabase.co/functions/v1/saas-webhook` e ative os eventos `subscription_preapproval`, `subscription_authorized_payment` e `payment`.
4. Configure um agendador de servidor para enviar POST a `https://kcxefjgchxhvcfppglvp.supabase.co/functions/v1/saas-provider-jobs` a cada minuto, com o header `x-saas-job-secret` contendo `SAAS_JOB_SECRET`. O agendador é necessário para efetivar os cancelamentos no gateway. A configuração depende desse segredo e ainda não foi criada.

Após configurar os segredos, homologue uma assinatura de teste: checkout, pagamento, retorno, webhook, liberação de acesso, renovação e cancelamento com processamento da fila. Cobranças reais dependem dessa configuração e homologação.

Referências oficiais: [Assinaturas pendentes](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments), [Webhooks](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks), [Consulta de faturas](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/get-authorized-payment/get), [RLS no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Validação e limites

A suíte final passou com 221 testes, zero falhas, incluindo sete testes dos controles do Super Admin. TypeScript, lint com zero avisos e build também passaram. O ZIP foi conferido para conter `index.html`, os assets e `.htaccess` na raiz correta de publicação.

Os testes locais exercitam banco PostgreSQL com PGlite, os contratos reais de venda e pricing, e handlers das Edge Functions com gateway simulado. Cobrem isolamento entre empresas, permissões, expiração, filiais, isenção, pagamento idempotente, eventos fora de ordem, personalização, autorização de webhook e cancelamentos concorrentes.

A verificação em produção confirmou 25 triggers de proteção e ausência de acesso `anon`/`authenticated` às RPCs reservadas ao gateway. Os advisors mantêm os avisos de senha vazada desativada e de RPCs `SECURITY DEFINER`; as novas RPCs públicas têm verificação de identidade e/ou Super Admin. As tabelas internas de cobrança mantêm RLS e não oferecem acesso direto aos clientes.

Não houve teste visual com login real nem pagamento de homologação na conta Mercado Pago. A disponibilidade de cada recurso comercial continua dependendo da implementação do módulo; esta alteração não implementa emissão fiscal autorizada, Instagram ou uma nova API pública.
