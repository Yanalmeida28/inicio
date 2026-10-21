import { useId, useState } from 'react';
import { BarChart3, CircleDollarSign, ShieldCheck, TrendingUp } from 'lucide-react';
import type { SaasOverview } from '../lib/saas';
import { adminDay, monthlyReceipts } from '../lib/adminOverview';
import { money } from '../utils';

const colors = ['#4ade80', '#60a5fa', '#fbbf24', '#fb7185', '#a78bfa', '#94a3b8'];

export function AdminManagementCharts({ data }: { data: SaasOverview }) {
  const [period, setPeriod] = useState(6);
  const gradientId = useId();
  const { subscriptions, invoices } = data;
  const today = adminDay(new Date().toISOString());
  const [year, month] = today.split('-').map(Number);
  const receipts = new Map(monthlyReceipts(invoices));
  const months = Array.from({ length: period }, (_, index) => {
    const day = new Date(Date.UTC(year, month - period + index, 1));
    const key = day.toISOString().slice(0, 7);
    return { key, label: day.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }), value: receipts.get(key) ?? 0 };
  });
  const total = months.reduce((sum, entry) => sum + entry.value, 0);
  const max = Math.max(1, ...months.map(entry => entry.value));
  const points = months.map((entry, index) => ({ ...entry, x: 60 + index * 580 / (period - 1), y: 176 - entry.value / max * 140 }));
  const line = points.map(point => `${point.x},${point.y}`).join(' ');
  const allowed = subscriptions.filter(subscription => subscription.can_access).length;
  const percentage = subscriptions.length ? Math.round(allowed / subscriptions.length * 100) : 0;
  const plans = [
    { id: 'basico', label: 'Básico' }, { id: 'profissional', label: 'Profissional' }, { id: 'enterprise', label: 'Enterprise' },
  ].map(plan => ({ ...plan, count: subscriptions.filter(subscription => subscription.effective_plan === plan.id).length }));
  const billing = [
    { status: 'paid', label: 'Pagas' }, { status: 'pending', label: 'Pendentes' },
    { status: 'cancellation_requested', label: 'Cancelamento em processamento' }, { status: 'cancelled', label: 'Canceladas' },
    { status: 'refunded', label: 'Estornadas' }, { status: 'charged_back', label: 'Contestadas' },
  ].map(item => {
    const matching = invoices.filter(invoice => invoice.status === item.status);
    return { ...item, count: matching.length, amount: matching.reduce((sum, invoice) => sum + Number(invoice.amount), 0) };
  });
  const maxAmount = Math.max(1, ...billing.map(item => item.amount));

  return <div className="saas-management-charts">
    <section className="saas-chart-card saas-revenue-chart" aria-labelledby={`${gradientId}-revenue`}>
      <div className="saas-chart-heading"><div><span className="saas-chart-eyebrow"><TrendingUp size={16} /> DESEMPENHO FINANCEIRO</span><h4 id={`${gradientId}-revenue`}>Evolução dos recebimentos</h4></div>
        <label className="saas-chart-period">Período<select value={period} onChange={event => setPeriod(Number(event.target.value))}><option value={6}>6 meses</option><option value={12}>12 meses</option></select></label>
      </div>
      <strong className="saas-chart-total">{money.format(total)}</strong><p className="saas-chart-note">Recebido no período · pagamentos por data de confirmação</p>
      {total > 0 ? <svg className="saas-revenue-svg" viewBox="0 0 700 220" role="img" aria-label={`Recebimentos nos últimos ${period} meses: ${money.format(total)}. Valores mensais na tabela abaixo.`}>
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#60a5fa" stopOpacity="0.35" /><stop offset="100%" stopColor="#60a5fa" stopOpacity="0" /></linearGradient></defs>
        {[0, 0.5, 1].map(ratio => <g key={ratio}><line x1="60" x2="640" y1={176 - ratio * 140} y2={176 - ratio * 140} stroke="#29465f" strokeDasharray="4 5" /><text x="52" y={180 - ratio * 140} textAnchor="end">{new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(max * ratio)}</text></g>)}
        <polygon points={`60,176 ${line} 640,176`} fill={`url(#${gradientId})`} />
        <polyline points={line} fill="none" stroke="#60a5fa" strokeWidth="3" strokeLinejoin="round" />
        {points.map(point => <g key={point.key}><circle cx={point.x} cy={point.y} r="4" fill="#93c5fd"><title>{point.label}: {money.format(point.value)}</title></circle><text x={point.x} y="205" textAnchor="middle">{point.label}</text></g>)}
      </svg> : <div className="saas-chart-empty">Nenhum recebimento confirmado nos últimos {period} meses.</div>}
      <details className="saas-chart-data"><summary>Consultar valores por mês</summary><table><caption>Recebimentos confirmados</caption><thead><tr><th>Mês</th><th>Recebido</th></tr></thead><tbody>{months.map(entry => <tr key={entry.key}><td>{entry.label}</td><td>{money.format(entry.value)}</td></tr>)}</tbody></table></details>
    </section>

    <section className="saas-chart-card"><div className="saas-chart-heading"><div><span className="saas-chart-eyebrow"><ShieldCheck size={16} /> ACESSO À PLATAFORMA</span><h4>Saúde dos acessos</h4></div></div>
      {subscriptions.length ? <div className="saas-donut" role="img" aria-label={`${allowed} empresas com acesso liberado de ${subscriptions.length}`} style={{ background: `conic-gradient(#4ade80 0% ${allowed / subscriptions.length * 100}%, #fb7185 ${allowed / subscriptions.length * 100}% 100%)` }}><div><strong>{percentage}%</strong><span>com acesso</span></div></div> : <div className="saas-chart-empty">Nenhuma empresa cadastrada.</div>}
      <div className="saas-chart-legend"><p><span><i style={{ background: colors[0] }} />Acesso liberado</span><strong>{allowed}</strong></p><p><span><i style={{ background: colors[3] }} />Acesso bloqueado</span><strong>{subscriptions.length - allowed}</strong></p></div>
      <p className="saas-chart-note">Situação atual, incluindo testes e liberações manuais.</p>
    </section>

    <section className="saas-chart-card"><div className="saas-chart-heading"><div><span className="saas-chart-eyebrow"><BarChart3 size={16} /> CARTEIRA DE EMPRESAS</span><h4>Distribuição por plano</h4></div></div>
      {!subscriptions.length && <p className="saas-chart-note">Os planos aparecerão após o cadastro de empresas.</p>}
      <div className="saas-chart-bars">{plans.map((plan, index) => <div key={plan.id}><div className="saas-bar-label"><span>{plan.label}</span><strong>{plan.count} <small>({subscriptions.length ? Math.round(plan.count / subscriptions.length * 100) : 0}%)</small></strong></div><div className="saas-bar-track"><span style={{ width: `${subscriptions.length ? plan.count / subscriptions.length * 100 : 0}%`, background: colors[index] }} /></div></div>)}</div>
      <p className="saas-chart-note">Plano efetivo de todas as empresas, incluindo acessos bloqueados.</p>
    </section>

    <section className="saas-chart-card"><div className="saas-chart-heading"><div><span className="saas-chart-eyebrow"><CircleDollarSign size={16} /> COBRANÇAS</span><h4>Situação das faturas</h4></div></div>
      {!invoices.length && <p className="saas-chart-note">Nenhuma fatura emitida.</p>}
      <div className="saas-chart-bars">{billing.map((item, index) => <div key={item.status}><div className="saas-bar-label"><span>{item.label} <small>({item.count})</small></span><strong>{money.format(item.amount)}</strong></div><div className="saas-bar-track"><span style={{ width: `${item.amount / maxAmount * 100}%`, background: colors[index] }} /></div></div>)}</div>
      <p className="saas-chart-note">Valores por status em todo o histórico disponível. Pendências não representam receita recebida.</p>
    </section>
  </div>;
}
