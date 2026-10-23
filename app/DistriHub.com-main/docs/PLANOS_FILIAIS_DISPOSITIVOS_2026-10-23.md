# Planos, filiais adicionais e acessos simultâneos

Implementação local na cópia `publish-product-photo-mobile-2026-10-22`.

| Plano | Mensalidade para nova contratação | Filiais incluídas | Sessões simultâneas por filial |
| --- | --- | --- | --- |
| Básico | R$ 49,90 | 1 | 3 |
| Profissional | R$ 129,90 | 3 | 5 |
| Enterprise | R$ 249,90 | 5 | 8 |

Enterprise permite adicionais de R$ 39,90 por filial/mês. Instagram e API foram retirados dos planos anunciados e dos recursos Enterprise na migração. A integração interna de cobrança com Mercado Pago permanece.

## Solicitação e autorização

Em Configurações → Assinatura, o titular Enterprise informa o **total** desejado de filiais adicionais pagas. O pedido não cobra nem libera capacidade. O Super Admin revisa em Acesso ao aplicativo e salva a decisão com motivo, ou rejeita a solicitação. A decisão e as alterações ficam registradas.

O Super Admin também pode configurar adicionais diretamente e conceder filiais de cortesia. Cortesias são imediatas e não entram no preço. A isenção com acesso completo já existente continua sem limite de filiais.

Uma mudança nos adicionais pagos cancela a autorização recorrente anterior pela fila já existente. Depois da confirmação desse cancelamento, o titular autoriza uma nova assinatura pelo checkout. O preço e a quantidade vêm do banco, não do navegador. O início do novo ciclo respeita o período já pago, sem cobrança proporcional antecipada. Os adicionais pagos entram em vigor quando o webhook confirma pagamento válido para um período vigente. Uma aprovação da recorrência no gateway, sem pagamento, não libera adicionais.

`monthly_amount` mostra o valor atualmente autorizado quando existe uma assinatura do gateway. `quoted_monthly_amount` mostra o preço da próxima contratação. Autorizações antigas preservam seu valor até substituição; esta migração não altera débitos existentes silenciosamente. Tentativas guardam quantidade e valor contratados para validar webhooks antigos e novos. Estornos, contestações e fim do período pago retiram a capacidade adicional correspondente. Reduções que não comportam as filiais existentes são recusadas.

## Dispositivos

Uma sessão autenticada do Supabase representa um acesso; abas que compartilham a mesma sessão contam uma vez. Navegadores/perfis diferentes contam separadamente. Não é uma identificação de hardware físico.

O heartbeat renova a reserva a cada 30 segundos. A reserva vence após três minutos sem contato. A admissão é serializada no servidor por empresa e limitada por filial. Transferir uma sessão para uma filial cheia é recusado sem derrubar outra sessão. O logout remove a sessão de autenticação e libera a vaga.

No bloqueio de acesso, o usuário pode escolher uma filial autorizada e consultar as sessões. O titular e o Super Admin podem encerrar sessões da empresa; colaboradores só encerram as próprias. Há confirmação para evitar encerrar um terminal durante uma venda. Uma sessão revogada fica bloqueada até novo login e não recupera a vaga automaticamente. As operações protegidas validam também a reserva no servidor. Cobrança e suporte continuam acessíveis pelas regras existentes.

Filiais que já excediam as cinco incluídas no antigo Enterprise ilimitado são preservadas como cortesia na migração. Isso não cria cobrança adicional retroativa.

## Publicação

Nenhuma mudança deste documento deve ser considerada publicada só porque o build passou.

1. Homologar a migração `20261023185537_plan_branch_addons_and_device_limits.sql` em ambiente de teste com as migrações anteriores.
2. Coordenar a aplicação dessa migração com a publicação do novo frontend: o servidor passa a exigir registro ativo de terminal e o frontend novo contém a tela de admissão e encerramento de sessões.
3. Publicar `saas-checkout` para incluir a quantidade de adicionais na descrição enviada ao Mercado Pago. Os handlers atuais de webhook e jobs são reutilizados; o webhook valida o valor gravado no checkout.
4. Publicar o conteúdo de `dist/`, incluindo `.htaccess`, na hospedagem existente.
5. Homologar com credenciais de teste do Mercado Pago: nova autorização, pagamento, confirmação, renovação, cancelamento, estorno e processamento do job de cancelamento anterior.

Não criar cobranças reais para validar a implantação. Credenciais ficam nos secrets do backend.

## Verificação local

```text
npm.cmd run typecheck
npm.cmd run build
node --test supabase/tests/saas-capacity.test.mjs supabase/tests/saas-device-hook.test.mjs supabase/tests/saas-admin.test.mjs supabase/tests/saas-edge.test.mjs supabase/tests/saas-subscriptions.test.mjs supabase/tests/saas-hook.test.mjs
```

Os testes de capacidade executam SQL real em Postgres embarcado (PGlite), incluindo os gatilhos de assinaturas e operações. As chamadas HTTP ao gateway são simuladas; não substituem homologação ponta a ponta no Mercado Pago.
