import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type PaymentInput = {
  orderReference: string;
  amount: number;
  paymentMethod: 'pix' | 'cartao';
  items: Array<{ id: number; name: string; sku: string; price: number; quantity: number }>;
  customer: { name: string; city: string };
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) throw new Error('Autenticação necessária.');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Sessão inválida.');

    const input = await request.json() as PaymentInput;
    if (!input.orderReference || !input.customer?.name || !input.customer?.city || !Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error('Dados de pagamento inválidos.');
    }

    const provider = Deno.env.get('PAYMENT_PROVIDER') ?? 'custom';
    const providerUrl = Deno.env.get('PAYMENT_API_URL');
    const providerKey = Deno.env.get('PAYMENT_API_KEY');
    if (!providerUrl || !providerKey) {
      throw new Error('Gateway de pagamento ainda não configurado no Supabase.');
    }

    const providerResponse = await fetch(providerUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${providerKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference: input.orderReference,
        amount: input.amount,
        currency: 'BRL',
        payment_method: input.paymentMethod,
        items: input.items,
        customer: input.customer,
        webhook_url: `${supabaseUrl}/functions/v1/payment-webhook`,
      }),
    });
    const providerData = await providerResponse.json();
    if (!providerResponse.ok) throw new Error(providerData?.message ?? 'Gateway recusou a cobrança.');

    const { data: transaction, error: transactionError } = await supabase
      .from('payment_transactions')
      .insert({
        user_id: user.id,
        provider,
        provider_payment_id: providerData.id ?? providerData.payment_id ?? null,
        order_reference: input.orderReference,
        amount: input.amount,
        payment_method: input.paymentMethod,
        status: providerData.status === 'approved' ? 'approved' : 'pending',
        checkout_url: providerData.checkout_url ?? providerData.init_point ?? null,
        qr_code: providerData.qr_code ?? providerData.qr_code_text ?? null,
        qr_code_base64: providerData.qr_code_base64 ?? null,
        provider_response: providerData,
      })
      .select('id, status, checkout_url, qr_code, qr_code_base64')
      .single();
    if (transactionError) throw transactionError;

    return new Response(JSON.stringify({
      transactionId: transaction.id,
      status: transaction.status,
      checkoutUrl: transaction.checkout_url,
      qrCode: transaction.qr_code,
      qrCodeBase64: transaction.qr_code_base64,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
