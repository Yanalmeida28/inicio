import { useEffect, useState } from 'react';
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
} from '../types';

type PartnerPanelProps = {
  onBack: () => void;
  user: User | null;
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
  segment,
  initialTab,
  onConsumeInitialTab,
}: PartnerPanelProps) {
  const [activeTab, setActiveTab] =
    useState<Tab>('cadastros');

  const [selectedBranchId, setSelectedBranchId] =
    useState<string>('');

  const [sidebarOpen, setSidebarOpen] =
    useState(false);

  const [currentRole, setCurrentRole] =
    useState<SalespersonRole>('administrador');

  const partner = usePartnerData(user);

  useEffect(() => {
    if (initialTab) {
      const validTab = allTabs.find(
        (t) => t.id === initialTab
      );

      if (validTab) {
        setActiveTab(validTab.id);
      }

      onConsumeInitialTab?.();
    }
  }, [
    initialTab,
    onConsumeInitialTab,
  ]);

  /*
   * Temporariamente usamos todas as abas para
   * garantir que Ordens de Serviço apareça.
   *
   * O controle de permissões continua preservado
   * nas listas acima para uso posterior.
   */
  const visibleTabs = allTabs;

  useEffect(() => {
    if (
      !visibleTabs.some(
        (tab) => tab.id === activeTab
      )
    ) {
      setActiveTab(
        visibleTabs[0]?.id ?? 'cadastros'
      );
    }
  }, [visibleTabs, activeTab]);

  const defaultSettings: StoreSettings = {
    id: 'default',
    user_id: user?.id ?? '',
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

  const storeSettings =
    partner.storeSettings ??
    defaultSettings;

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

          <MultiStoreModule
            branches={partner.branches}
            selectedBranchId={
              selectedBranchId || null
            }
            onSelectBranch={
              setSelectedBranchId
            }
            onAddBranch={
              partner.addBranch
            }
          />

          <div className="partner-content">

            {activeTab === 'cadastros' && (
              <CadastrosModule
                products={partner.products}
                branches={partner.branches}
                selectedBranchId={
                  selectedBranchId
                }
                categories={
                  partner.categories
                }
                suppliers={
                  partner.suppliers
                }
                salespeople={
                  partner.salespeople
                }
                combos={partner.combos}
                modifiers={
                  partner.modifiers
                }
                customers={
                  partner.customers
                }
                sales={partner.sales}
                segment={segment}
                onAddProduct={
                  partner.addProduct
                }
                onDeleteProduct={
                  partner.deleteProduct
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
                  partner.addCustomer
                }
                onUpdateCustomer={
                  partner.updateCustomer
                }
                onDeleteCustomer={
                  partner.deleteCustomer
                }
              />
            )}

            {activeTab === 'pdv' && (
              <PdvModule
                products={partner.products}
                customers={
                  partner.customers
                }
                sales={partner.sales}
                salespeople={
                  partner.salespeople
                }
                segment={segment}
                selectedBranchId={
                  selectedBranchId || null
                }
                currentRole={
                  currentRole
                }
                onCreateSale={
                  partner.createSale
                }
                onCreatePreSale={
                  partner.createPreSale
                }
                onFinalizePreSale={
                  partner.finalizePreSale
                }
                onCancelSale={
                  partner.cancelSale
                }
                onDeleteSale={
                  partner.deleteSale
                }
              />
            )}

            {activeTab === 'pedidos' && (
              <OpenOrdersModule
                sales={partner.sales}
                customers={
                  partner.customers
                }
                salespeople={
                  partner.salespeople
                }
                currentRole={
                  currentRole
                }
                onFinalizePreSale={
                  partner.finalizePreSale
                }
                onCancelSale={
                  partner.cancelSale
                }
                onDeleteSale={
                  partner.deleteSale
                }
              />
            )}

            {activeTab === 'os' && (
              <ServiceOrdersModule
                userId={user?.id}
                segment={segment}
                branches={
                  partner.branches
                }
                customers={
                  partner.customers
                }
                products={
                  partner.products
                }
                selectedBranchId={
                  selectedBranchId
                }
              />
            )}

            {activeTab === 'historico' && (
              <OrderHistoryModule
                orders={partner.orders}
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
                  partner.products
                }
                sales={partner.sales}
                customers={
                  partner.customers
                }
                profile={
                  partner.profile
                }
                currentRole={
                  currentRole
                }
                selectedBranchId={
                  selectedBranchId
                }
              />
            )}

            {activeTab === 'administrativo' && (
              <AdminModule
                userId={user?.id}
                sales={partner.sales}
                products={
                  partner.products
                }
                salespeople={
                  partner.salespeople
                }
                branches={
                  partner.branches
                }
                customers={
                  partner.customers
                }
                suppliers={
                  partner.suppliers
                }
                categories={
                  partner.categories
                }
                selectedBranchId={
                  selectedBranchId
                }
                onSelectBranch={
                  setSelectedBranchId
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
                sales={partner.sales}
                salespeople={
                  partner.salespeople
                }
                selectedBranchId={
                  selectedBranchId ||
                  null
                }
              />
            )}

            {activeTab === 'financeiro' && (
              <FinancialModule
                invoices={
                  partner.invoices
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
                  partner.rmaRequests
                }
                walletBalance={0}
                warrantyTerms={
                  storeSettings.warranty_terms ??
                  ''
                }
                currentRole={
                  currentRole
                }
                onCreate={
                  partner.createRma
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
                sales={partner.sales}
                products={
                  partner.products
                }
                customers={
                  partner.customers
                }
                salespeople={
                  partner.salespeople
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
    </div>
  );
}