const businessDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
export function orderMatchesDate(createdAt: string, start: string, end: string): boolean {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return false;
  const day = businessDate.format(date);
  return (!start || day >= start) && (!end || day <= end);
}
