import { ArrowDownRight, ArrowUpRight, BarChart3, CreditCard, Users } from 'lucide-react';
import type { AdminFinancialMonth } from '../types';
import { money } from '../utils';

type Props = { data: AdminFinancialMonth[] };

export function AdminFinancialModule({ data }: Props) {
  const current = data[data.length - 1];
  const revenue = data.reduce((sum, month) => sum + Number(month.revenue), 0);
  const openAmount = data.reduce((sum, month) => sum + Number(month.open_amount), 0);
  const paidCount = data.reduce((sum, month) => sum + Number(month.paid_count), 0);
  const activeClients = data.reduce((sum, month) => sum + Number(month.active_clients), 0);
  const maxRevenue = Math.max(...data.map((month) => Number(month.revenue)), 1);
  const cards = [
    { label: 'Receita nos últimos 6 meses', value: money.format(revenue), icon: CreditCard, tone: 'green' },
    { label: 'Faturas em aberto', value: money.format(openAmount), icon: ArrowDownRight, tone: 'amber' },
    { label: 'Faturas pagas', value: String(paidCount), icon: ArrowUpRight, tone: 'blue' },
    { label: 'Clientes cadastrados', value: String(activeClients), icon: Users, tone: 'slate' },
  ];

  return (
    <div className="panel-module admin-financial-module">
      <div className="module-header">
        <span className="module-icon"><BarChart3 size={20} /></span>
        <div><h3>Financeiro SaaS</h3><p>Visão executiva das assinaturas e recebimentos da plataforma</p></div>
      </div>
      <div className="admin-financial-kpis">
        {cards.map(({ label, value, icon: Icon, tone }) => <div className={`admin-financial-kpi ${tone}`} key={label}><Icon size={17} /><small>{label}</small><strong>{value}</strong></div>)}
      </div>
      <div className="admin-financial-grid">
        <div className="admin-financial-chart">
          <div className="admin-financial-chart-head"><h4>Receita mensal</h4><span>Últimos 6 meses</span></div>
          <div className="admin-financial-bars">
            {data.map((month) => <div className="admin-financial-bar-column" key={month.month_start}><div className="admin-financial-bar-value">{Number(month.revenue) > 0 ? money.format(Number(month.revenue)) : 'R$ 0'}</div><div className="admin-financial-bar" style={{ height: `${Math.max(4, Number(month.revenue) / maxRevenue * 150)}px` }} /><small>{month.month_label}</small></div>)}
          </div>
        </div>
        <div className="admin-financial-summary"><h4>Resumo do mês atual</h4><div><span>Receita</span><strong>{money.format(Number(current?.revenue ?? 0))}</strong></div><div><span>Em aberto</span><strong>{money.format(Number(current?.open_amount ?? 0))}</strong></div><div><span>Ticket médio</span><strong>{money.format(Number(current?.average_ticket ?? 0))}</strong></div><div><span>Novos clientes</span><strong>{current?.active_clients ?? 0}</strong></div></div>
      </div>
    </div>
  );
}
