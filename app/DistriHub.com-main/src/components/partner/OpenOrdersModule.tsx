import { useMemo, useRef, useState } from 'react';
import {
  ClipboardList, Search, X, Calendar, Filter, ArrowRight, Wallet, Lock, Pencil,
} from 'lucide-react';
import type { PartnerSale, PartnerCustomer, PartnerSalesperson, SalespersonRole, PartnerProduct } from '../../types';
import { OpenOrderItemsEditor } from './OpenOrderItemsEditor';
import { money } from '../../utils';
import { pdvErrorMessage } from '../../lib/pdv';
import { SaleActionsMenu } from './SaleActionsMenu';
import { printSale, type ReceiptDetails } from '../../lib/salePrint';
import { saleShareUrl } from '../../lib/saleShare';

type Props = {
  canEditPrice: boolean;
  products: PartnerProduct[];
  onUpdateItems: (id: string, items: PartnerSale['items']) => Promise<void>;
  onUpdateCustomer: (id: string, customerId: string) => Promise<void>;
  sales: PartnerSale[];
  customers: PartnerCustomer[];
  salespeople: PartnerSalesperson[];
  currentRole: SalespersonRole;
  receiptDetails?: ReceiptDetails;
  onFinalizePreSale?: (id: string, paymentMethod: string) => Promise<void>;
  onCancelSale: (id: string, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  onDeleteSale: (id: string, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  onPullToPdv?: (sale: PartnerSale) => void;
};

const cashierRoles: SalespersonRole[] = ['administrador', 'gerente', 'caixa', 'vendedor'];

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

export function OpenOrdersModule({ canEditPrice, products, onUpdateItems, onUpdateCustomer, sales, customers, salespeople, currentRole, receiptDetails, onFinalizePreSale, onCancelSale, onDeleteSale, onPullToPdv }: Props) {
  const [customerTarget, setCustomerTarget] = useState<PartnerSale | null>(null);
  const [newCustomerId, setNewCustomerId] = useState('');
  const [customerTerm, setCustomerTerm] = useState('');
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const customerInFlight = useRef(false);
  const canChangeCustomer = ['administrador', 'gerente', 'caixa', 'vendedor'].includes(currentRole);
  const availableCustomers = customers.filter(customer =>
    (!customer.branch_id || customer.branch_id === customerTarget?.branch_id) &&
    (!customerTerm.trim() || `${customer.name} ${customer.document ?? ''}`.toLocaleLowerCase('pt-BR').includes(customerTerm.trim().toLocaleLowerCase('pt-BR'))));

  async function saveCustomer() {
    if (!customerTarget || !newCustomerId || customerInFlight.current) return;
    customerInFlight.current = true;
    setSavingCustomer(true);
    setCustomerError(null);
    try {
      await onUpdateCustomer(customerTarget.id, newCustomerId);
      setCustomerTarget(null);
    } catch (error) { setCustomerError(pdvErrorMessage(error)); }
    finally { customerInFlight.current = false; setSavingCustomer(false); }
  }
  const [editTarget, setEditTarget] = useState<PartnerSale | null>(null);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [orderId, setOrderId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<{
    dateStart: string;
    dateEnd: string;
    orderId: string;
    customerSearch: string;
    statusFilter: string;
    paymentFilter: string;
    sourceFilter: string;
  } | null>(null);
  const [finalizeTarget, setFinalizeTarget] = useState<PartnerSale | null>(null);
  const [finalizePayment, setFinalizePayment] = useState('pix');
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const finalizeInFlight = useRef(false);
  const [cancelTarget, setCancelTarget] = useState<PartnerSale | null>(null);
  const [supervisorId, setSupervisorId] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  const [documentError, setDocumentError] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  function handlePrint(sale: PartnerSale, format: 'receipt' | 'label') {
    setDocumentError(null);
    setShareNotice(null);
    try {
      printSale(sale, format, {
        ...receiptDetails,
        customer: customers.find((customer) => customer.id === sale.customer_id),
        salespersonName: salespeople.find((person) => person.id === sale.salesperson_id)?.name,
      });
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : 'Não foi possível abrir a impressão.');
    }
  }

  function handleShare(sale: PartnerSale, channel: 'whatsapp' | 'email') {
    setDocumentError(null);
    setShareNotice(null);
    try {
      const url = saleShareUrl(sale, channel,
        customers.find((customer) => customer.id === sale.customer_id),
        salespeople.find((person) => person.id === sale.salesperson_id)?.name);
      if (channel === 'whatsapp') {
        const popup = window.open('about:blank', '_blank');
        if (!popup) throw new Error('Permita pop-ups neste navegador para abrir o WhatsApp.');
        popup.opener = null;
        popup.location.replace(url);
        setShareNotice('Confirme o envio no WhatsApp. O orçamento vai em texto, sem PDF anexado.');
      } else {
        const link = document.createElement('a');
        link.href = url;
        document.body.append(link);
        link.click();
        link.remove();
        setShareNotice('Confirme o envio no aplicativo de e-mail. Se nada abriu, configure um aplicativo de e-mail padrão. O orçamento vai em texto, sem PDF anexado.');
      }
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : 'Não foi possível preparar o envio.');
    }
  }

  const canCheckout = cashierRoles.includes(currentRole);

  // O PIN nunca é comparado no cliente: quem valida é a RPC no backend.
  // A lista abaixo serve apenas para escolher o responsável que autoriza.
  const managers = salespeople.filter((s) => s.role === 'administrador' || s.role === 'gerente');

  const openOrders = useMemo(() => {
    return sales.filter((s) => s.status === 'aberta' || s.status === 'pre_venda');
  }, [sales]);

  const displayedOrders = useMemo(() => {
    if (!appliedFilters) return openOrders;
    const filters = appliedFilters;
    return openOrders.filter((sale) => {
      if (filters.dateStart && new Date(sale.created_at) < new Date(filters.dateStart)) return false;
      if (filters.dateEnd) {
        const end = new Date(filters.dateEnd);
        end.setHours(23, 59, 59, 999);
        if (new Date(sale.created_at) > end) return false;
      }
      if (filters.orderId) {
        const term = filters.orderId.toLowerCase();
        if (!sale.id.toLowerCase().includes(term) && !sale.id.slice(0, 8).toUpperCase().includes(term)) return false;
      }
      if (filters.customerSearch) {
        const term = filters.customerSearch.toLowerCase();
        if (!(sale.customer_name ?? '').toLowerCase().includes(term) &&
          !customers.some((customer) => customer.id === sale.customer_id && customer.name.toLowerCase().includes(term))) return false;
      }
      if (filters.statusFilter !== 'all' && sale.status !== filters.statusFilter) return false;
      if (filters.paymentFilter !== 'all' && sale.payment_status !== filters.paymentFilter) return false;
      if (filters.sourceFilter !== 'all' && sale.origin !== filters.sourceFilter) return false;
      return true;
    });
  }, [appliedFilters, customers, openOrders]);

  function handleSearch() {
    setAppliedFilters({ dateStart, dateEnd, orderId, customerSearch, statusFilter, paymentFilter, sourceFilter });
  }

  function clearFilters() {
    setDateStart(''); setDateEnd(''); setOrderId(''); setCustomerSearch('');
    setStatusFilter('all'); setPaymentFilter('all'); setSourceFilter('all');
    setAppliedFilters(null);
  }

  const totalAmount = displayedOrders.reduce((sum, s) => sum + s.total, 0);
  const pendingCount = displayedOrders.filter((s) => s.payment_status === 'pendente' || s.status === 'pre_venda').length;

  function requestFinalize(sale: PartnerSale) {
    setFinalizeTarget(sale);
    setFinalizePayment(sale.payment_method || 'pix');
    setFinalizeError(null);
  }

  async function confirmFinalize() {
    if (!finalizeTarget || !onFinalizePreSale || finalizeInFlight.current) return;
    finalizeInFlight.current = true;
    setIsFinalizing(true);
    setFinalizeError(null);
    try {
      // The shared hook checks a fresh authorized credit balance before calling the sale RPC.
      await onFinalizePreSale(finalizeTarget.id, finalizePayment);
      setFinalizeTarget(null);
    } catch (error) {
      setFinalizeError(pdvErrorMessage(error));
    } finally {
      finalizeInFlight.current = false;
      setIsFinalizing(false);
    }
  }

  function requestCancel(sale: PartnerSale) {
    setCancelTarget(sale);
    setSupervisorId(managers[0]?.id ?? '');
    setPinInput('');
    setPinError(null);
  }

  // Autenticação delegada ao backend: o PIN digitado é enviado às RPCs
  // existentes (execute_partner_sale_mutation / execute_partner_sale_delete),
  // que o validam contra o pin_hash. Nenhuma comparação ocorre no navegador.
  async function verifyPinAndCancel(action: 'cancel' | 'delete') {
    if (!cancelTarget) return;
    if (!supervisorId) {
      setPinError('Selecione o responsável (Administrador ou Gerente).');
      return;
    }
    if (!pinInput) {
      setPinError('Digite o PIN do responsável selecionado.');
      return;
    }
    setIsVerifyingPin(true);
    setPinError(null);
    try {
      if (action === 'cancel') {
        await onCancelSale(cancelTarget.id, supervisorId, pinInput);
      } else {
        await onDeleteSale(cancelTarget.id, supervisorId, pinInput);
      }
      setCancelTarget(null);
      setSupervisorId('');
      setPinInput('');
      setPinError(null);
    } catch (error) {
      setPinError(error instanceof Error ? error.message : 'Não foi possível autorizar. Verifique o PIN.');
    } finally {
      setIsVerifyingPin(false);
    }
  }

  return (
    <div className="panel-module">
      <div className="module-header">
        <span className="module-icon"><ClipboardList size={20} /></span>
        <div>
          <h3>Pedidos em Aberto</h3>
          <p>Acompanhe e finalize pré-vendas e pedidos online</p>
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

      {documentError && <p className="otp-error-msg" role="alert">{documentError}</p>}
      {shareNotice && <p role="status">{shareNotice}</p>}

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
              </select>
            </label>
            <label className="orders-filter-field">
              Status do pagamento
              <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
                <option value="all">Todos</option>
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
                <option value="catalogo">Pedidos Online</option>
              </select>
            </label>
          </div>
        )}
      </div>

      {/* Data Table */}
      <div className="stock-table-wrap open-orders-table-wrap">
        <table className="rma-table orders-table">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Pagamento</th>
              <th>Total (R$)</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {displayedOrders.length === 0 ? (
              <tr><td colSpan={5} className="empty-row">Nenhum pedido em aberto.</td></tr>
            ) : (
              displayedOrders.map((s) => {
                const st = statusLabels[s.status] ?? { label: s.status, color: '#7f97a9' };
                const pst = payStatusLabels[s.payment_status] ?? { label: s.payment_status, color: '#7f97a9' };
                return (
                  <tr key={s.id}>
                    <td data-label="Pedido">
                      <strong>#{s.id.slice(0, 8).toUpperCase()}</strong>
                      <small className="open-order-secondary">{new Date(s.created_at).toLocaleString('pt-BR')}</small>
                      <span className="order-origin-badge">{s.origin === 'catalogo' ? 'Online' : 'PDV'}</span>
                    </td>
                    <td data-label="Cliente">
                      <strong>{s.customer_name ?? '—'}</strong>
                      <small className="open-order-secondary">{s.items.length} {s.items.length === 1 ? 'item' : 'itens'}</small>
                      <span className="rma-status-badge" style={{ color: st.color, borderColor: st.color }}>{st.label}</span>
                    </td>
                    <td data-label="Pagamento">
                      <small className="open-order-secondary">{s.payment_method ?? 'A definir'}</small>
                      <span className="rma-status-badge" style={{ color: pst.color, borderColor: pst.color }}>{pst.label}</span>
                      {s.online_payment && <small className="open-order-secondary">Pagamento online</small>}
                    </td>
                    <td data-label="Total"><strong>{money.format(s.total)}</strong></td>
                    <td data-label="Ações" className="open-order-actions">
                      <div className="row-action-group">
                        {canChangeCustomer && s.payment_status === 'pendente' && !s.online_payment && (
                          <button className="rma-advance-btn" title="Alterar cliente" onClick={() => {
                            setCustomerTarget(s); setNewCustomerId(s.customer_id ?? ''); setCustomerTerm(''); setCustomerError(null);
                          }}>Alterar cliente</button>
                        )}
                        {s.status === 'pre_venda' && (
                          <button className="rma-advance-btn" onClick={() => setEditTarget(s)} title="Editar produtos">
                            <Pencil size={14} /> Editar
                          </button>
                        )}
                        {canCheckout && s.status === 'pre_venda' && (
                          <button className="module-submit-btn compact" onClick={() => requestFinalize(s)} title="Finalizar no caixa">
                            <Wallet size={14} /> Finalizar
                          </button>
                        )}
                        {canCheckout && onPullToPdv && s.status === 'pre_venda' && (
                          <button className="rma-advance-btn" onClick={() => onPullToPdv(s)} title="Resgatar para PDV">
                            <ArrowRight size={14} /> Resgatar para PDV
                          </button>
                        )}
                        <SaleActionsMenu
                          onPrintReceipt={() => handlePrint(s, 'receipt')}
                          onPrintLabel={() => handlePrint(s, 'label')}
                          onWhatsApp={() => handleShare(s, 'whatsapp')}
                          onEmail={() => handleShare(s, 'email')}
                          onCancel={() => requestCancel(s)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="orders-footer-row">
              <td colSpan={3}><strong>{displayedOrders.length} registro(s)</strong></td>
              <td><strong>{money.format(totalAmount)}</strong></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Finalize Modal */}
      {editTarget && (
        <OpenOrderItemsEditor
          canEditPrice={canEditPrice}
          sale={editTarget}
          products={products}
          onSave={onUpdateItems}
          onClose={() => setEditTarget(null)}
        />
      )}
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
            {finalizeError && <p className="otp-error-msg" role="alert">{finalizeError}</p>}
            <div className="otp-actions">
              <button className="rma-advance-btn" disabled={isFinalizing} onClick={() => setFinalizeTarget(null)}>Cancelar</button>
              <button className="module-submit-btn" onClick={confirmFinalize} disabled={isFinalizing}>
                {isFinalizing ? 'Finalizando...' : 'Confirmar Venda'}
              </button>
            </div>
          </div>
        </div>
      )}

      {customerTarget && (
        <div className="modal-backdrop" onClick={() => { if (!customerInFlight.current) setCustomerTarget(null); }}>
          <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="change-customer-title" onClick={event => event.stopPropagation()}>
            <div className="modal-header">
              <h3 id="change-customer-title">Alterar cliente — #{customerTarget.id.slice(0, 8).toUpperCase()}</h3>
              <button disabled={savingCustomer} aria-label="Fechar alteração de cliente" onClick={() => setCustomerTarget(null)}><X size={18} /></button>
            </div>
            <p>Cliente atual: <strong>{customerTarget.customer_name || 'Sem cliente'}</strong></p>
            <p>Os produtos, preços e total deste pedido serão mantidos.</p>
            <fieldset disabled={savingCustomer} className="open-order-editor-fields">
              <label>Buscar cliente<input value={customerTerm} onChange={event => setCustomerTerm(event.target.value)} placeholder="Nome ou documento" /></label>
              <label>Novo cliente<select value={newCustomerId} onChange={event => setNewCustomerId(event.target.value)}>
                <option value="">Selecione um cliente</option>
                {newCustomerId && !availableCustomers.some(customer => customer.id === newCustomerId) && (
                  <option value={newCustomerId}>{customers.find(customer => customer.id === newCustomerId)?.name ?? 'Cliente selecionado'}</option>
                )}
                {availableCustomers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}{customer.document ? ` — ${customer.document}` : ''}</option>)}
              </select></label>
            </fieldset>
            {customerError && <p className="otp-error-msg" role="alert">{customerError}</p>}
            <div className="otp-actions">
              <button className="rma-advance-btn" disabled={savingCustomer} onClick={() => setCustomerTarget(null)}>Cancelar</button>
              <button className="module-submit-btn" disabled={savingCustomer || !newCustomerId || newCustomerId === customerTarget.customer_id} onClick={() => void saveCustomer()}>{savingCustomer ? 'Salvando...' : 'Salvar cliente'}</button>
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
              Cancelar ou apagar um pedido requer permissão de Administrador ou Gerente. Selecione o responsável e digite o PIN dele para continuar.
            </p>
            {managers.length === 0 ? (
              <p className="otp-error-msg">Nenhum Administrador ou Gerente cadastrado. Cadastre um em Colaboradores antes de continuar.</p>
            ) : (
              <>
                <label style={{ display: 'block', marginBottom: '12px' }}>
                  <strong>Responsável</strong>
                  <select
                    value={supervisorId}
                    onChange={(e) => { setSupervisorId(e.target.value); setPinError(null); }}
                    style={{ width: '100%', marginTop: '6px' }}
                  >
                    {managers.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.role === 'administrador' ? 'Administrador' : 'Gerente'})</option>)}
                  </select>
                </label>
                <label style={{ display: 'block', marginBottom: '12px' }}>
                  <strong>PIN do responsável</strong>
                  <input
                    type="password"
                    value={pinInput}
                    onChange={(e) => { setPinInput(e.target.value); setPinError(null); }}
                    placeholder="Digite o PIN"
                    maxLength={8}
                    style={{ width: '100%', marginTop: '6px' }}
                    autoFocus
                  />
                </label>
              </>
            )}
            {pinError && <p className="otp-error-msg">{pinError}</p>}
            <div className="otp-actions">
              <button className="rma-advance-btn danger" onClick={() => verifyPinAndCancel('delete')} disabled={isVerifyingPin || managers.length === 0}>
                {isVerifyingPin ? 'Verificando...' : 'Apagar'}
              </button>
              <button className="module-submit-btn" onClick={() => verifyPinAndCancel('cancel')} disabled={isVerifyingPin || managers.length === 0}>
                {isVerifyingPin ? 'Verificando...' : 'Cancelar Pedido'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
