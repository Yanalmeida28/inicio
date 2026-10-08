import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Trash2, ShoppingCart, Check,
  ScanLine, X, Tag, Ban, Lock, ClipboardList, Wallet, Lock as LockIcon,
} from 'lucide-react';
import type { DeliveryType, PartnerProduct, PartnerCustomer, PartnerSale, PartnerSalesperson, SaleItem, SalespersonRole } from '../../types';
import { SalePriceInput } from './SalePriceInput';
import { PreSaleCheckout } from './PreSaleCheckout';
import { money } from '../../utils';
import { billedSaleError, pdvErrorMessage, pdvTotal, validSalePrice, type CustomerCredit } from '../../lib/pdv';

type PriceTable = 'varejo' | 'atacado';
type ClientType = 'varejo' | 'atacado';
type PdvSubTab = 'pdv' | 'pre-venda';

function CustomerSearchPicker({ id, customers, customerId, clientType, onSelect }: {
  id: string;
  customers: PartnerCustomer[];
  customerId: string;
  clientType: ClientType;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const selectedCustomer = customers.find((customer) => customer.id === customerId) ?? null;
  const selectedCustomerName = selectedCustomer?.name;

  useEffect(() => {
    if (selectedCustomerName) setQuery(selectedCustomerName);
    else if (!isOpen) setQuery('');
  }, [selectedCustomerName, isOpen]);

  const filteredCustomers = useMemo(() => {
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const term = normalize(query.trim());
    const digits = query.replace(/\D/g, '');
    if (!term) return [];
    return customers.filter((customer) => {
      if (customer.customer_type !== clientType) return false;
      const contact = [customer.phone, customer.phone_commercial_1, customer.phone_commercial_2].filter(Boolean).join(' ');
      return normalize(customer.name).includes(term) || (digits.length > 0 && contact.replace(/\D/g, '').includes(digits));
    }).slice(0, 8);
  }, [customers, clientType, query]);

  function selectCustomer(customer: PartnerCustomer) {
    onSelect(customer.id);
    setQuery(customer.name);
    setIsOpen(false);
  }

  return (
    <div className="pdv-search-picker">
      <label htmlFor={id}>Cliente</label>
      <div className="pdv-search-control">
        <div className="pdv-search-input-row">
          <Search size={16} aria-hidden="true" />
          <input
            id={id}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isOpen && query.trim().length > 0}
            aria-controls={`${id}-results`}
            value={query}
            placeholder={`Buscar cliente ${clientType}...`}
            onFocus={() => setIsOpen(true)}
            onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
            onChange={(event) => {
              if (customerId) onSelect('');
              setQuery(event.target.value);
              setIsOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setIsOpen(false);
              if (event.key === 'Enter' && filteredCustomers.length === 1) {
                event.preventDefault();
                selectCustomer(filteredCustomers[0]);
              }
            }}
          />
          {customerId && (
            <button
              type="button"
              className="pdv-search-clear"
              aria-label="Limpar cliente e continuar sem cadastro"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect('');
                setQuery('');
                setIsOpen(false);
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>
        {isOpen && query.trim() && (
          <div id={`${id}-results`} className="pdv-search-results" role="listbox">
            {filteredCustomers.length > 0 ? filteredCustomers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                role="option"
                aria-selected={customer.id === customerId}
                className="pdv-search-result"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectCustomer(customer)}
              >
                <span>{customer.name}</span>
                {customer.phone && <small>{customer.phone}</small>}
              </button>
            )) : (
              <div className="pdv-search-no-results">Nenhum cliente encontrado.</div>
            )}
          </div>
        )}
      </div>
      {!customerId && <small className="pdv-search-hint">Sem cliente selecionado: venda avulsa.</small>}
    </div>
  );
}

