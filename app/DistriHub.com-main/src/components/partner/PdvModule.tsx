import { useMemo, useState } from 'react';
import {
  Search, Trash2, ShoppingCart, Check, Printer, MessageCircle, Mail,
  ScanLine, X, Tag, QrCode, Ban, Lock, ClipboardList, Wallet, Lock as LockIcon,
} from 'lucide-react';
import type { PartnerProduct, PartnerCustomer, PartnerSale, PartnerSalesperson, SalespersonRole } from '../../types';
import { money } from '../../utils';

type PriceTable = 'varejo' | 'atacado';
type ClientType = 'varejo' | 'atacado';
type PdvSubTab = 'pdv' | 'pre-venda';

type Props = {
  products: PartnerProduct[];
  customers: PartnerCustomer[];
  sales: PartnerSale[];
  salespeople: PartnerSalesperson[];
  segment: string;
  selectedBranchId: string | null;
  currentRole: SalespersonRole;
  onCreateSale: (sale: {
    customer_id: string | null;
    customer_name: string;
    items: { product_id: string; name: string; quantity: number; unit_price: number }[];
    total: number;
    imei?: string;
    serial_number?: string;
    payment_method?: string;
    salesperson_id?: string | null;
    branch_id?: string | null;
  }) => Promise<void>;
  onCreatePreSale: (sale: {
    customer_id: string | null;
    customer_name: string;
    items: { product_id: string; name: string; quantity: number; unit_price: number }[];
    total: number;
    imei?: string;
    serial_number?: string;
    salesperson_id?: string | null;
    branch_id?: string | null;
  }) => Promise<void>;
  onFinalizePreSale: (id: string, paymentMethod: string) => Promise<void>;
  onCancelSale: (id: string) => Promise<void>;
  onDeleteSale: (id: string) => Promise<void>;
};

const cashierRoles: SalespersonRole[] = ['administrador', 'gerente', 'caixa'];

export function PdvModule({
  products, customers, sales, salespeople, segment, selectedBranchId,
  currentRole, onCreateSale, onCreatePreSale, onFinalizePreSale, onCancelSale, onDeleteSale,
}: Props) {
  const [subTab, setSubTab] = useState<PdvSubTab>('pdv');

  const canCheckout = cashierRoles.includes(currentRole);
  const preSales = sales.filter((s) => s.status === 'pre_venda');

  return (
    <div className="panel-module">
      <div className="module-header">
        <span className="module-icon"><ShoppingCart size={20} /></span>
        <div>
          <h3>PDV Ultrarrápido & Validação de Garantia</h3>
          <p>Venda no balcão com rastreabilidade e cupom térmico</p>
        </div>
      </div>

      <div className="pdv-subtabs">
        <button
          className={`pdv-subtab ${subTab === 'pdv' ? 'active' : ''}`}
          onClick={() => setSubTab('pdv')}
        >
          <ShoppingCart size={16} /> PDV & Vendas
        </button>
        <button
          className={`pdv-subtab ${subTab === 'pre-venda' ? 'active' : ''}`}
          onClick={() => setSubTab('pre-venda')}
        >
          <ClipboardList size={16} /> Pré-Venda / Orçamentos
          {preSales.length > 0 && <span className="pdv-subtab-badge">{preSales.length}</span>}
        </button>
      </div>

      {subTab === 'pdv' && (
        <PdvCheckout
          products={products}
          customers={customers}
          sales={sales}
          salespeople={salespeople}
          segment={segment}
          selectedBranchId={selectedBranchId}
          canCheckout={canCheckout}
          onCreateSale={onCreateSale}
          onCancelSale={onCancelSale}
          onDeleteSale={onDeleteSale}
        />
      )}

      {subTab === 'pre-venda' && (
        <PreVendaTab
          products={products}
          customers={customers}
          sales={sales}
          salespeople={salespeople}
          segment={segment}
          selectedBranchId={selectedBranchId}
          canCheckout={canCheckout}
          onCreatePreSale={onCreatePreSale}
          onFinalizePreSale={onFinalizePreSale}
          onCancelSale={onCancelSale}
          onDeleteSale={onDeleteSale}
        />
      )}
    </div>
  );
}

