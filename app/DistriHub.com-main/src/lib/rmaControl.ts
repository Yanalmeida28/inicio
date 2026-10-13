import type { PartnerProduct, PartnerSale, RmaRequest } from '../types';
import { cashBusinessDay } from './cashRegister';
export const rmaDestinations = { avaliacao: 'Em avaliação', avaria: 'Avaria', fornecedor: 'No fornecedor', estoque: 'Reintegrada ao estoque' };
export function rmaDestination(rma: RmaRequest): keyof typeof rmaDestinations {
  return rma.destination ?? (rma.stock_restored_at || rma.status === 'reintegrado_estoque' ? 'estoque' : rma.status === 'retornou_fornecedor' ? 'fornecedor' : 'avaliacao');
}
export type RmaFilters = { search: string; from: string; to: string; destination: string; settlement: string; dateBasis: 'solicitacao' | 'reembolso' | 'credito' };
export function filterRmas(rows: RmaRequest[], filters: RmaFilters) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const term = normalize(filters.search.trim());
  return rows.filter(rma => {
    const timestamp = filters.dateBasis === 'reembolso' ? rma.refunded_at : filters.dateBasis === 'credito' ? rma.credited_at : rma.created_at;
    const day = timestamp ? cashBusinessDay(timestamp) : '';
    if (filters.dateBasis !== 'solicitacao' && !day) return false;
    if ((filters.from || filters.to) && (!day || (filters.from && day < filters.from) || (filters.to && day > filters.to))) return false;
    if (filters.destination !== 'all' && rmaDestination(rma) !== filters.destination) return false;
    if (filters.settlement === 'reembolso' && !Number(rma.refund_amount)) return false;
    if (filters.settlement === 'credito' && !Number(rma.credit_amount)) return false;
    if (filters.settlement === 'pendente' && (Number(rma.credit_amount) || Number(rma.refund_amount))) return false;
    return !term || normalize([rma.customer_name, rma.product_name, rma.product_sku, rma.batch_or_order, rma.id].join(' ')).includes(term);
  });
}
export function rmaControl(rows: RmaRequest[], products: PartnerProduct[], sales: PartnerSale[]) {
  const groups = Object.fromEntries(Object.keys(rmaDestinations).map(key => [key, { quantity: 0, cost: 0, estimated: 0, unknown: 0 }])) as Record<keyof typeof rmaDestinations, { quantity: number; cost: number; estimated: number; unknown: number }>;
  const productMap = new Map(products.map(product => [product.id, product]));
  const saleMap = new Map(sales.map(sale => [sale.id, sale]));
  let credits = 0, used = 0, creditUnknown = false;
  const refunds = { dinheiro: 0, pix: 0, cartao: 0 };
  for (const rma of rows) {
    const quantity = Number(rma.quantity ?? 1);
    const group = groups[rmaDestination(rma)]; group.quantity += quantity;
    const sale = rma.sale_id ? saleMap.get(rma.sale_id) : undefined;
    const historical = rma.product_id ? sale?.cost_snapshot?.[rma.product_id] : undefined;
    const current = rma.product_id ? productMap.get(rma.product_id)?.cost_price : undefined;
    const cost = historical ?? current;
    if (cost == null || !Number.isFinite(Number(cost))) group.unknown += quantity;
    else { group.cost += Math.round(Number(cost) * 100) * quantity; if (historical == null) group.estimated += quantity; }
    credits += Math.round(Number(rma.credit_amount ?? 0) * 100);
    if (Number(rma.credit_amount) > 0 && rma.credit_used_amount == null) creditUnknown = true;
    used += Math.round(Number(rma.credit_used_amount ?? 0) * 100);
    if (rma.refund_method) refunds[rma.refund_method] += Math.round(Number(rma.refund_amount ?? 0) * 100);
  }
  return { groups, credits: credits / 100, used: used / 100, available: creditUnknown ? null : Math.max(0, credits - used) / 100,
    refunded: rows.reduce((sum, rma) => sum + Math.round(Number(rma.refund_amount ?? 0) * 100), 0) / 100,
    refunds: Object.fromEntries(Object.entries(refunds).map(([key, value]) => [key, value / 100])) };
}
