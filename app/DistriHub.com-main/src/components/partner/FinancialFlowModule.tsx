import { useState } from 'react';
import type { PartnerInvoice, PartnerSale, StockMovement } from '../../types';
import type { PayableAccount } from '../../lib/accounts';
import { actualFinancialFlow, projectedFinancialFlow, localDate } from '../../lib/financialFlow';
import { useFinancialMovements } from '../../hooks/useFinancialMovements';
import { money } from '../../utils';

type Props = { isActive?: boolean; userId?: string; branchId: string; invoices: PartnerInvoice[]; payables: PayableAccount[]; sales: PartnerSale[]; movements: StockMovement[]; payablesUnavailable: boolean };
const today = () => localDate(new Date().toISOString());
const shifted = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return localDate(date.toISOString()); };

export function FinancialFlowModule({ userId, branchId, invoices, payables, sales, movements, payablesUnavailable, isActive = true }: Props) {
  const [mode, setMode] = useState<'realizado' | 'previsto'>('realizado');
  const [start, setStart] = useState(() => shifted(-29));
  const [end, setEnd] = useState(today);
  const { receipts, payments, refunds, loading, error, reload } = useFinancialMovements(userId, branchId, invoices, payables, isActive);

  const scopedSales = sales.filter(s => !branchId || s.branch_id === branchId);
  const records = mode === 'realizado' ? actualFinancialFlow(scopedSales, movements, receipts, payments, payables, invoices, refunds) : projectedFinancialFlow(invoices, payables);
  const invalidRange = Boolean(start && end && start > end);
  const rows = records.filter(r => r.date && localDate(r.date) && (!start || localDate(r.date) >= start) && (!end || localDate(r.date) <= end))
    .sort((a, b) => localDate(a.date!).localeCompare(localDate(b.date!)) || a.id.localeCompare(b.id));
  const undated = records.filter(r => !r.date || !localDate(r.date));
  const totals = rows.reduce((sum, row) => {
    const cents = Math.round(row.amount * 100);
    if (cents >= 0) sum.incoming += cents; else sum.outgoing -= cents;
    return sum;
  }, { incoming: 0, outgoing: 0 });
  const unavailable = loading || Boolean(error) || payablesUnavailable || invalidRange;
  let running = 0;
  return <section className="module-card">
    <h4 className="report-section-title">Fluxo Financeiro</h4>
    <p>{mode === 'realizado' ? 'Vendas à vista, recebimentos de faturas, pagamentos de contas e reembolsos de devoluções registrados. Resultado dos movimentos do período; não é o saldo bancário ou o fechamento do caixa.' : 'Previsão pelos vencimentos e saldos ainda pendentes. Estes valores não representam dinheiro já recebido ou pago.'}</p>
    <div className="orders-filter-row" style={{ flexWrap: 'wrap', margin: '16px 0' }}>
      {(['realizado', 'previsto'] as const).map(value => <button key={value} type="button" className={`rma-advance-btn ${mode === value ? 'active' : ''}`} onClick={() => { setMode(value); setStart(value === 'realizado' ? shifted(-29) : today()); setEnd(value === 'realizado' ? today() : shifted(29)); }}>{value === 'realizado' ? 'Realizado' : 'Previsto'}</button>)}
      <label>De <input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
      <label>Até <input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
      <button type="button" className="rma-advance-btn" disabled={loading} onClick={reload}>Atualizar</button>
    </div>
    {loading && <p role="status">Carregando movimentações…</p>}
    {error && <p role="alert">{error}</p>}
    {payablesUnavailable && <p role="alert">Contas a Pagar indisponíveis. Aguarde ou atualize a consulta para obter o resultado completo.</p>}
    {invalidRange && <p role="alert">A data inicial deve ser anterior ou igual à data final.</p>}
    <div className="report-cards">
      <div className="report-card"><small>Entradas no período</small><strong>{unavailable ? 'Indisponível' : money.format(totals.incoming / 100)}</strong></div>
      <div className="report-card"><small>Saídas no período</small><strong>{unavailable ? 'Indisponível' : money.format(totals.outgoing / 100)}</strong></div>
      <div className="report-card"><small>Resultado do período</small><strong>{unavailable ? 'Indisponível' : money.format((totals.incoming - totals.outgoing) / 100)}</strong></div>
    </div>
    {!unavailable && undated.length > 0 && <p role="status">{undated.length} registro(s) sem data comprovada, com valor líquido de {money.format(undated.reduce((sum, r) => sum + r.amount, 0))}, ficaram fora do filtro por período. Recebimentos antigos continuam considerados no saldo dos clientes.</p>}
    <div className="stock-table-wrap"><table className="rma-table"><thead><tr><th>Data</th><th>Descrição</th><th>Entrada</th><th>Saída</th><th>Acumulado do período</th></tr></thead>
      <tbody>{unavailable ? <tr><td colSpan={5} className="empty-row">Consulta incompleta ou período inválido.</td></tr> : rows.length === 0 ? <tr><td colSpan={5} className="empty-row">Nenhuma movimentação neste período.</td></tr> : rows.map(row => {
        running += Math.round(row.amount * 100);
        return <tr key={row.id}><td>{new Date(localDate(row.date!) + 'T12:00:00').toLocaleDateString('pt-BR')}</td><td>{row.description}</td><td>{row.amount >= 0 ? money.format(row.amount) : '—'}</td><td>{row.amount < 0 ? money.format(-row.amount) : '—'}</td><td>{money.format(running / 100)}</td></tr>;
      })}</tbody></table></div>
  </section>;
}
