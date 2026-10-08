export function mercadoPagoCheckoutUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      (url.hostname === 'mercadopago.com.br' || url.hostname.endsWith('.mercadopago.com.br')) ? url.href : null;
  } catch { return null; }
}

export type MpSubscription = {
  id: string; external_reference: string; status: string; init_point?: string;
  auto_recurring: { transaction_amount: number; currency_id: string };
};
export type MpInvoice = {
  id: number; preapproval_id: string; external_reference?: string;
  transaction_amount: number | string; currency_id: string; debit_date: string;
  payment?: { id: number; status: string };
};
export type MpPayment = {
  id: number; status: string; currency_id: string; transaction_amount: number;
  date_approved: string | null;
};

export async function verifyMpSignature(request: Request, secret: string): Promise<boolean> {
  const id = new URL(request.url).searchParams.get('data.id');
  const requestId = request.headers.get('x-request-id');
  const signature = request.headers.get('x-signature');
  if (!id || !requestId || !signature || !secret || !/^[a-zA-Z0-9_-]+$/.test(id)) return false;
  const parts = signature.split(',').map(part => part.trim().split('='));
  const ts = parts.find(([name]) => name === 'ts')?.[1];
  const signatures = parts.filter(([name]) => name === 'v1').map(([, value]) => value);
  if (!ts || !/^\d+$/.test(ts)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const manifest = new TextEncoder().encode(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`);
  for (const hex of signatures) {
    if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) continue;
    const bytes = Uint8Array.from(hex.match(/../g)!, pair => parseInt(pair, 16));
    if (await crypto.subtle.verify('HMAC', key, bytes, manifest)) return true;
  }
  return false;
}

export function paymentRpcArgs(invoice: MpInvoice, payment: MpPayment) {
  if (String(invoice.payment?.id) !== String(payment.id) || !invoice.preapproval_id ||
      !Number.isFinite(Number(invoice.transaction_amount)) || Number(invoice.transaction_amount) <= 0 ||
      Number(invoice.transaction_amount) !== payment.transaction_amount || invoice.currency_id !== payment.currency_id ||
      !invoice.debit_date || !Number.isFinite(Date.parse(invoice.debit_date))) throw new Error('Cobrança do gateway inconsistente.');
  const statuses: Record<string, string> = {
    approved: 'paid', pending: 'pending', in_process: 'pending', authorized: 'pending',
    rejected: 'cancelled', cancelled: 'cancelled', refunded: 'refunded', charged_back: 'charged_back',
  };
  const status = statuses[payment.status];
  if (!status) throw new Error('Status de pagamento desconhecido.');
  if (status === 'paid' && (!payment.date_approved || !Number.isFinite(Date.parse(payment.date_approved)))) throw new Error('Pagamento sem data de aprovação.');
  return {
    p_provider_subscription_id: invoice.preapproval_id, p_payment_id: String(payment.id),
    p_status: status, p_amount: payment.transaction_amount, p_currency: payment.currency_id,
    p_period_start: invoice.debit_date, p_paid_at: status === 'paid' ? payment.date_approved : null,
  };
}
