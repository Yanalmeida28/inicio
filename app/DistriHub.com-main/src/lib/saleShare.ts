import type { PartnerCustomer } from '../types';
import type { PrintableSale } from './salePrint';

export function whatsappPhone(value: string): string | null {
  const raw = value.trim();
  if (!raw || /[^\d+().\s-]/.test(raw)) return null;
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+') || raw.startsWith('00')) {
    if (raw.startsWith('00')) digits = digits.slice(2);
    return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
  }
  if (/^[1-9]\d{9,10}$/.test(digits)) return `55${digits}`;
  if (/^55[1-9]\d{9,10}$/.test(digits)) return digits;
  return null;
}

export function saleShareUrl(sale: PrintableSale, channel: 'whatsapp' | 'email', customer?: PartnerCustomer, salespersonName?: string): string {
  if (!customer) throw new Error('Esta venda não possui um cliente cadastrado vinculado. Cadastre e selecione o cliente para compartilhar seus próximos cupons.');
  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const payments: Record<string, string> = { pix: 'PIX', cartao: 'Cartão', dinheiro: 'Dinheiro', faturado: 'Faturado B2B' };
  const isQuote = sale.status === 'pre_venda' || sale.status === 'aberta';
  const message = [
    isQuote ? 'ORÇAMENTO — CUPOM NÃO FISCAL' : 'CUPOM NÃO FISCAL',
    ...(isQuote ? ['Pedido em aberto — pagamento não confirmado.'] : []),
    ...(sale.id ? [`Venda: ${sale.id}`] : []),
    `Data: ${new Date(sale.created_at).toLocaleString('pt-BR')}`,
    `Cliente: ${sale.customer_name || customer.name}`,
    ...(salespersonName ? [`Colaborador: ${salespersonName}`] : []),
    '',
    ...sale.items.map((item) => `${item.quantity} × ${item.name} — ${currency.format(item.unit_price)} cada — ${currency.format(item.quantity * item.unit_price)}`),
    '',
    `Total: ${currency.format(sale.total)}`,
    `Pagamento: ${payments[sale.payment_method ?? ''] ?? sale.payment_method ?? 'Não informado'}`,
    ...(sale.imei ? [`IMEI / Selo: ${sale.imei}`] : []),
    ...(sale.serial_number ? [`Nº de série: ${sale.serial_number}`] : []),
  ].join('\n');
  if (channel === 'whatsapp') {
    const phone = [customer.phone, customer.phone_commercial_1, customer.phone_commercial_2]
      .map((value) => whatsappPhone(value ?? '')).find(Boolean);
    if (!phone) throw new Error('Cadastre um telefone válido com DDD no cadastro do cliente. Para números internacionais, inclua + e o código do país.');
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }
  const email = customer.email?.trim() ?? '';
  if (!/^[^\s@<>,;:?&#%]+@[^\s@<>,;:?&#%]+\.[^\s@<>,;:?&#%]+$/.test(email)) {
    throw new Error('Cadastre um e-mail válido no cadastro do cliente para enviar o cupom.');
  }
  const subject = isQuote ? (sale.id ? `Orçamento do pedido ${sale.id}` : 'Orçamento') : sale.id ? `Cupom da venda ${sale.id}` : 'Cupom da sua compra';
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}
