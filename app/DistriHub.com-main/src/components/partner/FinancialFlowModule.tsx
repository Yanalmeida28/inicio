import { useEffect, useState } from 'react';
import type { PartnerInvoice, PartnerSale, StockMovement } from '../../types';
import type { PayableAccount } from '../../lib/accounts';
import { actualFinancialFlow, projectedFinancialFlow, localDate, type InvoiceReceipt, type PayablePayment } from '../../lib/financialFlow';
import { supabase } from '../../lib/supabase';
import { money } from '../../utils';

type Props = { userId?: string; branchId: string; invoices: PartnerInvoice[]; payables: PayableAccount[]; sales: PartnerSale[]; movements: StockMovement[]; payablesUnavailable: boolean };
const today = () => localDate(new Date().toISOString());
const shifted = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return localDate(date.toISOString()); };

export function FinancialFlowModule({ userId, branchId, invoices, payables, sales, movements, payablesUnavailable }: Props) {
  const [mode, setMode] = useState<'realizado' | 'previsto'>('realizado');
  const [start, setStart] = useState(() => shifted(-29));
  const [end, setEnd] = useState(today);
  const [receipts, setReceipts] = useState<InvoiceReceipt[]>([]);
  const [payments, setPayments] = useState<PayablePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setReceipts([]); setPayments([]);
    async function load() {
      const client = supabase;
      if (!client || !userId) throw new Error('Loja não conectada.');
      const { data: auth, error: failure } = await client.auth.getUser();
      if (failure || auth.user?.id !== userId) throw new Error('O Fluxo Financeiro é administrado pelo proprietário da loja.');
      async function pages(table: string) {
        const all: unknown[] = [];
        for (let offset = 0; ; offset += 500) {
          const result = await client!.from(table).select('*').eq('user_id', userId!).order('id').range(offset, offset + 499);
          if (result.error) throw new Error(result.error.message);
          all.push(...result.data);
          if (result.data.length < 500) return all;
        }
      }
      const [receiptRows, paymentRows] = await Promise.all([pages('partner_invoice_receipts'), pages('partner_payable_payments')]);
      if (active) { setReceipts((receiptRows as InvoiceReceipt[]).filter(r => !branchId || r.branch_id === branchId)); setPayments(paymentRows as PayablePayment[]); }
    }
    void load().catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Falha ao consultar movimentos.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, branchId, invoices, payables, revision]);

  const scopedSales = sales.filter(s => !branchId || s.branch_id === branchId);
  const records = mode === 'realizado' ? actualFinancialFlow(scopedSales, movements, receipts, payments, payables, invoices) : projectedFinancialFlow(invoices, payables);
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
    <p>{mode === 'realizado' ? 'Vendas à vista, recebimentos de faturas e pagamentos de contas registrados. Resultado dos movimentos do período; não é o saldo bancário ou o fechamento do caixa.' : 'Previsão pelos vencimentos e saldos ainda pendentes. Estes valores não representam dinheiro já recebido ou pago.'}</p>
    <div className="orders-filter-row" style={{ flexWrap: 'wrap', margin: '16px 0' }}>
      {(['realizado', 'previsto'] as const).map(value => <button key={value} type="button" className={`rma-advance-btn ${mode === value ? 'active' : ''}`} onClick={() => { setMode(value); setStart(value === 'realizado' ? shifted(-29) : today()); setEnd(value === 'realizado' ? today() : shifted(29)); }}>{value === 'realizado' ? 'Realizado' : 'Previsto'}</button>)}
      <label>De <input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
      <label>Até <input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
      <button type="button" className="rma-advance-btn" disabled={loading} onClick={() => setRevision(r => r + 1)}>Atualizar</button>
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
