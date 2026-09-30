import type { PartnerSale } from '../types';
import { money } from '../utils';

export type PrintableSale = Pick<PartnerSale, 'customer_name' | 'items' | 'total' | 'imei' | 'serial_number' | 'payment_method' | 'created_at' | 'branch_id'> & { id?: string };

export function printSale(sale: PrintableSale, format: 'receipt' | 'label') {
  const popup = window.open('', '_blank', 'width=440,height=700');
  if (!popup) throw new Error('Permita pop-ups neste navegador para imprimir o cupom ou a etiqueta.');

  const doc = popup.document;
  doc.title = format === 'receipt' ? 'Cupom não fiscal' : 'Etiqueta da venda';
  doc.documentElement.lang = 'pt-BR';
  const style = doc.createElement('style');
  style.textContent = `
    @page { size: auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: white; color: black; font: 12px Arial, sans-serif; }
    main { width: 72mm; max-width: 100%; margin: auto; }
    h1 { font-size: 16px; text-align: center; }
    p { margin: 7px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    article { padding: 3mm 0; border-bottom: 1px dashed black; break-inside: avoid; }
    .label { width: 52mm; min-height: 30mm; padding: 2mm; border: 1px solid black; margin: 2mm auto; }
    button { display: block; margin: 16px auto; padding: 10px; }
    @media print { button { display: none; } }
  `;
  doc.head.append(style);
  const main = doc.createElement('main');
  doc.body.append(main);
  function line(parent: HTMLElement, text: string, heading = false) {
    const element = doc.createElement(heading ? 'h1' : 'p');
    element.textContent = text;
    parent.append(element);
  }
  const date = new Date(sale.created_at).toLocaleString('pt-BR');
  const reference = sale.id ? `Venda: ${sale.id}` : `Venda: ${date}`;
  function identification(parent: HTMLElement) {
    line(parent, reference);
    line(parent, `Cliente: ${sale.customer_name || 'Consumidor'}`);
    if (sale.imei) line(parent, `IMEI / Selo: ${sale.imei}`);
    if (sale.serial_number) line(parent, `Nº de série: ${sale.serial_number}`);
  }
  if (format === 'receipt') {
    line(main, 'CUPOM NÃO FISCAL', true);
    identification(main);
    if (sale.id) line(main, `Data: ${date}`);
    for (const item of sale.items) {
      const row = doc.createElement('article');
      line(row, item.name);
      line(row, `${item.quantity} × ${money.format(item.unit_price)} = ${money.format(item.quantity * item.unit_price)}`);
      main.append(row);
    }
    line(main, `TOTAL: ${money.format(sale.total)}`, true);
    const payments: Record<string, string> = { pix: 'PIX', cartao: 'Cartão', dinheiro: 'Dinheiro', faturado: 'Faturado B2B' };
    line(main, `Pagamento: ${payments[sale.payment_method ?? ''] ?? sale.payment_method ?? 'Não informado'}`);
  } else {
    for (const item of sale.items) {
      const label = doc.createElement('article');
      label.className = 'label';
      line(label, item.name, true);
      identification(label);
      line(label, `Quantidade: ${item.quantity}`);
      main.append(label);
    }
  }
  const button = doc.createElement('button');
  button.textContent = 'Imprimir';
  button.onclick = () => { popup.focus(); popup.print(); };
  doc.body.append(button);
  // Keep the preview available for retrying or changing the printer settings.
  popup.requestAnimationFrame(() => { popup.focus(); popup.print(); });
}
