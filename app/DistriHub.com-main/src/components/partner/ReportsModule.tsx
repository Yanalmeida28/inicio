import { useMemo, useState } from 'react';
import {
  BarChart3, TrendingUp, TrendingDown, Package, Users, Cake, MessageCircle, DollarSign,
  ShoppingCart, Wrench, UserCheck, CreditCard, Banknote, Wallet, Trophy, Crown, Medal,
} from 'lucide-react';
import type { PartnerSale, PartnerProduct, PartnerCustomer, PartnerSalesperson, SalespersonRole } from '../../types';
import { money } from '../../utils';

type Props = {
  sales: PartnerSale[];
  products: PartnerProduct[];
  customers: PartnerCustomer[];
  salespeople: PartnerSalesperson[];
};

type ReportTab = 'vendas' | 'financeiro' | 'estoque' | 'crm';

const roleLabels: Record<SalespersonRole, string> = {
  administrador: 'Administrador / Proprietário',
  gerente: 'Gerente',
  caixa: 'Caixa',
  vendedor: 'Vendedor / Balcão',
  tecnico: 'Técnico',
  atendente: 'Atendente',
  logistica: 'Logística / Entregador',
};

export function ReportsModule({ sales, products, customers, salespeople }: Props) {
  const [tab, setTab] = useState<ReportTab>('vendas');

  const tabs: { id: ReportTab; label: string; icon: typeof BarChart3 }[] = [
    { id: 'vendas', label: 'Vendas & Serviços', icon: BarChart3 },
    { id: 'financeiro', label: 'Financeiro & Métodos', icon: DollarSign },
    { id: 'estoque', label: 'Estoque', icon: Package },
    { id: 'crm', label: 'CRM', icon: Users },
  ];

  return (
    <div className="panel-module">
      <div className="module-header">
        <span className="module-icon"><BarChart3 size={20} /></span>
        <div>
          <h3>Central de Relatórios Inteligente & CRM</h3>
          <p>Vendas, financeiro, estoque e relacionamento com clientes</p>
        </div>
      </div>

      <div className="subtab-bar">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`subtab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div className="subtab-content">
        {tab === 'vendas' && <SalesReport sales={sales} products={products} salespeople={salespeople} />}
        {tab === 'financeiro' && <FinancialReport sales={sales} />}
        {tab === 'estoque' && <StockReport products={products} sales={sales} />}
        {tab === 'crm' && <CrmReport customers={customers} sales={sales} />}
      </div>
    </div>
  );
}

function SalesReport({ sales, products, salespeople }: { sales: PartnerSale[]; products: PartnerProduct[]; salespeople: PartnerSalesperson[] }) {
  const totalSales = sales.reduce((s, sale) => s + sale.total, 0);

  const productSales = sales.filter((s) => s.items.some((i) => !i.product_id.includes('svc')));
  const serviceSales = sales.filter((s) => s.items.some((i) => i.product_id.includes('svc')));
  const productTotal = productSales.reduce((s, x) => s + x.total, 0);
  const serviceTotal = serviceSales.reduce((s, x) => s + x.total, 0);

  const operationalRoles: SalespersonRole[] = ['vendedor', 'tecnico', 'caixa', 'atendente'];
  const operationalSalespeople = useMemo(
    () => salespeople.filter((sp) => operationalRoles.includes(sp.role)),
    [salespeople],
  );

  const bySalesperson = useMemo(() => {
    const map: Record<string, number> = {};
    for (const sale of sales) {
      if (sale.salesperson_id) {
        map[sale.salesperson_id] = (map[sale.salesperson_id] ?? 0) + sale.total;
      }
    }
    return map;
  }, [sales]);

  const commissionBySalesperson = useMemo(() => {
    const map: Record<string, number> = {};
    for (const sale of sales) {
      if (sale.salesperson_id) {
        const sp = salespeople.find((s) => s.id === sale.salesperson_id);
        if (sp) {
          map[sale.salesperson_id] = (map[sale.salesperson_id] ?? 0) + sale.total * (sp.commission_rate / 100);
        }
      }
    }
    return map;
  }, [sales, salespeople]);

  const salespeopleWithSales = useMemo(
    () => operationalSalespeople.filter((sp) => (bySalesperson[sp.id] ?? 0) > 0 || (commissionBySalesperson[sp.id] ?? 0) > 0),
    [operationalSalespeople, bySalesperson, commissionBySalesperson],
  );

  const top5Products = useMemo(() => {
    const map: Record<string, { qty: number; revenue: number }> = {};
    for (const sale of sales) {
      for (const item of sale.items) {
        if (!item.product_id.includes('svc')) {
          map[item.product_id] = {
            qty: (map[item.product_id]?.qty ?? 0) + item.quantity,
            revenue: (map[item.product_id]?.revenue ?? 0) + item.unit_price * item.quantity,
          };
        }
      }
    }
    return Object.entries(map).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);
  }, [sales]);

  const top5Services = useMemo(() => {
    const map: Record<string, { qty: number; revenue: number }> = {};
    for (const sale of sales) {
      for (const item of sale.items) {
        if (item.product_id.includes('svc')) {
          map[item.product_id] = {
            qty: (map[item.product_id]?.qty ?? 0) + item.quantity,
            revenue: (map[item.product_id]?.revenue ?? 0) + item.unit_price * item.quantity,
          };
        }
      }
    }
    return Object.entries(map).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);
  }, [sales]);

  return (
    <div>
      <div className="report-cards">
        <div className="report-card">
          <small>Vendas Gerais</small>
          <strong>{money.format(totalSales)}</strong>
          <small>{sales.length} vendas</small>
        </div>
        <div className="report-card">
          <small><Package size={13} /> Vendas por Produto</small>
          <strong>{money.format(productTotal)}</strong>
          <small>{productSales.length} vendas</small>
        </div>
        <div className="report-card">
          <small><Wrench size={13} /> Vendas por Serviço</small>
          <strong>{money.format(serviceTotal)}</strong>
          <small>{serviceSales.length} vendas</small>
        </div>
        <div className="report-card">
          <small><ShoppingCart size={13} /> Produto + Serviço</small>
          <strong>{money.format(totalSales)}</strong>
          <small>receita total combinada</small>
        </div>
      </div>

      <h4 className="report-section-title"><UserCheck size={16} /> Vendas por Vendedor</h4>
      <div className="stock-table-wrap">
        <table className="rma-table">
          <thead><tr><th>Vendedor / Técnico</th><th>Função</th><th>Total Vendido</th><th>Comissão</th></tr></thead>
          <tbody>
            {salespeopleWithSales.length === 0 ? (
              <tr><td colSpan={4} className="empty-row">Nenhum vendedor com vendas registradas.</td></tr>
            ) : (
              salespeopleWithSales.map((sp) => (
                <tr key={sp.id}>
                  <td><strong>{sp.name}</strong></td>
                  <td>{roleLabels[sp.role] ?? sp.role}</td>
                  <td>{money.format(bySalesperson[sp.id] ?? 0)}</td>
                  <td>{money.format(commissionBySalesperson[sp.id] ?? 0)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="ranking-grid">
        <div>
          <h4 className="report-section-title"><Trophy size={16} /> Top 5 Produtos</h4>
          <div className="ranking-list">
            {top5Products.length === 0 ? (
              <div className="empty-row" style={{ border: 'none' }}>Sem dados de produtos.</div>
            ) : (
              top5Products.map(([pid, data], i) => {
                const p = products.find((x) => x.id === pid);
                const icon = i === 0 ? <Crown size={16} /> : i === 1 ? <Medal size={16} /> : i === 2 ? <Medal size={16} /> : null;
                return (
                  <div key={pid} className="ranking-item">
                    <span className="ranking-pos">{icon ?? <span className="ranking-num">{i + 1}</span>}</span>
                    <div className="ranking-info">
                      <strong>{p?.name ?? '—'}</strong>
                      <small>{data.qty} un. • {money.format(data.revenue)}</small>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div>
          <h4 className="report-section-title"><Trophy size={16} /> Top 5 Serviços</h4>
          <div className="ranking-list">
            {top5Services.length === 0 ? (
              <div className="empty-row" style={{ border: 'none' }}>Sem dados de serviços.</div>
            ) : (
              top5Services.map(([sid, data], i) => {
                const p = products.find((x) => x.id === sid);
                const icon = i === 0 ? <Crown size={16} /> : i === 1 ? <Medal size={16} /> : i === 2 ? <Medal size={16} /> : null;
                return (
                  <div key={sid} className="ranking-item">
                    <span className="ranking-pos">{icon ?? <span className="ranking-num">{i + 1}</span>}</span>
                    <div className="ranking-info">
                      <strong>{p?.name ?? '—'}</strong>
                      <small>{data.qty} un. • {money.format(data.revenue)}</small>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FinancialReport({ sales }: { sales: PartnerSale[] }) {
  const now = new Date();
  const thisMonth = sales.filter((s) => new Date(s.created_at).getMonth() === now.getMonth() && new Date(s.created_at).getFullYear() === now.getFullYear());
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1);
  const lastMonth = sales.filter((s) => new Date(s.created_at).getMonth() === lastMonthDate.getMonth() && new Date(s.created_at).getFullYear() === lastMonthDate.getFullYear());

  const thisTotal = thisMonth.reduce((s, x) => s + x.total, 0);
  const lastTotal = lastMonth.reduce((s, x) => s + x.total, 0);
  const growth = lastTotal > 0 ? ((thisTotal - lastTotal) / lastTotal) * 100 : 0;

  const byPayment = useMemo(() => {
    const map: Record<string, number> = {};
    for (const sale of sales) {
      const m = sale.payment_method ?? 'outros';
      map[m] = (map[m] ?? 0) + sale.total;
    }
    return map;
  }, [sales]);

  const monthlyData = useMemo(() => {
    const months: { label: string; total: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i);
      const monthSales = sales.filter((s) => new Date(s.created_at).getMonth() === d.getMonth() && new Date(s.created_at).getFullYear() === d.getFullYear());
      months.push({ label: d.toLocaleDateString('pt-BR', { month: 'short' }), total: monthSales.reduce((sum, x) => sum + x.total, 0) });
    }
    return months;
  }, [sales]);

  const maxMonthly = Math.max(...monthlyData.map((m) => m.total), 1);

  const paymentTypes: { key: string; label: string; icon: typeof CreditCard; color: string }[] = [
    { key: 'pix', label: 'PIX', icon: CreditCard, color: '#5bbc87' },
    { key: 'credito', label: 'Cartão de Crédito', icon: CreditCard, color: '#55adf1' },
    { key: 'debito', label: 'Cartão de Débito', icon: CreditCard, color: '#e6a06d' },
    { key: 'dinheiro', label: 'Dinheiro', icon: Banknote, color: '#5fd0d1' },
    { key: 'faturado', label: 'Crédito/B2B (Faturado)', icon: Wallet, color: '#a78bfa' },
    { key: 'outros', label: 'Outros', icon: DollarSign, color: '#97aabc' },
  ];

  const totalRevenue = sales.reduce((s, x) => s + x.total, 0);

  return (
    <div>
      <div className="report-cards">
        <div className="report-card">
          <small>Mês Atual</small>
          <strong>{money.format(thisTotal)}</strong>
        </div>
        <div className="report-card">
          <small>Mês Anterior</small>
          <strong>{money.format(lastTotal)}</strong>
        </div>
        <div className="report-card">
          <small>Comparativo</small>
          <strong className={growth >= 0 ? 'text-green' : 'text-red'}>
            {growth >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            {growth >= 0 ? '+' : ''}{growth.toFixed(1)}%
          </strong>
        </div>
      </div>

      <h4 className="report-section-title">Visão Anual (12 meses)</h4>
      <div className="bar-chart">
        {monthlyData.map((m, i) => (
          <div key={i} className="bar-col">
            <div className="bar-fill" style={{ height: `${(m.total / maxMonthly) * 100}%` }} />
            <small>{m.label}</small>
          </div>
        ))}
      </div>

      <h4 className="report-section-title">Tipos de Pagamento (Breakdown)</h4>
      <div className="payment-breakdown-grid">
        {paymentTypes.map(({ key, label, icon: Icon, color }) => {
          const total = byPayment[key] ?? 0;
          const pct = totalRevenue > 0 ? (total / totalRevenue) * 100 : 0;
          return (
            <div key={key} className="payment-breakdown-card">
              <div className="payment-breakdown-icon" style={{ color, background: `${color}1f` }}>
                <Icon size={20} />
              </div>
              <div className="payment-breakdown-info">
                <small>{label}</small>
                <strong>{money.format(total)}</strong>
                <div className="payment-breakdown-bar">
                  <div className="payment-breakdown-fill" style={{ width: `${pct}%`, background: color }} />
                </div>
                <small>{pct.toFixed(1)}% do total</small>
              </div>
            </div>
          );
        })}
      </div>

      <h4 className="report-section-title">DRE Simplificado</h4>
      <div className="stock-table-wrap">
        <table className="rma-table">
          <thead><tr><th>Item</th><th>Valor</th></tr></thead>
          <tbody>
            <tr><td>Receita Bruta</td><td>{money.format(totalRevenue)}</td></tr>
            <tr><td>Custo dos Produtos</td><td>—</td></tr>
            <tr><td>Receita Líquida</td><td>{money.format(totalRevenue)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StockReport({ products, sales }: { products: PartnerProduct[]; sales: PartnerSale[] }) {
  const totalInvested = products.reduce((s, p) => s + p.cost_price * p.stock, 0);
  const slowMovers = products.filter((p) => !sales.some((s) => s.items.some((i) => i.product_id === p.id)));

  const topByQty = useMemo(() => {
    const map: Record<string, number> = {};
    for (const sale of sales) {
      for (const item of sale.items) {
        map[item.product_id] = (map[item.product_id] ?? 0) + item.quantity;
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [sales]);

  const topByMargin = useMemo(() => {
    return products
      .map((p) => ({ product: p, margin: p.sale_price > 0 ? ((p.sale_price - p.cost_price) / p.sale_price) * 100 : 0 }))
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 5);
  }, [products]);

  return (
    <div>
      <div className="report-cards">
        <div className="report-card">
          <small>Valor Total Investido</small>
          <strong>{money.format(totalInvested)}</strong>
        </div>
        <div className="report-card">
          <small>Produtos Parados</small>
          <strong>{slowMovers.length}</strong>
          <small>sem movimentação</small>
        </div>
      </div>

      <h4 className="report-section-title"><Trophy size={16} /> Top 5 Produtos Mais Vendidos (Quantidade)</h4>
      <div className="ranking-list">
        {topByQty.length === 0 ? (
          <div className="empty-row" style={{ border: 'none' }}>Sem vendas registradas.</div>
        ) : (
          topByQty.map(([pid, qty], i) => {
            const p = products.find((x) => x.id === pid);
            const icon = i === 0 ? <Crown size={16} /> : i === 1 ? <Medal size={16} /> : i === 2 ? <Medal size={16} /> : null;
            return (
              <div key={pid} className="ranking-item">
                <span className="ranking-pos">{icon ?? <span className="ranking-num">{i + 1}</span>}</span>
                <div className="ranking-info">
                  <strong>{p?.name ?? '—'}</strong>
                  <small>{qty} unidades vendidas</small>
                </div>
              </div>
            );
          })
        )}
      </div>

      <h4 className="report-section-title">Top 5 Produtos por Margem %</h4>
      <div className="stock-table-wrap">
        <table className="rma-table">
          <thead><tr><th>Produto</th><th>Margem</th><th>Custo</th><th>Venda</th></tr></thead>
          <tbody>
            {topByMargin.map(({ product, margin }) => (
              <tr key={product.id}>
                <td><strong>{product.name}</strong></td>
                <td>{margin.toFixed(1)}%</td>
                <td>{money.format(product.cost_price)}</td>
                <td>{money.format(product.sale_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CrmReport({ customers, sales }: { customers: PartnerCustomer[]; sales: PartnerSale[] }) {
  const now = new Date();
  const currentMonth = now.getMonth();

  const topCustomers = useMemo(() => {
    const map: Record<string, number> = {};
    for (const sale of sales) {
      if (sale.customer_id) {
        map[sale.customer_id] = (map[sale.customer_id] ?? 0) + sale.total;
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [sales]);

  const birthdays = customers.filter((c) => {
    if (!c.birthday) return false;
    return new Date(c.birthday).getMonth() === currentMonth;
  });

  function sendBirthdayWhatsApp(phone: string | null, name: string) {
    if (!phone) return;
    const digits = phone.replace(/\D/g, '');
    const msg = `Olá ${name}! Parabéns pelo seu aniversário! 🎉 Aproveite um cupom especial de desconto na sua próxima visita!`;
    window.open(`https://wa.me/55${digits}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div>
      <h4 className="report-section-title"><Trophy size={16} /> Top 5 Clientes</h4>
      <div className="ranking-list">
        {topCustomers.length === 0 ? (
          <div className="empty-row" style={{ border: 'none' }}>Sem dados de clientes.</div>
        ) : (
          topCustomers.map(([cid, total], i) => {
            const c = customers.find((x) => x.id === cid);
            const icon = i === 0 ? <Crown size={16} /> : i === 1 ? <Medal size={16} /> : i === 2 ? <Medal size={16} /> : null;
            return (
              <div key={cid} className="ranking-item">
                <span className="ranking-pos">{icon ?? <span className="ranking-num">{i + 1}</span>}</span>
                <div className="ranking-info">
                  <strong>{c?.name ?? '—'}</strong>
                  <small>{money.format(total)} em compras</small>
                </div>
              </div>
            );
          })
        )}
      </div>

      <h4 className="report-section-title"><Cake size={16} /> Aniversariantes do Mês</h4>
      <div className="stock-table-wrap">
        <table className="rma-table">
          <thead><tr><th>Cliente</th><th>WhatsApp</th><th>Aniversário</th><th></th></tr></thead>
          <tbody>
            {birthdays.length === 0 ? (
              <tr><td colSpan={4} className="empty-row">Nenhum aniversariante este mês.</td></tr>
            ) : (
              birthdays.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.phone ?? '—'}</td>
                  <td>{c.birthday ? new Date(c.birthday).toLocaleDateString('pt-BR') : '—'}</td>
                  <td>
                    <button
                      className="rma-advance-btn whatsapp-btn"
                      onClick={() => sendBirthdayWhatsApp(c.phone, c.name)}
                      disabled={!c.phone}
                    >
                      <MessageCircle size={14} /> Enviar Mensagem no WhatsApp
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
