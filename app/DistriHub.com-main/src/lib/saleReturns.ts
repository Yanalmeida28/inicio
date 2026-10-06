import type { PartnerSale, RmaRequest } from '../types';

export function saleReturns(sale: PartnerSale, requests: RmaRequest[]) {
  return requests.filter(request => request.sale_id === sale.id && request.user_id === sale.user_id);
}

export function returnedQuantity(sale: PartnerSale, index: number, requests: RmaRequest[]) {
  return saleReturns(sale, requests)
    .filter(request => request.sale_item_index === index)
    .reduce((sum, request) => sum + Number(request.quantity ?? 1), 0);
}

export function saleReturnLabel(sale: PartnerSale, requests: RmaRequest[]) {
  const returned = sale.items.reduce((sum, _, index) => sum + returnedQuantity(sale, index, requests), 0);
  if (!returned) return '';
  const sold = sale.items.reduce((sum, item) => sum + Number(item.quantity), 0);
  return returned >= sold ? 'Devolução total' : 'Devolução parcial';
}

export function saleItemDescription(sale: PartnerSale, requests: RmaRequest[]) {
  return sale.items.map((item, index) => {
    const returned = returnedQuantity(sale, index, requests);
    return `${item.name} (${item.quantity})${returned ? ` — ${returned} devolvido(s)` : ''}`;
  }).join(', ');
}
