import type { CartItem } from './types';
import { WHATSAPP_NUMBER } from './data';

export const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function generateOrderId(): string {
  const ts = Date.now().toString(36).toUpperCase().slice(-6);
  const rand = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `DH-${ts}${rand}`;
}

export function formatWhatsAppMessage(
  cart: CartItem[],
  businessName: string,
  city: string,
  total: number,
  orderId?: string,
  paymentMethod?: string,
  deliveryMethod?: string,
): string {
  const oid = orderId ?? generateOrderId();
  const lines = cart.map(
    (item, idx) =>
      `${idx + 1}. ${item.quantity}x ${item.name}\n   SKU: ${item.sku}\n   Subtotal: ${money.format(item.price * item.quantity)}`,
  );
  const paymentLabel: Record<string, string> = {
    pix: 'PIX Instantâneo',
    cartao: 'Cartão de Crédito',
    faturado: 'Faturado no Limite B2B',
    rma: 'Crédito de RMA',
  };
  const deliveryLabel: Record<string, string> = {
    balcao: 'Retirada no Balcão',
    motoboy: 'Entrega Rápida por Motoboy',
    rota_manha: 'Rota Agendada — Manhã',
    rota_tarde: 'Rota Agendada — Tarde',
  };
  const sections = [
    'Olá, DistriHub! Gostaria de enviar um pedido.',
    '',
    `*Pedido Nº: ${oid}*`,
    `Assistência/Técnico: ${businessName}`,
    `Cidade: ${city}`,
  ];
  if (paymentMethod) sections.push(`Pagamento: ${paymentLabel[paymentMethod] ?? paymentMethod}`);
  if (deliveryMethod) sections.push(`Entrega: ${deliveryLabel[deliveryMethod] ?? deliveryMethod}`);
  sections.push('', '*Itens do pedido:*', lines.join('\n'), '', `*Total do pedido: ${money.format(total)}*`);
  if (paymentMethod === 'pix') {
    sections.push('', '_PIX Copia e Cola:_');
    sections.push('00020126360014BR.GOV.BCB.PIX0114+5511940000000520400005303986580BR6009SAOPAULO62070503***6304ABCD');
  }
  sections.push('', `Pedido enviado via Catálogo B2B DistriHub`);
  return sections.join('\n');
}

export function openWhatsApp(message: string, phoneNumber?: string | null): void {
  const targetPhone = (phoneNumber ?? WHATSAPP_NUMBER).replace(/\D/g, '');
  const base = targetPhone
    ? `https://wa.me/${targetPhone}?text=`
    : 'https://wa.me/?text=';

  const target = `${base}${encodeURIComponent(message)}`;
  window.open(target, '_blank', 'noopener,noreferrer');
}

export const PIX_COPY_PASTE = '00020126360014BR.GOV.BCB.PIX0114+5511940000000520400005303986580BR6009SAOPAULO62070503***6304ABCD';

export function copyToClipboard(text: string): boolean {
  try {
    navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
