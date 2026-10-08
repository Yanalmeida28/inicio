import { adminClient, env, json, mp, MpError, userClient, corsHeaders } from '../_shared/saasRuntime.ts';
import { mercadoPagoCheckoutUrl, type MpSubscription } from '../_shared/mercadoPago.ts';

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  let attemptId: string | null = null;
  let sentToProvider = false;
  try {
    const client = userClient(request);
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user?.email) return json({ error: 'Sessão inválida.' }, 401);
    env('MERCADO_PAGO_ACCESS_TOKEN');
    const backUrl = new URL(env('SAAS_RETURN_URL'));
    if (backUrl.protocol !== 'https:') throw new Error('SAAS_RETURN_URL precisa usar HTTPS.');
    const { data: attempt, error } = await client.rpc('begin_saas_checkout', { p_company_id: user.id });
    if (error) throw error;
    attemptId = attempt.id;
    const existingUrl = mercadoPagoCheckoutUrl(attempt.checkout_url);
    if (!attempt.should_create) {
      if (existingUrl) return json({ checkoutUrl: existingUrl });
      return json({ error: 'A assinatura está sendo conferida no gateway. Aguarde a confirmação ou procure o suporte.' }, 409);
    }
    const start = Math.max(Date.now() + 60000, Date.parse(attempt.trial_ends_at));
    sentToProvider = true;
    const subscription = await mp<MpSubscription>('/preapproval', 'POST', {
      reason: `DistriHub · Plano ${attempt.plan_id}`, external_reference: attempt.id, payer_email: user.email,
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: Number(attempt.amount),
        currency_id: 'BRL', start_date: new Date(start).toISOString() },
      back_url: backUrl.href, status: 'pending',
    }, attempt.id);
    if (!subscription.id || subscription.external_reference !== attempt.id) throw new Error('Resposta inesperada do gateway.');
    const url = mercadoPagoCheckoutUrl(subscription.init_point);
    const { data: finished, error: finishError } = await adminClient().rpc('finish_saas_checkout', {
      p_attempt_id: attempt.id, p_provider_id: subscription.id, p_checkout_url: url,
      p_provider_status: subscription.status,
    });
    if (finishError) throw finishError;
    if (!finished.accepted) return json({ error: 'A assinatura mudou durante o checkout. O pedido anterior será cancelado.' }, 409);
    if (!url) throw new Error('O gateway não retornou um link de pagamento válido.');
    return json({ checkoutUrl: url });
  } catch (error) {
    if (attemptId) {
      const definitive = !sentToProvider || (error instanceof MpError && error.status >= 400 && error.status < 500 && error.status !== 429);
      try { await adminClient().rpc('mark_saas_checkout_uncertain', { p_attempt_id: attemptId, p_definitive_failure: definitive }); }
      catch { /* The creating attempt remains reserved; retry must never create a duplicate. */ }
    }
    return json({ error: error instanceof Error ? error.message : 'Não foi possível iniciar a assinatura.' }, 400);
  }
});
