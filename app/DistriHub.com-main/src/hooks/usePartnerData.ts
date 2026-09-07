import { useCallback, useEffect, useState } from 'react';
import type {
  PartnerProduct, PartnerCustomer, PartnerSale, StockMovement,
  StoreSettings, RmaPayload, RmaRequest, RmaStatus, SaleItem,
  PartnerBranch, PartnerCategory, PartnerSupplier, PartnerSalesperson,
  PartnerCombo, PartnerModifier, PartnerInvoice, PartnerProfile,
  B2BOrder, PartnerIdentity, CustomerType, DeliveryType,
} from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { normalizeDocument } from '../utils';

type PartnerData = {
  products: PartnerProduct[];
  customers: PartnerCustomer[];
  sales: PartnerSale[];
  movements: StockMovement[];
  storeSettings: StoreSettings | null;
  profile: PartnerProfile | null;
  rmaRequests: RmaRequest[];
  branches: PartnerBranch[];
  categories: PartnerCategory[];
  suppliers: PartnerSupplier[];
  salespeople: PartnerSalesperson[];
  combos: PartnerCombo[];
  modifiers: PartnerModifier[];
  invoices: PartnerInvoice[];
  orders: B2BOrder[];
  loading: boolean;
  error: string | null;
  addProduct: (product: Omit<PartnerProduct, 'id' | 'user_id' | 'created_at' | 'updated_at'>, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  replenishStock: (productId: string, branchId: string, quantity: number, unitCost?: number | null, reason?: string, operatorId?: string | null, operatorPin?: string | null) => Promise<{ newStock: number }>;
  updateProduct: (id: string, updates: Partial<PartnerProduct>, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  deleteProduct: (id: string, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  addCustomer: (customer: Omit<PartnerCustomer, 'id' | 'user_id' | 'created_at'>, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  updateCustomer: (id: string, updates: PartnerCustomerUpdate, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  refreshCustomer: (id: string) => Promise<PartnerCustomer>;
  deleteCustomer: (id: string, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  createSale: (sale: SalePayload, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  createPreSale: (sale: SalePayload, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  finalizePreSale: (id: string, paymentMethod: string, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  updateStoreSettings: (settings: Partial<StoreSettings>) => Promise<void>;
  updateProfile: (profile: Partial<PartnerProfile>) => Promise<void>;
  createRma: (rma: RmaPayload) => Promise<void>;
  updateRmaStatus: (id: string, status: RmaStatus) => Promise<void>;
  deleteRma: (id: string) => Promise<void>;
  addBranch: (name: string, address: string) => Promise<void>;
  updateBranch: (id: string, updates: Pick<PartnerBranch, 'name' | 'address'>) => Promise<void>;
  deleteBranch: (id: string) => Promise<void>;
  addCategory: (name: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  addSupplier: (supplier: Omit<PartnerSupplier, 'id' | 'user_id' | 'created_at' | 'payable_balance'>) => Promise<void>;
  updateSupplier: (id: string, updates: Partial<PartnerSupplier>) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
  addSalesperson: (sp: Omit<PartnerSalesperson, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
  updateSalesperson: (id: string, updates: Partial<PartnerSalesperson>) => Promise<void>;
  deleteSalesperson: (id: string) => Promise<void>;
  cancelSale: (id: string, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  deleteSale: (id: string, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  addCombo: (combo: Omit<PartnerCombo, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
  deleteCombo: (id: string) => Promise<void>;
  addModifier: (mod: Omit<PartnerModifier, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
  deleteModifier: (id: string) => Promise<void>;
  payInvoice: (id: string) => Promise<void>;
};

export type PartnerCustomerUpdate = Partial<PartnerCustomer> & {
  photo_file?: File | null;
  remove_photo?: boolean;
};

const customerRpcFields = (customer: PartnerCustomer) => ({
  p_branch_id: customer.branch_id ?? null,
  p_name: customer.name,
  p_document: customer.document ?? null,
  p_person_type: customer.person_type ?? null,
  p_birthday: customer.birthday ?? null,
  p_phone: customer.phone ?? null,
  p_email: customer.email ?? null,
  p_address: customer.address ?? null,
  p_neighborhood: customer.neighborhood ?? null,
  p_city: customer.city ?? null,
  p_device_model: customer.device_model ?? null,
  p_notes: customer.notes ?? null,
  p_customer_type: customer.customer_type ?? 'varejo',
  p_credit_limit: customer.credit_limit ?? 0,
  p_trade_name: customer.trade_name ?? null,
  p_rg: customer.rg ?? null,
  p_municipal_registration: customer.municipal_registration ?? null,
  p_state_registration: customer.state_registration ?? null,
  p_ie_isento: customer.ie_isento ?? false,
  p_suframa_id: customer.suframa_id ?? null,
  p_sex: customer.sex ?? null,
  p_address_number: customer.address_number ?? null,
  p_zip_code: customer.zip_code ?? null,
  p_state: customer.state ?? null,
  p_complement: customer.complement ?? null,
  p_reference_point: customer.reference_point ?? null,
  p_country: customer.country ?? null,
  p_customer_group: customer.customer_group ?? 'Varejo',
  p_price_table: customer.price_table ?? 'varejo',
  p_allow_credit: customer.allow_credit ?? false,
  p_convenio: customer.convenio ? 'sim' : 'nao',
  p_simples_nacional: customer.simples_nacional ?? false,
  p_reter_iss: customer.reter_iss ?? false,
  p_is_active: customer.is_active ?? true,
  p_is_store_admin: customer.is_store_admin ?? false,
  p_phone_commercial_1: customer.phone_commercial_1 ?? null,
  p_phone_commercial_2: customer.phone_commercial_2 ?? null,
  p_photo_url: customer.photo_url ?? null,
});

const customerRpcParameterNames = [
  'p_salesperson_id', 'p_pin', 'p_customer_id', 'p_branch_id', 'p_name', 'p_trade_name',
  'p_document', 'p_person_type', 'p_rg', 'p_municipal_registration', 'p_state_registration',
  'p_ie_isento', 'p_suframa_id', 'p_sex', 'p_birthday', 'p_phone', 'p_phone_commercial_1',
  'p_phone_commercial_2', 'p_email', 'p_address', 'p_address_number', 'p_zip_code',
  'p_neighborhood', 'p_city', 'p_state', 'p_complement', 'p_reference_point', 'p_country',
  'p_notes', 'p_device_model', 'p_customer_group', 'p_price_table',
  'p_customer_type', 'p_credit_limit', 'p_allow_credit', 'p_convenio', 'p_simples_nacional',
  'p_reter_iss', 'p_is_active', 'p_is_store_admin', 'p_photo_url',
] as const;

function validateCustomerRpcPayload(payload: Record<string, unknown>) {
  const missing = customerRpcParameterNames.filter((name) => !(name in payload) || payload[name] === undefined);
  if (missing.length > 0) {
    throw new Error(`Payload de cliente incompleto: ${missing.join(', ')}`);
  }
}

function customerMutationPayload(
  customer: PartnerCustomer,
  customerId: string,
  operatorId: string | null | undefined,
  operatorPin: string | null | undefined,
) {
  const payload = {
    p_salesperson_id: customer.salesperson_id ?? operatorId ?? null,
    p_pin: operatorPin ?? null,
    p_customer_id: customerId,
    ...customerRpcFields(customer),
  };
  validateCustomerRpcPayload(payload);
  return payload;
}

type SalePayload = {
  customer_id: string | null;
  customer_name: string;
  items: SaleItem[];
  total: number;
  customer_type: CustomerType;
  delivery_type: DeliveryType;
  imei?: string;
  serial_number?: string;
  payment_method?: string;
  salesperson_id?: string | null;
  branch_id?: string | null;
};

type PartnerDataState = Pick<PartnerData,
  | 'products' | 'customers' | 'sales' | 'movements' | 'storeSettings' | 'profile'
  | 'rmaRequests' | 'branches' | 'categories' | 'suppliers' | 'salespeople' | 'combos'
  | 'modifiers' | 'invoices' | 'orders' | 'loading' | 'error'
>;

const emptyState = {
  products: [], customers: [], sales: [], movements: [],
  storeSettings: null, profile: null, rmaRequests: [], branches: [], categories: [],
  suppliers: [], salespeople: [], combos: [], modifiers: [], invoices: [], orders: [],
};

export function usePartnerData(identity: PartnerIdentity | null): PartnerData {
  const [data, setData] = useState<PartnerDataState>({
    ...emptyState, loading: false, error: null,
  });

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !identity) return;
    const client = supabase;
    setData((prev) => ({ ...prev, loading: true, error: null }));

    if (identity.salespersonId && !identity.branchId) {
      setData((prev) => ({
        ...prev,
        loading: false,
        error: 'O funcionário autenticado não possui uma filial atribuída.',
      }));
      return;
    }

    const tables = [
      'partner_products', 'partner_customers', 'partner_sales', 'stock_movements',
      'rma_requests_v2', 'partner_branches', 'partner_categories',
      'partner_suppliers', 'partner_salespeople', 'partner_combos', 'partner_modifiers',
      'partner_invoices', 'b2b_orders',
    ];

    const branchScopedTables = new Set(['partner_products', 'partner_customers', 'partner_sales', 'rma_requests_v2']);
    const results = await Promise.all(tables.map((table) => {
      if (identity.salespersonId && table === 'stock_movements') {
        return Promise.resolve({ data: [], error: null, status: 200 });
      }
      let query = client.from(table).select('*').eq('user_id', identity.companyUserId).order('created_at', { ascending: false });
      if (identity.branchId && branchScopedTables.has(table)) query = query.eq('branch_id', identity.branchId);
      if (identity.salespersonId && table === 'partner_salespeople') query = query.eq('id', identity.salespersonId);
      return query;
    }));

    const settingsRes = identity.salespersonId
      ? { data: null, error: null, status: 200 }
      : await client
        .from('store_settings_v2')
        .select('*')
        .eq('user_id', identity.companyUserId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    const profileRes = identity.salespersonId
      ? { data: null, error: null, status: 200 }
      : await client.from('partner_profiles').select('*').eq('id', identity.companyUserId).limit(1).maybeSingle();

    const failedResult = [...results, settingsRes, profileRes].find((result) => result.error);
    if (failedResult?.error) {
      console.error('Falha ao carregar dados do painel.', failedResult.error);
      setData((prev) => ({
        ...prev,
        loading: false,
        error: `Não foi possível carregar os dados (${failedResult.status ?? 'sem status'}): ${failedResult.error.message}`,
      }));
      return;
    }

    setData({
      products: (results[0].data as PartnerProduct[]) ?? [],
      customers: (results[1].data as PartnerCustomer[]) ?? [],
      sales: (results[2].data as PartnerSale[]) ?? [],
      movements: (results[3].data as StockMovement[]) ?? [],
      storeSettings: (settingsRes.data as StoreSettings) ?? null,
      profile: (profileRes.data as PartnerProfile) ?? null,
      rmaRequests: (results[4].data as RmaRequest[]) ?? [],
      branches: (results[5].data as PartnerBranch[]) ?? [],
      categories: (results[6].data as PartnerCategory[]) ?? [],
      suppliers: (results[7].data as PartnerSupplier[]) ?? [],
      salespeople: (results[8].data as PartnerSalesperson[]) ?? [],
      combos: (results[9].data as PartnerCombo[]) ?? [],
      modifiers: (results[10].data as PartnerModifier[]) ?? [],
      invoices: (results[11].data as PartnerInvoice[]) ?? [],
      orders: (results[12].data as B2BOrder[]) ?? [],
      loading: false,
      error: null,
    });
  }, [identity]);

  useEffect(() => { loadData(); }, [loadData]);

  const addProduct = useCallback(async (
    product: Omit<PartnerProduct, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => {
    if (!identity) return;
    if (!product.branch_id) {
      throw new Error('Produto sem filial não pode ser cadastrado.');
    }
    const np: PartnerProduct = {
      ...product,
      wholesale_price: product.wholesale_price ?? 0,
      ncm: product.ncm ?? null,
      cfop: product.cfop ?? null,
      cst_csosn: product.cst_csosn ?? null,
      icms_rate: product.icms_rate ?? 0,
      pis_rate: product.pis_rate ?? 0,
      cofins_rate: product.cofins_rate ?? 0,
      id: crypto.randomUUID(), user_id: identity.companyUserId, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    setData((prev) => ({ ...prev, products: [np, ...prev.products] }));
    if (isSupabaseConfigured && supabase) {
      const { error: rpcErr } = await supabase.rpc('execute_partner_product_mutation', {
        p_salesperson_id: operatorId ?? null,
        p_pin: operatorPin ?? null,
        p_product_id: np.id,
        p_branch_id: np.branch_id,
        p_name: np.name,
        p_cost_price: np.cost_price,
        p_sale_price: np.sale_price,
        p_wholesale_price: np.wholesale_price,
        p_stock: np.stock,
        p_min_stock: np.min_stock,
        p_category: np.category ?? null,
        p_sku: np.sku ?? null,
        p_is_service: np.is_service ?? false,
        p_image_url: np.image_url ?? null,
      });
      if (rpcErr) throw rpcErr;
      await supabase.from('stock_movements').insert({ user_id: identity.companyUserId, product_id: np.id, product_name: np.name, type: 'entrada', quantity: np.stock, reason: 'Cadastro inicial' });
    }
  }, [identity]);

  const replenishStock = useCallback(async (
    productId: string,
    branchId: string,
    quantity: number,
    unitCost?: number | null,
    reason?: string,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => {
    if (!identity) throw new Error('Usuário não autenticado.');
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase não configurado.');
    if (!branchId) throw new Error('Selecione uma filial antes de repor o estoque.');
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('A quantidade de reposição deve ser um número inteiro maior que zero.');

    const { data, error } = await supabase.rpc('execute_partner_stock_replenishment', {
      p_salesperson_id: operatorId ?? null,
      p_pin: operatorPin ?? null,
      p_product_id: productId,
      p_branch_id: branchId,
      p_quantity: quantity,
      p_unit_cost: unitCost ?? null,
      p_reason: reason?.trim() || null,
    });
    if (error) {
      console.error('Falha ao repor estoque via execute_partner_stock_replenishment.', {
        error,
        productId,
        branchId,
        quantity,
        unitCost,
      });
      throw error;
    }

    const result = data as { product_id?: string; new_stock?: number } | null;
    if (!result?.product_id || typeof result.new_stock !== 'number') {
      throw new Error('A reposição não foi confirmada pelo servidor.');
    }

    setData((prev) => ({
      ...prev,
      products: prev.products.map((product) => product.id === productId
        ? { ...product, stock: result.new_stock as number, ...(unitCost != null ? { cost_price: unitCost } : {}) }
        : product),
      movements: [{
        id: crypto.randomUUID(), user_id: identity.companyUserId, product_id: productId,
        product_name: prev.products.find((product) => product.id === productId)?.name ?? 'Produto',
        branch_id: branchId, type: 'entrada', quantity, reason: reason?.trim() || 'Reposição de estoque',
        created_at: new Date().toISOString(),
      }, ...prev.movements],
    }));
    return { newStock: result.new_stock };
  }, [identity]);

  const updateProduct = useCallback(async (
    id: string,
    updates: Partial<PartnerProduct>,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => {
    setData((prev) => ({ ...prev, products: prev.products.map((p) => p.id === id ? { ...p, ...updates, updated_at: new Date().toISOString() } : p) }));
    if (isSupabaseConfigured && supabase) {
      const currentProd = data.products.find((p) => p.id === id);
      const merged = { ...currentProd, ...updates };
      if (!merged.branch_id || !merged.name) throw new Error('Dados insuficientes para atualizar produto.');
      const { error: rpcErr } = await supabase.rpc('execute_partner_product_mutation', {
        p_salesperson_id: operatorId ?? null,
        p_pin: operatorPin ?? null,
        p_product_id: id,
        p_branch_id: merged.branch_id,
        p_name: merged.name,
        p_cost_price: merged.cost_price ?? 0,
        p_sale_price: merged.sale_price ?? 0,
        p_wholesale_price: merged.wholesale_price ?? 0,
        p_stock: merged.stock ?? 0,
        p_min_stock: merged.min_stock ?? 5,
        p_category: merged.category ?? null,
        p_sku: merged.sku ?? null,
        p_is_service: merged.is_service ?? false,
        p_image_url: merged.image_url ?? null,
      });
      if (rpcErr) throw rpcErr;
    }
  }, [data.products]);

  const deleteProduct = useCallback(async (
    id: string,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => {
    setData((prev) => ({ ...prev, products: prev.products.filter((p) => p.id !== id) }));
    if (isSupabaseConfigured && supabase) {
      const { error: rpcErr } = await supabase.rpc('execute_partner_product_delete', {
        p_salesperson_id: operatorId ?? null,
        p_pin: operatorPin ?? null,
        p_product_id: id,
      });
      if (rpcErr) throw rpcErr;
    }
  }, []);

  const addCustomer = useCallback(async (
    customer: Omit<PartnerCustomer, 'id' | 'user_id' | 'created_at'>,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => {
    if (!identity) return;
    if (!customer.branch_id) {
      throw new Error('Cliente sem filial não pode ser cadastrado.');
    }
    const normalizedDocument = customer.document ? normalizeDocument(customer.document) : null;
    if (normalizedDocument && data.customers.some((item) => normalizeDocument(item.document ?? '') === normalizedDocument)) {
      throw new Error('Já existe um cliente com este CPF/CNPJ neste lojista.');
    }
    const nc: PartnerCustomer = { ...customer, document: normalizedDocument, id: crypto.randomUUID(), user_id: identity.companyUserId, created_at: new Date().toISOString() };
    if (isSupabaseConfigured && supabase) {
      const { error: rpcErr } = await supabase.rpc('execute_partner_customer_mutation', customerMutationPayload(nc, nc.id, operatorId, operatorPin));
      if (rpcErr) throw rpcErr;
    }
    setData((prev) => ({ ...prev, customers: [nc, ...prev.customers] }));
  }, [identity, data.customers]);

  const updateCustomer = useCallback(async (
    id: string,
    updates: PartnerCustomerUpdate,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => {
    const normalizedDocument = updates.document === undefined
      ? undefined
      : (updates.document ? normalizeDocument(updates.document) : null);
    if (normalizedDocument && data.customers.some((item) => item.id !== id && normalizeDocument(item.document ?? '') === normalizedDocument)) {
      throw new Error('Já existe um cliente com este CPF/CNPJ neste lojista.');
    }
    const { photo_file: photoFile, remove_photo: removePhoto, ...persistedUpdates } = updates;
    const normalizedUpdates = normalizedDocument === undefined
      ? persistedUpdates
      : { ...persistedUpdates, document: normalizedDocument };
    const currentCust = data.customers.find((customer) => customer.id === id);
    if (!currentCust) throw new Error('Cliente não encontrado no estado atual. Atualize a página e tente novamente.');
    const merged = { ...currentCust, ...normalizedUpdates };
    if (!merged.name) throw new Error('Nome do cliente é obrigatório.');
    if ((merged.credit_limit ?? 0) < 0) throw new Error('O limite de crédito não pode ser negativo.');
    if (merged.salesperson_id) {
      const salesperson = data.salespeople.find((item) => item.id === merged.salesperson_id);
      if (!salesperson || (salesperson.branch_id && salesperson.branch_id !== merged.branch_id)) {
        throw new Error('Vendedor responsável inválido para a filial do cliente.');
      }
    }

    let uploadedPhotoPath: string | null = null;
    let authUserId: string | null = null;
    if (isSupabaseConfigured && supabase) {
      if (photoFile || removePhoto) {
        const { data: authUserData, error: authUserError } = await supabase.auth.getUser();
        if (authUserError || !authUserData.user) throw new Error('Usuário autenticado não encontrado para enviar a foto.');
        authUserId = authUserData.user.id;
      }
      if (photoFile) {
        const extension = photoFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const candidatePhotoPath = `${authUserId}/customers/${id}/${crypto.randomUUID()}.${extension}`;
        const { data: uploadedObject, error: uploadError } = await supabase.storage
          .from('customer-photos')
          .upload(candidatePhotoPath, photoFile, { upsert: false, contentType: photoFile.type || 'image/jpeg' });
        if (uploadError) throw new Error(`Não foi possível enviar a foto: ${uploadError.message}`);
        uploadedPhotoPath = uploadedObject.path;
        merged.photo_url = uploadedPhotoPath;
      } else if (removePhoto) {
        merged.photo_url = null;
      }
      const { error: rpcErr } = await supabase.rpc('execute_partner_customer_mutation', customerMutationPayload(merged, id, operatorId, operatorPin));
      if (rpcErr) {
        if (uploadedPhotoPath) await supabase.storage.from('customer-photos').remove([uploadedPhotoPath]);
        throw rpcErr;
      }
      const previousPhotoBelongsToCustomer = currentCust.photo_url?.startsWith(`${authUserId}/customers/${id}/`) ?? false;
      if ((photoFile || removePhoto) && currentCust.photo_url && currentCust.photo_url !== merged.photo_url && previousPhotoBelongsToCustomer) {
        const { error: removeError } = await supabase.storage.from('customer-photos').remove([currentCust.photo_url]);
        if (removeError) console.warn('Não foi possível remover a foto antiga do cliente.', removeError);
      }
      const { data: savedCustomer, error: reloadError } = await supabase
        .from('partner_customers')
        .select('*')
        .eq('id', id)
        .eq('user_id', identity?.companyUserId ?? currentCust.user_id)
        .single();
      if (reloadError) throw new Error(`Cliente salvo, mas não foi possível recarregar os dados: ${reloadError.message}`);
      setData((prev) => ({
        ...prev,
        customers: prev.customers.map((customer) => customer.id === id ? savedCustomer as PartnerCustomer : customer),
      }));
      return;
    }
    setData((prev) => ({
      ...prev,
      customers: prev.customers.map((customer) => customer.id === id ? { ...customer, ...merged } : customer),
    }));
  }, [data.customers, data.salespeople, identity]);

  const refreshCustomer = useCallback(async (id: string) => {
    if (!supabase || !identity) throw new Error('Sessão do cliente não disponível.');
    const { data: savedCustomer, error } = await supabase
      .from('partner_customers')
      .select('*')
      .eq('id', id)
      .eq('user_id', identity.companyUserId)
      .single();
    if (error) throw new Error(`Não foi possível carregar os dados do cliente: ${error.message}`);
    const customer = savedCustomer as PartnerCustomer;
    setData((prev) => ({ ...prev, customers: prev.customers.map((item) => item.id === id ? customer : item) }));
    return customer;
  }, [identity]);

  const deleteCustomer = useCallback(async (
    id: string,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase não configurado. A exclusão não foi realizada.');
    const { data: deleted, error: rpcErr } = await supabase.rpc('execute_partner_customer_delete', {
      p_salesperson_id: operatorId ?? null,
      p_pin: operatorPin ?? null,
      p_customer_id: id,
    });
    if (rpcErr) throw rpcErr;
    if (deleted !== id) throw new Error('A exclusão do cliente não foi confirmada pelo servidor.');
    setData((prev) => ({ ...prev, customers: prev.customers.filter((customer) => customer.id !== id) }));
  }, []);

  const createSale = useCallback(async (
    sale: SalePayload,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => {
    if (!identity) return;
    const branchId = sale.branch_id ?? null;
    if (!branchId) {
      throw new Error('Venda sem filial selecionada.');
    }
    const effectiveSpId = operatorId ?? sale.salesperson_id ?? null;
    if (sale.payment_method === 'faturado') {
      const customer = data.customers.find((item) => item.id === sale.customer_id);
      if (!customer) throw new Error('Faturado B2B exige um cliente selecionado.');
      if (!customer.allow_credit) throw new Error('Este cliente não possui crédito permitido.');
    }
    const ns: PartnerSale = { ...sale, id: crypto.randomUUID(), user_id: identity.companyUserId, status: 'concluida', created_at: new Date().toISOString(), imei: sale.imei ?? null, serial_number: sale.serial_number ?? null, payment_method: sale.payment_method ?? null, branch_id: branchId, salesperson_id: effectiveSpId, origin: 'pdv', online_payment: false, payment_status: sale.payment_method === 'faturado' ? 'pendente' : 'pago' };
    let createdInvoice: PartnerInvoice | null = null;
    if (isSupabaseConfigured && supabase) {
      const { error: rpcErr } = await supabase.rpc('execute_partner_sale_mutation', {
        p_salesperson_id: effectiveSpId,
        p_pin: operatorPin ?? null,
        p_sale_id: ns.id,
        p_customer_id: ns.customer_id,
        p_customer_name: ns.customer_name,
        p_items: ns.items,
        p_total: ns.total,
        p_imei: ns.imei,
        p_serial_number: ns.serial_number,
        p_payment_method: ns.payment_method,
        p_branch_id: ns.branch_id,
        p_status: 'concluida',
        p_origin: 'pdv',
        p_customer_type: ns.customer_type,
        p_delivery_type: ns.delivery_type,
      });
      if (rpcErr) throw rpcErr;
      if (sale.payment_method === 'faturado') {
        const { data: invoice, error: invoiceError } = await supabase
          .from('partner_invoices')
          .select('*')
          .eq('sale_id', ns.id)
          .eq('user_id', identity.companyUserId)
          .single();
        if (invoiceError) throw new Error(`Venda criada, mas o título B2B não foi localizado: ${invoiceError.message}`);
        createdInvoice = invoice as PartnerInvoice;
      }
      for (const item of sale.items) {
        const { error: movementError } = await supabase.from('stock_movements').insert({ user_id: identity.companyUserId, product_id: item.product_id, product_name: item.name, type: 'saida', quantity: item.quantity, reason: 'Venda' });
        if (movementError) throw movementError;
      }
    }
    setData((prev) => {
      const newMovements: StockMovement[] = sale.items.map((item) => ({ id: crypto.randomUUID(), user_id: identity.companyUserId, product_id: item.product_id, product_name: item.name, type: 'saida' as const, quantity: item.quantity, reason: 'Venda', created_at: new Date().toISOString() }));
      const updatedProducts = prev.products.map((p) => {
        if (p.branch_id !== branchId) return p;
        const item = sale.items.find((currentItem) => currentItem.product_id === p.id);
        return item ? { ...p, stock: Math.max(0, p.stock - item.quantity) } : p;
      });
      return { ...prev, sales: [ns, ...prev.sales], invoices: createdInvoice ? [createdInvoice, ...prev.invoices] : prev.invoices, movements: [...newMovements, ...prev.movements], products: updatedProducts };
    });
  }, [data.customers, identity]);

  const createPreSale = useCallback(async (
    sale: SalePayload,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => {
    if (!identity) return;
    const effectiveSpId = operatorId ?? sale.salesperson_id ?? null;
    const ns: PartnerSale = { ...sale, id: crypto.randomUUID(), user_id: identity.companyUserId, status: 'pre_venda', created_at: new Date().toISOString(), imei: sale.imei ?? null, serial_number: sale.serial_number ?? null, payment_method: null, branch_id: sale.branch_id ?? null, salesperson_id: effectiveSpId, origin: 'pdv', online_payment: false, payment_status: 'pendente' };
    if (isSupabaseConfigured && supabase) {
      const { error: rpcErr } = await supabase.rpc('execute_partner_sale_mutation', {
        p_salesperson_id: effectiveSpId,
        p_pin: operatorPin ?? null,
        p_sale_id: ns.id,
        p_customer_id: ns.customer_id,
        p_customer_name: ns.customer_name,
        p_items: ns.items,
        p_total: ns.total,
        p_imei: ns.imei,
        p_serial_number: ns.serial_number,
        p_payment_method: null,
        p_branch_id: ns.branch_id,
        p_status: 'pre_venda',
        p_origin: 'pdv',
        p_customer_type: ns.customer_type,
        p_delivery_type: ns.delivery_type,
      });
      if (rpcErr) throw rpcErr;
    }
    setData((prev) => ({ ...prev, sales: [ns, ...prev.sales] }));
  }, [identity]);

  const finalizePreSale = useCallback(async (
    id: string,
    paymentMethod: string,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => {
    const sale = data.sales.find((currentSale) => currentSale.id === id);
    if (!sale || !sale.branch_id) throw new Error('Pré-venda não encontrada ou sem filial válida.');
    if (isSupabaseConfigured && supabase) {
      const { error: rpcErr } = await supabase.rpc('execute_partner_sale_mutation', {
        p_salesperson_id: operatorId ?? sale?.salesperson_id ?? null,
        p_pin: operatorPin ?? null,
        p_sale_id: id,
        p_customer_id: sale?.customer_id ?? null,
        p_customer_name: sale?.customer_name ?? '',
        p_items: sale?.items ?? [],
        p_total: sale?.total ?? 0,
        p_imei: sale?.imei ?? null,
        p_serial_number: sale?.serial_number ?? null,
        p_payment_method: paymentMethod,
        p_branch_id: sale?.branch_id ?? null,
        p_status: 'concluida',
        p_origin: sale?.origin ?? 'pdv',
        p_customer_type: sale.customer_type,
        p_delivery_type: sale.delivery_type,
      });
      if (rpcErr) throw rpcErr;
      for (const item of sale.items) {
        const { error: movementError } = await supabase.from('stock_movements').insert({ user_id: sale.user_id, product_id: item.product_id, product_name: item.name, type: 'saida', quantity: item.quantity, reason: 'Venda (Pré-venda)' });
        if (movementError) throw movementError;
      }
    }
    setData((prev) => {
      const newMovements: StockMovement[] = sale.items.map((item) => ({ id: crypto.randomUUID(), user_id: sale.user_id, product_id: item.product_id, product_name: item.name, type: 'saida' as const, quantity: item.quantity, reason: 'Venda (Pré-venda)', created_at: new Date().toISOString() }));
      const updatedProducts = prev.products.map((product) => {
        if (product.branch_id !== sale.branch_id) return product;
        const item = sale.items.find((currentItem) => currentItem.product_id === product.id);
        return item ? { ...product, stock: Math.max(0, product.stock - item.quantity) } : product;
      });
      return { ...prev, sales: prev.sales.map((currentSale) => currentSale.id === id ? { ...currentSale, status: 'concluida', payment_method: paymentMethod } : currentSale), movements: [...newMovements, ...prev.movements], products: updatedProducts };
    });
  }, [data.sales]);

  const updateStoreSettings = useCallback(async (settings: Partial<StoreSettings>) => {
    if (!isSupabaseConfigured || !supabase || !identity) {
      throw new Error('Supabase não configurado; não foi possível salvar as configurações da loja.');
    }
    if (identity.salespersonId) {
      throw new Error('Funcionários não podem alterar as configurações da loja.');
    }
    const { id: _id, user_id: _userId, updated_at: _updatedAt, ...changes } = settings;
    const { data: savedSettings, error } = await supabase
      .from('store_settings_v2')
      .upsert(
        { user_id: identity.companyUserId, ...changes, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
      .select('*')
      .single();

    if (error) {
      console.error('Falha ao salvar configurações da loja.', error);
      setData((prev) => ({ ...prev, error: `Não foi possível salvar as configurações da loja: ${error.message}` }));
      throw error;
    }

    setData((prev) => ({ ...prev, storeSettings: savedSettings as StoreSettings, error: null }));
  }, [identity]);

  const updateProfile = useCallback(async (profileUpdate: Partial<PartnerProfile>) => {
    setData((prev) => prev.profile ? { ...prev, profile: { ...prev.profile, ...profileUpdate } } : prev);
    if (isSupabaseConfigured && supabase && identity) {
      await supabase.from('partner_profiles').update(profileUpdate).eq('id', identity.companyUserId);
    }
  }, [identity]);

  const createRma = useCallback(async (rma: RmaPayload) => {
    if (!identity) return;
    const nr: RmaRequest = { ...rma, branch_id: rma.branch_id ?? null, customer_name: rma.customer_name ?? 'Cliente não informado', id: crypto.randomUUID(), user_id: identity.companyUserId, status: 'aguardando_troca', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    setData((prev) => ({ ...prev, rmaRequests: [nr, ...prev.rmaRequests] }));
    if (isSupabaseConfigured && supabase) await supabase.from('rma_requests_v2').insert(nr);
  }, [identity]);

  const updateRmaStatus = useCallback(async (id: string, status: RmaStatus) => {
    setData((prev) => ({ ...prev, rmaRequests: prev.rmaRequests.map((r) => r.id === id ? { ...r, status, updated_at: new Date().toISOString() } : r) }));
    if (isSupabaseConfigured && supabase) await supabase.from('rma_requests_v2').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  }, []);

  const deleteRma = useCallback(async (id: string) => {
    setData((prev) => ({ ...prev, rmaRequests: prev.rmaRequests.filter((r) => r.id !== id) }));
    if (isSupabaseConfigured && supabase) await supabase.from('rma_requests_v2').delete().eq('id', id);
  }, []);

  const addBranch = useCallback(async (name: string, address: string) => {
    if (!identity) return;
    if (identity.salespersonId) throw new Error('Funcionários não têm permissão para adicionar filiais.');
    const nb: PartnerBranch = { id: crypto.randomUUID(), user_id: identity.companyUserId, name, address, is_active: true, created_at: new Date().toISOString() };
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('partner_branches').insert(nb);
      if (error) throw error;
    }
    setData((prev) => ({ ...prev, branches: [...prev.branches, nb] }));
  }, [identity]);

  const updateBranch = useCallback(async (id: string, updates: Pick<PartnerBranch, 'name' | 'address'>) => {
    if (!identity) return;
    if (identity.salespersonId) throw new Error('Funcionários não têm permissão para alterar filiais.');
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('partner_branches')
        .update(updates)
        .eq('id', id)
        .eq('user_id', identity.companyUserId);
      if (error) throw error;
    }
    setData((prev) => ({
      ...prev,
      branches: prev.branches.map((branch) => branch.id === id ? { ...branch, ...updates } : branch),
    }));
  }, [identity]);

  const deleteBranch = useCallback(async (id: string) => {
    if (!identity) return;
    if (identity.salespersonId) throw new Error('Funcionários não têm permissão para excluir filiais.');
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('partner_branches')
        .delete()
        .eq('id', id)
        .eq('user_id', identity.companyUserId);
      if (error) throw error;
    }
    setData((prev) => ({ ...prev, branches: prev.branches.filter((branch) => branch.id !== id) }));
  }, [identity]);

  const addCategory = useCallback(async (name: string) => {
    if (!identity) return;
    const nc: PartnerCategory = { id: crypto.randomUUID(), user_id: identity.companyUserId, name, created_at: new Date().toISOString() };
    setData((prev) => ({ ...prev, categories: [nc, ...prev.categories] }));
    if (isSupabaseConfigured && supabase) await supabase.from('partner_categories').insert(nc);
  }, [identity]);

  const deleteCategory = useCallback(async (id: string) => {
    setData((prev) => ({ ...prev, categories: prev.categories.filter((c) => c.id !== id) }));
    if (isSupabaseConfigured && supabase) await supabase.from('partner_categories').delete().eq('id', id);
  }, []);

  const addSupplier = useCallback(async (supplier: Omit<PartnerSupplier, 'id' | 'user_id' | 'created_at' | 'payable_balance'>) => {
    if (!identity) return;
    const ns: PartnerSupplier = { ...supplier, id: crypto.randomUUID(), user_id: identity.companyUserId, payable_balance: 0, created_at: new Date().toISOString() };
    setData((prev) => ({ ...prev, suppliers: [ns, ...prev.suppliers] }));
    if (isSupabaseConfigured && supabase) await supabase.from('partner_suppliers').insert(ns);
  }, [identity]);

  const updateSupplier = useCallback(async (id: string, updates: Partial<PartnerSupplier>) => {
    if (!identity || !isSupabaseConfigured || !supabase) throw new Error('Supabase não configurado.');
    const { id: _id, user_id: _userId, created_at: _createdAt, payable_balance: _payableBalance, ...payload } = updates;
    const { data: updated, error } = await supabase
      .from('partner_suppliers')
      .update(payload)
      .eq('id', id)
      .eq('user_id', identity.companyUserId)
      .select()
      .single();
    if (error) throw error;
    if (!updated) throw new Error('O fornecedor atualizado não foi confirmado pelo servidor.');
    setData((prev) => ({ ...prev, suppliers: prev.suppliers.map((supplier) => supplier.id === id ? updated as PartnerSupplier : supplier) }));
  }, [identity]);

  const deleteSupplier = useCallback(async (id: string) => {
    if (!identity || !isSupabaseConfigured || !supabase) throw new Error('Supabase não configurado.');
    const { data: deleted, error } = await supabase
      .from('partner_suppliers')
      .delete()
      .eq('id', id)
      .eq('user_id', identity.companyUserId)
      .select('id')
      .single();
    if (error) throw error;
    if (!deleted || deleted.id !== id) throw new Error('A exclusão do fornecedor não foi confirmada pelo servidor.');
    setData((prev) => ({ ...prev, suppliers: prev.suppliers.filter((supplier) => supplier.id !== id) }));
  }, [identity]);

  const addSalesperson = useCallback(async (sp: Omit<PartnerSalesperson, 'id' | 'user_id' | 'created_at'>) => {
    if (!identity) return;
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase não configurado. O colaborador não foi salvo.');

    const invalidColumns = new Set(['phone', 'email', 'is_active', 'updated_at']);
    const insertPayload = {
      ...Object.fromEntries(Object.entries(sp).filter(([key]) => !invalidColumns.has(key))),
      id: crypto.randomUUID(),
      user_id: identity.companyUserId,
      created_at: new Date().toISOString(),
    };
    const { data: inserted, error } = await supabase
      .from('partner_salespeople')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;
    if (!inserted) throw new Error('O Supabase não retornou o colaborador criado.');

    const confirmed = inserted as unknown as PartnerSalesperson;
    setData((prev) => ({ ...prev, salespeople: [confirmed, ...prev.salespeople] }));
  }, [identity]);

  const updateSalesperson = useCallback(async (id: string, updates: Partial<PartnerSalesperson>) => {
    if (!identity) return;
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase não configurado. O colaborador não foi atualizado.');

    const invalidColumns = new Set(['id', 'user_id', 'created_at', 'updated_at', 'phone', 'email', 'is_active']);
    const updatePayload = Object.fromEntries(Object.entries(updates).filter(([key]) => !invalidColumns.has(key)));
    const { data: updated, error } = await supabase
      .from('partner_salespeople')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', identity.companyUserId)
      .select()
      .single();
    if (error) throw error;
    if (!updated) throw new Error('O Supabase não retornou o colaborador atualizado.');

    const confirmed = updated as unknown as PartnerSalesperson;
    setData((prev) => ({ ...prev, salespeople: prev.salespeople.map((salesperson) => salesperson.id === id ? confirmed : salesperson) }));
  }, [identity]);

  const deleteSalesperson = useCallback(async (id: string) => {
    setData((prev) => ({ ...prev, salespeople: prev.salespeople.filter((s) => s.id !== id) }));
    if (isSupabaseConfigured && supabase) await supabase.from('partner_salespeople').delete().eq('id', id);
  }, []);

  const cancelSale = useCallback(async (
    id: string,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => {
    if (isSupabaseConfigured && supabase) {
      const sale = data.sales.find((s) => s.id === id);
      if (!sale) throw new Error('Venda não encontrada.');
      const { error: rpcErr } = await supabase.rpc('execute_partner_sale_mutation', {
        p_salesperson_id: operatorId ?? sale?.salesperson_id ?? null,
        p_pin: operatorPin ?? null,
        p_sale_id: id,
        p_customer_id: sale?.customer_id ?? null,
        p_customer_name: sale?.customer_name ?? '',
        p_items: sale?.items ?? [],
        p_total: sale?.total ?? 0,
        p_imei: sale?.imei ?? null,
        p_serial_number: sale?.serial_number ?? null,
        p_payment_method: sale?.payment_method ?? null,
        p_branch_id: sale?.branch_id ?? null,
        p_status: 'cancelada',
        p_origin: sale?.origin ?? 'pdv',
        p_customer_type: sale?.customer_type ?? 'varejo',
        p_delivery_type: sale?.delivery_type ?? 'balcao',
      });
      if (rpcErr) throw rpcErr;
      await loadData();
      return;
    }
    setData((prev) => ({ ...prev, sales: prev.sales.map((s) => s.id === id ? { ...s, status: 'cancelada' as const } : s) }));
  }, [data.sales, loadData]);

  const deleteSale = useCallback(async (
    id: string,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase não configurado. A venda não foi excluída.');
    const { data: deleted, error: rpcErr } = await supabase.rpc('execute_partner_sale_delete', {
      p_salesperson_id: operatorId ?? null,
      p_pin: operatorPin ?? null,
      p_sale_id: id,
    });
    if (rpcErr) throw rpcErr;
    if (deleted !== id) throw new Error('A exclusão da venda não foi confirmada pelo servidor.');
    setData((prev) => ({ ...prev, sales: prev.sales.filter((sale) => sale.id !== id) }));
  }, []);

  const addCombo = useCallback(async (combo: Omit<PartnerCombo, 'id' | 'user_id' | 'created_at'>) => {
    if (!identity) return;
    const nc: PartnerCombo = { ...combo, id: crypto.randomUUID(), user_id: identity.companyUserId, created_at: new Date().toISOString() };
    setData((prev) => ({ ...prev, combos: [nc, ...prev.combos] }));
    if (isSupabaseConfigured && supabase) await supabase.from('partner_combos').insert(nc);
  }, [identity]);

  const deleteCombo = useCallback(async (id: string) => {
    setData((prev) => ({ ...prev, combos: prev.combos.filter((c) => c.id !== id) }));
    if (isSupabaseConfigured && supabase) await supabase.from('partner_combos').delete().eq('id', id);
  }, []);

  const addModifier = useCallback(async (mod: Omit<PartnerModifier, 'id' | 'user_id' | 'created_at'>) => {
    if (!identity) return;
    const nm: PartnerModifier = { ...mod, id: crypto.randomUUID(), user_id: identity.companyUserId, created_at: new Date().toISOString() };
    setData((prev) => ({ ...prev, modifiers: [nm, ...prev.modifiers] }));
    if (isSupabaseConfigured && supabase) await supabase.from('partner_modifiers').insert(nm);
  }, [identity]);

  const deleteModifier = useCallback(async (id: string) => {
    setData((prev) => ({ ...prev, modifiers: prev.modifiers.filter((m) => m.id !== id) }));
    if (isSupabaseConfigured && supabase) await supabase.from('partner_modifiers').delete().eq('id', id);
  }, []);

  const payInvoice = useCallback(async (id: string) => {
    if (!isSupabaseConfigured || !supabase || !identity) throw new Error('Supabase não configurado.');
    const invoice = data.invoices.find((item) => item.id === id);
    if (!invoice) throw new Error('Título não encontrado.');
    const paidAt = new Date().toISOString();
    const { data: updatedInvoice, error } = await supabase
      .from('partner_invoices')
      .update({ status: 'paga', paid_amount: invoice.amount, paid_at: paidAt })
      .eq('id', id)
      .eq('user_id', identity.companyUserId)
      .select('*')
      .single();
    if (error) throw error;
    setData((prev) => ({ ...prev, invoices: prev.invoices.map((invoice) => invoice.id === id ? updatedInvoice as PartnerInvoice : invoice) }));
  }, [data.invoices, identity]);

  return {
    products: data.products, customers: data.customers, sales: data.sales,
    movements: data.movements, storeSettings: data.storeSettings,
    profile: data.profile, orders: data.orders, error: data.error,
    rmaRequests: data.rmaRequests, branches: data.branches, categories: data.categories,
    suppliers: data.suppliers, salespeople: data.salespeople, combos: data.combos,
    modifiers: data.modifiers, invoices: data.invoices, loading: data.loading,
    addProduct, replenishStock, updateProduct, deleteProduct, addCustomer, updateCustomer, refreshCustomer, deleteCustomer, createSale,
    createPreSale, finalizePreSale,
    updateStoreSettings, updateProfile, createRma, updateRmaStatus, deleteRma, addBranch, updateBranch, deleteBranch,
    addCategory, deleteCategory, addSupplier, updateSupplier, deleteSupplier, addSalesperson,
    updateSalesperson, deleteSalesperson, cancelSale, deleteSale,
    addCombo, deleteCombo, addModifier, deleteModifier, payInvoice,
  };
}
