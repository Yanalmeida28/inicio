import type { PartnerCustomer, PartnerSale, StoreSettings } from '../types';
import { money } from '../utils';

export type PrintableSale = Pick<PartnerSale, 'customer_name' | 'items' | 'total' | 'imei' | 'serial_number' | 'payment_method' | 'created_at' | 'branch_id' | 'customer_id' | 'salesperson_id'> & { id?: string };

export type ReceiptDetails = { customer?: PartnerCustomer; salespersonName?: string; settings?: StoreSettings; companyName?: string; companyDocument?: string | null; companyAddress?: string | null };

export function printSale(sale: PrintableSale, format: 'receipt' | 'label', details: ReceiptDetails = {}) {
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
    if (details.settings?.show_logo_on_receipt && details.settings.logo_url) {
      const logo = doc.createElement('img');
      logo.src = details.settings.logo_url;
      logo.alt = details.companyName || 'Logo da loja';
      logo.style.cssText = 'display:block;max-width:50mm;max-height:25mm;object-fit:contain;margin:0 auto';
      main.append(logo);
    }
    if (details.companyName) line(main, details.companyName, true);
    if (details.settings?.show_cnpj_on_receipt) {
      if (details.companyDocument) line(main, `CNPJ/CPF: ${details.companyDocument}`);
      if (details.companyAddress) line(main, `Endereço da loja: ${details.companyAddress}`);
    }
    line(main, 'CUPOM NÃO FISCAL', true);
    identification(main);
    line(main, `Colaborador: ${details.salespersonName || 'Não informado'}`);
    const customer = details.customer;
    const phones = [...new Set([customer?.phone, customer?.phone_commercial_1, customer?.phone_commercial_2].map((value) => value?.trim()).filter(Boolean))].join(' / ');
    const address = [customer?.address, customer?.address_number, customer?.complement, customer?.neighborhood].map((value) => value?.trim()).filter(Boolean).join(', ');
    const city = [customer?.city, customer?.state].map((value) => value?.trim()).filter(Boolean).join(' / ');
    line(main, `Telefone: ${phones || 'Não informado'}`);
    line(main, `Endereço: ${address || 'Não informado'}`);
    line(main, `Cidade: ${city || 'Não informada'}`);
    if (customer?.zip_code) line(main, `CEP: ${customer.zip_code}`);
    if (sale.id) line(main, `Data: ${date}`);
    for (const item of sale.items) {
      const row = doc.createElement('article');
      line(row, item.name);
      line(row, `${item.quantity} × ${money.format(item.unit_price)} = ${money.format(item.quantity * item.unit_price)}`);
      main.append(row);
    }
    const totalQuantity = sale.items.reduce((total, item) => total + item.quantity, 0);
    const totalSummary = doc.createElement('div');
    totalSummary.style.cssText = 'display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:4px 0';
    const totalLabel = doc.createElement('strong');
    totalLabel.textContent = `TOTAL: ${money.format(sale.total)}`;
    totalLabel.style.cssText = 'min-width:0;font-size:16px';
    const quantityLabel = doc.createElement('span');
    quantityLabel.textContent = `Qtd. produtos: ${totalQuantity}`;
    quantityLabel.style.cssText = 'flex:0 0 auto;font-size:11px;white-space:nowrap';
    totalSummary.append(totalLabel, quantityLabel);
    main.append(totalSummary);
    const payments: Record<string, string> = { pix: 'PIX', cartao: 'Cartão', dinheiro: 'Dinheiro', faturado: 'Faturado B2B' };
    line(main, `Pagamento: ${payments[sale.payment_method ?? ''] ?? sale.payment_method ?? 'Não informado'}`);
    if (details.settings?.receipt_footer_text) line(main, details.settings.receipt_footer_text);
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
  const images = Array.from(doc.images);
  void Promise.all(images.map((img) => img.decode().catch(() => undefined))).then(() => {
    if (!popup.closed) popup.requestAnimationFrame(() => { popup.focus(); popup.print(); });
  });
}
