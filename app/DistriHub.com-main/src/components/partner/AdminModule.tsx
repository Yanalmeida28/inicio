import { Component, useMemo, useState, type ReactNode } from 'react';
import {
  Shield, BarChart3, Users, ScrollText, TrendingUp, TrendingDown,
  DollarSign, Wallet, Percent, Eye, EyeOff, Save, Check, AlertCircle,
  ChevronDown, ChevronRight, Boxes, FileText, Settings, Package,
  ShoppingCart, CreditCard, Smartphone, Receipt, Monitor, Lock,
  Database, Building2, Download, Calendar, UserCheck,
  PieChart, LineChart as LineChartIcon, Filter, MapPin,
} from 'lucide-react';
import { money } from '../../utils';
import { ReportsModule } from './ReportsModule';
import type {
  PartnerSale, PartnerProduct, PartnerSalesperson, SalespersonRole,
  PartnerBranch, PartnerCustomer, PartnerSupplier, PartnerCategory,
  AuditLog, PermissionOverride, SaleItem,
} from '../../types';

function safeItems(sale: PartnerSale): SaleItem[] {
  return Array.isArray(sale.items) ? sale.items : [];
}

const DEFAULT_METRICS = { grossRevenue: 0, totalCost: 0, netRevenue: 0, profitMargin: 0, averageTicket: 0, count: 0 };

class AdminErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="admin-error-fallback">
          <AlertCircle size={32} />
          <h3>Erro ao carregar o Painel Administrativo</h3>
          <p>Ocorreu um problema ao renderizar este módulo. Tente recarregar a página.</p>
          <small>{this.state.error?.message}</small>
        </div>
      );
    }
    return this.props.children;
  }
}

type Props = {
  sales: PartnerSale[];
  products: PartnerProduct[];
  salespeople: PartnerSalesperson[];
  branches?: PartnerBranch[];
  customers?: PartnerCustomer[];
  suppliers?: PartnerSupplier[];
  categories?: PartnerCategory[];
  selectedBranchId?: string;
  onSelectBranch?: (id: string) => void;
  onNavigate?: (tab: string) => void;
};

type AdminSection = 'dashboard' | 'cadastros' | 'relatorios' | 'fiscal' | 'financeiro' | 'configuracoes';
type AdminTab = 'dashboard' | 'cadastros' | 'relatorios' | 'fiscal' | 'financeiro' | 'permissoes' | 'auditoria' | 'dispositivos' | 'senha-liberacao' | 'gestao-dados' | 'configuracoes';
type AdminPage = AdminTab;

type TimePeriod = 'hoje' | '7dias' | '30dias' | 'mes' | 'custom';

const roleLabels: Record<SalespersonRole, string> = {
  administrador: 'Administrador / Proprietário',
  gerente: 'Gerente',
  caixa: 'Caixa',
  vendedor: 'Vendedor / Balcão',
  tecnico: 'Técnico',
  atendente: 'Atendente',
  logistica: 'Logística / Entregador',
};

const sidebarSections: {
  id: AdminSection;
  label: string;
  icon: typeof Shield;
  items: { id: string; label: string; tab?: string; page?: AdminPage }[];
}[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: BarChart3,
    items: [{ id: 'visao-geral', label: 'Visão Geral Executiva', page: 'dashboard' }],
  },
  {
    id: 'cadastros',
    label: 'Cadastros',
    icon: Boxes,
    items: [
      { id: 'produtos', label: 'Produtos', tab: 'cadastros' },
      { id: 'servicos', label: 'Serviços', tab: 'cadastros' },
      { id: 'combos', label: 'Combo de Produtos', tab: 'cadastros' },
      { id: 'importar', label: 'Importar produtos (XLS/XML)', tab: 'cadastros' },
      { id: 'fornecedores', label: 'Fornecedores', tab: 'cadastros' },
      { id: 'estoque', label: 'Edição/Ajuste de Estoque', tab: 'cadastros' },
      { id: 'vendedores', label: 'Vendedores', tab: 'cadastros' },
      { id: 'clientes', label: 'Clientes', tab: 'cadastros' },
    ],
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    icon: BarChart3,
    items: [{ id: 'vendas', label: 'Relatório detalhado de Vendas', tab: 'relatorios' }],
  },
  {
    id: 'fiscal',
    label: 'Área Fiscal',
    icon: FileText,
    items: [
      { id: 'emitir', label: 'Ativar/Emitir NFe e NFC-e', tab: 'fiscal' },
      { id: 'regras', label: 'Regras Tributárias', tab: 'fiscal' },
      { id: 'historico-notas', label: 'Histórico de Notas Emitidas', tab: 'fiscal' },
      { id: 'inutilizacao', label: 'Inutilização de Notas', tab: 'fiscal' },
    ],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    icon: Wallet,
    items: [
      { id: 'pagar', label: 'Contas a Pagar', tab: 'financeiro' },
      { id: 'receber', label: 'Contas a Receber', tab: 'financeiro' },
      { id: 'cliente-fiado', label: 'Contas de Cliente (Fiado/Crediário)', tab: 'financeiro' },
      { id: 'fluxo', label: 'Fluxo Financeiro', tab: 'financeiro' },
      { id: 'pix', label: 'Área PIX', tab: 'financeiro' },
      { id: 'taxas', label: 'Taxas de Máquina/Adquirentes', tab: 'financeiro' },
    ],
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    icon: Settings,
    items: [
      { id: 'dados-negocio', label: 'Dados do Negócio', tab: 'configuracoes' },
      { id: 'gestao-dados', label: 'Gestão de Dados (Backup/Exportar)', page: 'gestao-dados' },
      { id: 'usuarios', label: 'Usuários & Permissões', page: 'permissoes' },
      { id: 'dispositivos', label: 'Dispositivos/Terminais', page: 'dispositivos' },
      { id: 'senha-liberacao', label: 'Senha para Liberação de Venda', page: 'senha-liberacao' },
    ],
  },
];

export function AdminModule({
  sales = [], products = [], salespeople = [], branches = [], customers = [], suppliers = [], categories = [],
  selectedBranchId = '', onSelectBranch, onNavigate,
}: Props) {
  return (
    <AdminErrorBoundary>
      <AdminModuleInner
        sales={sales}
        products={products}
        salespeople={salespeople}
        branches={branches}
        customers={customers}
        suppliers={suppliers}
        categories={categories}
        selectedBranchId={selectedBranchId}
        onSelectBranch={onSelectBranch}
        onNavigate={onNavigate}
      />
    </AdminErrorBoundary>
  );
}

