export type BusinessSegment = 'assistencia' | 'varejo' | 'servicos';

export type SalespersonRole =
  | 'administrador'
  | 'gerente'
  | 'caixa'
  | 'vendedor'
  | 'tecnico'
  | 'atendente'
  | 'logistica';

export type RmaStatus =
  | 'aguardando_troca'
  | 'retornou_fornecedor'
  | 'reintegrado_estoque'
  | 'credito_gerado';

export type ServiceOrderStatus =
  | 'aberta'
  | 'em_analise'
  | 'aguardando_aprovacao'
  | 'aprovada'
  | 'em_reparo'
  | 'aguardando_peca'
  | 'pronta'
  | 'entregue'
  | 'cancelada';

export type ServiceOrderApprovalStatus =
  | 'aguardando_aprovacao'
  | 'aprovado'
  | 'reprovado';

export interface PartnerBranch {
  id: string;
  user_id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface PartnerCustomer {
  id: string;
  user_id: string;
  name: string;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  birthday?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  device_model?: string | null;
  notes?: string | null;
  customer_type?: 'varejo' | 'atacado';
  branch_id?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface PartnerSupplier {
  id: string;
  user_id: string;
  name: string;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  payable_balance: number;
  created_at: string;
  updated_at?: string;
}

export interface PartnerCategory {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface PartnerProduct {
  id: string;
  user_id: string;
  name: string;
  sku: string | null;
  cost_price: number;
  sale_price: number;
  wholesale_price: number;
  stock: number;
  min_stock: number;
  image_url: string | null;
  category: string | null;
  is_service: boolean;
  branch_id: string | null;
  ncm: string | null;
  cfop: string | null;
  cst_csosn: string | null;
  icms_rate: number;
  pis_rate: number;
  cofins_rate: number;
  created_at: string;
  updated_at: string;
}

export interface PartnerSalesperson {
  id: string;
  user_id: string;
  name: string;
  role: SalespersonRole;
  commission_rate: number;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface SaleItem {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
}

export interface PartnerSale {
  id: string;
  user_id: string;
  customer_id: string | null;
  customer_name: string;
  items: SaleItem[];
  total: number;
  imei: string | null;
  serial_number: string | null;
  payment_method: string | null;
  salesperson_id: string | null;
  branch_id: string | null;
  status: 'concluida' | 'pre_venda' | 'cancelada';
  origin: 'pdv' | 'b2b' | 'manual';
  online_payment: boolean;
  payment_status: 'pago' | 'pendente' | 'cancelado';
  created_at: string;
  updated_at?: string;
}

export interface StockMovement {
  id: string;
  user_id: string;
  product_id: string;
  product_name: string;
  type: 'entrada' | 'saida';
  quantity: number;
  reason: string;
  created_at: string;
}

export interface StoreSettings {
  id: string;
  user_id: string;
  logo_url: string | null;
  banner_url: string | null;
  primary_color: string;
  nav_color: string;
  internal_notice: string;
  warranty_terms: string;
  receipt_footer_text: string;
  show_logo_on_receipt: boolean;
  show_cnpj_on_receipt: boolean;
  catalog_slug?: string | null;
  catalog_enabled?: boolean;
  catalog_oos_behavior?: 'indisponivel' | 'ocultar';
  social_facebook?: string | null;
  social_instagram?: string | null;
  social_whatsapp?: string | null;
  business_hours?: string | null;
  updated_at: string;
}

export interface PartnerProfile {
  id: string;
  email: string;
  name: string;
  whatsapp: string | null;
  segment: BusinessSegment;
  created_at?: string;
  updated_at?: string;
}

export interface RmaRequest {
  id: string;
  user_id: string;
  customer_name: string;
  product_name: string;
  order_number: string | null;
  issue: string;
  status: RmaStatus;
  created_at: string;
  updated_at: string;
}

export interface PartnerCombo {
  id: string;
  user_id: string;
  name: string;
  items: Array<{ product_id: string; quantity: number }>;
  price: number;
  created_at: string;
}

export interface PartnerModifier {
  id: string;
  user_id: string;
  name: string;
  price: number;
  created_at: string;
}

export interface PartnerInvoice {
  id: string;
  user_id: string;
  number: string;
  customer_name: string;
  total: number;
  status: 'pendente' | 'pago';
  created_at: string;
}

export interface B2BOrder {
  id: string;
  user_id: string;
  business_name: string;
  items: unknown[];
  total: number;
  status: 'pendente' | 'aprovado' | 'cancelado';
  created_at: string;
}

export interface ServiceOrder {
  id: string;
  user_id: string;
  branch_id: string;

  customer_id: string | null;
  customer_name: string | null;

  service_segment: string;

  os_number: string | null;
  equipment_type: string | null;
  equipment_brand: string | null;
  equipment_model: string | null;
  equipment_identification: string | null;
  serial_number: string | null;
  imei: string | null;
  reported_issue: string | null;
  observations: string | null;
  technician_name: string | null;
  entry_date: string | null;
  forecast_delivery: string | null;

  accessories_left: string | null;
  physical_condition: string | null;
  entry_damage: string | null;
  entry_notes: string | null;
  screen_condition: string | null;
  shell_condition: string | null;
  side_condition: string | null;
  rear_condition: string | null;
  connectors_condition: string | null;
  buttons_condition: string | null;
  other_damage: string | null;
  inspection_notes: string | null;

  status: ServiceOrderStatus;
  approval_status: ServiceOrderApprovalStatus;
  approval_notes: string | null;

  labor_total: number;
  parts_total: number;
  discount_total: number;
  total: number;

  created_at: string;
  updated_at: string;
}

export interface ServiceOrderItem {
  id: string;
  service_order_id: string;
  user_id: string;
  product_id: string;
  branch_id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  unit_price: number;
  created_at: string;
}

export interface ServiceOrderPhoto {
  id: string;
  service_order_id: string;
  user_id: string;
  label: string;
  storage_path: string;
  created_at: string;
}
