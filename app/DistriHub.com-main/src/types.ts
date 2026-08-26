export type Brand = 'Samsung' | 'Apple' | 'Motorola' | 'Xiaomi';

export type Product = {
  id: number;
  name: string;
  subtitle: string;
  sku: string;
  brand: Brand;
  category: string;
  price: number;
  stock: number;
  image: string;
  badge?: string;
};

export type CartItem = Product & { quantity: number };

export type Category = {
  label: string;
  icon: string;
  tone: string;
};

export type BusinessSegment = 'assistencia' | 'varejo' | 'servicos';

export type PartnerProfile = {
  id: string;
  business_name: string;
  document: string | null;
  whatsapp: string | null;
  segment: BusinessSegment;
  account_name: string | null;
  subscription_plan: string;
  subscription_status: 'ativa' | 'trial' | 'cancelada' | 'suspensa';
  next_billing_date: string | null;
  payment_method: string | null;
  created_at: string;
};

export type PartnerBranch = {
  id: string;
  user_id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
};

export type PartnerProduct = {
  id: string;
  user_id: string;
  name: string;
  cost_price: number;
  sale_price: number;
  wholesale_price: number;
  image_url: string | null;
  stock: number;
  min_stock: number;
  category: string | null;
  sku: string | null;
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
};

export type PartnerCustomer = {
  id: string;
  user_id: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  device_model: string | null;
  notes: string | null;
  customer_type: 'varejo' | 'atacado';
  branch_id: string | null;
  created_at: string;
};

export type PartnerCategory = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

export type PartnerSupplier = {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  payable_balance: number;
  created_at: string;
};

export type SalespersonRole = 'administrador' | 'gerente' | 'caixa' | 'vendedor' | 'tecnico' | 'atendente' | 'logistica';

export type PartnerSalesperson = {
  id: string;
  user_id: string;
  name: string;
  commission_rate: number;
  active: boolean;
  pin: string | null;
  role: SalespersonRole;
  created_at: string;
};

export type PartnerCombo = {
  id: string;
  user_id: string;
  name: string;
  price: number;
  items: { product_id: string; name: string; quantity: number }[];
  active: boolean;
  created_at: string;
};

export type PartnerModifier = {
  id: string;
  user_id: string;
  product_id: string | null;
  name: string;
  price_adjustment: number;
  created_at: string;
};

export type SaleItem = {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
};

export type PartnerSale = {
  id: string;
  user_id: string;
  customer_id: string | null;
  customer_name: string | null;
  items: SaleItem[];
  total: number;
  status: 'aberta' | 'pre_venda' | 'concluida' | 'cancelada';
  branch_id: string | null;
  salesperson_id: string | null;
  imei: string | null;
  serial_number: string | null;
  payment_method: string | null;
  origin: 'pdv' | 'catalogo';
  online_payment: boolean;
  payment_status: 'pago' | 'pendente' | 'cancelado';
  created_at: string;
};

export type StockMovement = {
  id: string;
  user_id: string;
  product_id: string | null;
  product_name: string;
  type: 'entrada' | 'saida';
  quantity: number;
  reason: string | null;
  created_at: string;
};

export type PartnerInvoice = {
  id: string;
  user_id: string;
  amount: number;
  status: 'aberta' | 'paga';
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
};

export type StoreSettings = {
  id: string;
  user_id: string;
  logo_url: string | null;
  banner_url: string | null;
  primary_color: string;
  nav_color: string;
  internal_notice: string | null;
  warranty_terms: string | null;
  receipt_footer_text: string | null;
  show_logo_on_receipt: boolean;
  show_cnpj_on_receipt: boolean;
  catalog_slug: string | null;
  catalog_enabled: boolean;
  catalog_oos_behavior: 'indisponivel' | 'ocultar';
  social_facebook: string | null;
  social_instagram: string | null;
  social_whatsapp: string | null;
  business_hours: string | null;
  updated_at: string;
};

export type RmaStatus = 'aguardando_troca' | 'retornou_fornecedor' | 'reintegrado_estoque' | 'credito_gerado';

export type RmaRequest = {
  id: string;
  user_id: string;
  product_name: string;
  product_sku: string;
  batch_or_order: string;
  defect_description: string;
  media_url: string | null;
  status: RmaStatus;
  created_at: string;
  updated_at: string;
};

export type DeliveryRoute = {
  id: string;
  name: string;
  shift: string;
  cutoff_time: string | null;
  active: boolean;
  created_at: string;
};

export type DeliveryRate = {
  id: string;
  neighborhood: string;
  rate: number;
  route_id: string | null;
  created_at: string;
};

export type AdminLojista = {
  id: string;
  user_id: string | null;
  business_name: string;
  document: string | null;
  whatsapp: string | null;
  segment: string;
  credit_limit: number;
  credit_used: number;
  status: 'pendente' | 'aprovado' | 'reprovado';
  created_at: string;
};

export type AdminCompany = AdminLojista & {
  email: string | null;
  account_name: string | null;
  subscription_plan: string | null;
  subscription_status: string | null;
  next_billing_date: string | null;
  payment_method: string | null;
  orders_count: number;
  orders_total: number;
  last_order_at: string | null;
};

export type AdminFinancialMonth = {
  month_label: string;
  month_start: string;
  revenue: number;
  open_amount: number;
  paid_count: number;
  open_count: number;
  active_clients: number;
  average_ticket: number;
};

export type B2BOrder = {
  id: string;
  user_id: string | null;
  business_name: string | null;
  items: SaleItem[];
  total: number;
  payment_method: string | null;
  delivery_method: string | null;
  delivery_rate: number;
  status: string;
  created_at: string;
};

export type AuditLog = {
  id: string;
  user_id: string;
  actor_name: string;
  actor_role: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: string | null;
  created_at: string;
};

export type PermissionOverride = {
  id: string;
  user_id: string;
  salesperson_id: string;
  can_cancel_sales: boolean;
  discount_override_limit: number;
  can_view_cost_prices: boolean;
  created_at: string;
};
