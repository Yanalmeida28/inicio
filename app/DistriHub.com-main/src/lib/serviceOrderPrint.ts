import type { PartnerCustomer, ServiceOrder, ServiceOrderItem } from '../types';
import type { ReceiptDetails } from './salePrint';
import { money } from '../utils';

export function printServiceOrder(order: ServiceOrder, items: ServiceOrderItem[], details: ReceiptDetails = {}, warrantyTerms = '', customer?: PartnerCustomer) {
  const popup = window.open('', '_blank', 'width=900,height=800');
  if (!popup) throw new Error('Permita a abertura de janelas para imprimir a OS.');
  const doc = popup.document;
  doc.documentElement.lang = 'pt-BR';
  doc.title = `OS ${order.os_number || order.id.slice(0, 8)}`;
  doc.head.replaceChildren(); doc.body.replaceChildren();
  const style = doc.createElement('style');
  style.textContent = `@page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; } body { background: #fff; color: #000; font: 12px Arial, sans-serif; margin: 20px auto; max-width: 800px; padding: 16px; }
    h1 { font-size: 23px; } h2 { font-size: 15px; border-bottom: 1px solid #aaa; padding-bottom: 6px; margin-top: 24px; }
    p { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ccc; overflow-wrap: anywhere; }
    thead { display: table-header-group; } tr, .signatures { break-inside: avoid; } .signatures { display: flex; gap: 30px; margin-top: 65px; } .signatures p { flex: 1; border-top: 1px solid; padding-top: 8px; text-align: center; }
    button { padding: 10px 16px; margin-bottom: 18px; cursor: pointer; } @media print { body { margin: 0; padding: 0; max-width: none; } button { display: none; } }`;
  doc.head.append(style);
  function node(tag: string, text: string, parent: HTMLElement = doc.body) {
    const element = doc.createElement(tag); element.textContent = text; parent.append(element); return element;
  }
  const button = node('button', 'Imprimir / Salvar como PDF');
  button.onclick = () => { popup.focus(); popup.print(); };
  const branch = details.branches?.find(value => value.id === order.branch_id);
  node('h1', details.companyName || branch?.name || 'Ordem de Serviço');
  if (branch) node('p', `Filial: ${branch.name}`);
  if (details.companyDocument) node('p', `CPF/CNPJ: ${details.companyDocument}`);
  if (branch?.address || details.companyAddress) node('p', branch?.address || details.companyAddress || '');
  node('h2', `Ordem de Serviço Nº ${order.os_number || order.id.slice(0, 8)}`);
  const date = (value: string | null) => {
    if (!value) return 'Não informada';
    const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00-03:00` : value);
    return Number.isNaN(parsed.getTime()) ? 'Não informada' : parsed.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  };
  const status: Record<string, string> = { aberta: 'Aberta', em_andamento: 'Em andamento', aguardando_peca: 'Aguardando peça', aguardando_cliente: 'Aguardando cliente', pronta: 'Pronta', finalizada: 'Finalizada / entregue', cancelada: 'Cancelada', em_analise: 'Em análise', aguardando_aprovacao: 'Aguardando aprovação', aprovada: 'Aprovada', em_reparo: 'Em reparo', entregue: 'Entregue' };
  node('p', `Entrada: ${date(order.entry_date || order.created_at)} · Previsão de entrega: ${date(order.forecast_delivery)}`);
  node('p', `Situação: ${status[order.status] || order.status} · Técnico: ${order.technician_name || 'Não informado'}`);
  node('h2', 'Cliente');
  const savedCustomer = customer?.id === order.customer_id ? customer : undefined;
  node('p', `Nome: ${order.customer_name || savedCustomer?.name || 'Não informado'}`);
  if (savedCustomer?.document) node('p', `CPF/CNPJ: ${savedCustomer.document}`);
  node('p', `Telefone: ${order.customer_phone || savedCustomer?.phone || 'Não informado'} · E-mail: ${order.customer_email || savedCustomer?.email || 'Não informado'}`);
  const address = savedCustomer ? [savedCustomer.address, savedCustomer.address_number, savedCustomer.complement, savedCustomer.neighborhood, savedCustomer.city, savedCustomer.state, savedCustomer.zip_code].filter(Boolean).join(', ') : '';
  node('p', `Endereço: ${order.customer_address || address || 'Não informado'}`);
  node('h2', 'Equipamento e condições de entrada');
  for (const [label, value] of [
    ['Equipamento', order.equipment_type], ['Marca', order.equipment_brand], ['Modelo', order.equipment_model],
    ['Identificação', order.equipment_identification], ['Número de série', order.serial_number], ['IMEI', order.imei],
    ['Defeito relatado', order.reported_issue], ['Acessórios deixados', order.accessories_left], ['Condição física', order.physical_condition],
    ['Danos na entrada', order.entry_damage], ['Observações de entrada', order.entry_notes], ['Tela', order.screen_condition],
    ['Carcaça', order.shell_condition], ['Laterais', order.side_condition], ['Traseira', order.rear_condition], ['Conectores', order.connectors_condition],
    ['Botões', order.buttons_condition], ['Outros danos', order.other_damage], ['Inspeção', order.inspection_notes], ['Observações', order.observations],
  ]) if (value) node('p', `${label}: ${value}`);
  node('h2', 'Conferência de saída');
  node('p', order.approval_notes?.includes('[Checklist de saída]') ? order.approval_notes : 'Checklist de saída não registrado.');
  node('h2', 'Peças e serviços');
  const table = node('table', ''); const header = node('tr', '', node('thead', '', table));
  for (const label of ['Descrição', 'Qtd.', 'Valor unitário', 'Subtotal']) node('th', label, header);
  const body = node('tbody', '', table);
  for (const item of items) {
    const row = node('tr', '', body);
    for (const value of [item.product_name, String(item.quantity), money.format(Number(item.unit_price)), money.format(Number(item.quantity) * Number(item.unit_price))]) node('td', value, row);
  }
  if (!items.length) node('p', 'Nenhuma peça ou serviço discriminado.');
  node('p', `Peças: ${money.format(Number(order.parts_total))} · Mão de obra / serviços: ${money.format(Number(order.labor_total))} · Desconto: ${money.format(Number(order.discount_total))}`);
  node('h2', `Total: ${money.format(Number(order.total))}`);
  node('p', 'Este documento não comprova pagamento.');
  // The current store configuration must never replace an issued order's terms.
  warrantyTerms = order.warranty_snapshot ?? '';
  node('h2', 'Termo de garantia de serviços');
  node('p', order.warranty_snapshot == null ? 'Termo histórico não registrado nesta OS.' : warrantyTerms.trim() ? warrantyTerms : 'Nenhum termo de garantia adicional registrado na abertura.');
  const signatures = node('div', ''); signatures.className = 'signatures';
  node('p', 'Assinatura do cliente', signatures); node('p', 'Responsável pelo atendimento', signatures);
  node('p', 'Data: ______ / ______ / __________');
  popup.requestAnimationFrame(() => { if (!popup.closed) { popup.focus(); popup.print(); } });
}
