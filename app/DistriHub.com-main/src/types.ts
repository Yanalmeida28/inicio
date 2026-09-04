export type BusinessSegment = 'assistencia' | 'varejo' | 'servicos';
export type PersonType = 'PF' | 'PJ';
export type CustomerType = 'varejo' | 'atacado';
export type DeliveryType = 'balcao' | 'entrega' | 'retirada';

export interface Product {
  id: number;
  name: string;
  subtitle: string;
  sku: string;
  brand: string;
  category: string;
  price: number;
  stock: number;
  image: string;
  badge?: string;
}

export interface CartItem extends Product {
  quantity: number;
}

export interface Category {
  label: string;
  icon: string;
  tone: string;
}

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

export type PhotoType = 'entry' | 'exit' | 'legacy';

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
  person_type?: PersonType | null;
  phone?: string | null;
  email?: string | null;
  birthday?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  device_model?: string | null;
  notes?: string | null;
  customer_type?: CustomerType;
  credit_limit?: number | null;
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
  notes?: string | null;
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
  ncm?: string | null;
  cfop?: string | null;
  cst_csosn?: string | null;
  icms_rate?: number;
  pis_rate?: number;
  cofins_rate?: number;
  created_at: string;
  updated_at: string;
}

export interface PartnerSalesperson {
  id: string;
  user_id: string;
  auth_user_id?: string | null;
  name: string;
  role: SalespersonRole;
  commission_rate: number;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  active?: boolean;
  pin?: string | null;
  branch_id?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface PartnerIdentity {
  authUserId: string;
  companyUserId: string;
  role: SalespersonRole;
  salespersonId: string | null;
  branchId: string | null;
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
  customer_type: CustomerType;
  delivery_type: DeliveryType;
  status: 'aberta' | 'concluida' | 'pre_venda' | 'cancelada' | 'devolucao';
  origin: 'pdv' | 'b2b' | 'manual' | 'catalogo';
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
  account_name?: string | null;
  document?: string | null;
  subscription_plan?: string | null;
  subscription_status?: 'ativa' | 'trial' | 'cancelada' | 'suspensa' | null;
  next_billing_date?: string | null;
  payment_method?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RmaRequest {
  id: string;
  user_id: string;
  branch_id: string | null;
  customer_name: string;
  product_name: string;
  product_sku: string;
  batch_or_order: string;
  defect_description: string;
  media_url: string | null;
  status: RmaStatus;
  created_at: string;
  updated_at: string;
}

export type RmaPayload = Omit<RmaRequest, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'status' | 'branch_id' | 'customer_name'> & {
  branch_id?: string | null;
  customer_name?: string;
};

export interface PartnerCombo {
  id: string;
  user_id: string;
  name: string;
  items: Array<{ product_id: string; quantity: number }>;
  price: number;
  active: boolean;
  created_at: string;
}

export interface PartnerModifier {
  id: string;
  user_id: string;
  name: string;
  product_id: string;
  price_adjustment: number;
  created_at: string;
}

export interface PartnerInvoice {
  id: string;
  user_id: string;
  number: string;
  customer_name: string;
  amount: number;
  status: 'aberta' | 'paga';
  due_date: string | null;
  paid_at: string | null;
  branch_id: string | null;
  created_at: string;
}

export interface B2BOrder {
  id: string;
  user_id: string;
  business_name: string;
  items: unknown[];
  total: number;
  status: 'pendente' | 'aprovado' | 'cancelado';
  payment_method: string | null;
  branch_id: string | null;
  created_at: string;
}

export interface AdminLojista {
  status: 'pendente' | 'aprovado' | 'reprovado';
}

export interface AdminCompany extends AdminLojista {
  id: string;
  user_id: string | null;
  business_name: string;
  account_name: string | null;
  email: string | null;
  whatsapp: string | null;
  document: string | null;
  segment: BusinessSegment;
  subscription_plan: string | null;
  subscription_status: string | null;
  orders_count: number;
  orders_total: number;
  client_status: AdminLojista['status'];
  credit_limit: number | null;
}

export interface AdminFinancialMonth {
  month_start: string;
  month_label: string;
  revenue: number;
  open_amount: number;
  paid_count: number;
  active_clients: number;
  average_ticket: number;
}

export interface PermissionOverride {
  id: string;
  user_id: string;
  salesperson_id: string;
  can_cancel_sales: boolean;
  discount_override_limit: number;
  can_view_cost_prices: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  actor_name: string;
  actor_role: SalespersonRole | 'sistema';
  action: string;
  entity_type: string;
  entity_id: string;
  details: string;
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
  branch_id: string | null;
  photo_type: PhotoType | null;
  operation_type: 'service_order' | 'rma' | null;
  label: string;
  storage_path: string;
  created_at: string;
}
