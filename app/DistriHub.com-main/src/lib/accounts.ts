import type { PartnerInvoice } from '../types';

export interface PayableAccount {
  id: string;
  user_id: string;
  branch_id: string | null;
  supplier_id: string | null;
  description: string;
  creditor_name: string;
  category: 'fornecedor' | 'aluguel' | 'energia' | 'salarios' | 'impostos' | 'outros';
  amount: number;
  paid_amount: number;
  due_date: string;
  status: 'aberta' | 'parcial' | 'paga' | 'cancelada';
  created_at: string;
}

export function accountPaid(account: { amount: number; paid_amount?: number; status: string }): number {
  return account.status === 'cancelada' ? 0 : Number(account.paid_amount ?? (account.status === 'paga' ? account.amount : 0));
}

export function accountBalance(account: { amount: number; paid_amount?: number; status: string }): number {
  if (account.status === 'cancelada' || account.status === 'paga') return 0;
  return Math.max(0, Math.round(Number(account.amount) * 100) - Math.round(accountPaid(account) * 100)) / 100;
}

export function isOverdue(account: { amount: number; paid_amount?: number; status: string; due_date: string | null }, today = new Date()): boolean {
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return accountBalance(account) > 0 && Boolean(account.due_date && account.due_date.slice(0, 10) < date);
}

export function financialAccounts(invoices: PartnerInvoice[], payables: PayableAccount[]) {
  return {
    receivable: invoices.reduce((sum, account) => sum + accountBalance(account), 0),
    received: invoices.reduce((sum, account) => sum + accountPaid(account), 0),
    payable: payables.reduce((sum, account) => sum + accountBalance(account), 0),
    paid: payables.reduce((sum, account) => sum + accountPaid(account), 0),
  };
}