function SalespersonSearchPicker({ id, salespeople, salespersonId, onSelect }: {
  id: string;
  salespeople: PartnerSalesperson[];
  salespersonId: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const selectedSalesperson = salespeople.find((salesperson) => salesperson.id === salespersonId) ?? null;
  const selectedSalespersonName = selectedSalesperson?.name;

  useEffect(() => {
    if (selectedSalespersonName) setQuery(selectedSalespersonName);
    else if (!isOpen) setQuery('');
  }, [selectedSalespersonName, isOpen]);

  const filteredSalespeople = useMemo(() => {
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const term = normalize(query.trim());
    if (!term) return [];
    return salespeople.filter((salesperson) => normalize(`${salesperson.name} ${salesperson.email ?? ''}`).includes(term)).slice(0, 8);
  }, [salespeople, query]);

  function selectSalesperson(salesperson: PartnerSalesperson) {
    onSelect(salesperson.id);
    setQuery(salesperson.name);
    setIsOpen(false);
  }

  return (
    <div className="pdv-search-picker">
      <label htmlFor={id}>Vendedor responsável</label>
      <div className="pdv-search-control">
        <div className="pdv-search-input-row">
          <Search size={16} aria-hidden="true" />
          <input
            id={id}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isOpen && query.trim().length > 0}
            aria-controls={`${id}-results`}
            value={query}
            placeholder="Buscar colaborador..."
            onFocus={() => setIsOpen(true)}
            onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
            onChange={(event) => {
              if (salespersonId) onSelect('');
              setQuery(event.target.value);
              setIsOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setIsOpen(false);
              if (event.key === 'Enter' && filteredSalespeople.length === 1) {
                event.preventDefault();
                selectSalesperson(filteredSalespeople[0]);
              }
            }}
          />
          {salespersonId && (
            <button
              type="button"
              className="pdv-search-clear"
              aria-label="Limpar colaborador responsável"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect('');
                setQuery('');
                setIsOpen(false);
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>
        {isOpen && query.trim() && (
          <div id={`${id}-results`} className="pdv-search-results" role="listbox">
            {filteredSalespeople.length > 0 ? filteredSalespeople.map((salesperson) => (
              <button
                key={salesperson.id}
                type="button"
                role="option"
                aria-selected={salesperson.id === salespersonId}
                className="pdv-search-result"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSalesperson(salesperson)}
              >
                <span>{salesperson.name}</span>
                {salesperson.email && <small>{salesperson.email}</small>}
              </button>
            )) : (
              <div className="pdv-search-no-results">Nenhum colaborador encontrado.</div>
            )}
          </div>
        )}
      </div>
      {!salespersonId && <small className="pdv-search-hint">Sem atribuição de colaborador.</small>}
    </div>
  );
}

type Props = {
  cashContext?: { status: string; message: string; others: { id: string; operator_id: string | null; operator_name: string }[] };
  onOpenCash?: () => void;
  onConfirmCashOperator?: (operatorId?: string | null) => void;
  canEditPrice: boolean;
  products: PartnerProduct[];
  customers: PartnerCustomer[];
  sales: PartnerSale[];
  credits: CustomerCredit[];
  hasPendingSale?: boolean;
  preSaleToCheckout?: PartnerSale | null;
  onConsumePreSale?: () => void;
  onRequestPreSale?: (sale: PartnerSale) => void;
  salespeople: PartnerSalesperson[];
  activeSalespersonId?: string | null;
  activeBranchName: string;
  segment: string;
  selectedBranchId: string | null;
  currentRole: SalespersonRole;
  onCreateSale: (sale: {
    customer_id: string | null;
    customer_name: string;
    items: { product_id: string; name: string; quantity: number; unit_price: number }[];
    total: number;
    customer_type: ClientType;
    delivery_type: DeliveryType;
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
    customer_type: ClientType;
    delivery_type: DeliveryType;
    payment_method?: string | null;
    imei?: string;
    serial_number?: string;
    salesperson_id?: string | null;
    branch_id?: string | null;
  }) => Promise<void>;
  onFinalizePreSale: (id: string, paymentMethod: string) => Promise<void>;
  onCancelSale: (id: string, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  onDeleteSale: (id: string, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
};

const cashierRoles: SalespersonRole[] = ['administrador', 'gerente', 'caixa', 'vendedor'];
const PRODUCT_PAGE_SIZE = 30;

export function PdvModule({
  cashContext, onOpenCash, onConfirmCashOperator,
  products, customers, sales, credits, hasPendingSale, salespeople, segment, selectedBranchId,
  preSaleToCheckout, onConsumePreSale, onRequestPreSale,
  activeSalespersonId, activeBranchName, currentRole, canEditPrice, onCreateSale, onCreatePreSale, onFinalizePreSale, onCancelSale, onDeleteSale,
}: Props) {
  const [subTab, setSubTab] = useState<PdvSubTab>('pdv');
  const [checkoutPreSale, setCheckoutPreSale] = useState<PartnerSale | null>(null);
  useEffect(() => {
    if (!preSaleToCheckout) return;
    setCheckoutPreSale(preSaleToCheckout);
    setSubTab('pdv');
  }, [preSaleToCheckout]);
  const moduleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = moduleRef.current;
    if (!element) return;
    const updateHeight = () => {
      const checkout = element.querySelector('.pdv-checkout-layout') ?? element;
      const top = checkout.getBoundingClientRect().top + window.scrollY;
      element.style.setProperty('--pdv-height', `${Math.max(420, window.innerHeight - (top + 20))}px`);
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    if (element.parentElement) observer.observe(element.parentElement);
    const toolbar = element.closest('.sidebar-main-inner')?.querySelector('.branch-toolbar');
    if (toolbar) observer.observe(toolbar);
    const cashContext = element.querySelector('.pdv-cash-context');
    if (cashContext) observer.observe(cashContext);
    window.addEventListener('resize', updateHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, [subTab]);

  const canCheckout = cashierRoles.includes(currentRole);
  const preSales = sales.filter((s) => s.status === 'pre_venda');

  return (
    <div ref={moduleRef} className={`panel-module pdv-workspace${subTab === 'pdv' ? ' pdv-workspace-checkout' : ''}`}>
      <div className="module-header">
        <span className="module-icon"><ShoppingCart size={20} /></span>
        <div>
          <h3>PDV</h3>
          <small className="pdv-branch-context">{activeBranchName}</small>
        </div>
      </div>

      <div className="pdv-subtabs">
        <button
          className={`pdv-subtab ${subTab === 'pdv' ? 'active' : ''}`}
          onClick={() => setSubTab('pdv')}
        >
          <ShoppingCart size={16} /> PDV
        </button>
        <button
          className={`pdv-subtab ${subTab === 'pre-venda' ? 'active' : ''}`}
          onClick={() => setSubTab('pre-venda')}
        >
          <ClipboardList size={16} /> Pré-vendas
          {preSales.length > 0 && <span className="pdv-subtab-badge">{preSales.length}</span>}
        </button>

      </div>

      {cashContext && <div className="pdv-cash-context" role="status">
        <span>{cashContext.message}</span>
        {cashContext.status === 'authorize' && onConfirmCashOperator && <button type="button" className="rma-advance-btn" onClick={() => onConfirmCashOperator()}>Confirmar operador</button>}
        {cashContext.status === 'closed' && <>
          {onOpenCash && <button type="button" className="rma-advance-btn" onClick={onOpenCash}>Ir ao caixa</button>}
          {onConfirmCashOperator && cashContext.others.map(session => <button key={session.id} type="button" className="rma-advance-btn" onClick={() => onConfirmCashOperator(session.operator_id)}>Operar como {session.operator_name}</button>)}
        </>}
        {cashContext.status === 'error' && onOpenCash && <button type="button" className="rma-advance-btn" onClick={onOpenCash}>Conferir caixa</button>}
      </div>}

      {subTab === 'pdv' && checkoutPreSale && (
        <PreSaleCheckout
          key={checkoutPreSale.id}
          sale={sales.find(sale => sale.id === checkoutPreSale.id) ?? checkoutPreSale}
          selectedBranchId={selectedBranchId}
          canCheckout={canCheckout && !hasPendingSale}
          onFinalize={onFinalizePreSale}
          onClose={() => { setCheckoutPreSale(null); onConsumePreSale?.(); }}
        />
      )}
      {subTab !== 'pre-venda' && !checkoutPreSale && (
        <PdvCheckout
          products={products}
          customers={customers}
          credits={credits}
          hasPendingSale={hasPendingSale}
          salespeople={salespeople}
          activeSalespersonId={activeSalespersonId}
          segment={segment}
          selectedBranchId={selectedBranchId}
          canCheckout={canCheckout}
          canEditPrice={canEditPrice}
          onCreateSale={onCreateSale}
        />
      )}

      {subTab === 'pre-venda' && (
        <PreVendaTab
          onPullToPdv={(sale) => { setCheckoutPreSale(sale); setSubTab('pdv'); onRequestPreSale?.(sale); }}
          products={products}
          customers={customers}
          sales={sales}
          salespeople={salespeople}
          activeSalespersonId={activeSalespersonId}
          segment={segment}
          selectedBranchId={selectedBranchId}
          canCheckout={canCheckout}
          canEditPrice={canEditPrice}
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

function PdvCheckout({ products, customers, credits, hasPendingSale, salespeople, activeSalespersonId, segment, selectedBranchId, canCheckout, canEditPrice, onCreateSale }: {
  products: PartnerProduct[];
  customers: PartnerCustomer[];
  credits: CustomerCredit[];
  canEditPrice: boolean;
  hasPendingSale?: boolean;
  salespeople: PartnerSalesperson[];
  activeSalespersonId?: string | null;
  segment: string;
  selectedBranchId: string | null;
  canCheckout: boolean;
  onCreateSale: (sale: { customer_id: string | null; customer_name: string; items: SaleItem[]; total: number; customer_type: ClientType; delivery_type: DeliveryType; imei?: string; serial_number?: string; payment_method?: string; salesperson_id?: string | null; branch_id?: string | null }) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [visibleProductCount, setVisibleProductCount] = useState(PRODUCT_PAGE_SIZE);
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setVisibleProductCount(PRODUCT_PAGE_SIZE);
  }, [search, selectedBranchId]);
  const [cart, setCart] = useState<{ product_id: string; name: string; quantity: number; unit_price: number }[]>([]);
  const previousBranchId = useRef(selectedBranchId);
  const [branchChangedWithCart, setBranchChangedWithCart] = useState(false);
  useEffect(() => {
    if (previousBranchId.current !== selectedBranchId && cart.length > 0) {
      setBranchChangedWithCart(true);
    }
    if (cart.length === 0) setBranchChangedWithCart(false);
    previousBranchId.current = selectedBranchId;
  }, [cart.length, selectedBranchId]);
  const cartHasWrongBranch = Boolean(selectedBranchId && cart.some((item) => {
    const product = products.find((candidate) => candidate.id === item.product_id);
    return !product || (product.branch_id != null && product.branch_id !== selectedBranchId);
  }));
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [clientType, setClientType] = useState<ClientType>('varejo');
  const [imei, setImei] = useState('');
  const [serial, setSerial] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('balcao');
  const [salespersonId, setSalespersonId] = useState('');
  const [completed, setCompleted] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const checkoutInFlight = useRef(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [priceTable, setPriceTable] = useState<PriceTable>('varejo');
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const lastClickRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });
  const addedTimeoutRef = useRef<number | null>(null);
  const noticeTimeoutRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (addedTimeoutRef.current !== null) window.clearTimeout(addedTimeoutRef.current);
    if (noticeTimeoutRef.current !== null) window.clearTimeout(noticeTimeoutRef.current);
  }, []);

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

  const filtered = useMemo(() => {
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const term = normalize(search.trim());
    if (!term) return [];
    return products.filter((p) => {
      // `products` já chega filtrado pela filial ativa (ou pela filial fixa do funcionário).
      // Aplica o filtro local apenas quando uma filial específica está selecionada,
      // mantendo a Visão Consolidada do proprietário funcional.
      if (selectedBranchId && p.branch_id !== selectedBranchId) return false;
      return normalize(p.name).includes(term) || normalize(p.sku ?? '').includes(term);
    });
  }, [products, search, selectedBranchId]);

  const total = pdvTotal(cart);
  const selectedCustomer = customers.find((customer) => customer.id === customerId) ?? null;
  const credit = credits.find(item => item.customer_id === customerId);
  const customerOpenCredit = Number(credit?.used ?? 0);
  const customerCreditAvailable = Number(credit?.available ?? 0);
  const billedSaleBlocked = paymentMethod === 'faturado' && Boolean(billedSaleError(credit, customerId || null, total));

  function showSelectionNotice(message: string) {
    setSelectionNotice(message);
    if (noticeTimeoutRef.current !== null) window.clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = window.setTimeout(() => setSelectionNotice(null), 3500);
  }

  function addToCart(product: PartnerProduct) {
    // Ignora disparo duplicado do mesmo toque/clique (ex.: double-tap acidental no mobile).
    const now = Date.now();
    if (lastClickRef.current.id === product.id && now - lastClickRef.current.time < 350) return;
    lastClickRef.current = { id: product.id, time: now };

    if (!product.is_service) {
      const inCart = cart.find((i) => i.product_id === product.id)?.quantity ?? 0;
      if (product.stock <= 0) {
        showSelectionNotice(`"${product.name}" está sem estoque nesta filial.`);
        return;
      }
      if (inCart + 1 > product.stock) {
        showSelectionNotice(`Estoque insuficiente: apenas ${product.stock} un. de "${product.name}" disponíveis.`);
        return;
      }
    }

    const price = getPriceForProduct(product, priceTable);
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) return prev.map((i) => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: product.id, name: product.name, quantity: 1, unit_price: price }];
    });
    setCompleted(false);
    setCheckoutError(null);
    setSelectionNotice(null);
    setLastAddedId(product.id);
    setSearch('');
    searchInputRef.current?.focus();
    if (addedTimeoutRef.current !== null) window.clearTimeout(addedTimeoutRef.current);
    addedTimeoutRef.current = window.setTimeout(() => setLastAddedId(null), 1200);
  }

  function changeQty(id: string, delta: number) {
    if (delta > 0) {
      const product = products.find((p) => p.id === id);
      const inCart = cart.find((i) => i.product_id === id)?.quantity ?? 0;
      if (product && !product.is_service && inCart + 1 > product.stock) {
        showSelectionNotice(`Estoque insuficiente: apenas ${product.stock} un. de "${product.name}" disponíveis.`);
        return;
      }
    }
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
    if (cart.length === 0 || checkoutInFlight.current || hasPendingSale) return;
    if (cart.some(item => !validSalePrice(item.unit_price))) {
      setCheckoutError('Informe preços válidos com até duas casas decimais.');
      return;
    }
    if (!selectedBranchId) {
      alert('Selecione uma filial antes de finalizar a venda.');
      return;
    }
    const customer = customers.find((c) => c.id === customerId);
    if (paymentMethod === 'faturado') {
      const message = billedSaleError(credit, customerId || null, total);
      if (message) { setCheckoutError(message); return; }
    }
    const fallbackName = clientType === 'atacado' ? 'Cliente Atacado' : 'Cliente Varejo';
    checkoutInFlight.current = true;
    setIsCheckingOut(true);
    setCheckoutError(null);
    try {
      await onCreateSale({
        customer_id: customerId || null,
        customer_name: customerName || customer?.name || fallbackName,
        items: cart,
        total,
        customer_type: clientType,
        delivery_type: deliveryType,
        imei: imei || undefined,
        serial_number: serial || undefined,
        payment_method: paymentMethod,
        salesperson_id: salespersonId || null,
        branch_id: selectedBranchId,
      });
      setCart([]); setCustomerId(''); setCustomerName(''); setImei(''); setSerial(''); setSalespersonId('');
      setCompleted(true);
      setClientType('varejo');
      setPriceTable('varejo');
      setPaymentMethod('pix');
      setDeliveryType('balcao');
      setSearch('');
      setVisibleProductCount(PRODUCT_PAGE_SIZE);
      setSelectionNotice(null);
      setLastAddedId(null);
    } catch (error) {
      setCheckoutError(pdvErrorMessage(error));
    } finally {
      checkoutInFlight.current = false;
      setIsCheckingOut(false);
    }
  }

  return (
    <>
      <div className="pdv-layout pdv-checkout-layout">
        <div className="pdv-right">
          <div className="pdv-cart-header"><h4>Dados da venda</h4></div>
          <div className="pdv-sale-scroll">
          {branchChangedWithCart && cart.length > 0 && (
            <div className="pdv-restricted-checkout" role="alert">
              <LockIcon size={16} />
              <span>A filial foi alterada e o carrinho foi mantido. Confira os produtos antes de finalizar.</span>
              <button type="button" className="rma-advance-btn" onClick={() => setCart([])}>Esvaziar carrinho</button>
            </div>
          )}
          {cartHasWrongBranch && (
            <p className="otp-error-msg" role="alert">O carrinho contém produtos de outra filial. Remova os itens incompatíveis ou esvazie o carrinho.</p>
          )}

          {cart.length > 0 && (
            <>
              <div className="pdv-form">
                <label>
                  Tabela de preços
                  <select aria-label="Tabela de preços da venda" value={clientType} onChange={event => handleClientTypeChange(event.target.value as ClientType)}>
                    <option value="varejo">Varejo</option>
                    <option value="atacado">Atacado</option>
                  </select>
                </label>
                <CustomerSearchPicker
                  key={`sale-${clientType}`}
                  id="pdv-customer-search"
                  customers={customers}
                  customerId={customerId}
                  clientType={clientType}
                  onSelect={handleCustomerChange}
                />
                <details className="pdv-traceability">
                  <summary>Mais detalhes{imei || serial ? ' · preenchidos' : ''}</summary>
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
                </details>
                <label>
                  Tipo de atendimento
                  <select aria-label="Tipo de atendimento da venda" value={deliveryType} onChange={event => setDeliveryType(event.target.value as DeliveryType)}>
                    <option value="balcao">Balcão</option>
                    <option value="entrega">Entrega</option>
                    <option value="retirada">Retirada</option>
                  </select>
                </label>
                <div className="form-row">
                  <label>
                    Forma de Pagamento
                    <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} disabled={!canCheckout}>
                      <option value="pix">PIX</option>
                      <option value="cartao">Cartão</option>
                      <option value="dinheiro">Dinheiro</option>
                      <option value="faturado">Faturado B2B</option>
                    </select>
                  </label>
                  {!activeSalespersonId && (
                    <SalespersonSearchPicker
                      id="pdv-salesperson-search"
                      salespeople={salespeople}
                      salespersonId={salespersonId}
                      onSelect={setSalespersonId}
                    />
                  )}
                </div>
              </div>
              {paymentMethod === 'faturado' && selectedCustomer && !credit && (
                <p role="status">Não foi possível consultar o crédito deste cliente.</p>
              )}
              {paymentMethod === 'faturado' && selectedCustomer && credit && (
                <div className="b2b-credit-summary">
                  <strong>Crédito B2B</strong>
                  <span>Limite: {money.format(Number(credit?.credit_limit ?? 0))}</span>
                  <span>Utilizado: {money.format(customerOpenCredit)}</span>
                  <span>Disponível: {money.format(Math.max(0, customerCreditAvailable))}</span>
                  <span>Esta venda: {money.format(total)}</span>
                </div>
              )}

            </>
          )}
          </div>

          <div className="pdv-sale-footer">
              <div className="pdv-total-bar">
                <span>Total {priceTable === 'atacado' ? '(Atacado)' : '(Varejo)'}</span>
                <strong>{money.format(total)}</strong>
              </div>

              {canCheckout ? (
                <button className="module-submit-btn pdv-checkout-btn" onClick={handleCheckout} disabled={cart.length === 0 || isCheckingOut || billedSaleBlocked || hasPendingSale || cartHasWrongBranch}>
                  <Check size={18} /> {isCheckingOut ? 'Finalizando...' : 'Finalizar Venda'}
                </button>
              ) : (
                <div className="pdv-restricted-checkout">
                  <LockIcon size={16} />
                  <span>Finalização de venda restrita a Caixa, Gerente ou Administrador.</span>
                </div>
              )}

          {completed && (
            <div className="sent-message" role="status">
              <Check size={15} /> Venda finalizada! Pronto para uma nova venda. Cupom, etiqueta e envio no Histórico.
            </div>
          )}
          {checkoutError && <p className="otp-error-msg">{checkoutError}</p>}
          </div>
        </div>

        <div className="pdv-left">
          <div className="pdv-search-bar">
            <Search size={18} />
           <input
  type="search"
  ref={searchInputRef}
  name="new-product-search"
  autoComplete="new-password"
  autoCorrect="off"
  autoCapitalize="none"
  spellCheck={false}
  data-lpignore="true"
  data-1p-ignore="true"
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  placeholder="Buscar produto por nome ou SKU..."
  aria-label="Buscar produto por nome ou SKU"
/>

          </div>

          {selectionNotice && (
            <p className="pdv-selection-notice" role="alert">{selectionNotice}</p>
          )}

          {search.trim() && (
          <div className="pdv-product-search-results" aria-label="Resultados da pesquisa">
          <div className="pdv-product-grid">
            {filtered.length === 0 ? (
              <p className="empty-row">
                {`Nenhum produto encontrado para "${search.trim()}".`}
              </p>
            ) : (
              filtered.slice(0, visibleProductCount).map((p) => {
                const outOfStock = !p.is_service && p.stock <= 0;
                const inCartQty = cart.find((i) => i.product_id === p.id)?.quantity ?? 0;
                const justAdded = lastAddedId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`pdv-product-card${justAdded ? ' added' : ''}`}
                    onClick={() => addToCart(p)}
                    disabled={outOfStock}
                  >
                    <strong>{p.name}</strong>
                    {p.sku && <small>SKU: {p.sku}</small>}
                    <span>{money.format(getPriceForProduct(p, priceTable))}</span>
                    {!p.is_service && (
                      <small className={`pdv-stock${outOfStock ? ' out' : ''}`}>
                        {outOfStock ? 'Sem estoque' : `${p.stock} un. em estoque`}
                      </small>
                    )}
                    {justAdded && (
                      <em className="pdv-added-tag"><Check size={12} /> Adicionado ao carrinho</em>
                    )}
                    {!justAdded && inCartQty > 0 && (
                      <em className="pdv-in-cart-tag">{inCartQty} no carrinho</em>
                    )}
                  </button>
                );
              })
            )}
          </div>
          {filtered.length > visibleProductCount && (
            <button
              type="button"
              className="module-action-btn"
              onClick={() => setVisibleProductCount((count) => count + PRODUCT_PAGE_SIZE)}
            >
              Carregar mais ({Math.min(visibleProductCount, filtered.length)} de {filtered.length})
            </button>
          )}
          </div>
          )}
          <section className="pdv-cart-main" aria-label="Carrinho">
          <div className="pdv-cart-header">
            <h4>Carrinho · {cart.reduce((count, item) => count + item.quantity, 0)} itens</h4>
            {cart.length > 0 && (
              <button className="rma-advance-btn danger" onClick={() => setCart([])}>
                <X size={14} /> Limpar
              </button>
            )}
          </div>

          <div className={`pdv-cart-table-wrap${cart.length >= 10 ? ' pdv-cart-table-scrollable' : ''}`}>
          <table className="rma-table pdv-cart-table">
            <thead><tr><th>Produto</th><th>Quantidade</th><th>Preço</th><th>Subtotal</th><th>Remover</th></tr></thead>
            <tbody>
            {cart.length === 0 ? (
              <tr><td colSpan={5} className="empty-row">Carrinho vazio. Pesquise um produto acima para começar.</td></tr>
            ) : (
              cart.map((item) => (
                <tr key={item.product_id}>
                  <td>
                    <strong>{item.name}</strong>
                  </td>
                  <td><div className="pdv-item-controls">
                    <button aria-label={`Diminuir quantidade de ${item.name}`} onClick={() => changeQty(item.product_id, -1)}>−</button>
                    <b>{item.quantity}</b>
                    <button aria-label={`Aumentar quantidade de ${item.name}`} onClick={() => changeQty(item.product_id, 1)}>+</button>
                  </div></td>
                  <td>{canEditPrice ? <SalePriceInput value={item.unit_price} name={item.name} disabled={isCheckingOut || hasPendingSale} onChange={value => setCart(previous => previous.map(row => row.product_id === item.product_id ? { ...row, unit_price: value } : row))} /> : money.format(item.unit_price)}</td>
                  <td>{money.format(item.unit_price * item.quantity)}</td>
                  <td><button className="pdv-remove" aria-label={`Remover ${item.name}`} onClick={() => removeFromCart(item.product_id)}><Trash2 size={16} /></button></td>
                </tr>
              ))
            )}
            </tbody>
          </table>
          </div>
          </section>
        </div>
      </div>

    </>
  );
}

