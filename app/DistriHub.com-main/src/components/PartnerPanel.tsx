import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Boxes,
  ShoppingCart,
  Wallet,
  Package,
  BarChart3,
  Wand2,
  Settings,
  Menu,
  X,
  Store,
  Truck,
  ClipboardList,
  FileText,
  Shield,
  Headphones,
  Wrench,
  UserCheck,
  Lock,
  KeyRound,
} from 'lucide-react';

import type { User } from '@supabase/supabase-js';

import { usePartnerData } from '../hooks/usePartnerData';

import { CadastrosModule } from './partner/CadastrosModule';
import { PdvModule } from './partner/PdvModule';
import { FinancialModule } from './partner/FinancialModule';
import { RmaModule } from './partner/RmaModule';
import { ReportsModule } from './partner/ReportsModule';
import { WhiteLabelModule } from './partner/WhiteLabelModule';
import { MultiStoreModule } from './partner/MultiStoreModule';
import { DeliveryModule } from './partner/DeliveryModule';
import { SettingsModule } from './partner/SettingsModule';
import { OpenOrdersModule } from './partner/OpenOrdersModule';
import { FiscalModule } from './partner/FiscalModule';
import { AdminModule } from './partner/AdminModule';
import { OrderHistoryModule } from './partner/OrderHistoryModule';
import { SupportChatModule } from './partner/SupportChatModule';
import { ServiceOrdersModule } from './partner/ServiceOrdersModule';

import type {
  StoreSettings,
  BusinessSegment,
  SalespersonRole,
  PartnerProduct,
  PartnerCustomer,
  PartnerSale,
  RmaPayload,
  RmaRequest,
  SaleItem,
  CustomerType,
  DeliveryType,
  PartnerIdentity,
} from '../types';

type PartnerPanelProps = {
  onBack: () => void;
  user: User | null;
  identity: PartnerIdentity | null;
  identityError: string | null;
  segment: BusinessSegment;
  initialTab?: string;
  onConsumeInitialTab?: () => void;
};

type Tab =
  | 'cadastros'
  | 'pdv'
  | 'pedidos'
  | 'os'
  | 'historico'
  | 'suporte'
  | 'fiscal'
  | 'administrativo'
  | 'financeiro'
  | 'rma'
  | 'relatorios'
  | 'white-label'
  | 'configuracoes'
  | 'entregas';

const allTabs: {
  id: Tab;
  label: string;
  icon: typeof Boxes;
}[] = [
  {
    id: 'cadastros',
    label: 'Cadastros',
    icon: Boxes,
  },
  {
    id: 'pdv',
    label: 'PDV & Vendas',
    icon: ShoppingCart,
  },
  {
    id: 'pedidos',
    label: 'Pedidos em Aberto',
    icon: ClipboardList,
  },
  {
    id: 'os',
    label: 'Ordens de Serviço',
    icon: Wrench,
  },
  {
    id: 'historico',
    label: 'Histórico de Compras',
    icon: FileText,
  },
  {
    id: 'suporte',
    label: 'Suporte',
    icon: Headphones,
  },
  {
    id: 'fiscal',
    label: 'Nota Fiscal',
    icon: FileText,
  },
  {
    id: 'administrativo',
    label: 'Administrativo',
    icon: Shield,
  },
  {
    id: 'entregas',
    label: 'Gestão de Entregas',
    icon: Truck,
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    icon: Wallet,
  },
  {
    id: 'rma',
    label: 'RMA & Devoluções',
    icon: Package,
  },
  {
    id: 'relatorios',
    label: 'Relatórios & CRM',
    icon: BarChart3,
  },
  {
    id: 'white-label',
    label: 'Personalização',
    icon: Wand2,
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    icon: Settings,
  },
];

const gerenteBlockedTabs: Tab[] = [
  'financeiro',
  'white-label',
  'configuracoes',
];

const vendedorBlockedTabs: Tab[] = [
  'financeiro',
  'white-label',
  'configuracoes',
  'entregas',
  'fiscal',
];

const atendenteBlockedTabs: Tab[] = [
  'financeiro',
  'white-label',
  'configuracoes',
  'entregas',
  'fiscal',
  'rma',
];

