import { adminClient, env, json, mp } from '../_shared/saasRuntime.ts';
import { mercadoPagoCheckoutUrl, paymentRpcArgs, verifyMpSignature, type MpInvoice, type MpPayment, type MpSubscription } from '../_shared/mercadoPago.ts';

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  try {
    if (!await verifyMpSignature(request, env('MERCADO_PAGO_WEBHOOK_SECRET'))) return json({ error: 'Assinatura inválida.' }, 401);
    const id = new URL(request.url).searchParams.get('data.id')!;
    const payload = await request.json() as { type?: string; data?: { id?: string | number } };
    if (String(payload.data?.id).toLowerCase() !== id.toLowerCase()) return json({ error: 'Identificador inconsistente.' }, 400);
    const admin = adminClient();
    // Recover a provider creation whose HTTP response did not reach checkout.
    async function link(subscriptionId: string) {
      const remote = await mp<MpSubscription>(`/preapproval/${encodeURIComponent(subscriptionId)}`);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(remote.external_reference)) return false;
      const { data: attempt, error } = await admin.from('saas_checkout_attempts').select('id,amount,provider_subscription_id')
        .eq('id', remote.external_reference).maybeSingle();
      if (error) throw error;
      if (!attempt) return false;
      if (Number(attempt.amount) !== Number(remote.auto_recurring.transaction_amount) || remote.auto_recurring.currency_id !== 'BRL') throw new Error('Assinatura do gateway inconsistente.');
      if (!attempt.provider_subscription_id) {
        const { error: finishError } = await admin.rpc('finish_saas_checkout', {
          p_attempt_id: attempt.id, p_provider_id: remote.id,
          p_checkout_url: mercadoPagoCheckoutUrl(remote.init_point), p_provider_status: remote.status,
        });
        if (finishError) throw finishError;
      } else if (attempt.provider_subscription_id !== remote.id) throw new Error('Assinatura já associada a outro checkout.');
      const { error: syncError } = await admin.rpc('sync_saas_provider_subscription', { p_provider_id: remote.id, p_status: remote.status });
      if (syncError) throw syncError;
      return true;
    }
    let invoice: MpInvoice | null = null;
    if (payload.type === 'subscription_preapproval') {
      await link(id);
    } else if (payload.type === 'subscription_authorized_payment') {
      invoice = await mp<MpInvoice>(`/authorized_payments/${encodeURIComponent(id)}`);
    } else if (payload.type === 'payment') {
      const { results } = await mp<{ results: MpInvoice[] }>(`/authorized_payments/search?payment_id=${encodeURIComponent(id)}`);
      invoice = results.find(result => String(result.payment?.id) === id) ?? null;
      if (!invoice) {
        // A later payment notification can still revoke access after a refund/chargeback.
        const { data: stored, error } = await admin.from('saas_invoices').select('provider_subscription_id,amount,currency,period_start').eq('provider_payment_id', id).maybeSingle();
        if (error) throw error;
        if (stored) {
          invoice = { id: 0, preapproval_id: stored.provider_subscription_id, transaction_amount: stored.amount,
            currency_id: stored.currency, debit_date: stored.period_start, payment: { id: Number(id), status: '' } };
        }
      }
    } else return json({ received: true, ignored: true });
    if (invoice?.payment?.id) {
      const payment = await mp<MpPayment>(`/v1/payments/${encodeURIComponent(String(invoice.payment.id))}`);
      if (!await link(invoice.preapproval_id)) return json({ received: true, ignored: true });
      const { error } = await admin.rpc('apply_saas_payment', paymentRpcArgs(invoice, payment));
      if (error) throw error;
    }
    return json({ received: true });
  } catch {
    // Returning 500 lets Mercado Pago retry; do not acknowledge uncommitted updates.
    return json({ error: 'Não foi possível confirmar a notificação. Tente novamente.' }, 500);
  }
});