/* ============ Pré-Venda / Orçamentos ============ */

function PreVendaTab({ products, customers, sales, salespeople, activeSalespersonId, segment, selectedBranchId, canCheckout, canEditPrice, onCreatePreSale, onFinalizePreSale, onCancelSale, onDeleteSale, onPullToPdv }: {
  onPullToPdv: (sale: PartnerSale) => void;
  products: PartnerProduct[];
  customers: PartnerCustomer[];
  sales: PartnerSale[];
  salespeople: PartnerSalesperson[];
  activeSalespersonId?: string | null;
  segment: string;
  selectedBranchId: string | null;
  canCheckout: boolean;
  onCreatePreSale: (sale: { customer_id: string | null; customer_name: string; items: SaleItem[]; total: number; customer_type: ClientType; delivery_type: DeliveryType; payment_method?: string | null; imei?: string; serial_number?: string; salesperson_id?: string | null; branch_id?: string | null }) => Promise<void>;
  canEditPrice: boolean;
  onFinalizePreSale: (id: string, paymentMethod: string) => Promise<void>;
  onCancelSale: (id: string, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  onDeleteSale: (id: string, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<{ product_id: string; name: string; quantity: number; unit_price: number }[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [clientType, setClientType] = useState<ClientType>('varejo');
  const [imei, setImei] = useState('');
  const [serial, setSerial] = useState('');
  const [priceTable, setPriceTable] = useState<PriceTable>('varejo');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('balcao');
  const [salespersonId, setSalespersonId] = useState('');
  const [saved, setSaved] = useState(false);
  const [preSalePayment, setPreSalePayment] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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
  const managers = salespeople.filter((s) => s.role === 'administrador' || s.role === 'gerente');

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

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return products.filter((p) => {
      if (!selectedBranchId || p.branch_id !== selectedBranchId) return false;
      return !term || p.name.toLowerCase().includes(term) || (p.sku ?? '').toLowerCase().includes(term);
    });
  }, [products, search, selectedBranchId]);

  const total = pdvTotal(cart);

  function addToCart(product: PartnerProduct) {
    const price = getPriceForProduct(product, priceTable);
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) return prev.map((i) => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: product.id, name: product.name, quantity: 1, unit_price: price }];
    });
    setSaved(false);
    setSaveError(null);
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
    if (cart.some(item => !validSalePrice(item.unit_price))) {
      setSaveError('Informe preços válidos com até duas casas decimais.');
      return;
    }
    if (!selectedBranchId) {
      alert('Selecione uma filial antes de salvar a pré-venda.');
      return;
    }
    const customer = customers.find((c) => c.id === customerId);
    const fallbackName = clientType === 'atacado' ? 'Cliente Atacado' : 'Cliente Varejo';
    setIsSaving(true);
    setSaveError(null);
    try {
      await onCreatePreSale({
        payment_method: preSalePayment || null,
        customer_id: customerId || null,
        customer_name: customerName || customer?.name || fallbackName,
        items: cart,
        total,
        customer_type: clientType,
        delivery_type: deliveryType,
        imei: imei || undefined,
        serial_number: serial || undefined,
        salesperson_id: salespersonId || null,
        branch_id: selectedBranchId,
      });
      setCart([]); setCustomerId(''); setCustomerName(''); setImei(''); setSerial(''); setSalespersonId('');
      setPreSalePayment('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Não foi possível salvar a pré-venda.');
    } finally {
      setIsSaving(false);
    }
  }

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
    <>
      <div className="pdv-layout pdv-presale-layout">
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
                    {canEditPrice ? <SalePriceInput value={item.unit_price} name={item.name} disabled={isSaving} onChange={value => setCart(previous => previous.map(row => row.product_id === item.product_id ? { ...row, unit_price: value } : row))} /> : <small>{money.format(item.unit_price)} / un.</small>}
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
                  Tabela de preços
                  <div className="pdv-client-type-toggle">
                    <button
                      type="button"
                      className={`price-toggle-btn ${clientType === 'varejo' ? 'active' : ''}`}
                      onClick={() => handleClientTypeChange('varejo')}
                    >
                      <Tag size={15} /> Varejo
                    </button>
                    <button
                      type="button"
                      className={`price-toggle-btn ${clientType === 'atacado' ? 'active' : ''}`}
                      onClick={() => handleClientTypeChange('atacado')}
                    >
                      <Tag size={15} /> Atacado
                    </button>
                  </div>
                </label>
                <CustomerSearchPicker
                  key={`pre-sale-${clientType}`}
                  id="presale-customer-search"
                  customers={customers}
                  customerId={customerId}
                  clientType={clientType}
                  onSelect={handleCustomerChange}
                />
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
                {!activeSalespersonId && (
                  <SalespersonSearchPicker
                    id="presale-salesperson-search"
                    salespeople={salespeople}
                    salespersonId={salespersonId}
                    onSelect={setSalespersonId}
                  />
                )}
                <label>
                  Tipo de atendimento
                  <div className="pdv-client-type-toggle">
                    {(['balcao', 'entrega', 'retirada'] as DeliveryType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        className={`price-toggle-btn ${deliveryType === type ? 'active' : ''}`}
                        onClick={() => setDeliveryType(type)}
                      >
                        {type === 'balcao' ? 'Balcão' : type === 'entrega' ? 'Entrega' : 'Retirada'}
                      </button>
                    ))}
                  </div>
                </label>
              </div>

              <div className="pdv-total-bar">
                <span>Total {priceTable === 'atacado' ? '(Atacado)' : '(Varejo)'}</span>
                <strong>{money.format(total)}</strong>
              </div>

              <label style={{ display: 'block', marginBottom: '12px' }}>Forma de pagamento prevista
                <select value={preSalePayment} onChange={event => setPreSalePayment(event.target.value)} disabled={isSaving}>
                  <option value="">A definir</option><option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro</option><option value="cartao">Cartão</option><option value="faturado">Faturado</option>
                </select>
              </label>
              <p className="otp-description">O pagamento será confirmado ao finalizar a pré-venda no caixa.</p>
              <button className="module-submit-btn pdv-checkout-btn" onClick={handleSavePreSale} disabled={isSaving}>
                {saved ? <><Check size={18} /> Pré-Venda Salva!</> : <><ClipboardList size={18} /> {isSaving ? 'Salvando...' : 'Salvar Pré-Venda'}</>}
              </button>

              {saved && (
                <div className="sent-message">
                  <Check size={15} /> Pré-venda salva com status Pendente. Aguardando finalização no caixa.
                </div>
              )}
              {saveError && <p className="otp-error-msg">{saveError}</p>}
            </>
          )}
        </div>
      </div>

      {/* Pending Pre-Sales List */}
      <div className="pdv-recent-sales pdv-presale-pending">
        <h4>Pré-Vendas Pendentes ({preSales.length})</h4>
        <div className="stock-table-wrap">
          <table className="rma-table">
            <thead><tr><th>Cliente</th><th>Itens</th><th>Total</th><th>{traceabilityLabel}</th><th>Pagamento</th><th>Data</th><th>Ações</th></tr></thead>
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
                      <span>{s.payment_method || 'A definir'}</span>
                      <small className="open-order-secondary">Pendente</small>
                    </td>
                    <td>{new Date(s.created_at).toLocaleDateString('pt-BR')}</td>
                    <td>
                      <div className="row-action-group">
                        {canCheckout && <button className="rma-advance-btn" onClick={() => onPullToPdv(s)}>Resgatar para PDV</button>}
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
            {finalizeError && <p className="otp-error-msg" role="alert">{finalizeError}</p>}
            <div className="otp-actions">
              <button className="rma-advance-btn" disabled={isFinalizing} onClick={() => setFinalizeTarget(null)}>Cancelar</button>
              <button className="module-submit-btn" onClick={confirmFinalize} disabled={isFinalizing}>
                <Check size={16} /> {isFinalizing ? 'Finalizando...' : 'Confirmar Venda'}
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
              Cancelar ou apagar uma pré-venda requer permissão de Administrador ou Gerente. Selecione o responsável e digite o PIN dele para continuar.
            </p>
            {managers.length === 0 ? (
              <p className="otp-error-msg">Nenhum Administrador ou Gerente cadastrado com PIN. Cadastre um em Colaboradores antes de continuar.</p>
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
                <Trash2 size={16} /> {isVerifyingPin ? 'Verificando...' : 'Apagar'}
              </button>
              <button className="module-submit-btn" onClick={() => verifyPinAndCancel('cancel')} disabled={isVerifyingPin || managers.length === 0}>
                <Ban size={16} /> {isVerifyingPin ? 'Verificando...' : 'Cancelar Pré-Venda'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
