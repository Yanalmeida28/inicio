import type { PartnerSale } from '../types';

export type AdminPeriod = 'hoje' | '7dias' | '30dias' | 'mes' | 'custom';
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
export function adminBusinessDay(value: Date): string {
  const parts = dayFormat.formatToParts(value);
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function validDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
}
export function shiftAdminDay(day: string, count: number): string {
  return new Date(Date.parse(day + 'T12:00:00Z') + count * 86400000).toISOString().slice(0, 10);
}
// First instant of this civil day, including historical timezone transitions.
export function adminDayStart(day: string): Date {
  if (!validDay(day)) throw new Error('Data inválida.');
  const anchor = Date.parse(day + 'T12:00:00Z');
  let low = anchor - 86400000, high = anchor + 86400000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (adminBusinessDay(new Date(middle)) < day) low = middle + 1; else high = middle;
  }
  return new Date(low);
}
export function adminSaleDate(sale: Pick<PartnerSale, 'completed_at' | 'created_at'>): string {
  return sale.completed_at && Number.isFinite(Date.parse(sale.completed_at)) ? sale.completed_at : sale.created_at;
}
export function getAdminPeriodRange(period: AdminPeriod, customStart?: string, customEnd?: string, now = new Date()) {
  const today = adminBusinessDay(now);
  let first = today, last = today;
  if (period === '7dias') first = shiftAdminDay(today, -6);
  if (period === '30dias') first = shiftAdminDay(today, -29);
  if (period === 'mes') { first = today.slice(0, 7) + '-01'; last = shiftAdminDay(new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1)).toISOString().slice(0, 10), -1); }
  if (period === 'custom') { first = customStart ?? ''; last = customEnd ?? ''; }
  const error = !validDay(first) || !validDay(last) ? 'Informe duas datas válidas.' : first > last ? 'A data inicial deve ser anterior ou igual à data final.' : '';
  if (error) return { start: new Date(0), end: new Date(0), prevStart: new Date(0), prevEnd: new Date(0), error };
  const start = adminDayStart(first), end = adminDayStart(shiftAdminDay(last, 1));
  const days = Math.round((Date.parse(last) - Date.parse(first)) / 86400000) + 1;
  return { start, end, prevStart: adminDayStart(shiftAdminDay(first, -days)), prevEnd: start, error: '' };
}
export function adminChartBuckets(start: Date, end: Date) {
  if (end <= start) return [];
  const first = adminBusinessDay(start), last = adminBusinessDay(new Date(end.getTime() - 1));
  const days = Math.round((Date.parse(last) - Date.parse(first)) / 86400000) + 1;
  const width = Math.max(1, Math.ceil(days / 90));
  const buckets: { date: Date; start: Date; end: Date; days: number }[] = [];
  for (let offset = 0; offset < days; offset += width) {
    const count = Math.min(width, days - offset), day = shiftAdminDay(first, offset);
    const from = adminDayStart(day), until = adminDayStart(shiftAdminDay(day, count));
    buckets.push({ date: from, start: from, end: until, days: count });
  }
  return buckets;
}
