import { useMemo, useState } from 'react';
import {
  ClipboardList, Search, X, Calendar, Filter, ArrowRight, Wallet, Lock,
} from 'lucide-react';
import type { PartnerSale, PartnerCustomer, PartnerSalesperson, SalespersonRole } from '../../types';
import { money } from '../../utils';

type Props = {
  sales: PartnerSale[];
  customers: PartnerCustomer[];
  salespeople: PartnerSalesperson[];
  currentRole: SalespersonRole;
  onFinalizePreSale?: (id: string, paymentMethod: string) => Promise<void>;
  onCancelSale: (id: string) => Promise<void>;
  onDeleteSale: (id: string) => Promise<void>;
  onPullToPdv?: (sale: PartnerSale) => void;
};

const cashierRoles: SalespersonRole[] = ['administrador', 'gerente', 'caixa'];

const statusLabels: Record<string, { label: string; color: string }> = {
  aberta: { label: 'ABERTO', color: '#e6a06d' },
  pre_venda: { label: 'ABERTO', color: '#e6a06d' },
  concluida: { label: 'CONCLUÍDO', color: '#5bbc87' },
  cancelada: { label: 'CANCELADO', color: '#e3829b' },
};

const payStatusLabels: Record<string, { label: string; color: string }> = {
  pago: { label: 'Pago', color: '#5bbc87' },
  pendente: { label: 'Pendente', color: '#e6a06d' },
  cancelado: { label: 'Cancelado', color: '#e3829b' },
};

