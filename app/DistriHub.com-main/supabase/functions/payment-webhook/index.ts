import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const expectedSecret = Deno.env.get('PAYMENT_WEBHOOK_SECRET');
    if (!expectedSecret || request.headers.get('x-webhook-secret') !== expectedSecret) {
      return new Response('Unauthorized', { status: 401 });
    }

    const payload = await request.json();
    const providerPaymentId = payload.id ?? payload.payment_id;
    if (!providerPaymentId) return new Response('Missing payment id', { status: 400 });

    const statusMap: Record<string, string> = {
      approved: 'approved', paid: 'approved', pending: 'pending',
      rejected: 'rejected', cancelled: 'cancelled', refunded: 'refunded',
    };
    const status = statusMap[String(payload.status).toLowerCase()] ?? 'pending';
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error } = await admin
      .from('payment_transactions')
      .update({ status, provider_response: payload })
      .eq('provider_payment_id', String(providerPaymentId));
    if (error) throw error;

    return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Webhook error' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
});
