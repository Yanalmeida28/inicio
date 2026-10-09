import type { PartnerInvoice, PartnerSale, StockMovement } from '../types';
import { accountBalance, type PayableAccount } from './accounts';
import { saleChargeTotal } from './pdv';

export interface InvoiceReceipt {
  id: string; user_id: string; invoice_id: string; branch_id: string | null;
  customer_id: string | null; customer_name: string; invoice_number: string;
  amount: number; occurred_at: string | null;
}
export interface PayablePayment {
  id: string; payable_id: string; user_id: string; amount: number; created_at: string;
}
export interface FinancialMovement {
  id: string; date: string | null; description: string; amount: number;
}

export function actualFinancialFlow(sales: PartnerSale[], movements: StockMovement[], receipts: InvoiceReceipt[], payments: PayablePayment[], payables: PayableAccount[], invoices: PartnerInvoice[]): FinancialMovement[] {
  const saleTimes = new Map<string, string>();
  for (const movement of movements) {
    const match = /^\s*sa[ií]da por venda\s+(\S+)\s*$/i.exec(movement.reason ?? '');
    if (movement.type !== 'saida' || !match || movement.quantity <= 0) continue;
    if (!saleTimes.has(match[1]) || movement.created_at > saleTimes.get(match[1])!) saleTimes.set(match[1], movement.created_at);
  }
  const billed = new Set(invoices.filter(i => i.status !== 'cancelada').map(i => i.sale_id));
  const accounts = new Map(payables.map(a => [a.id, a]));
  return [
    ...sales.filter(s => s.status === 'concluida' && s.payment_method !== 'faturado' && !billed.has(s.id)).map(s => ({
      id: `sale-${s.id}`, date: saleTimes.get(s.id) ?? s.completed_at ?? s.created_at,
      description: `Venda à vista — ${s.customer_name}${s.freight_fee ? ' (inclui frete para repasse)' : ''}`, amount: saleChargeTotal(s),
    })),
    ...receipts.map(r => ({ id: `receipt-${r.id}`, date: r.occurred_at, description: `Fatura ${r.invoice_number} — ${r.customer_name}`, amount: Number(r.amount) })),
    ...payments.filter(p => accounts.has(p.payable_id)).map(p => ({ id: `payment-${p.id}`, date: p.created_at,
      description: `${accounts.get(p.payable_id)!.description} — ${accounts.get(p.payable_id)!.creditor_name}`, amount: -Number(p.amount) })),
  ];
}

export function projectedFinancialFlow(invoices: PartnerInvoice[], payables: PayableAccount[]): FinancialMovement[] {
  return [
    ...invoices.filter(i => accountBalance(i) > 0).map(i => ({ id: `invoice-${i.id}`, date: i.due_date,
      description: `A receber — ${i.customer_name} / ${i.number}`, amount: accountBalance(i) })),
    ...payables.filter(a => accountBalance(a) > 0).map(a => ({ id: `payable-${a.id}`, date: a.due_date,
      description: `A pagar — ${a.description} / ${a.creditor_name}`, amount: -accountBalance(a) })),
  ];
}

export function localDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
