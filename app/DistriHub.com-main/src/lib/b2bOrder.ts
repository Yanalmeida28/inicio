import type { SupabaseClient } from '@supabase/supabase-js';
import type { CartItem } from '../types';

export class B2bOrderRejected extends Error {}

export async function saveB2bOrder(client: SupabaseClient | null, userId: string | null, input: {
  requestId: string; cart: CartItem[]; businessName: string; city: string;
  paymentMethod: string; deliveryMethod: string;
}): Promise<{ id: string; total: number }> {
  if (!client || !userId) throw new B2bOrderRejected('Entre na sua conta para enviar o pedido.');
  if (!['pix', 'cartao'].includes(input.paymentMethod)) throw new B2bOrderRejected('Pagamento com crédito depende de autorização do estabelecimento.');
  if (!['balcao', 'motoboy', 'rota_manha', 'rota_tarde'].includes(input.deliveryMethod)) throw new B2bOrderRejected('Forma de entrega inválida.');
  if (!input.cart.length || !input.businessName.trim() || !input.city.trim()) throw new B2bOrderRejected('Preencha os dados do pedido.');
  if (input.cart.some((item) => !Number.isInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.price) || item.price < 0)) {
    throw new B2bOrderRejected('O pedido contém valores inválidos.');
  }
  const freight = input.deliveryMethod === 'motoboy' ? 15 : 0;
  const total = (input.cart.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0) + freight * 100) / 100;
  if (!Number.isSafeInteger(Math.round(total * 100))) throw new B2bOrderRejected('Total do pedido inválido.');
  const payload = {
    id: input.requestId, user_id: userId, business_name: input.businessName.trim(),
    items: input.cart, total, payment_method: input.paymentMethod,
    delivery_method: input.deliveryMethod, delivery_rate: freight, status: 'pendente',
  };
  // INSERT ON CONFLICT DO NOTHING: a lost response can be retried without modifying an existing order.
  const { error } = await client.from('b2b_orders').upsert(payload, { onConflict: 'id', ignoreDuplicates: true });
  if (error) {
    const Rejection = /^[0-9A-Z]{5}$/.test(error.code ?? '') ? B2bOrderRejected : Error;
    throw new Rejection(`Não foi possível salvar o pedido: ${error.message}`);
  }
  const { data: saved, error: readError } = await client.from('b2b_orders')
    .select('id,user_id,business_name,items,total,payment_method,delivery_method,delivery_rate')
    .eq('id', input.requestId).eq('user_id', userId).single();
  if (readError || !saved) throw new Error('Não foi possível confirmar o pedido salvo. Tente novamente com os mesmos dados.');
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => JSON.stringify(key) + ':' + canonical(entry)).join(',') + '}';
    return JSON.stringify(value);
  };
  if (saved.business_name !== payload.business_name || Number(saved.total) !== total || saved.payment_method !== input.paymentMethod
    || saved.delivery_method !== input.deliveryMethod || Number(saved.delivery_rate) !== freight || canonical(saved.items) !== canonical(input.cart)) {
    throw new Error('Os dados divergem do pedido já registrado. Consulte o pedido antes de reenviar.');
  }
  return { id: saved.id, total: Number(saved.total) };
}