/* ============ PDV Checkout ============ */

function PdvCheckout({ products, customers, sales, salespeople, segment, selectedBranchId, canCheckout, onCreateSale, onCancelSale, onDeleteSale }: {
  products: PartnerProduct[];
  customers: PartnerCustomer[];
  sales: PartnerSale[];
  salespeople: PartnerSalesperson[];
  segment: string;
  selectedBranchId: string | null;
  canCheckout: boolean;
  onCreateSale: (sale: { customer_id: string | null; customer_name: string; items: SaleItem[]; total: number; imei?: string; serial_number?: string; payment_method?: string; salesperson_id?: string | null; branch_id?: string | null }) => Promise<void>;
  onCancelSale: (id: string) => Promise<void>;
  onDeleteSale: (id: string) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<{ product_id: string; name: string; quantity: number; unit_price: number }[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [clientType, setClientType] = useState<ClientType>('varejo');
  const [imei, setImei] = useState('');
  const [serial, setSerial] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [salespersonId, setSalespersonId] = useState('');
  const [completed, setCompleted] = useState(false);
  const [priceTable, setPriceTable] = useState<PriceTable>('varejo');
  const [cancelTarget, setCancelTarget] = useState<PartnerSale | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const traceabilityLabel = segment === 'assistencia' ? 'IMEI / Selo' : 'Nº de Série';

  function getPriceForProduct(p: PartnerProduct, table: PriceTable): number {
    if (table === 'atacado' && p.wholesale_price && p.wholesale_price > 0) return p.wholesale_price;
    return p.sale_price;
  }

  function handleClientTypeChange(type: ClientType) {
    setClientType(type);
    setPriceTable(type);
    setCustomerId('');
    setCustomerName('');
    setCart((prev) => prev.map((item) => {
      const product = products.find((p) => p.id === item.product_id);
      if (!product) return item;
      return { ...item, unit_price: getPriceForProduct(product, type) };
    }));
  }

  function handleCustomerChange(id: string) {
    setCustomerId(id);
    if (id) {
      const customer = customers.find((c) => c.id === id);
      if (customer) {
        const type = customer.customer_type === 'atacado' ? 'atacado' : 'varejo';
        setClientType(type);
        setPriceTable(type);
        setCustomerName(customer.name);
      }
    } else {
      setCustomerName('');
    }
  }

  function switchPriceTable(table: PriceTable) {
    setPriceTable(table);
    setClientType(table);
    setCart((prev) => prev.map((item) => {
      const product = products.find((p) => p.id === item.product_id);
      if (!product) return item;
      return { ...item, unit_price: getPriceForProduct(product, table) };
    }));
  }

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return products.filter((p) => {
      if (!selectedBranchId || p.branch_id !== selectedBranchId) return false;
      return !term || p.name.toLowerCase().includes(term) || (p.sku ?? '').toLowerCase().includes(term);
    });
  }, [products, search, selectedBranchId]);

  const total = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

  function addToCart(product: PartnerProduct) {
    const price = getPriceForProduct(product, priceTable);
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) return prev.map((i) => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: product.id, name: product.name, quantity: 1, unit_price: price }];
    });
    setCompleted(false);
  }

  function changeQty(id: string, delta: number) {
    setCart((prev) => prev.flatMap((i) => {
      if (i.product_id !== id) return [i];
      const q = i.quantity + delta;
      return q > 0 ? [{ ...i, quantity: q }] : [];
    }));
  }

  function removeFromCart(id: string) {
    setCart((prev) => prev.filter((i) => i.product_id !== id));
  }

  async function handleCheckout() {
    if (cart.length === 0) return;
    if (!selectedBranchId) {
      alert('Selecione uma filial antes de finalizar a venda.');
      return;
    }
    const customer = customers.find((c) => c.id === customerId);
    const fallbackName = clientType === 'atacado' ? 'Cliente Atacado' : 'Cliente Varejo';
    await onCreateSale({
      customer_id: customerId || null,
      customer_name: customerName || customer?.name || fallbackName,
      items: cart,
      total,
      imei: imei || undefined,
      serial_number: serial || undefined,
      payment_method: paymentMethod,
      salesperson_id: salespersonId || null,
      branch_id: selectedBranchId,
    });
    setCart([]); setCustomerId(''); setCustomerName(''); setImei(''); setSerial(''); setSalespersonId('');
    setCompleted(true);
  }

  function requestCancelSale(sale: PartnerSale) {
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
    <>
      <div className="pdv-layout">
        <div className="pdv-left">
          <div className="pdv-search-bar">
            <Search size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto por nome ou SKU..."
              autoFocus
            />
          </div>

          <div className="pdv-price-toggle">
            <button
              className={`price-toggle-btn ${priceTable === 'varejo' ? 'active' : ''}`}
              onClick={() => switchPriceTable('varejo')}
            >
              <Tag size={15} /> Tabela Varejo
            </button>
            <button
              className={`price-toggle-btn ${priceTable === 'atacado' ? 'active' : ''}`}
              onClick={() => switchPriceTable('atacado')}
            >
              <Tag size={15} /> Tabela Atacado
            </button>
          </div>

          <div className="pdv-product-grid">
            {filtered.length === 0 ? (
              <p className="empty-row">Nenhum produto encontrado.</p>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  className="pdv-product-card"
                  onClick={() => addToCart(p)}
                  disabled={!p.is_service && p.stock <= 0}
                >
                  <strong>{p.name}</strong>
                  <small>{p.sku ?? '—'}</small>
                  <span>{money.format(getPriceForProduct(p, priceTable))}</span>
                  {!p.is_service && <small className="pdv-stock">{p.stock} un.</small>}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="pdv-right">
          <div className="pdv-cart-header">
            <h4>Carrinho Atual</h4>
            {cart.length > 0 && (
              <button className="rma-advance-btn danger" onClick={() => setCart([])}>
                <X size={14} /> Limpar
              </button>
            )}
          </div>

          <div className="pdv-cart-items">
            {cart.length === 0 ? (
              <p className="empty-row">Carrinho vazio. Selecione produtos ao lado.</p>
            ) : (
              cart.map((item) => (
                <div key={item.product_id} className="pdv-cart-item">
                  <div>
                    <strong>{item.name}</strong>
                    <small>{money.format(item.unit_price)} / un.</small>
                  </div>
                  <div className="pdv-item-controls">
                    <button onClick={() => changeQty(item.product_id, -1)}>-</button>
                    <b>{item.quantity}</b>
                    <button onClick={() => changeQty(item.product_id, 1)}>+</button>
                    <span>{money.format(item.unit_price * item.quantity)}</span>
                    <button className="pdv-remove" onClick={() => removeFromCart(item.product_id)}><Trash2 size={13} /></button>
                  </div>
                </div>
              ))
            )}
          </div>

          {cart.length > 0 && (
            <>
              <div className="pdv-form">
                <label>
                  Tipo de Cliente
                  <div className="pdv-client-type-toggle">
                    <button
                      type="button"
                      className={`price-toggle-btn ${clientType === 'varejo' ? 'active' : ''}`}
                      onClick={() => handleClientTypeChange('varejo')}
                    >
                      <Tag size={15} /> Cliente Varejo
                    </button>
                    <button
                      type="button"
                      className={`price-toggle-btn ${clientType === 'atacado' ? 'active' : ''}`}
                      onClick={() => handleClientTypeChange('atacado')}
                    >
                      <Tag size={15} /> Cliente Atacado
                    </button>
                  </div>
                </label>
                <label>
                  Cliente
                  <select value={customerId} onChange={(e) => handleCustomerChange(e.target.value)}>
                    <option value="">{clientType === 'atacado' ? 'Cliente Atacado (sem cadastro)' : 'Cliente Varejo (sem cadastro)'}</option>
                    {customers
                      .filter((c) => c.customer_type === clientType)
                      .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <div className="form-row">
                  <label>
                    <ScanLine size={14} /> {traceabilityLabel}
                    <input value={imei} onChange={(e) => setImei(e.target.value)} placeholder={segment === 'assistencia' ? 'IMEI / Selo' : 'Nº de Série'} />
                  </label>
                  <label>
                    Nº de Série
                    <input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Opcional" />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Forma de Pagamento
                    <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} disabled={!canCheckout}>
                      <option value="pix">PIX</option>
                      <option value="cartao">Cartão</option>
                      <option value="dinheiro">Dinheiro</option>
                      <option value="faturado">Faturado</option>
                    </select>
                  </label>
                  <label>
                    Vendedor / Técnico
                    <select value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)}>
                      <option value="">Selecione...</option>
                      {salespeople.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                </div>
              </div>

              <div className="pdv-total-bar">
                <span>Total {priceTable === 'atacado' ? '(Atacado)' : '(Varejo)'}</span>
                <strong>{money.format(total)}</strong>
              </div>

              {canCheckout ? (
                <button className="module-submit-btn pdv-checkout-btn" onClick={handleCheckout}>
                  <Check size={18} /> Finalizar Venda
                </button>
              ) : (
                <div className="pdv-restricted-checkout">
                  <LockIcon size={16} />
                  <span>Finalização de venda restrita a Caixa, Gerente ou Administrador.</span>
                </div>
              )}

              <div className="pdv-receipt-actions">
                <button className="pdv-receipt-btn" disabled={!completed}>
                  <Printer size={16} /> Imprimir Cupom
                </button>
                <button className="pdv-receipt-btn" disabled={!completed}>
                  <QrCode size={16} /> Imprimir Etiqueta
                </button>
                <button className="pdv-receipt-btn" disabled={!completed}>
                  <MessageCircle size={16} /> WhatsApp
                </button>
                <button className="pdv-receipt-btn" disabled={!completed}>
                  <Mail size={16} /> E-mail
                </button>
              </div>
              {completed && (
                <div className="sent-message">
                  <Check size={15} /> Venda finalizada! Cupom e etiqueta disponíveis para impressão/envio.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="pdv-recent-sales">
        <h4>Vendas Recentes</h4>
        <div className="stock-table-wrap">
          <table className="rma-table">
            <thead><tr><th>Cliente</th><th>Itens</th><th>Total</th><th>Pagamento</th><th>{traceabilityLabel}</th><th>Status</th><th>Data</th><th></th></tr></thead>
            <tbody>
              {sales.filter((s) => s.status !== 'pre_venda').length === 0 ? (
                <tr><td colSpan={8} className="empty-row">Nenhuma venda registrada.</td></tr>
              ) : (
                sales.filter((s) => s.status !== 'pre_venda').slice(0, 10).map((s) => (
                  <tr key={s.id} className={s.status === 'cancelada' ? 'cancelled-row' : ''}>
                    <td><strong>{s.customer_name ?? '—'}</strong></td>
                    <td>{s.items.length} {s.items.length === 1 ? 'item' : 'itens'}</td>
                    <td>{money.format(s.total)}</td>
                    <td>{s.payment_method ?? '—'}</td>
                    <td>{s.imei ?? s.serial_number ?? '—'}</td>
                    <td>
                      {s.status === 'cancelada' ? (
                        <span className="rma-status-badge" style={{ color: '#e3829b', borderColor: '#e3829b' }}>Cancelada</span>
                      ) : (
                        <span className="rma-status-badge" style={{ color: '#5bbc87', borderColor: '#5bbc87' }}>Concluída</span>
                      )}
                    </td>
                    <td>{new Date(s.created_at).toLocaleDateString('pt-BR')}</td>
                    <td>
                      {s.status !== 'cancelada' && (
                        <div className="row-action-group">
                          <button className="rma-advance-btn" onClick={() => requestCancelSale(s)} title="Cancelar/Apagar Venda">
                            <Ban size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {cancelTarget && (
        <div className="modal-backdrop" onClick={() => setCancelTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '380px' }}>
            <div className="modal-header">
              <h3><Lock size={18} style={{ display: 'inline', marginRight: '6px' }} /> Confirmação Necessária</h3>
              <button onClick={() => setCancelTarget(null)}><X size={18} /></button>
            </div>
            <p className="otp-description">
              Cancelar ou apagar uma venda requer permissão de Administrador ou Gerente. Digite o PIN de um administrador ou gerente para continuar.
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
                <Trash2 size={16} /> Apagar Venda
              </button>
              <button className="module-submit-btn" onClick={() => verifyPinAndCancel('cancel')}>
                <Ban size={16} /> Cancelar Venda
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ============ Pré-Venda / Orçamentos ============ */

function PreVendaTab({ products, customers, sales, salespeople, segment, selectedBranchId, canCheckout, onCreatePreSale, onFinalizePreSale, onCancelSale, onDeleteSale }: {
  products: PartnerProduct[];
  customers: PartnerCustomer[];
  sales: PartnerSale[];
  salespeople: PartnerSalesperson[];
  segment: string;
  selectedBranchId: string | null;
  canCheckout: boolean;
  onCreatePreSale: (sale: { customer_id: string | null; customer_name: string; items: SaleItem[]; total: number; imei?: string; serial_number?: string; salesperson_id?: string | null; branch_id?: string | null }) => Promise<void>;
  onFinalizePreSale: (id: string, paymentMethod: string) => Promise<void>;
  onCancelSale: (id: string) => Promise<void>;
  onDeleteSale: (id: string) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<{ product_id: string; name: string; quantity: number; unit_price: number }[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [clientType, setClientType] = useState<ClientType>('varejo');
  const [imei, setImei] = useState('');
  const [serial, setSerial] = useState('');
  const [priceTable, setPriceTable] = useState<PriceTable>('varejo');
  const [salespersonId, setSalespersonId] = useState('');
  const [saved, setSaved] = useState(false);
  const [finalizeTarget, setFinalizeTarget] = useState<PartnerSale | null>(null);
  const [finalizePayment, setFinalizePayment] = useState('pix');
  const [cancelTarget, setCancelTarget] = useState<PartnerSale | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const traceabilityLabel = segment === 'assistencia' ? 'IMEI / Selo' : 'Nº de Série';
  const preSales = sales.filter((s) => s.status === 'pre_venda');

  function getPriceForProduct(p: PartnerProduct, table: PriceTable): number {
    if (table === 'atacado' && p.wholesale_price && p.wholesale_price > 0) return p.wholesale_price;
    return p.sale_price;
  }

  function handleClientTypeChange(type: ClientType) {
    setClientType(type);
    setPriceTable(type);
    setCustomerId('');
    setCustomerName('');
    setCart((prev) => prev.map((item) => {
      const product = products.find((p) => p.id === item.product_id);
      if (!product) return item;
      return { ...item, unit_price: getPriceForProduct(product, type) };
    }));
  }

  function handleCustomerChange(id: string) {
    setCustomerId(id);
    if (id) {
      const customer = customers.find((c) => c.id === id);
      if (customer) {
        const type = customer.customer_type === 'atacado' ? 'atacado' : 'varejo';
        setClientType(type);
        setPriceTable(type);
        setCustomerName(customer.name);
      }
    } else {
      setCustomerName('');
    }
  }

  function switchPriceTable(table: PriceTable) {
    setPriceTable(table);
    setClientType(table);
    setCart((prev) => prev.map((item) => {
      const product = products.find((p) => p.id === item.product_id);
      if (!product) return item;
      return { ...item, unit_price: getPriceForProduct(product, table) };
    }));
  }

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return products.filter((p) => {
      if (!selectedBranchId || p.branch_id !== selectedBranchId) return false;
      return !term || p.name.toLowerCase().includes(term) || (p.sku ?? '').toLowerCase().includes(term);
    });
  }, [products, search, selectedBranchId]);

  const total = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

  function addToCart(product: PartnerProduct) {
    const price = getPriceForProduct(product, priceTable);
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) return prev.map((i) => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: product.id, name: product.name, quantity: 1, unit_price: price }];
    });
    setSaved(false);
  }

  function changeQty(id: string, delta: number) {
    setCart((prev) => prev.flatMap((i) => {
      if (i.product_id !== id) return [i];
      const q = i.quantity + delta;
      return q > 0 ? [{ ...i, quantity: q }] : [];
    }));
  }

  function removeFromCart(id: string) {
    setCart((prev) => prev.filter((i) => i.product_id !== id));
  }

  async function handleSavePreSale() {
    if (cart.length === 0) return;
    if (!selectedBranchId) {
      alert('Selecione uma filial antes de salvar a pré-venda.');
      return;
    }
    const customer = customers.find((c) => c.id === customerId);
    const fallbackName = clientType === 'atacado' ? 'Cliente Atacado' : 'Cliente Varejo';
    await onCreatePreSale({
      customer_id: customerId || null,
      customer_name: customerName || customer?.name || fallbackName,
      items: cart,
      total,
      imei: imei || undefined,
      serial_number: serial || undefined,
      salesperson_id: salespersonId || null,
      branch_id: selectedBranchId,
    });
    setCart([]); setCustomerId(''); setCustomerName(''); setImei(''); setSerial(''); setSalespersonId('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function requestFinalize(sale: PartnerSale) {
    setFinalizeTarget(sale);
    setFinalizePayment('pix');
  }

  async function confirmFinalize() {
    if (!finalizeTarget) return;
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
    <>
      <div className="pdv-layout">
        <div className="pdv-left">
          <div className="pdv-search-bar">
            <Search size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto para orçamento..."
              autoFocus
            />
          </div>

          <div className="pdv-price-toggle">
            <button
              className={`price-toggle-btn ${priceTable === 'varejo' ? 'active' : ''}`}
              onClick={() => switchPriceTable('varejo')}
            >
              <Tag size={15} /> Tabela Varejo
            </button>
            <button
              className={`price-toggle-btn ${priceTable === 'atacado' ? 'active' : ''}`}
              onClick={() => switchPriceTable('atacado')}
            >
              <Tag size={15} /> Tabela Atacado
            </button>
          </div>

          <div className="pdv-product-grid">
            {filtered.length === 0 ? (
              <p className="empty-row">Nenhum produto encontrado.</p>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  className="pdv-product-card"
                  onClick={() => addToCart(p)}
                >
                  <strong>{p.name}</strong>
                  <small>{p.sku ?? '—'}</small>
                  <span>{money.format(getPriceForProduct(p, priceTable))}</span>
                  {!p.is_service && <small className="pdv-stock">{p.stock} un.</small>}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="pdv-right">
          <div className="pdv-cart-header">
            <h4>Orçamento Atual</h4>
            {cart.length > 0 && (
              <button className="rma-advance-btn danger" onClick={() => setCart([])}>
                <X size={14} /> Limpar
              </button>
            )}
          </div>

          <div className="pdv-cart-items">
            {cart.length === 0 ? (
              <p className="empty-row">Selecione produtos para gerar uma pré-venda.</p>
            ) : (
              cart.map((item) => (
                <div key={item.product_id} className="pdv-cart-item">
                  <div>
                    <strong>{item.name}</strong>
                    <small>{money.format(item.unit_price)} / un.</small>
                  </div>
                  <div className="pdv-item-controls">
                    <button onClick={() => changeQty(item.product_id, -1)}>-</button>
                    <b>{item.quantity}</b>
                    <button onClick={() => changeQty(item.product_id, 1)}>+</button>
                    <span>{money.format(item.unit_price * item.quantity)}</span>
                    <button className="pdv-remove" onClick={() => removeFromCart(item.product_id)}><Trash2 size={13} /></button>
                  </div>
                </div>
              ))
            )}
          </div>

          {cart.length > 0 && (
            <>
              <div className="pdv-form">
                <label>
                  Tipo de Cliente
                  <div className="pdv-client-type-toggle">
                    <button
                      type="button"
                      className={`price-toggle-btn ${clientType === 'varejo' ? 'active' : ''}`}
                      onClick={() => handleClientTypeChange('varejo')}
                    >
                      <Tag size={15} /> Cliente Varejo
                    </button>
                    <button
                      type="button"
                      className={`price-toggle-btn ${clientType === 'atacado' ? 'active' : ''}`}
                      onClick={() => handleClientTypeChange('atacado')}
                    >
                      <Tag size={15} /> Cliente Atacado
                    </button>
                  </div>
                </label>
                <label>
                  Cliente
                  <select value={customerId} onChange={(e) => handleCustomerChange(e.target.value)}>
                    <option value="">{clientType === 'atacado' ? 'Cliente Atacado (sem cadastro)' : 'Cliente Varejo (sem cadastro)'}</option>
                    {customers
                      .filter((c) => c.customer_type === clientType)
                      .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <div className="form-row">
                  <label>
                    <ScanLine size={14} /> {traceabilityLabel}
                    <input value={imei} onChange={(e) => setImei(e.target.value)} placeholder={segment === 'assistencia' ? 'IMEI / Selo' : 'Nº de Série'} />
                  </label>
                  <label>
                    Nº de Série
                    <input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Opcional" />
                  </label>
                </div>
                <label>
                  Vendedor / Técnico
                  <select value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)}>
                    <option value="">Selecione...</option>
                    {salespeople.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              </div>

              <div className="pdv-total-bar">
                <span>Total {priceTable === 'atacado' ? '(Atacado)' : '(Varejo)'}</span>
                <strong>{money.format(total)}</strong>
              </div>

              <button className="module-submit-btn pdv-checkout-btn" onClick={handleSavePreSale}>
                {saved ? <><Check size={18} /> Pré-Venda Salva!</> : <><ClipboardList size={18} /> Salvar Pré-Venda</>}
              </button>

              {saved && (
                <div className="sent-message">
                  <Check size={15} /> Pré-venda salva com status Pendente. Aguardando finalização no caixa.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Pending Pre-Sales List */}
      <div className="pdv-recent-sales">
        <h4>Pré-Vendas Pendentes ({preSales.length})</h4>
        <div className="stock-table-wrap">
          <table className="rma-table">
            <thead><tr><th>Cliente</th><th>Itens</th><th>Total</th><th>{traceabilityLabel}</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead>
            <tbody>
              {preSales.length === 0 ? (
                <tr><td colSpan={7} className="empty-row">Nenhuma pré-venda pendente.</td></tr>
              ) : (
                preSales.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.customer_name ?? '—'}</strong></td>
                    <td>{s.items.length} {s.items.length === 1 ? 'item' : 'itens'}</td>
                    <td>{money.format(s.total)}</td>
                    <td>{s.imei ?? s.serial_number ?? '—'}</td>
                    <td>
                      <span className="rma-status-badge" style={{ color: '#e6a06d', borderColor: '#e6a06d' }}>Pendente</span>
                    </td>
                    <td>{new Date(s.created_at).toLocaleDateString('pt-BR')}</td>
                    <td>
                      <div className="row-action-group">
                        {canCheckout ? (
                          <button className="module-submit-btn compact" onClick={() => requestFinalize(s)} title="Finalizar Venda">
                            <Wallet size={14} /> Finalizar
                          </button>
                        ) : (
                          <span className="pdv-restricted-inline" title="Apenas Caixa, Gerente ou Administrador">
                            <LockIcon size={14} /> Caixa
                          </span>
                        )}
                        <button className="rma-advance-btn" onClick={() => requestCancel(s)} title="Cancelar/Apagar">
                          <Ban size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Finalize Pre-Sale Modal */}
      {finalizeTarget && (
        <div className="modal-backdrop" onClick={() => setFinalizeTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3><Wallet size={18} style={{ display: 'inline', marginRight: '6px' }} /> Finalizar Pré-Venda</h3>
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
                <Check size={16} /> Confirmar Venda
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
              Cancelar ou apagar uma pré-venda requer permissão de Administrador ou Gerente. Digite o PIN para continuar.
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
                <Trash2 size={16} /> Apagar
              </button>
              <button className="module-submit-btn" onClick={() => verifyPinAndCancel('cancel')}>
                <Ban size={16} /> Cancelar Pré-Venda
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