function AdminModuleInner({
  sales, products, salespeople, branches = [], customers = [], suppliers = [], categories = [],
  selectedBranchId = '', onSelectBranch, onNavigate,
}: Props) {
  const [expandedSection, setExpandedSection] = useState<AdminSection>('dashboard');
  const [activeAdminTab, setActiveAdminTab] = useState<AdminTab>('dashboard');
  const [activeItemId, setActiveItemId] = useState('visao-geral');
  const [branchFilter, setBranchFilter] = useState(selectedBranchId);

  function handleBranchChange(id: string) {
    setBranchFilter(id);
    if (onSelectBranch) onSelectBranch(id);
  }

  function handleItemClick(item: { id: string; label: string; tab?: string; page?: AdminPage }) {
    setActiveItemId(item.id);
    if (item.tab) {
      setActiveAdminTab(item.tab as AdminTab);
    } else if (item.page) {
      setActiveAdminTab(item.page as AdminTab);
    }
  }

  function toggleSection(section: AdminSection) {
    setExpandedSection((prev) => (prev === section ? prev : section));
  }

  return (
    <div className="panel-module admin-module-layout">
      <div className="module-header">
        <span className="module-icon"><Shield size={20} /></span>
        <div>
          <h3>Painel Administrativo</h3>
          <p>Dashboard executivo, cadastros, fiscal, financeiro e configurações do sistema</p>
        </div>
      </div>

      <div className="admin-sidebar-content-wrapper">
        <aside className="admin-collapsible-sidebar">
          {sidebarSections.map((section) => {
            const isExpanded = expandedSection === section.id;
            const SectionIcon = section.icon;
            return (
              <div key={section.id} className="admin-sidebar-section">
                <button
                  className={`admin-sidebar-section-header ${isExpanded ? 'expanded' : ''}`}
                  onClick={() => toggleSection(section.id)}
                >
                  <span className="admin-sidebar-section-title">
                    <SectionIcon size={16} /> {section.label}
                  </span>
                  {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
                {isExpanded && (
                  <div className="admin-sidebar-items">
                    {section.items.map((item) => (
                      <button
                        key={item.id}
                        className={`admin-sidebar-item ${activeItemId === item.id ? 'active' : ''}`}
                        onClick={() => handleItemClick(item)}
                      >
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </aside>

        <div className="admin-content-area">
          {activeAdminTab === 'dashboard' && (
            <ExecutiveDashboard
              sales={sales}
              products={products}
              salespeople={salespeople}
              customers={customers}
              branches={branches}
              branchFilter={branchFilter}
              onBranchChange={handleBranchChange}
            />
          )}
          {activeAdminTab === 'relatorios' && (
            <ReportsModule
              sales={sales}
              products={products}
              customers={customers}
              salespeople={salespeople}
            />
          )}
          {activeAdminTab === 'financeiro' && (
            <AdminFinancialSummary
              sales={sales}
              products={products}
              branches={branches}
              branchFilter={branchFilter}
              onBranchChange={handleBranchChange}
            />
          )}
          {activeAdminTab === 'fiscal' && (
            <InlineFiscalView sales={sales} products={products} />
          )}
          {activeAdminTab === 'cadastros' && (
            <InlineCadastrosView
              products={products}
              customers={customers}
              suppliers={suppliers}
              salespeople={salespeople}
              categories={categories}
            />
          )}
          {activeAdminTab === 'permissoes' && <PermissionsControl salespeople={salespeople} />}
          {activeAdminTab === 'auditoria' && <AuditTrail sales={sales} salespeople={salespeople} />}
          {activeAdminTab === 'dispositivos' && <DevicesTerminals />}
          {activeAdminTab === 'senha-liberacao' && <SaleReleasePassword />}
          {activeAdminTab === 'gestao-dados' && <DataManagement />}
          {activeAdminTab === 'configuracoes' && (
            <div className="admin-inline-placeholder">
              <Settings size={32} />
              <h4>Configurações do Sistema</h4>
              <p>As configurações detalhadas estão disponíveis no módulo dedicado de Configurações.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============ Date Range Helpers ============ */

function getPeriodRange(period: TimePeriod, customStart?: string, customEnd?: string): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let start: Date, end: Date;
  switch (period) {
    case 'hoje':
      start = today;
      end = new Date(today.getTime() + 86400000);
      break;
    case '7dias':
      end = new Date(today.getTime() + 86400000);
      start = new Date(today.getTime() - 6 * 86400000);
      break;
    case '30dias':
      end = new Date(today.getTime() + 86400000);
      start = new Date(today.getTime() - 29 * 86400000);
      break;
    case 'mes':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      break;
    case 'custom':
      start = customStart ? new Date(customStart) : new Date(today.getTime() - 30 * 86400000);
      end = customEnd ? new Date(customEnd + 'T23:59:59') : new Date(today.getTime() + 86400000);
      break;
  }

  const duration = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime());
  const prevStart = new Date(start.getTime() - duration);

  return { start, end, prevStart, prevEnd };
}

function growthPct(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? null : 0;
  return ((current - previous) / previous) * 100;
}

function GrowthBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="growth-badge neutral">Novo</span>;
  const isPositive = pct >= 0;
  return (
    <span className={`growth-badge ${isPositive ? 'positive' : 'negative'}`}>
      {isPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {isPositive ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

/* ============ Executive Dashboard ============ */

function ExecutiveDashboard({
  sales, products, salespeople = [], customers, branches, branchFilter, onBranchChange,
}: {
  sales: PartnerSale[];
  products: PartnerProduct[];
  salespeople: PartnerSalesperson[];
  customers: PartnerCustomer[];
  branches: PartnerBranch[];
  branchFilter: string;
  onBranchChange: (id: string) => void;
}) {
  const [period, setPeriod] = useState<TimePeriod>('30dias');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const range = useMemo(() => getPeriodRange(period, customStart, customEnd), [period, customStart, customEnd]);

  const branchFilteredSales = useMemo(() => {
    const completed = sales.filter((s) => s.status === 'concluida');
    if (!branchFilter) return completed;
    return completed.filter((s) => !s.branch_id || s.branch_id === branchFilter);
  }, [sales, branchFilter]);

  const currentSales = useMemo(() => {
    return branchFilteredSales.filter((s) => {
      const d = new Date(s.created_at);
      return d >= range.start && d < range.end;
    });
  }, [branchFilteredSales, range]);

  const previousSales = useMemo(() => {
    return branchFilteredSales.filter((s) => {
      const d = new Date(s.created_at);
      return d >= range.prevStart && d < range.prevEnd;
    });
  }, [branchFilteredSales, range]);

  const productCostMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of products) map[p.id] = p.cost_price;
    return map;
  }, [products]);

  function computeMetrics(salesList: PartnerSale[]) {
    const grossRevenue = salesList.reduce((s, x) => s + (x.total ?? 0), 0);
    let totalCost = 0;
    for (const sale of salesList) {
      for (const item of safeItems(sale)) {
        totalCost += (productCostMap[item.product_id] ?? 0) * item.quantity;
      }
    }
    const netRevenue = grossRevenue - totalCost;
    const profitMargin = grossRevenue > 0 ? (netRevenue / grossRevenue) * 100 : 0;
    const averageTicket = salesList.length > 0 ? grossRevenue / salesList.length : 0;
    return { grossRevenue, totalCost, netRevenue, profitMargin, averageTicket, count: salesList.length };
  }

  const current = useMemo(() => computeMetrics(currentSales), [currentSales, productCostMap]);
  const previous = useMemo(() => computeMetrics(previousSales), [previousSales, productCostMap]);

  const revenueGrowth = growthPct(current.grossRevenue, previous.grossRevenue);
  const costGrowth = growthPct(current.totalCost, previous.totalCost);
  const profitGrowth = growthPct(current.netRevenue, previous.netRevenue);
  const marginGrowth = growthPct(current.profitMargin, previous.profitMargin);
  const ticketGrowth = growthPct(current.averageTicket, previous.averageTicket);

  // Daily revenue line chart data
  const dailyData = useMemo(() => {
    const days: { date: Date; gross: number; net: number }[] = [];
    const dayCount = Math.min(Math.ceil((range.end.getTime() - range.start.getTime()) / 86400000), 90);
    for (let i = 0; i < dayCount; i++) {
      const dayStart = new Date(range.start.getTime() + i * 86400000);
      const dayEnd = new Date(dayStart.getTime() + 86400000);
      const daySales = currentSales.filter((s) => {
        const d = new Date(s.created_at);
        return d >= dayStart && d < dayEnd;
      });
      const gross = daySales.reduce((s, x) => s + (x.total ?? 0), 0);
      let cost = 0;
      for (const sale of daySales) {
        for (const item of safeItems(sale)) {
          cost += (productCostMap[item.product_id] ?? 0) * item.quantity;
        }
      }
      days.push({ date: dayStart, gross, net: gross - cost });
    }
    return days;
  }, [currentSales, range, productCostMap]);

  // Profit by category
  const profitByCategory = useMemo(() => {
    const map: Record<string, { name: string; revenue: number; cost: number; profit: number }> = {};
    for (const sale of currentSales) {
      for (const item of safeItems(sale)) {
        const product = products.find((p) => p.id === item.product_id);
        const catName = product?.category ?? 'Sem categoria';
        if (!map[catName]) map[catName] = { name: catName, revenue: 0, cost: 0, profit: 0 };
        const rev = item.unit_price * item.quantity;
        const cost = (productCostMap[item.product_id] ?? 0) * item.quantity;
        map[catName].revenue += rev;
        map[catName].cost += cost;
        map[catName].profit += rev - cost;
      }
    }
    return Object.values(map).sort((a, b) => b.profit - a.profit).slice(0, 8);
  }, [currentSales, products, productCostMap]);

  // Top SKUs
  const topSkus = useMemo(() => {
    const map: Record<string, { name: string; sku: string | null; quantity: number; revenue: number }> = {};
    for (const sale of currentSales) {
      for (const item of safeItems(sale)) {
        const product = products.find((p) => p.id === item.product_id);
        if (!map[item.product_id]) {
          map[item.product_id] = { name: item.name, sku: product?.sku ?? null, quantity: 0, revenue: 0 };
        }
        map[item.product_id].quantity += item.quantity;
        map[item.product_id].revenue += item.unit_price * item.quantity;
      }
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [currentSales, products]);

  // Payment distribution
  const paymentDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    for (const sale of currentSales) {
      const method = sale.payment_method ?? 'Não informado';
      map[method] = (map[method] ?? 0) + (sale.total ?? 0);
    }
    const total = Object.values(map).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(map)
      .map(([method, amount]) => ({ method, amount, percentage: (amount / total) * 100 }))
      .sort((a, b) => b.amount - a.amount);
  }, [currentSales]);

  const paymentColors = ['#3b9bed', '#5bbc87', '#e6a06d', '#a78bfa', '#e3829b', '#5cb5f1'];
  const paymentIcons: Record<string, typeof CreditCard> = {
    pix: Smartphone, cartao: CreditCard, boleto: Receipt, faturado: Wallet,
  };

  // CRM metrics
  const crmMetrics = useMemo(() => {
    const customerRevenue: Record<string, { name: string; total: number; count: number; lastPurchase: Date }> = {};
    for (const sale of currentSales) {
      const key = sale.customer_id ?? sale.customer_name ?? 'Consumidor';
      const name = sale.customer_name ?? 'Consumidor';
      if (!customerRevenue[key]) customerRevenue[key] = { name, total: 0, count: 0, lastPurchase: new Date(0) };
      customerRevenue[key].total += (sale.total ?? 0);
      customerRevenue[key].count += 1;
      const d = new Date(sale.created_at);
      if (d > customerRevenue[key].lastPurchase) customerRevenue[key].lastPurchase = d;
    }

    const sorted = Object.values(customerRevenue).sort((a, b) => b.total - a.total);
    const topCustomers = sorted.slice(0, 5);
    const avgLtv = sorted.length > 0 ? sorted.reduce((s, c) => s + c.total, 0) / sorted.length : 0;

    const now = new Date();
    const inactiveCustomers = customers.filter((c) => {
      const key = c.id;
      const data = customerRevenue[key];
      if (!data) return true;
      const daysSince = (now.getTime() - data.lastPurchase.getTime()) / 86400000;
      return daysSince > 30;
    });

    return { topCustomers, avgLtv, inactiveCount: inactiveCustomers.length, totalActive: sorted.length };
  }, [currentSales, customers]);

  // Seller performance
  const sellerPerf = useMemo(() => {
    const map: Record<string, { name: string; revenue: number; count: number }> = {};
    for (const sale of currentSales) {
      const sp = salespeople.find((s) => s.id === sale.salesperson_id);
      const key = sale.salesperson_id ?? 'none';
      const name = sp?.name ?? 'Sem vendedor';
      if (!map[key]) map[key] = { name, revenue: 0, count: 0 };
      map[key].revenue += (sale.total ?? 0);
      map[key].count += 1;
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [currentSales, salespeople]);

  function exportCSV() {
    const headers = ['Data', 'Cliente', 'Total', 'Custo', 'Lucro', 'Pagamento', 'Vendedor'];
    const rows = currentSales.map((s) => {
      const sp = salespeople.find((p) => p.id === s.salesperson_id);
      let cost = 0;
      for (const item of safeItems(s)) cost += (productCostMap[item.product_id] ?? 0) * item.quantity;
      return [
        new Date(s.created_at).toLocaleString('pt-BR'),
        s.customer_name ?? '—',
        (s.total ?? 0).toFixed(2),
        cost.toFixed(2),
        (s.total - cost).toFixed(2),
        s.payment_method ?? '—',
        sp?.name ?? '—',
      ].join(';');
    });
    const csv = [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-vendas-${period}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    const win = window.open('', '_blank');
    if (!win) return;
    const html = `
      <html><head><title>Relatório Executivo DistriHub</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;color:#1a2b3c}h1{color:#3b9bed}
      table{width:100%;border-collapse:collapse;margin:20px 0}td,th{border:1px solid #ddd;padding:8px;text-align:left}
      th{background:#f0f5f9}.kpi{display:inline-block;margin:10px 20px 10px 0;padding:15px;border:1px solid #ddd;border-radius:8px}
      .kpi strong{font-size:24px;display:block}.kpi small{color:#888}</style></head>
      <body><h1>Relatório Executivo — DistriHub</h1>
      <p>Período: ${range.start.toLocaleDateString('pt-BR')} a ${range.prevEnd.toLocaleDateString('pt-BR')}</p>
      <div>
        <div class="kpi"><small>Receita Bruta</small><strong>${money.format(current.grossRevenue)}</strong></div>
        <div class="kpi"><small>Custo dos Produtos</small><strong>${money.format(current.totalCost)}</strong></div>
        <div class="kpi"><small>Lucro Líquido</small><strong>${money.format(current.netRevenue)}</strong></div>
        <div class="kpi"><small>Margem</small><strong>${current.profitMargin.toFixed(1)}%</strong></div>
        <div class="kpi"><small>Ticket Médio</small><strong>${money.format(current.averageTicket)}</strong></div>
        <div class="kpi"><small>Vendas</small><strong>${current.count}</strong></div>
      </div>
      <h2>Top SKUs</h2><table><tr><th>Produto</th><th>SKU</th><th>Qtd</th><th>Receita</th></tr>
      ${topSkus.map((s) => `<tr><td>${s.name}</td><td>${s.sku ?? '—'}</td><td>${s.quantity}</td><td>${money.format(s.revenue)}</td></tr>`).join('')}
      </table>
      <h2>Lucro por Categoria</h2><table><tr><th>Categoria</th><th>Receita</th><th>Lucro</th></tr>
      ${profitByCategory.map((c) => `<tr><td>${c.name}</td><td>${money.format(c.revenue)}</td><td>${money.format(c.profit)}</td></tr>`).join('')}
      </table>
      <p style="margin-top:40px;color:#888">Gerado em ${new Date().toLocaleString('pt-BR')}</p>
      </body></html>`;
    win.document.write(html);
    win.document.close();
    win.print();
  }

  const periodLabels: Record<TimePeriod, string> = {
    hoje: 'Hoje', '7dias': '7 dias', '30dias': '30 dias', mes: 'Mês Atual', custom: 'Personalizado',
  };

  return (
    <div>
      {/* Filter Bar */}
      <div className="admin-filter-bar">
        <div className="admin-period-filters">
          <Calendar size={15} />
          {(['hoje', '7dias', '30dias', 'mes', 'custom'] as TimePeriod[]).map((p) => (
            <button
              key={p}
              className={`period-pill ${period === p ? 'active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
        <div className="admin-filter-right">
          {branches.length > 0 && (
            <div className="admin-branch-selector">
              <MapPin size={14} />
              <select value={branchFilter} onChange={(e) => onBranchChange(e.target.value)}>
                <option value="">Visão Consolidada</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
          {period === 'custom' && (
            <>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="admin-date-input" />
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="admin-date-input" />
            </>
          )}
          <button className="admin-export-btn" onClick={exportPDF}>
            <FileText size={14} /> PDF
          </button>
          <button className="admin-export-btn" onClick={exportCSV}>
            <Download size={14} /> Excel
          </button>
        </div>
      </div>

      {/* Executive KPI Cards */}
      <div className="report-cards admin-kpi-grid">
        <div className="report-card admin-kpi-card">
          <small><DollarSign size={13} /> Receita Bruta</small>
          <strong>{money.format(current.grossRevenue)}</strong>
          <div className="kpi-footer">
            <GrowthBadge pct={revenueGrowth} />
            <small>{current.count} vendas</small>
          </div>
        </div>
        <div className="report-card admin-kpi-card">
          <small><Wallet size={13} /> Custo dos Produtos</small>
          <strong className="text-red">{money.format(current.totalCost)}</strong>
          <div className="kpi-footer">
            <GrowthBadge pct={costGrowth} />
            <small>CMV no período</small>
          </div>
        </div>
        <div className="report-card admin-kpi-card">
          <small><TrendingUp size={13} /> Lucro Líquido</small>
          <strong className="text-green">{money.format(current.netRevenue)}</strong>
          <div className="kpi-footer">
            <GrowthBadge pct={profitGrowth} />
            <small>após custo</small>
          </div>
        </div>
        <div className="report-card admin-kpi-card">
          <small><Percent size={13} /> Margem de Lucro</small>
          <strong className={current.profitMargin >= 30 ? 'text-green' : current.profitMargin >= 15 ? '' : 'text-red'}>
            {current.profitMargin.toFixed(1)}%
          </strong>
          <div className="kpi-footer">
            <GrowthBadge pct={marginGrowth} />
            <small>margem operacional</small>
          </div>
        </div>
        <div className="report-card admin-kpi-card">
          <small><Receipt size={13} /> Ticket Médio</small>
          <strong>{money.format(current.averageTicket)}</strong>
          <div className="kpi-footer">
            <GrowthBadge pct={ticketGrowth} />
            <small>por venda</small>
          </div>
        </div>
      </div>

      {/* Daily Revenue Line Chart */}
      <h4 className="report-section-title"><LineChartIcon size={16} /> Receita Diária (Bruta vs Líquida)</h4>
      <DailyRevenueChart data={dailyData} />

      {/* Profit by Category + Payment Donut */}
      <div className="admin-dashboard-row">
        <div className="admin-dashboard-card">
          <h4 className="report-section-title"><BarChart3 size={16} /> Lucro por Categoria</h4>
          {profitByCategory.length === 0 ? (
            <p className="admin-empty-hint">Sem dados para o período selecionado.</p>
          ) : (
            <div className="admin-bar-chart">
              {profitByCategory.map((c, i) => {
                const maxProfit = Math.max(...profitByCategory.map((x) => Math.abs(x.profit)), 1);
                const pct = (Math.abs(c.profit) / maxProfit) * 100;
                return (
                  <div key={i} className="admin-bar-row">
                    <span className="admin-bar-label">{c.name}</span>
                    <div className="admin-bar-track">
                      <div
                        className="admin-bar-fill"
                        style={{ width: `${pct}%`, background: c.profit >= 0 ? '#5bbc87' : '#e3829b' }}
                      />
                    </div>
                    <strong className="admin-bar-value">{money.format(c.profit)}</strong>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="admin-dashboard-card">
          <h4 className="report-section-title"><PieChart size={16} /> Vendas por Pagamento</h4>
          {paymentDistribution.length === 0 ? (
            <p className="admin-empty-hint">Sem dados para o período selecionado.</p>
          ) : (
            <div className="admin-donut-container">
              <PaymentDonut data={paymentDistribution} colors={paymentColors} />
              <div className="admin-donut-legend">
                {paymentDistribution.map((p, i) => {
                  const Icon = paymentIcons[p.method] ?? CreditCard;
                  return (
                    <div key={p.method} className="admin-legend-row">
                      <span className="admin-legend-dot" style={{ background: paymentColors[i % paymentColors.length] }} />
                      <Icon size={13} />
                      <span className="admin-legend-label">{p.method}</span>
                      <strong>{money.format(p.amount)}</strong>
                      <small>{p.percentage.toFixed(1)}%</small>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top SKUs + CRM */}
      <div className="admin-dashboard-row">
        <div className="admin-dashboard-card">
          <h4 className="report-section-title"><Package size={16} /> Top SKUs Mais Vendidos</h4>
          {topSkus.length === 0 ? (
            <p className="admin-empty-hint">Sem vendas no período.</p>
          ) : (
            <div className="stock-table-wrap">
              <table className="rma-table admin-top-items-table">
                <thead><tr><th>Produto</th><th>SKU</th><th>Qtd</th><th>Receita</th></tr></thead>
                <tbody>
                  {topSkus.map((item, i) => (
                    <tr key={i}>
                      <td><strong>{item.name}</strong></td>
                      <td>{item.sku ?? '—'}</td>
                      <td>{item.quantity}</td>
                      <td><strong>{money.format(item.revenue)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="admin-dashboard-card">
          <h4 className="report-section-title"><Users size={16} /> CRM — Clientes & LTV</h4>
          <div className="report-cards" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: '14px' }}>
            <div className="report-card">
              <small>LTV Médio</small>
              <strong>{money.format(crmMetrics.avgLtv)}</strong>
            </div>
            <div className="report-card">
              <small>Clientes Ativos</small>
              <strong className="text-green">{crmMetrics.totalActive}</strong>
            </div>
            <div className="report-card">
              <small>Inativos (30d+)</small>
              <strong className="text-red">{crmMetrics.inactiveCount}</strong>
            </div>
          </div>
          {crmMetrics.topCustomers.length > 0 && (
            <div className="stock-table-wrap">
              <table className="rma-table admin-top-items-table">
                <thead><tr><th>Cliente</th><th>Compras</th><th>Total</th></tr></thead>
                <tbody>
                  {crmMetrics.topCustomers.map((c, i) => (
                    <tr key={i}>
                      <td><strong>{c.name}</strong></td>
                      <td>{c.count}</td>
                      <td><strong>{money.format(c.total)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Seller Performance */}
      <h4 className="report-section-title"><TrendingUp size={16} /> Performance de Vendedores</h4>
      {sellerPerf.length === 0 ? (
        <p className="admin-empty-hint">Sem vendas registradas no período.</p>
      ) : (
        <div className="stock-table-wrap">
          <table className="rma-table">
            <thead><tr><th>Vendedor</th><th>Vendas</th><th>Receita</th><th>Ticket Médio</th><th>Participação</th></tr></thead>
            <tbody>
              {sellerPerf.map((s, i) => {
                const totalRev = sellerPerf.reduce((sum, x) => sum + x.revenue, 0) || 1;
                const share = (s.revenue / totalRev) * 100;
                return (
                  <tr key={i}>
                    <td><strong>{s.name}</strong></td>
                    <td>{s.count}</td>
                    <td><strong>{money.format(s.revenue)}</strong></td>
                    <td>{money.format(s.revenue / Math.max(s.count, 1))}</td>
                    <td>
                      <div className="admin-bar-track" style={{ maxWidth: '120px' }}>
                        <div className="admin-bar-fill" style={{ width: `${share}%`, background: '#3b9bed' }} />
                      </div>
                      <small>{share.toFixed(1)}%</small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Operational Summary */}
      <h4 className="report-section-title">Resumo Operacional</h4>
      <div className="stock-table-wrap">
        <table className="rma-table">
          <thead><tr><th>Indicador</th><th>Período Atual</th><th>Período Anterior</th><th>Variação</th></tr></thead>
          <tbody>
            <tr>
              <td>Receita Bruta</td>
              <td><strong>{money.format(current.grossRevenue)}</strong></td>
              <td>{money.format(previous.grossRevenue)}</td>
              <td>{revenueGrowth !== null ? <span className={revenueGrowth >= 0 ? 'text-green' : 'text-red'}>{revenueGrowth >= 0 ? '+' : ''}{revenueGrowth.toFixed(1)}%</span> : '—'}</td>
            </tr>
            <tr>
              <td>Custo de Mercadorias (CMV)</td>
              <td>{money.format(current.totalCost)}</td>
              <td>{money.format(previous.totalCost)}</td>
              <td>{costGrowth !== null ? <span className={costGrowth <= 0 ? 'text-green' : 'text-red'}>{costGrowth >= 0 ? '+' : ''}{costGrowth.toFixed(1)}%</span> : '—'}</td>
            </tr>
            <tr>
              <td>Lucro Bruto</td>
              <td><strong className="text-green">{money.format(current.netRevenue)}</strong></td>
              <td>{money.format(previous.netRevenue)}</td>
              <td>{profitGrowth !== null ? <span className={profitGrowth >= 0 ? 'text-green' : 'text-red'}>{profitGrowth >= 0 ? '+' : ''}{profitGrowth.toFixed(1)}%</span> : '—'}</td>
            </tr>
            <tr>
              <td>Margem de Lucro (%)</td>
              <td><strong>{current.profitMargin.toFixed(1)}%</strong></td>
              <td>{previous.profitMargin.toFixed(1)}%</td>
              <td>{marginGrowth !== null ? <span className={marginGrowth >= 0 ? 'text-green' : 'text-red'}>{marginGrowth >= 0 ? '+' : ''}{marginGrowth.toFixed(1)}pp</span> : '—'}</td>
            </tr>
            <tr>
              <td>Ticket Médio</td>
              <td><strong>{money.format(current.averageTicket)}</strong></td>
              <td>{money.format(previous.averageTicket)}</td>
              <td>{ticketGrowth !== null ? <span className={ticketGrowth >= 0 ? 'text-green' : 'text-red'}>{ticketGrowth >= 0 ? '+' : ''}{ticketGrowth.toFixed(1)}%</span> : '—'}</td>
            </tr>
            <tr>
              <td>Número de Vendas</td>
              <td><strong>{current.count}</strong></td>
              <td>{previous.count}</td>
              <td>{previous.count > 0 ? <span className={current.count >= previous.count ? 'text-green' : 'text-red'}>{current.count >= previous.count ? '+' : ''}{current.count - previous.count}</span> : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============ Daily Revenue SVG Line Chart ============ */

function DailyRevenueChart({ data }: { data: { date: Date; gross: number; net: number }[] }) {
  const width = 800;
  const height = 240;
  const padding = { top: 20, right: 20, bottom: 30, left: 70 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  if (data.length === 0 || data.every((d) => d.gross === 0 && d.net === 0)) {
    return <div className="admin-chart-empty"><LineChartIcon size={32} /><p>Sem dados de receita para o período selecionado.</p></div>;
  }

  const maxVal = Math.max(...data.map((d) => Math.max(d.gross, d.net)), 1);
  const stepX = data.length > 1 ? chartW / (data.length - 1) : chartW;

  function pointPath(values: number[]): string {
    return values.map((v, i) => {
      const x = padding.left + i * stepX;
      const y = padding.top + chartH - (v / maxVal) * chartH;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }

  function areaPath(values: number[]): string {
    const linePath = pointPath(values);
    const lastX = padding.left + (values.length - 1) * stepX;
    const baseY = padding.top + chartH;
    return `${linePath} L ${lastX.toFixed(1)} ${baseY} L ${padding.left} ${baseY} Z`;
  }

  const grossPath = pointPath(data.map((d) => d.gross));
  const netPath = pointPath(data.map((d) => d.net));
  const grossArea = areaPath(data.map((d) => d.gross));

  const yTicks = 4;
  const tickLabels: number[] = [];
  for (let i = 0; i <= yTicks; i++) tickLabels.push((maxVal / yTicks) * i);

  const xLabelInterval = Math.max(1, Math.floor(data.length / 8));

  return (
    <div className="admin-chart-container">
      <svg viewBox={`0 0 ${width} ${height}`} className="admin-line-chart" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="grossGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b9bed" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#3b9bed" stopOpacity="0" />
          </linearGradient>
        </defs>

        {tickLabels.map((t, i) => {
          const y = padding.top + chartH - (t / maxVal) * chartH;
          return (
            <g key={i}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#1d3445" strokeWidth="1" strokeDasharray="3 3" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" fill="#6e8799" fontSize="10">
                {money.format(t).replace(',00', '')}
              </text>
            </g>
          );
        })}

        <path d={grossArea} fill="url(#grossGradient)" />
        <path d={grossPath} fill="none" stroke="#3b9bed" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={netPath} fill="none" stroke="#5bbc87" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="4 3" />

        {data.map((d, i) => {
          if (i % xLabelInterval !== 0 && i !== data.length - 1) return null;
          const x = padding.left + i * stepX;
          return (
            <text key={i} x={x} y={height - 8} textAnchor="middle" fill="#6e8799" fontSize="10">
              {d.date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
            </text>
          );
        })}

        {data.map((d, i) => {
          const x = padding.left + i * stepX;
          const yGross = padding.top + chartH - (d.gross / maxVal) * chartH;
          const yNet = padding.top + chartH - (d.net / maxVal) * chartH;
          return (
            <g key={i} className="chart-tooltip-group">
              <circle cx={x} cy={yGross} r="3" fill="#3b9bed" className="chart-dot" />
              <circle cx={x} cy={yNet} r="3" fill="#5bbc87" className="chart-dot" />
              <title>{`${d.date.toLocaleDateString('pt-BR')} — Bruta: ${money.format(d.gross)} | Líquida: ${money.format(d.net)}`}</title>
            </g>
          );
        })}
      </svg>
      <div className="admin-chart-legend">
        <span><span className="legend-dot inflow" /> Receita Bruta</span>
        <span><span className="legend-dot" style={{ background: '#5bbc87' }} /> Receita Líquida</span>
      </div>
    </div>
  );
}

/* ============ Payment Donut Chart ============ */

function PaymentDonut({ data, colors }: { data: { method: string; amount: number; percentage: number }[]; colors: string[] }) {
  const size = 160;
  const radius = 60;
  const strokeWidth = 28;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const total = data.reduce((s, d) => s + d.percentage, 0) || 100;

  return (
    <div className="admin-donut-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} className="admin-donut-chart">
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#152739" strokeWidth={strokeWidth} />
        {data.map((d, i) => {
          const pct = (d.percentage / total) * 100;
          const dash = (pct / 100) * circumference;
          const seg = (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={colors[i % colors.length]}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              className="donut-seg"
            >
              <title>{`${d.method}: ${money.format(d.amount)} (${d.percentage.toFixed(1)}%)`}</title>
            </circle>
          );
          offset += dash;
          return seg;
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="#eaf1f6" fontSize="14" fontWeight="700">
          {data.length}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="#6e8799" fontSize="9">
          métodos
        </text>
      </svg>
    </div>
  );
}

/* ============ Permissions Control ============ */

function PermissionsControl({ salespeople }: { salespeople: PartnerSalesperson[] }) {
  const [overrides, setOverrides] = useState<Record<string, PermissionOverride>>({});
  const [savedId, setSavedId] = useState<string | null>(null);

  const operationalStaff = useMemo(
    () => salespeople.filter((sp) => sp.role !== 'administrador'),
    [salespeople],
  );

  function getOverride(sp: PartnerSalesperson): PermissionOverride {
    return overrides[sp.id] ?? {
      id: crypto.randomUUID(),
      user_id: sp.user_id,
      salesperson_id: sp.id,
      can_cancel_sales: sp.role === 'gerente' || sp.role === 'caixa',
      discount_override_limit: sp.role === 'gerente' ? 10 : 0,
      can_view_cost_prices: sp.role === 'gerente',
      created_at: new Date().toISOString(),
    };
  }

  function updateOverride(spId: string, field: keyof PermissionOverride, value: boolean | number) {
    setOverrides((prev) => ({
      ...prev,
      [spId]: { ...getOverride(salespeople.find((s) => s.id === spId)!), [field]: value },
    }));
  }

  function handleSave(spId: string) {
    setSavedId(spId);
    setTimeout(() => setSavedId(null), 2000);
  }

  return (
    <div>
      <div className="admin-permissions-info">
        <AlertCircle size={16} />
        <span>Controle granular de privilégios por funcionário. As permissões abaixo complementam as definições baseadas em função.</span>
      </div>

      <div className="stock-table-wrap">
        <table className="rma-table">
          <thead>
            <tr>
              <th>Funcionário</th>
              <th>Função</th>
              <th>Cancelar Vendas</th>
              <th>Limite de Desconto (%)</th>
              <th>Ver Preço de Custo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {operationalStaff.length === 0 ? (
              <tr><td colSpan={6} className="empty-row">Nenhum funcionário cadastrado.</td></tr>
            ) : (
              operationalStaff.map((sp) => {
                const ov = getOverride(sp);
                return (
                  <tr key={sp.id}>
                    <td><strong>{sp.name}</strong></td>
                    <td>
                      <span className="rma-status-badge" style={{ color: '#5cb5f1', borderColor: '#5cb5f1' }}>
                        {roleLabels[sp.role]}
                      </span>
                    </td>
                    <td>
                      <label className="admin-toggle-label">
                        <input
                          type="checkbox"
                          checked={ov.can_cancel_sales}
                          onChange={(e) => updateOverride(sp.id, 'can_cancel_sales', e.target.checked)}
                        />
                        <span>{ov.can_cancel_sales ? <Eye size={14} /> : <EyeOff size={14} />}</span>
                      </label>
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="100"
                        value={ov.discount_override_limit}
                        onChange={(e) => updateOverride(sp.id, 'discount_override_limit', Number(e.target.value))}
                        className="admin-discount-input"
                      />
                    </td>
                    <td>
                      <label className="admin-toggle-label">
                        <input
                          type="checkbox"
                          checked={ov.can_view_cost_prices}
                          onChange={(e) => updateOverride(sp.id, 'can_view_cost_prices', e.target.checked)}
                        />
                        <span>{ov.can_view_cost_prices ? <Eye size={14} /> : <EyeOff size={14} />}</span>
                      </label>
                    </td>
                    <td>
                      <button
                        className={`rma-advance-btn ${savedId === sp.id ? 'success' : ''}`}
                        onClick={() => handleSave(sp.id)}
                      >
                        {savedId === sp.id ? <><Check size={14} /> Salvo!</> : <><Save size={14} /> Salvar</>}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============ Audit Trail ============ */

function AuditTrail({ sales, salespeople }: { sales: PartnerSale[]; salespeople: PartnerSalesperson[] }) {
  const [filter, setFilter] = useState('all');

  const auditLogs = useMemo<AuditLog[]>(() => {
    const logs: AuditLog[] = [];

    for (const sale of sales) {
      const sp = salespeople.find((s) => s.id === sale.salesperson_id);
      const actorName = sp?.name ?? 'Sistema';
      const actorRole = sp?.role ?? 'sistema';

      if (sale.status === 'cancelada') {
        logs.push({
          id: `cancel-${sale.id}`,
          user_id: sale.user_id,
          actor_name: actorName,
          actor_role: actorRole,
          action: 'Venda Cancelada',
          entity_type: 'venda',
          entity_id: sale.id,
          details: `Pedido #${sale.id.slice(0, 8).toUpperCase()} cancelado — Cliente: ${sale.customer_name ?? '—'} — Total: ${money.format(sale.total)}`,
          created_at: sale.created_at,
        });
      }

      if (sale.status === 'concluida') {
        logs.push({
          id: `sale-${sale.id}`,
          user_id: sale.user_id,
          actor_name: actorName,
          actor_role: actorRole,
          action: 'Venda Finalizada',
          entity_type: 'venda',
          entity_id: sale.id,
          details: `Pedido #${sale.id.slice(0, 8).toUpperCase()} concluído — Cliente: ${sale.customer_name ?? '—'} — Total: ${money.format(sale.total)} — Pagamento: ${sale.payment_method ?? '—'}`,
          created_at: sale.created_at,
        });
      }

      if (sale.status === 'pre_venda') {
        logs.push({
          id: `presale-${sale.id}`,
          user_id: sale.user_id,
          actor_name: actorName,
          actor_role: actorRole,
          action: 'Pré-Venda Criada',
          entity_type: 'pre_venda',
          entity_id: sale.id,
          details: `Orçamento #${sale.id.slice(0, 8).toUpperCase()} gerado — Cliente: ${sale.customer_name ?? '—'} — Total: ${money.format(sale.total)}`,
          created_at: sale.created_at,
        });
      }
    }

    return logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [sales, salespeople]);

  const filteredLogs = filter === 'all' ? auditLogs : auditLogs.filter((l) => l.action.toLowerCase().includes(filter));

  const actionColors: Record<string, string> = {
    'Venda Finalizada': '#5bbc87',
    'Venda Cancelada': '#e3829b',
    'Pré-Venda Criada': '#e6a06d',
  };

  return (
    <div>
      <div className="admin-audit-filters">
        <button className={`rma-advance-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Todos</button>
        <button className={`rma-advance-btn ${filter === 'cancelada' ? 'active' : ''}`} onClick={() => setFilter('cancelada')}>Cancelamentos</button>
        <button className={`rma-advance-btn ${filter === 'finalizada' ? 'active' : ''}`} onClick={() => setFilter('finalizada')}>Vendas Finalizadas</button>
        <button className={`rma-advance-btn ${filter === 'pré-venda' || filter === 'pre-venda' ? 'active' : ''}`} onClick={() => setFilter('pré-venda')}>Pré-Vendas</button>
      </div>

      <div className="stock-table-wrap">
        <table className="rma-table">
          <thead>
            <tr><th>Data/Hora</th><th>Responsável</th><th>Função</th><th>Ação</th><th>Detalhes</th></tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr><td colSpan={5} className="empty-row">Nenhum registro de auditoria encontrado.</td></tr>
            ) : (
              filteredLogs.slice(0, 50).map((log) => (
                <tr key={log.id}>
                  <td><small>{new Date(log.created_at).toLocaleString('pt-BR')}</small></td>
                  <td><strong>{log.actor_name}</strong></td>
                  <td>
                    <span className="rma-status-badge" style={{ color: '#7f97a9', borderColor: '#3a4d5e' }}>
                      {roleLabels[log.actor_role as SalespersonRole] ?? log.actor_role}
                    </span>
                  </td>
                  <td>
                    <span className="rma-status-badge" style={{ color: actionColors[log.action] ?? '#7f97a9', borderColor: actionColors[log.action] ?? '#3a4d5e' }}>
                      {log.action}
                    </span>
                  </td>
                  <td><small>{log.details}</small></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filteredLogs.length > 50 && (
        <p className="admin-audit-footer">Exibindo os 50 registros mais recentes de {filteredLogs.length} total.</p>
      )}
    </div>
  );
}

/* ============ Devices / Terminals ============ */

function DevicesTerminals() {
  const [devices] = useState([
    { id: 'POS-001', name: 'Caixa Frontal 1', type: 'PDV Desktop', status: 'online', lastSeen: new Date().toISOString() },
    { id: 'POS-002', name: 'Caixa Balcão 2', type: 'Tablet', status: 'online', lastSeen: new Date().toISOString() },
    { id: 'POS-003', name: 'Terminal Móvel', type: 'Smartphone', status: 'offline', lastSeen: new Date(Date.now() - 86400000).toISOString() },
  ]);

  return (
    <div>
      <div className="admin-permissions-info">
        <Monitor size={16} />
        <span>Cadastre e monitore os dispositivos e terminais conectados ao sistema.</span>
      </div>
      <div className="stock-table-wrap">
        <table className="rma-table">
          <thead><tr><th>Dispositivo</th><th>Tipo</th><th>Status</th><th>Última Conexão</th></tr></thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id}>
                <td><strong>{d.name}</strong><small>ID: {d.id}</small></td>
                <td>{d.type}</td>
                <td>
                  <span className="rma-status-badge" style={{ color: d.status === 'online' ? '#5bbc87' : '#e3829b', borderColor: d.status === 'online' ? '#5bbc87' : '#e3829b' }}>
                    {d.status === 'online' ? 'Online' : 'Offline'}
                  </span>
                </td>
                <td><small>{new Date(d.lastSeen).toLocaleString('pt-BR')}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============ Sale Release Password ============ */

function SaleReleasePassword() {
  const [enabled, setEnabled] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saved, setSaved] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    setPassword('');
    setConfirmPassword('');
  }

  return (
    <div>
      <div className="admin-permissions-info">
        <Lock size={16} />
        <span>Defina uma senha obrigatória para liberar vendas com desconto acima do limite ou operações especiais.</span>
      </div>
      <form className="rma-form" onSubmit={handleSave}>
        <label className="checkbox-label">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Exigir senha para liberação de venda
        </label>
        {enabled && (
          <>
            <label>
              <span className="social-label"><Lock size={14} /> Nova Senha de Liberação</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </label>
            <label>
              <span className="social-label"><Lock size={14} /> Confirmar Senha</span>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" required />
            </label>
          </>
        )}
        <button type="submit" className="module-submit-btn">
          {saved ? <><Check size={16} /> Salvo!</> : <><Save size={16} /> Salvar Senha</>}
        </button>
      </form>
    </div>
  );
}

/* ============ Data Management (Backup/Export) ============ */

function DataManagement() {
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);

  function handleExport() {
    setExporting(true);
    setTimeout(() => {
      setExporting(false);
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    }, 1200);
  }

  return (
    <div>
      <div className="admin-permissions-info">
        <Database size={16} />
        <span>Faça backup dos dados do sistema ou exporte para planilhas (XLS/CSV).</span>
      </div>
      <div className="admin-data-mgmt-grid">
        <div className="admin-data-card">
          <Database size={22} />
          <strong>Backup Completo</strong>
          <p>Exporta todos os dados do sistema (produtos, vendas, clientes, financeiro) em um arquivo único.</p>
          <button className="module-action-btn" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exportando...' : done ? <><Check size={15} /> Concluído!</> : 'Gerar Backup'}
          </button>
        </div>
        <div className="admin-data-card">
          <FileText size={22} />
          <strong>Exportar Produtos (XLS)</strong>
          <p>Planilha com todos os produtos, preços, estoque e classificação fiscal.</p>
          <button className="module-action-btn" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exportando...' : 'Exportar XLS'}
          </button>
        </div>
        <div className="admin-data-card">
          <ShoppingCart size={22} />
          <strong>Exportar Vendas (CSV)</strong>
          <p>Histórico de vendas com itens, valores, clientes e vendedores.</p>
          <button className="module-action-btn" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exportando...' : 'Exportar CSV'}
          </button>
        </div>
        <div className="admin-data-card">
          <Building2 size={22} />
          <strong>Exportar Clientes (CSV)</strong>
          <p>Lista de clientes cadastrados com dados de contato e histórico.</p>
          <button className="module-action-btn" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exportando...' : 'Exportar CSV'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============ Inline Financial Summary ============ */

function AdminFinancialSummary({
  sales, products, branches, branchFilter, onBranchChange,
}: {
  sales: PartnerSale[];
  products: PartnerProduct[];
  branches: PartnerBranch[];
  branchFilter: string;
  onBranchChange: (id: string) => void;
}) {
  const completed = useMemo(() => {
    const c = sales.filter((s) => s.status === 'concluida');
    if (!branchFilter) return c;
    return c.filter((s) => !s.branch_id || s.branch_id === branchFilter);
  }, [sales, branchFilter]);

  const productCostMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of products) map[p.id] = p.cost_price;
    return map;
  }, [products]);

  const grossRevenue = completed.reduce((s, x) => s + (x.total ?? 0), 0);
  let totalCost = 0;
  for (const sale of completed) {
    for (const item of safeItems(sale)) {
      totalCost += (productCostMap[item.product_id] ?? 0) * item.quantity;
    }
  }
  const netRevenue = grossRevenue - totalCost;
  const margin = grossRevenue > 0 ? (netRevenue / grossRevenue) * 100 : 0;

  const accountsReceivable = completed
    .filter((s) => s.payment_method === 'faturado')
    .reduce((s, x) => s + (x.total ?? 0), 0);
  const accountsPayable = totalCost * 0.4;
  const cashBalance = netRevenue - accountsPayable;

  const dreRows = [
    { label: 'Receita Bruta de Vendas', value: grossRevenue, bold: true },
    { label: '(-) Deduções e Impostos', value: -grossRevenue * 0.08, bold: false },
    { label: 'Receita Líquida', value: grossRevenue * 0.92, bold: true },
    { label: '(-) Custo dos Produtos Vendidos (CMV)', value: -totalCost, bold: false },
    { label: 'Lucro Bruto', value: grossRevenue * 0.92 - totalCost, bold: true },
    { label: '(-) Despesas Operacionais (estimado)', value: -grossRevenue * 0.12, bold: false },
    { label: 'Lucro Operacional (EBIT)', value: grossRevenue * 0.92 - totalCost - grossRevenue * 0.12, bold: true },
    { label: '(-) Imposto de Renda (estimado)', value: -(grossRevenue * 0.92 - totalCost - grossRevenue * 0.12) * 0.15, bold: false },
    { label: 'Lucro Líquido do Período', value: (grossRevenue * 0.92 - totalCost - grossRevenue * 0.12) * 0.85, bold: true },
  ];

  const cashFlowRows = [
    { label: 'Saldo Inicial', value: 0, bold: false },
    { label: '(+) Recebimentos (Vendas)', value: grossRevenue - accountsReceivable, bold: false },
    { label: '(+) Contas a Receber (Faturado)', value: accountsReceivable, bold: false },
    { label: '(-) Pagamentos (Contas a Pagar)', value: -accountsPayable, bold: false },
    { label: '(-) Despesas Operacionais', value: -grossRevenue * 0.12, bold: false },
    { label: 'Saldo Final de Caixa', value: cashBalance, bold: true },
  ];

  return (
    <div className="admin-financial-summary">
      <div className="admin-filter-bar">
        <h4 className="admin-section-heading"><Wallet size={16} /> Resumo Financeiro Executivo</h4>
        {branches.length > 0 && (
          <div className="admin-branch-selector">
            <MapPin size={14} />
            <select value={branchFilter} onChange={(e) => onBranchChange(e.target.value)}>
              <option value="">Visão Consolidada</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="report-cards admin-kpi-grid">
        <div className="report-card admin-kpi-card">
          <small><DollarSign size={13} /> Receita Bruta</small>
          <strong>{money.format(grossRevenue)}</strong>
          <small>{completed.length} vendas</small>
        </div>
        <div className="report-card admin-kpi-card">
          <small><Wallet size={13} /> Contas a Pagar</small>
          <strong>{money.format(accountsPayable)}</strong>
          <small>estimado</small>
        </div>
        <div className="report-card admin-kpi-card">
          <small><CreditCard size={13} /> Contas a Receber</small>
          <strong>{money.format(accountsReceivable)}</strong>
          <small>faturado</small>
        </div>
        <div className="report-card admin-kpi-card">
          <small><Percent size={13} /> Margem Líquida</small>
          <strong>{margin.toFixed(1)}%</strong>
          <small>lucro / receita</small>
        </div>
        <div className="report-card admin-kpi-card">
          <small><Wallet size={13} /> Saldo de Caixa</small>
          <strong>{money.format(cashBalance)}</strong>
          <small>após pagamentos</small>
        </div>
      </div>

      <div className="admin-dre-grid">
        <div className="module-card">
          <h4 className="report-section-title"><FileText size={16} /> DRE — Demonstrativo do Resultado</h4>
          <div className="stock-table-wrap">
            <table className="rma-table">
              <thead><tr><th>Descrição</th><th>Valor</th></tr></thead>
              <tbody>
                {dreRows.map((row, i) => (
                  <tr key={i} className={row.bold ? 'admin-dre-bold' : ''}>
                    <td>{row.label}</td>
                    <td>{money.format(row.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="module-card">
          <h4 className="report-section-title"><Wallet size={16} /> Fluxo de Caixa</h4>
          <div className="stock-table-wrap">
            <table className="rma-table">
              <thead><tr><th>Descrição</th><th>Valor</th></tr></thead>
              <tbody>
                {cashFlowRows.map((row, i) => (
                  <tr key={i} className={row.bold ? 'admin-dre-bold' : ''}>
                    <td>{row.label}</td>
                    <td>{money.format(row.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============ Inline Fiscal View ============ */

function InlineFiscalView({ sales, products }: {
  sales: PartnerSale[];
  products: PartnerProduct[];
}) {
  const completed = useMemo(() => sales.filter((s) => s.status === 'concluida'), [sales]);
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const selectedSale = completed.find((s) => s.id === selectedSaleId);

  const fiscalItems = useMemo(() => {
    if (!selectedSale) return [];
    return safeItems(selectedSale).map((item) => {
      const product = products.find((p) => p.id === item.product_id);
      const lineTotal = item.unit_price * item.quantity;
      return {
        ...item,
        ncm: product?.ncm ?? '—',
        cfop: product?.cfop ?? '5102',
        cst_csosn: product?.cst_csosn ?? '102',
        icmsValue: (lineTotal * (product?.icms_rate ?? 0)) / 100,
      };
    });
  }, [selectedSale, products]);

  return (
    <div className="admin-inline-fiscal">
      <div className="admin-permissions-info">
        <FileText size={16} />
        <span>Visualização fiscal inline — selecione uma venda para ver detalhes tributários.</span>
      </div>
      <div className="module-card">
        <label>
          <span className="social-label"><Receipt size={14} /> Venda Concluída</span>
          <select value={selectedSaleId} onChange={(e) => setSelectedSaleId(e.target.value)}>
            <option value="">Selecione uma venda...</option>
            {completed.map((s) => (
              <option key={s.id} value={s.id}>
                #{s.id.slice(0, 8).toUpperCase()} — {s.customer_name ?? 'Cliente'} — {money.format(s.total)} — {new Date(s.created_at).toLocaleDateString('pt-BR')}
              </option>
            ))}
          </select>
        </label>
      </div>
      {selectedSale && fiscalItems.length > 0 && (
        <div className="stock-table-wrap">
          <table className="rma-table">
            <thead>
              <tr><th>Item</th><th>NCM</th><th>CFOP</th><th>CST/CSOSN</th><th>Qtd</th><th>Valor</th><th>ICMS</th></tr>
            </thead>
            <tbody>
              {fiscalItems.map((item, i) => (
                <tr key={i}>
                  <td>{item.name}</td>
                  <td>{item.ncm}</td>
                  <td>{item.cfop}</td>
                  <td>{item.cst_csosn}</td>
                  <td>{item.quantity}</td>
                  <td>{money.format(item.unit_price * item.quantity)}</td>
                  <td>{money.format(item.icmsValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!selectedSale && (
        <div className="admin-inline-placeholder">
          <FileText size={32} />
          <h4>Área Fiscal</h4>
          <p>Selecione uma venda acima para visualizar os detalhes fiscais e tributários inline.</p>
        </div>
      )}
    </div>
  );
}

/* ============ Inline Cadastros View ============ */

function InlineCadastrosView({ products, customers, suppliers, salespeople, categories }: {
  products: PartnerProduct[];
  customers: PartnerCustomer[];
  suppliers: PartnerSupplier[];
  salespeople: PartnerSalesperson[];
  categories: PartnerCategory[];
}) {
  return (
    <div className="admin-inline-cadastros">
      <div className="admin-permissions-info">
        <Boxes size={16} />
        <span>Resumo de cadastros — para edição completa, acesse o módulo Cadastros na barra lateral principal.</span>
      </div>
      <div className="report-cards">
        <div className="report-card">
          <small><Package size={13} /> Produtos</small>
          <strong>{products.length}</strong>
          <small>{products.filter((p) => !p.is_service).length} produtos • {products.filter((p) => p.is_service).length} serviços</small>
        </div>
        <div className="report-card">
          <small><Users size={13} /> Clientes</small>
          <strong>{customers.length}</strong>
          <small>cadastrados</small>
        </div>
        <div className="report-card">
          <small><Building2 size={13} /> Fornecedores</small>
          <strong>{suppliers.length}</strong>
          <small>fornecedores</small>
        </div>
        <div className="report-card">
          <small><UserCheck size={13} /> Vendedores</small>
          <strong>{salespeople.length}</strong>
          <small>equipe</small>
        </div>
        <div className="report-card">
          <small><Boxes size={13} /> Categorias</small>
          <strong>{categories.length}</strong>
          <small>classificações</small>
        </div>
      </div>
      <div className="stock-table-wrap">
        <h4 className="report-section-title"><Package size={16} /> Produtos Cadastrados</h4>
        <table className="rma-table">
          <thead><tr><th>Nome</th><th>SKU</th><th>Custo</th><th>Varejo</th><th>Estoque</th></tr></thead>
          <tbody>
            {products.length === 0 ? (
              <tr><td colSpan={5} className="empty-row">Nenhum produto cadastrado.</td></tr>
            ) : (
              products.slice(0, 20).map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.sku ?? '—'}</td>
                  <td>{money.format(p.cost_price)}</td>
                  <td>{money.format(p.sale_price)}</td>
                  <td>{p.is_service ? '—' : p.stock}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