const tecnicoBlockedTabs: Tab[] = [
  'cadastros',
  'pdv',
  'financeiro',
  'white-label',
  'configuracoes',
  'entregas',
  'relatorios',
  'fiscal',
];

const logisticaBlockedTabs: Tab[] = [
  'cadastros',
  'pdv',
  'financeiro',
  'rma',
  'white-label',
  'configuracoes',
  'relatorios',
  'fiscal',
];

export function PartnerPanel({
  onBack,
  user,
  identity,
  identityError,
  segment,
  initialTab,
  onConsumeInitialTab,
}: PartnerPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('cadastros');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentRole, setCurrentRole] = useState<SalespersonRole>('administrador');

  // Operator session & employee branch restriction
  const [currentSalespersonId, setCurrentSalespersonId] = useState<string | null>(null);
  const [activeOperatorPin, setActiveOperatorPin] = useState<string | null>(null);
  const [showOperatorModal, setShowOperatorModal] = useState(false);
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>('owner');
  const [operatorPinInput, setOperatorPinInput] = useState('');
  const [operatorPinError, setOperatorPinError] = useState('');

  const partner = usePartnerData(identity);

  const activeSalesperson = identity?.salespersonId
    ? partner.salespeople.find((s) => s.id === identity.salespersonId) ?? {
        id: identity.salespersonId, user_id: identity.companyUserId, name: 'Funcionário', role: identity.role,
        commission_rate: 0, phone: null, email: null, is_active: true, branch_id: identity.branchId,
        created_at: '',
      }
    : currentSalespersonId
    ? partner.salespeople.find((s) => s.id === currentSalespersonId)
    : null;

  const isEmployeeRestricted = Boolean(identity?.salespersonId);

  const lockedBranchId = isEmployeeRestricted ? identity!.branchId! : null;
  const effectiveBranchId = lockedBranchId ?? selectedBranchId;

  const effectiveRole: SalespersonRole = activeSalesperson
    ? activeSalesperson.role
    : 'administrador';

  useEffect(() => {
    setCurrentRole(effectiveRole);
  }, [effectiveRole]);

  useEffect(() => {
    if (isEmployeeRestricted && lockedBranchId && selectedBranchId !== lockedBranchId) {
      setSelectedBranchId(lockedBranchId);
    }
  }, [isEmployeeRestricted, lockedBranchId, selectedBranchId]);

  useEffect(() => {
    if (initialTab) {
      const validTab = allTabs.find((t) => t.id === initialTab);
      if (validTab) {
        setActiveTab(validTab.id);
      }
      onConsumeInitialTab?.();
    }
  }, [initialTab, onConsumeInitialTab]);

  const blockedTabs = useMemo(() => {
    switch (effectiveRole) {
      case 'gerente': return gerenteBlockedTabs;
      case 'vendedor': return vendedorBlockedTabs;
      case 'caixa': return vendedorBlockedTabs;
      case 'atendente': return atendenteBlockedTabs;
      case 'tecnico': return tecnicoBlockedTabs;
      case 'logistica': return logisticaBlockedTabs;
      default: return [];
    }
  }, [effectiveRole]);

  const visibleTabs = useMemo(() => {
    return allTabs.filter((tab) => !blockedTabs.includes(tab.id));
  }, [blockedTabs]);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id ?? 'pdv');
    }
  }, [visibleTabs, activeTab]);

  const lockedBranch = useMemo(() => {
    if (!lockedBranchId) return null;
    return partner.branches.find((b) => b.id === lockedBranchId) ?? null;
  }, [partner.branches, lockedBranchId]);

  // Derived branch-filtered datasets
  const filteredProducts = useMemo(() => {
    if (!effectiveBranchId) return partner.products;
    return partner.products.filter((p) => p.branch_id === effectiveBranchId);
  }, [partner.products, effectiveBranchId]);

  const filteredSales = useMemo(() => {
    if (!effectiveBranchId) return partner.sales;
    return partner.sales.filter((s) => s.branch_id === effectiveBranchId);
  }, [partner.sales, effectiveBranchId]);

  const filteredCustomers = useMemo(() => {
    if (!effectiveBranchId) return partner.customers;
    return partner.customers.filter((c) => !c.branch_id || c.branch_id === effectiveBranchId);
  }, [partner.customers, effectiveBranchId]);

  const filteredRmaRequests = useMemo(() => {
    if (!effectiveBranchId) return partner.rmaRequests;
    return partner.rmaRequests.filter((r) => !r.branch_id || r.branch_id === effectiveBranchId);
  }, [partner.rmaRequests, effectiveBranchId]);

  const filteredInvoices = useMemo(() => {
    if (!effectiveBranchId) return partner.invoices;
    return partner.invoices.filter((i) => !i.branch_id || i.branch_id === effectiveBranchId);
  }, [partner.invoices, effectiveBranchId]);

  const filteredOrders = useMemo(() => {
    if (!effectiveBranchId) return partner.orders;
    return partner.orders.filter((o) => !o.branch_id || o.branch_id === effectiveBranchId);
  }, [partner.orders, effectiveBranchId]);

  const filteredSalespeople = useMemo(() => {
    if (!effectiveBranchId) return partner.salespeople;
    return partner.salespeople.filter((s) => !s.branch_id || s.branch_id === effectiveBranchId);
  }, [partner.salespeople, effectiveBranchId]);

  // Guarded mutation functions ensuring strict branch isolation
  async function handleAddProduct(product: Omit<PartnerProduct, 'id' | 'user_id' | 'created_at' | 'updated_at'>) {
    const targetBranch = isEmployeeRestricted ? effectiveBranchId : (product.branch_id || effectiveBranchId);
    if (!targetBranch) {
      window.alert('Selecione uma filial antes de cadastrar produtos.');
      return;
    }
    if (isEmployeeRestricted && targetBranch !== effectiveBranchId) {
      window.alert('Acesso negado: você só pode cadastrar produtos na sua filial vinculada.');
      return;
    }
    await partner.addProduct({ ...product, branch_id: targetBranch }, currentSalespersonId, activeOperatorPin);
  }

  async function handleDeleteProduct(id: string) {
    const target = partner.products.find((p) => p.id === id);
    if (isEmployeeRestricted && target && target.branch_id && target.branch_id !== effectiveBranchId) {
      window.alert('Acesso negado: você não tem permissão para excluir produtos de outra filial.');
      return;
    }
    await partner.deleteProduct(id, currentSalespersonId, activeOperatorPin);
  }

  async function handleAddCustomer(customer: Omit<PartnerCustomer, 'id' | 'user_id' | 'created_at'>) {
    const targetBranch = isEmployeeRestricted ? effectiveBranchId : (customer.branch_id || effectiveBranchId);
    if (!targetBranch) {
      window.alert('Selecione uma filial antes de cadastrar clientes.');
      return;
    }
    if (isEmployeeRestricted && targetBranch !== effectiveBranchId) {
      window.alert('Acesso negado: você só pode cadastrar clientes na sua filial vinculada.');
      return;
    }
    await partner.addCustomer({ ...customer, branch_id: targetBranch }, currentSalespersonId, activeOperatorPin);
  }

  async function handleUpdateCustomer(id: string, updates: Partial<PartnerCustomer>) {
    const target = partner.customers.find((c) => c.id === id);
    if (isEmployeeRestricted && target && target.branch_id && target.branch_id !== effectiveBranchId) {
      window.alert('Acesso negado: você não tem permissão para alterar clientes de outra filial.');
      return;
    }
    await partner.updateCustomer(id, isEmployeeRestricted ? { ...updates, branch_id: effectiveBranchId } : updates, currentSalespersonId, activeOperatorPin);
  }

  async function handleDeleteCustomer(id: string) {
    const target = partner.customers.find((c) => c.id === id);
    if (isEmployeeRestricted && target && target.branch_id && target.branch_id !== effectiveBranchId) {
      window.alert('Acesso negado: você não tem permissão para excluir clientes desta filial.');
      return;
    }
    await partner.deleteCustomer(id, currentSalespersonId, activeOperatorPin);
  }

  async function handleCreateSale(sale: { customer_id: string | null; customer_name: string; items: SaleItem[]; total: number; customer_type: CustomerType; delivery_type: DeliveryType; imei?: string; serial_number?: string; payment_method?: string; salesperson_id?: string | null; branch_id?: string | null }) {
    const targetBranch = isEmployeeRestricted ? effectiveBranchId : (sale.branch_id || effectiveBranchId);
    if (!targetBranch) {
      window.alert('Selecione uma filial para realizar a venda.');
      return;
    }
    if (isEmployeeRestricted && targetBranch !== effectiveBranchId) {
      window.alert('Acesso negado: você só pode realizar vendas na sua filial vinculada.');
      return;
    }
    await partner.createSale(
      {
        ...sale,
        branch_id: targetBranch,
        salesperson_id: activeSalesperson ? activeSalesperson.id : (sale.salesperson_id || null),
      },
      currentSalespersonId,
      activeOperatorPin,
    );
  }

  async function handleCreatePreSale(sale: { customer_id: string | null; customer_name: string; items: SaleItem[]; total: number; customer_type: CustomerType; delivery_type: DeliveryType; imei?: string; serial_number?: string; salesperson_id?: string | null; branch_id?: string | null }) {
    const targetBranch = isEmployeeRestricted ? effectiveBranchId : (sale.branch_id || effectiveBranchId);
    if (!targetBranch) {
      window.alert('Selecione uma filial para criar a pré-venda.');
      return;
    }
    if (isEmployeeRestricted && targetBranch !== effectiveBranchId) {
      window.alert('Acesso negado: você só pode criar pré-vendas na sua filial vinculada.');
      return;
    }
    await partner.createPreSale(
      {
        ...sale,
        branch_id: targetBranch,
        salesperson_id: activeSalesperson ? activeSalesperson.id : (sale.salesperson_id || null),
      },
      currentSalespersonId,
      activeOperatorPin,
    );
  }

  async function handleFinalizePreSale(id: string, paymentMethod: string) {
    const sale = partner.sales.find((s) => s.id === id);
    if (isEmployeeRestricted && sale && sale.branch_id && sale.branch_id !== effectiveBranchId) {
      window.alert('Acesso negado: você só pode finalizar pré-vendas da sua filial vinculada.');
      return;
    }
    await partner.finalizePreSale(id, paymentMethod, currentSalespersonId, activeOperatorPin);
  }

  async function handleCancelSale(id: string) {
    const sale = partner.sales.find((s) => s.id === id);
    if (isEmployeeRestricted && sale && sale.branch_id && sale.branch_id !== effectiveBranchId) {
      window.alert('Acesso negado: você não pode cancelar vendas de outra filial.');
      return;
    }
    await partner.cancelSale(id, currentSalespersonId, activeOperatorPin);
  }

  async function handleDeleteSale(id: string) {
    const sale = partner.sales.find((s) => s.id === id);
    if (isEmployeeRestricted && sale && sale.branch_id && sale.branch_id !== effectiveBranchId) {
      window.alert('Acesso negado: você não pode excluir vendas de outra filial.');
      return;
    }
    await partner.deleteSale(id, currentSalespersonId, activeOperatorPin);
  }

  async function handleCreateRma(rma: RmaPayload) {
    const targetBranch = isEmployeeRestricted ? effectiveBranchId : (rma.branch_id || effectiveBranchId);
    await partner.createRma({ ...rma, branch_id: targetBranch || null });
  }

  async function handleAddBranch(name: string, address: string) {
    if (isEmployeeRestricted) {
      window.alert('Funcionários não têm permissão para adicionar novas filiais.');
      return;
    }
    await partner.addBranch(name, address);
  }

  function openOperatorModal() {
    setSelectedOperatorId(currentSalespersonId ?? 'owner');
    setOperatorPinInput('');
    setOperatorPinError('');
    setShowOperatorModal(true);
  }

  function handleConfirmOperator() {
    setOperatorPinError('');
    if (selectedOperatorId === 'owner' || !selectedOperatorId) {
      setCurrentSalespersonId(null);
      setActiveOperatorPin(null);
      setShowOperatorModal(false);
      return;
    }

    const targetSp = partner.salespeople.find((s) => s.id === selectedOperatorId);
    if (!targetSp) return;

    if (targetSp.pin) {
      if (operatorPinInput !== targetSp.pin) {
        setOperatorPinError('PIN incorreto. Digite os 4 dígitos cadastrados para este operador.');
        return;
      }
    }

    setCurrentSalespersonId(targetSp.id);
    setActiveOperatorPin(operatorPinInput || null);
    if (targetSp.branch_id) {
      setSelectedBranchId(targetSp.branch_id);
    }
    setShowOperatorModal(false);
  }

  function handleSelectBranch(id: string) {
    if (isEmployeeRestricted) {
      window.alert(`Operação negada: Seu usuário está vinculado à filial "${lockedBranch?.name ?? ''}" e não pode trocar de loja.`);
      return;
    }
    setSelectedBranchId(id);
  }

  const defaultSettings: StoreSettings = {
    id: 'default',
    user_id: identity?.companyUserId ?? '',
    logo_url: null,
    banner_url: null,
    primary_color: '#3193e5',
    nav_color: '#0b1927',
    internal_notice: '',
    warranty_terms: '',
    receipt_footer_text: '',
    show_logo_on_receipt: true,
    show_cnpj_on_receipt: true,
    updated_at: new Date().toISOString(),
  };

  const storeSettings = partner.storeSettings ?? defaultSettings;

  if (identityError) {
    return <div className="partner-panel"><p className="partner-loading">{identityError}</p></div>;
  }

  function handleTabClick(tab: Tab) {
    setActiveTab(tab);
    setSidebarOpen(false);
  }

  return (
    <div className="partner-panel sidebar-layout">

      <div className="sidebar-mobile-bar">
        <button
          className="sidebar-toggle"
          onClick={() =>
            setSidebarOpen(!sidebarOpen)
          }
          aria-label="Menu"
        >
          {sidebarOpen ? (
            <X size={22} />
          ) : (
            <Menu size={22} />
          )}
        </button>

        <span className="sidebar-mobile-title">
          <Store size={18} />
          {
            visibleTabs.find(
              (t) => t.id === activeTab
            )?.label
          }
        </span>

        <button
          className="partner-back-btn compact"
          onClick={onBack}
        >
          <ArrowLeft size={18} />
        </button>
      </div>

      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() =>
            setSidebarOpen(false)
          }
        />
      )}

      <aside
        className={`partner-sidebar ${
          sidebarOpen ? 'open' : ''
        }`}
      >
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <span className="sidebar-brand-mark">
              <Store size={22} />
            </span>

            <div>
              <strong>
                Painel do Lojista
              </strong>
            </div>
          </div>

          <button
            className="partner-back-btn"
            onClick={onBack}
          >
            <ArrowLeft size={16} />
            Voltar ao início
          </button>
        </div>

        {/* Banner de Operador/Sessão */}
        <div style={{ padding: '10px 12px', margin: '8px 12px', borderRadius: '8px', background: isEmployeeRestricted ? 'rgba(59,155,237,0.12)' : '#102433', border: '1px solid #1d3445' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ minWidth: 0 }}>
              <small style={{ color: '#6e8799', display: 'block', fontSize: '11px' }}>Operador Ativo:</small>
              <strong style={{ color: '#eaf1f6', fontSize: '13px', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeSalesperson ? activeSalesperson.name : 'Proprietário (Admin)'}
              </strong>
              {lockedBranch ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#5cb5f1', fontSize: '11px', marginTop: '2px' }}>
                  <Lock size={12} /> {lockedBranch.name}
                </span>
              ) : (
                <span style={{ display: 'block', color: '#889eaf', fontSize: '11px', marginTop: '2px' }}>
                  Todas as filiais
                </span>
              )}
            </div>
            <button
              onClick={openOperatorModal}
              className="rma-advance-btn"
              style={{ fontSize: '11px', padding: '4px 8px' }}
              title="Trocar Operador / Funcionário"
            >
              <UserCheck size={14} />
            </button>
          </div>
        </div>

        <nav className="sidebar-nav">
          {visibleTabs.map(
            ({
              id,
              label,
              icon: Icon,
            }) => (
              <button
                key={id}
                className={`sidebar-nav-item ${
                  activeTab === id
                    ? 'active'
                    : ''
                }`}
                onClick={() =>
                  handleTabClick(id)
                }
              >
                <Icon size={20} />
                {label}
              </button>
            )
          )}
        </nav>

        {partner.loading && (
          <div className="sidebar-footer">
            <span className="partner-loading">
              Carregando...
            </span>
          </div>
        )}
      </aside>

      <div className="sidebar-main">
        <div className="sidebar-main-inner">

          {partner.error && <p className="partner-loading">{partner.error}</p>}

          <MultiStoreModule
            branches={partner.branches}
            selectedBranchId={
              effectiveBranchId || null
            }
            onSelectBranch={
              handleSelectBranch
            }
            onAddBranch={
              handleAddBranch
            }
            isEmployeeLocked={isEmployeeRestricted}
            lockedBranchName={lockedBranch?.name}
          />

          <div className="partner-content">

            {activeTab === 'cadastros' && (
              <CadastrosModule
                products={filteredProducts}
                branches={partner.branches}
                selectedBranchId={
                  effectiveBranchId
                }
                categories={
                  partner.categories
                }
                suppliers={
                  partner.suppliers
                }
                salespeople={
                  filteredSalespeople
                }
                combos={partner.combos}
                modifiers={
                  partner.modifiers
                }
                customers={
                  filteredCustomers
                }
                sales={filteredSales}
                segment={segment}
                onAddProduct={
                  handleAddProduct
                }
                onDeleteProduct={
                  handleDeleteProduct
                }
                onAddCategory={
                  partner.addCategory
                }
                onDeleteCategory={
                  partner.deleteCategory
                }
                onAddSupplier={
                  partner.addSupplier
                }
                onAddSalesperson={
                  partner.addSalesperson
                }
                onUpdateSalesperson={
                  partner.updateSalesperson
                }
                onDeleteSalesperson={
                  partner.deleteSalesperson
                }
                onAddCombo={
                  partner.addCombo
                }
                onDeleteCombo={
                  partner.deleteCombo
                }
                onAddModifier={
                  partner.addModifier
                }
                onDeleteModifier={
                  partner.deleteModifier
                }
                onAddCustomer={
                  handleAddCustomer
                }
                onUpdateCustomer={
                  handleUpdateCustomer
                }
                onDeleteCustomer={
                  handleDeleteCustomer
                }
              />
            )}

            {activeTab === 'pdv' && (
              <PdvModule
                products={filteredProducts}
                customers={
                  filteredCustomers
                }
                sales={filteredSales}
                salespeople={
                  filteredSalespeople
                }
                segment={segment}
                selectedBranchId={
                  effectiveBranchId || null
                }
                currentRole={
                  effectiveRole
                }
                onCreateSale={
                  handleCreateSale
                }
                onCreatePreSale={
                  handleCreatePreSale
                }
                onFinalizePreSale={
                  handleFinalizePreSale
                }
                onCancelSale={
                  handleCancelSale
                }
                onDeleteSale={
                  handleDeleteSale
                }
              />
            )}

            {activeTab === 'pedidos' && (
              <OpenOrdersModule
                sales={filteredSales}
                customers={
                  filteredCustomers
                }
                salespeople={
                  filteredSalespeople
                }
                currentRole={
                  effectiveRole
                }
                onFinalizePreSale={
                  handleFinalizePreSale
                }
                onCancelSale={
                  handleCancelSale
                }
                onDeleteSale={
                  handleDeleteSale
                }
              />
            )}

            {activeTab === 'os' && (
              <ServiceOrdersModule
                userId={identity?.companyUserId}
                segment={segment}
                branches={
                  partner.branches
                }
                customers={
                  filteredCustomers
                }
                products={
                  filteredProducts
                }
                selectedBranchId={
                  effectiveBranchId
                }
                warrantyTerms={
                  storeSettings.warranty_terms ?? ''
                }
                onUpdateWarrantyTerms={(value) =>
                  partner.updateStoreSettings({
                    warranty_terms: value,
                  })
                }
              />
            )}

            {activeTab === 'historico' && (
              <OrderHistoryModule
                orders={filteredOrders}
              />
            )}

            {activeTab === 'suporte' && (
              <SupportChatModule
                user={user}
              />
            )}

            {activeTab === 'fiscal' && (
              <FiscalModule
                products={
                  filteredProducts
                }
                sales={filteredSales}
                customers={
                  filteredCustomers
                }
                profile={
                  partner.profile
                }
                currentRole={
                  effectiveRole
                }
                selectedBranchId={
                  effectiveBranchId
                }
              />
            )}

            {activeTab === 'administrativo' && (
              <AdminModule
                userId={identity?.companyUserId}
                sales={filteredSales}
                products={
                  filteredProducts
                }
                salespeople={
                  filteredSalespeople
                }
                branches={
                  partner.branches
                }
                customers={
                  filteredCustomers
                }
                suppliers={
                  partner.suppliers
                }
                categories={
                  partner.categories
                }
                selectedBranchId={
                  effectiveBranchId
                }
                onSelectBranch={
                  handleSelectBranch
                }
                onNavigate={(tab) =>
                  handleTabClick(
                    tab as Tab
                  )
                }
              />
            )}

            {activeTab === 'entregas' && (
              <DeliveryModule
                sales={filteredSales}
                salespeople={
                  filteredSalespeople
                }
                selectedBranchId={
                  effectiveBranchId || null
                }
              />
            )}

            {activeTab === 'financeiro' && (
              <FinancialModule
                invoices={
                  filteredInvoices
                }
                walletBalance={0}
                creditLimit={5000}
                creditUsed={0}
                onPayInvoice={
                  partner.payInvoice
                }
              />
            )}

            {activeTab === 'rma' && (
              <RmaModule
                rmaRequests={
                  filteredRmaRequests
                }
                walletBalance={0}
                warrantyTerms={
                  storeSettings.warranty_terms ??
                  ''
                }
                currentRole={
                  effectiveRole
                }
                onCreate={
                  handleCreateRma
                }
                onUpdateStatus={
                  partner.updateRmaStatus
                }
                onDelete={
                  partner.deleteRma
                }
              />
            )}

            {activeTab === 'relatorios' && (
              <ReportsModule
                sales={filteredSales}
                products={
                  filteredProducts
                }
                customers={
                  filteredCustomers
                }
                salespeople={
                  filteredSalespeople
                }
              />
            )}

            {activeTab === 'white-label' && (
              <WhiteLabelModule
                settings={
                  storeSettings
                }
                onUpdate={
                  partner.updateStoreSettings
                }
              />
            )}

            {activeTab === 'configuracoes' && (
              <SettingsModule
                user={user}
                profile={
                  partner.profile
                }
                onProfileUpdate={
                  partner.updateProfile
                }
              />
            )}

          </div>
        </div>
      </div>

      {showOperatorModal && (
        <div className="modal-backdrop" onClick={() => setShowOperatorModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3>Seleção de Operador / Funcionário</h3>
              <button onClick={() => setShowOperatorModal(false)}><X size={18} /></button>
            </div>
            <div className="rma-form">
              <label>
                Selecione o Operador do Sistema
                <select
                  value={selectedOperatorId}
                  onChange={(e) => {
                    setSelectedOperatorId(e.target.value);
                    setOperatorPinInput('');
                    setOperatorPinError('');
                  }}
                >
                  <option value="owner">Proprietário / Administrador Geral (Acesso Livre)</option>
                  {partner.salespeople.map((sp) => {
                    const spBranch = partner.branches.find((b) => b.id === sp.branch_id);
                    const branchText = spBranch ? `Filial: ${spBranch.name}` : 'Acesso a Todas as Filiais';
                    return (
                      <option key={sp.id} value={sp.id}>
                        {sp.name} ({sp.role.toUpperCase()}) — {branchText}
                      </option>
                    );
                  })}
                </select>
              </label>

              {selectedOperatorId && selectedOperatorId !== 'owner' && (
                <>
                  {partner.salespeople.find((s) => s.id === selectedOperatorId)?.pin ? (
                    <label>
                      <KeyRound size={14} /> PIN de Acesso (4 dígitos)
                      <input
                        type="password"
                        value={operatorPinInput}
                        onChange={(e) => {
                          setOperatorPinInput(e.target.value);
                          setOperatorPinError('');
                        }}
                        placeholder="Digite o PIN do funcionário"
                        maxLength={4}
                        autoFocus
                      />
                    </label>
                  ) : (
                    <small style={{ color: '#889eaf' }}>Este operador não possui PIN cadastrado.</small>
                  )}
                </>
              )}

              {operatorPinError && (
                <p className="otp-error-msg" style={{ color: '#e3829b', fontSize: '12px' }}>{operatorPinError}</p>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button type="button" className="module-submit-btn" onClick={handleConfirmOperator} style={{ flex: 1 }}>
                  Confirmar Operador
                </button>
                <button type="button" className="rma-advance-btn" onClick={() => setShowOperatorModal(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