export function OpenOrdersModule({ sales, customers, salespeople, currentRole, onFinalizePreSale, onCancelSale, onDeleteSale, onPullToPdv }: Props) {
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [orderId, setOrderId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchResults, setSearchResults] = useState<PartnerSale[] | null>(null);
  const [finalizeTarget, setFinalizeTarget] = useState<PartnerSale | null>(null);
  const [finalizePayment, setFinalizePayment] = useState('pix');
  const [cancelTarget, setCancelTarget] = useState<PartnerSale | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const canCheckout = cashierRoles.includes(currentRole);

  const openOrders = useMemo(() => {
    return sales.filter((s) => s.status === 'aberta' || s.status === 'pre_venda');
  }, [sales]);

  const displayedOrders = searchResults ?? openOrders;

  function handleSearch() {
    let filtered = [...openOrders];
    if (dateStart) {
      filtered = filtered.filter((s) => new Date(s.created_at) >= new Date(dateStart));
    }
    if (dateEnd) {
      const end = new Date(dateEnd);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter((s) => new Date(s.created_at) <= end);
    }
    if (orderId) {
      const term = orderId.toLowerCase();
      filtered = filtered.filter((s) => s.id.toLowerCase().includes(term) || s.id.slice(0, 8).toUpperCase().includes(term));
    }
    if (customerSearch) {
      const term = customerSearch.toLowerCase();
      filtered = filtered.filter((s) =>
        (s.customer_name ?? '').toLowerCase().includes(term) ||
        customers.some((c) => c.id === s.customer_id && c.name.toLowerCase().includes(term)),
      );
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter((s) => s.status === statusFilter);
    }
    if (sourceFilter !== 'all') {
      filtered = filtered.filter((s) => s.origin === sourceFilter);
    }
    setSearchResults(filtered);
  }

  function clearFilters() {
    setDateStart(''); setDateEnd(''); setOrderId(''); setCustomerSearch(''); setStatusFilter('all'); setSourceFilter('all');
    setSearchResults(null);
  }

  const totalAmount = displayedOrders.reduce((sum, s) => sum + s.total, 0);
  const pendingCount = displayedOrders.filter((s) => s.payment_status === 'pendente' || s.status === 'pre_venda').length;

  function requestFinalize(sale: PartnerSale) {
    setFinalizeTarget(sale);
    setFinalizePayment('pix');
  }

  async function confirmFinalize() {
    if (!finalizeTarget || !onFinalizePreSale) return;
    await onFinalizePreSale(finalizeTarget.id, finalizePayment);
    setFinalizeTarget(null);
  }

  function requestCancel(sale: PartnerSale) {
    setCancelTarget(sale);
    setPinInput('');
    setPinError(false);
  }

  function verifyPinAndCancel(action: 'cancel' | 'delete') {
    if (!cancelTarget) return;
    const admin = salespeople.find((s) => (s.role === 'administrador' || s.role === 'gerente') && s.pin && s.pin === pinInput);
    if (!admin || admin.pin !== pinInput) {
      setPinError(true);
      return;
    }
    if (action === 'cancel') {
      onCancelSale(cancelTarget.id);
    } else {
      onDeleteSale(cancelTarget.id);
    }
    setCancelTarget(null);
    setPinInput('');
    setPinError(false);
  }

  return (
    <div className="panel-module">
      <div className="module-header">
        <span className="module-icon"><ClipboardList size={20} /></span>
        <div>
          <h3>Pedidos em Aberto</h3>
          <p>Acompanhe e finalize pré-vendas e pedidos do catálogo online</p>
        </div>
      </div>

      <div className="orders-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <div className="orders-summary-card" style={{ padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', background: '#0f1f2c' }}>
          <small style={{ color: '#8ba3b5' }}>Pedidos em aberto</small>
          <strong style={{ display: 'block', fontSize: '22px', marginTop: '6px' }}>{displayedOrders.length}</strong>
        </div>
        <div className="orders-summary-card" style={{ padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', background: '#0f1f2c' }}>
          <small style={{ color: '#8ba3b5' }}>Valor total</small>
          <strong style={{ display: 'block', fontSize: '22px', marginTop: '6px' }}>{money.format(totalAmount)}</strong>
        </div>
        <div className="orders-summary-card" style={{ padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', background: '#0f1f2c' }}>
          <small style={{ color: '#8ba3b5' }}>Pendentes</small>
          <strong style={{ display: 'block', fontSize: '22px', marginTop: '6px' }}>{pendingCount}</strong>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="orders-filter-bar">
        <div className="orders-filter-row">
          <label className="orders-filter-field">
            <Calendar size={14} /> Data inicial
            <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
          </label>
          <label className="orders-filter-field">
            <Calendar size={14} /> Data final
            <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
          </label>
          <label className="orders-filter-field">
            Identificador do pedido
            <input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Nº do pedido" />
          </label>
          <label className="orders-filter-field">
            <Search size={14} /> Cliente
            <input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Buscar cliente..." />
          </label>
        </div>
        <div className="orders-filter-actions">
          <button className="rma-advance-btn" onClick={() => setShowAdvanced(!showAdvanced)}>
            <Filter size={14} /> Opções de pesquisa
          </button>
          <button className="rma-advance-btn" onClick={clearFilters}>
            <X size={14} /> Limpar filtros
          </button>
          <button className="module-submit-btn" onClick={handleSearch}>
            <Search size={14} /> Pesquisar
          </button>
        </div>
        {showAdvanced && (
          <div className="orders-advanced-filters">
            <label className="orders-filter-field">
              Status do pedido
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">Todos</option>
                <option value="aberta">Aberta</option>
                <option value="pre_venda">Pré-venda</option>
                <option value="concluida">Concluída</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </label>
            <label className="orders-filter-field">
              Status do pagamento
              <select>
                <option value="">Todos</option>
                <option value="pago">Pago</option>
                <option value="pendente">Pendente</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </label>
            <label className="orders-filter-field">
              Origem
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                <option value="all">Todas</option>
                <option value="pdv">PDV</option>
                <option value="catalogo">Catálogo Online</option>
              </select>
            </label>
          </div>
        )}
      </div>

      {/* Data Table */}
      <div className="stock-table-wrap">
        <table className="rma-table orders-table">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Status</th>
              <th>Pagamento</th>
              <th>Origem</th>
              <th>Criado em</th>
              <th>Total (R$)</th>
              <th>Status pgto</th>
              <th>Pgto online</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {displayedOrders.length === 0 ? (
              <tr><td colSpan={10} className="empty-row">Nenhum pedido em aberto.</td></tr>
            ) : (
              displayedOrders.map((s) => {
                const st = statusLabels[s.status] ?? { label: s.status, color: '#7f97a9' };
                const pst = payStatusLabels[s.payment_status] ?? { label: s.payment_status, color: '#7f97a9' };
                return (
                  <tr key={s.id}>
                    <td><strong>#{s.id.slice(0, 8).toUpperCase()}</strong></td>
                    <td>{s.customer_name ?? '—'}</td>
                    <td>
                      <span className="rma-status-badge" style={{ color: st.color, borderColor: st.color }}>{st.label}</span>
                    </td>
                    <td>{s.payment_method ?? '—'}</td>
                    <td>
                      <span className="order-origin-badge">{s.origin === 'catalogo' ? 'Catálogo' : 'PDV'}</span>
                    </td>
                    <td>{new Date(s.created_at).toLocaleString('pt-BR')}</td>
                    <td><strong>{money.format(s.total)}</strong></td>
                    <td>
                      <span className="rma-status-badge" style={{ color: pst.color, borderColor: pst.color }}>{pst.label}</span>
                    </td>
                    <td>
                      <span className={`order-online-badge ${s.online_payment ? 'yes' : 'no'}`}>
                        {s.online_payment ? 'SIM' : 'NÃO'}
                      </span>
                    </td>
                    <td>
                      <div className="row-action-group">
                        {canCheckout && s.status === 'pre_venda' && (
                          <button className="module-submit-btn compact" onClick={() => requestFinalize(s)} title="Finalizar no caixa">
                            <Wallet size={14} /> Finalizar
                          </button>
                        )}
                        {canCheckout && onPullToPdv && (
                          <button className="rma-advance-btn" onClick={() => onPullToPdv(s)} title="Puxar para PDV">
                            <ArrowRight size={14} />
                          </button>
                        )}
                        <button className="rma-advance-btn" onClick={() => requestCancel(s)} title="Cancelar/Apagar">
                          <X size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="orders-footer-row">
              <td colSpan={6}><strong>{displayedOrders.length} registro(s)</strong></td>
              <td><strong>{money.format(totalAmount)}</strong></td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Finalize Modal */}
      {finalizeTarget && (
        <div className="modal-backdrop" onClick={() => setFinalizeTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3><Wallet size={18} style={{ display: 'inline', marginRight: '6px' }} /> Finalizar Pedido</h3>
              <button onClick={() => setFinalizeTarget(null)}><X size={18} /></button>
            </div>
            <p className="otp-description">
              <strong>{finalizeTarget.customer_name ?? 'Cliente'}</strong> — {finalizeTarget.items.length} {finalizeTarget.items.length === 1 ? 'item' : 'itens'} — {money.format(finalizeTarget.total)}
            </p>
            <label style={{ display: 'block', marginBottom: '12px' }}>
              <strong>Forma de Pagamento</strong>
              <select
                value={finalizePayment}
                onChange={(e) => setFinalizePayment(e.target.value)}
                style={{ width: '100%', marginTop: '6px' }}
              >
                <option value="pix">PIX</option>
                <option value="cartao">Cartão</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="faturado">Faturado</option>
              </select>
            </label>
            <div className="otp-actions">
              <button className="rma-advance-btn" onClick={() => setFinalizeTarget(null)}>Cancelar</button>
              <button className="module-submit-btn" onClick={confirmFinalize}>
                Confirmar Venda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel/Delete Modal */}
      {cancelTarget && (
        <div className="modal-backdrop" onClick={() => setCancelTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '380px' }}>
            <div className="modal-header">
              <h3><Lock size={18} style={{ display: 'inline', marginRight: '6px' }} /> Confirmação Necessária</h3>
              <button onClick={() => setCancelTarget(null)}><X size={18} /></button>
            </div>
            <p className="otp-description">
              Cancelar ou apagar um pedido requer permissão de Administrador ou Gerente. Digite o PIN para continuar.
            </p>
            <label style={{ display: 'block', marginBottom: '12px' }}>
              <strong>PIN (Administrador ou Gerente)</strong>
              <input
                type="password"
                value={pinInput}
                onChange={(e) => { setPinInput(e.target.value); setPinError(false); }}
                placeholder="Digite o PIN"
                maxLength={4}
                style={{ width: '100%', marginTop: '6px' }}
                autoFocus
              />
            </label>
            {pinError && <p className="otp-error-msg">PIN incorreto. Acesso negado.</p>}
            <div className="otp-actions">
              <button className="rma-advance-btn danger" onClick={() => verifyPinAndCancel('delete')}>
                Apagar
              </button>
              <button className="module-submit-btn" onClick={() => verifyPinAndCancel('cancel')}>
                Cancelar Pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
