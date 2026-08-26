import { supabase } from './supabase';
import type { CartItem } from '../types';

export type PaymentMethod = 'pix' | 'cartao';

export type PaymentCheckout = {
  orderReference: string;
  amount: number;
  paymentMethod: PaymentMethod;
  items: Pick<CartItem, 'id' | 'name' | 'sku' | 'price' | 'quantity'>[];
  customer: { name: string; city: string };
};

export type PaymentResult = {
  transactionId: string;
  status: 'pending' | 'approved';
  checkoutUrl?: string;
  qrCode?: string;
  qrCodeBase64?: string;
};

/** Calls the server-side gateway adapter; provider credentials never reach the browser. */
export async function createPaymentCheckout(input: PaymentCheckout): Promise<PaymentResult> {
  if (!supabase) throw new Error('Supabase não configurado.');

  const { data, error } = await supabase.functions.invoke('create-payment', { body: input });
  if (error) throw new Error(error.message);
  if (!data?.transactionId) throw new Error('A API de pagamentos não retornou uma transação.');
  return data as PaymentResult;
}
