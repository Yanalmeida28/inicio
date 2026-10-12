import type { SaasInvoice, SaasSubscription } from './saas';
import { buildCsv } from './exportSafety';

export function adminDay(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  return new Date(value).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}
export function matchesPeriod(value: string | null, start: string, end: string): boolean {
  const day = adminDay(value);
  return (!start && !end) || (!!day && (!start || day >= start) && (!end || day <= end));
}
export function accessDeadline(s: SaasSubscription): string | null {
  if (!s.can_access || s.billing_mode === 'exempt') return null;
  if (s.status === 'trial') return s.trial_ends_at;
  if (s.status === 'past_due') return s.grace_until ?? null;
  return [s.paid_until, s.admin_access_until].filter((v): v is string => !!v && Number.isFinite(Date.parse(v)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}
export function accessExplanation(s: SaasSubscription): string {
  if (s.status === 'suspended') return 'Acesso suspenso pelo administrador';
  if (!s.can_access) return s.status === 'cancelled' ? 'Assinatura cancelada, sem período de acesso vigente' : s.status === 'unavailable' ? 'Assinatura indisponível' : 'Teste e liberações de acesso vencidos';
  if (s.billing_mode === 'exempt') return 'Empresa isenta de mensalidade';
  if (s.status === 'trial') return 'Período de teste vigente';
  if (s.status === 'past_due') return 'Pagamento em atraso, dentro do período de tolerância';
  if (s.admin_access_until && Date.parse(s.admin_access_until) > Date.now() && (!s.paid_until || Date.parse(s.admin_access_until) > Date.parse(s.paid_until))) return 'Liberação manual vigente';
  return 'Período pago vigente';
}
export function recurringRevenue(subscriptions: SaasSubscription[]): number {
  return subscriptions.filter(s => s.billing_mode === 'paid' && s.status === 'active' && s.can_access && s.auto_renew)
    .reduce((sum, s) => sum + Number(s.monthly_amount || 0), 0);
}
export function monthlyReceipts(invoices: SaasInvoice[]) {
  const months = new Map<string, number>();
  for (const invoice of invoices) {
    if (invoice.status !== 'paid' || !invoice.paid_at) continue;
    const key = adminDay(invoice.paid_at).slice(0, 7);
    if (key) months.set(key, (months.get(key) ?? 0) + Number(invoice.amount));
  }
  return [...months].sort(([a], [b]) => a.localeCompare(b));
}
export function downloadAdminCsv(filename: string, rows: (string | number)[][]) {
  const url = URL.createObjectURL(new Blob([buildCsv(rows)], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
