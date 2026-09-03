import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type {
  PartnerProduct, PartnerCustomer, PartnerSale, StockMovement,
  StoreSettings, RmaRequest, RmaStatus, SaleItem,
  PartnerBranch, PartnerCategory, PartnerSupplier, PartnerSalesperson,
  PartnerCombo, PartnerModifier, PartnerInvoice, PartnerProfile,
  B2BOrder,
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
  addProduct: (product: Omit<PartnerProduct, 'id' | 'user_id' | 'created_at' | 'updated_at'>, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  updateProduct: (id: string, updates: Partial<PartnerProduct>, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  deleteProduct: (id: string, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  addCustomer: (customer: Omit<PartnerCustomer, 'id' | 'user_id' | 'created_at'>, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  updateCustomer: (id: string, updates: Partial<PartnerCustomer>, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  deleteCustomer: (id: string, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  createSale: (sale: { customer_id: string | null; customer_name: string; items: SaleItem[]; total: number; imei?: string; serial_number?: string; payment_method?: string; salesperson_id?: string | null; branch_id?: string | null }, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  createPreSale: (sale: { customer_id: string | null; customer_name: string; items: SaleItem[]; total: number; imei?: string; serial_number?: string; salesperson_id?: string | null; branch_id?: string | null }, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  finalizePreSale: (id: string, paymentMethod: string, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  updateStoreSettings: (settings: Partial<StoreSettings>) => Promise<void>;
  updateProfile: (profile: Partial<PartnerProfile>) => Promise<void>;
  createRma: (rma: Omit<RmaRequest, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'status'>) => Promise<void>;
  updateRmaStatus: (id: string, status: RmaStatus) => Promise<void>;
  deleteRma: (id: string) => Promise<void>;
  addBranch: (name: string, address: string) => Promise<void>;
  addCategory: (name: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  addSupplier: (supplier: Omit<PartnerSupplier, 'id' | 'user_id' | 'created_at' | 'payable_balance'>) => Promise<void>;
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

const emptyState = {
  products: [], customers: [], sales: [], movements: [],
  storeSettings: null, profile: null, rmaRequests: [], branches: [], categories: [],
  suppliers: [], salespeople: [], combos: [], modifiers: [], invoices: [], orders: [],
};

export function usePartnerData(user: User | null): PartnerData {
  const [data, setData] = useState<PartnerData & { loading: boolean }>({
    ...emptyState, loading: false,
  });

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !user) return;
    setData((prev) => ({ ...prev, loading: true }));

    const tables = [
      'partner_products', 'partner_customers', 'partner_sales', 'stock_movements',
      'store_settings_v2', 'rma_requests_v2', 'partner_branches', 'partner_categories',
      'partner_suppliers', 'partner_salespeople', 'partner_combos', 'partner_modifiers',
      'partner_invoices', 'b2b_orders',
    ];

    const results = await Promise.all(
      tables.map((t) =>
        supabase.from(t).select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      ),
    );

    const settingsRes = await supabase.from('store_settings_v2').select('*').eq('user_id', user.id).maybeSingle();
    const profileRes = await supabase.from('partner_profiles').select('*').eq('id', user.id).maybeSingle();

    setData({
      products: (results[0].data as PartnerProduct[]) ?? [],
      customers: (results[1].data as PartnerCustomer[]) ?? [],
      sales: (results[2].data as PartnerSale[]) ?? [],
      movements: (results[3].data as StockMovement[]) ?? [],
      storeSettings: (settingsRes.data as StoreSettings) ?? null,
      profile: (profileRes.data as PartnerProfile) ?? null,
      rmaRequests: (results[5].data as RmaRequest[]) ?? [],
      branches: (results[6].data as PartnerBranch[]) ?? [],
      categories: (results[7].data as PartnerCategory[]) ?? [],
      suppliers: (results[8].data as PartnerSupplier[]) ?? [],
      salespeople: (results[9].data as PartnerSalesperson[]) ?? [],
      combos: (results[10].data as PartnerCombo[]) ?? [],
      modifiers: (results[11].data as PartnerModifier[]) ?? [],
      invoices: (results[12].data as PartnerInvoice[]) ?? [],
      orders: (results[13].data as B2BOrder[]) ?? [],
      loading: false,
    });
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const addProduct = useCallback(async (
    product: Omit<PartnerProduct, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => {
    if (!user) return;
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
      id: crypto.randomUUID(), user_id: user.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
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
      await supabase.from('stock_movements').insert({ user_id: user.id, product_id: np.id, product_name: np.name, type: 'entrada', quantity: np.stock, reason: 'Cadastro inicial' });
    }
  }, [user]);

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
    if (!user) return;
    if (!customer.branch_id) {
      throw new Error('Cliente sem filial não pode ser cadastrado.');
    }
    const normalizedDocument = customer.document ? normalizeDocument(customer.document) : null;
    if (normalizedDocument && data.customers.some((item) => normalizeDocument(item.document ?? '') === normalizedDocument)) {
      throw new Error('Já existe um cliente com este CPF/CNPJ neste lojista.');
    }
    const nc: PartnerCustomer = { ...customer, document: normalizedDocument, id: crypto.randomUUID(), user_id: user.id, created_at: new Date().toISOString() };
    setData((prev) => ({ ...prev, customers: [nc, ...prev.customers] }));
    if (isSupabaseConfigured && supabase) {
      const { error: rpcErr } = await supabase.rpc('execute_partner_customer_mutation', {
        p_salesperson_id: operatorId ?? null,
        p_pin: operatorPin ?? null,
        p_customer_id: nc.id,
        p_branch_id: nc.branch_id,
        p_name: nc.name,
        p_document: nc.document ?? null,
        p_person_type: nc.person_type ?? null,
        p_phone: nc.phone ?? null,
        p_email: nc.email ?? null,
        p_birthday: nc.birthday ?? null,
        p_address: nc.address ?? null,
        p_neighborhood: nc.neighborhood ?? null,
        p_city: nc.city ?? null,
        p_device_model: nc.device_model ?? null,
        p_notes: nc.notes ?? null,
        p_customer_type: nc.customer_type ?? 'varejo',
      });
      if (rpcErr) throw rpcErr;
    }
  }, [user, data.customers]);

  const updateCustomer = useCallback(async (
    id: string,
    updates: Partial<PartnerCustomer>,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => {
    const normalizedDocument = updates.document === undefined
      ? undefined
      : (updates.document ? normalizeDocument(updates.document) : null);
    if (normalizedDocument && data.customers.some((item) => item.id !== id && normalizeDocument(item.document ?? '') === normalizedDocument)) {
      throw new Error('Já existe um cliente com este CPF/CNPJ neste lojista.');
    }
    const normalizedUpdates = normalizedDocument === undefined ? updates : { ...updates, document: normalizedDocument };
    setData((prev) => ({
      ...prev,
      customers: prev.customers.map((customer) => customer.id === id ? { ...customer, ...normalizedUpdates } : customer),
    }));
    if (isSupabaseConfigured && supabase) {
      const currentCust = data.customers.find((c) => c.id === id);
      const merged = { ...currentCust, ...normalizedUpdates };
      if (!merged.name) throw new Error('Nome do cliente é obrigatório.');
      const { error: rpcErr } = await supabase.rpc('execute_partner_customer_mutation', {
        p_salesperson_id: operatorId ?? null,
        p_pin: operatorPin ?? null,
        p_customer_id: id,
        p_branch_id: merged.branch_id ?? null,
        p_name: merged.name,
        p_document: merged.document ?? null,
        p_person_type: merged.person_type ?? null,
        p_phone: merged.phone ?? null,
        p_email: merged.email ?? null,
        p_birthday: merged.birthday ?? null,
        p_address: merged.address ?? null,
        p_neighborhood: merged.neighborhood ?? null,
        p_city: merged.city ?? null,
        p_device_model: merged.device_model ?? null,
        p_notes: merged.notes ?? null,
        p_customer_type: merged.customer_type ?? 'varejo',
      });
      if (rpcErr) throw rpcErr;
    }
  }, [data.customers]);

  const deleteCustomer = useCallback(async (
    id: string,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => {
    setData((prev) => ({ ...prev, customers: prev.customers.filter((customer) => customer.id !== id) }));
    if (isSupabaseConfigured && supabase) {
      const { error: rpcErr } = await supabase.rpc('execute_partner_customer_delete', {
        p_salesperson_id: operatorId ?? null,
        p_pin: operatorPin ?? null,
        p_customer_id: id,
      });
      if (rpcErr) throw rpcErr;
    }
  }, []);

  const createSale = useCallback(async (
    sale: { customer_id: string | null; customer_name: string; items: SaleItem[]; total: number; imei?: string; serial_number?: string; payment_method?: string; salesperson_id?: string | null; branch_id?: string | null },
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => {
    if (!user) return;
    const branchId = sale.branch_id ?? null;
    if (!branchId) {
      throw new Error('Venda sem filial selecionada.');
    }
    const effectiveSpId = operatorId ?? sale.salesperson_id ?? null;
    const ns: PartnerSale = { ...sale, id: crypto.randomUUID(), user_id: user.id, status: 'concluida', created_at: new Date().toISOString(), imei: sale.imei ?? null, serial_number: sale.serial_number ?? null, payment_method: sale.payment_method ?? null, branch_id: branchId, salesperson_id: effectiveSpId, origin: 'pdv', online_payment: false, payment_status: 'pago' };
    setData((prev) => {
      const newMovements: StockMovement[] = sale.items.map((item) => ({ id: crypto.randomUUID(), user_id: user.id, product_id: item.product_id, product_name: item.name, type: 'saida' as const, quantity: item.quantity, reason: 'Venda', created_at: new Date().toISOString() }));
      const updatedProducts = prev.products.map((p) => {
        if (p.branch_id !== branchId) return p;
        const si = sale.items.find((i) => i.product_id === p.id);
        return si ? { ...p, stock: Math.max(0, p.stock - si.quantity) } : p;
      });
      return { ...prev, sales: [ns, ...prev.sales], movements: [...newMovements, ...prev.movements], products: updatedProducts };
    });
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
      });
      if (rpcErr) throw rpcErr;
      for (const item of sale.items) {
        await supabase.from('stock_movements').insert({ user_id: user.id, product_id: item.product_id, product_name: item.name, type: 'saida', quantity: item.quantity, reason: 'Venda' });
      }
    }
  }, [user]);

  const createPreSale = useCallback(async (
    sale: { customer_id: string | null; customer_name: string; items: SaleItem[]; total: number; imei?: string; serial_number?: string; salesperson_id?: string | null; branch_id?: string | null },
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => {
    if (!user) return;
    const effectiveSpId = operatorId ?? sale.salesperson_id ?? null;
    const ns: PartnerSale = { ...sale, id: crypto.randomUUID(), user_id: user.id, status: 'pre_venda', created_at: new Date().toISOString(), imei: sale.imei ?? null, serial_number: sale.serial_number ?? null, payment_method: null, branch_id: sale.branch_id ?? null, salesperson_id: effectiveSpId, origin: 'pdv', online_payment: false, payment_status: 'pendente' };
    setData((prev) => ({ ...prev, sales: [ns, ...prev.sales] }));
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
      });
      if (rpcErr) throw rpcErr;
    }
  }, [user]);

  const finalizePreSale = useCallback(async (
    id: string,
    paymentMethod: string,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => {
    setData((prev) => {
      const sale = prev.sales.find((s) => s.id === id);
      if (!sale || !sale.branch_id) return prev;
      const newMovements: StockMovement[] = sale.items.map((item) => ({ id: crypto.randomUUID(), user_id: sale.user_id, product_id: item.product_id, product_name: item.name, type: 'saida' as const, quantity: item.quantity, reason: 'Venda (Pré-venda)', created_at: new Date().toISOString() }));
      const updatedProducts = prev.products.map((p) => {
        if (p.branch_id !== sale.branch_id) return p;
        const si = sale.items.find((i) => i.product_id === p.id);
        return si ? { ...p, stock: Math.max(0, p.stock - si.quantity) } : p;
      });
      return { ...prev, sales: prev.sales.map((s) => s.id === id ? { ...s, status: 'concluida' as const, payment_method: paymentMethod } : s), movements: [...newMovements, ...prev.movements], products: updatedProducts };
    });
    if (isSupabaseConfigured && supabase) {
      const sale = data.sales.find((s) => s.id === id);
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
      });
      if (rpcErr) throw rpcErr;
      if (sale && sale.branch_id) {
        for (const item of sale.items) {
          await supabase.from('stock_movements').insert({ user_id: sale.user_id, product_id: item.product_id, product_name: item.name, type: 'saida', quantity: item.quantity, reason: 'Venda (Pré-venda)' });
        }
      }
    }
  }, [data.sales]);

  const updateStoreSettings = useCallback(async (settings: Partial<StoreSettings>) => {
    setData((prev) => prev.storeSettings ? { ...prev, storeSettings: { ...prev.storeSettings, ...settings, updated_at: new Date().toISOString() } } : prev);
    if (isSupabaseConfigured && supabase && user) {
      if (data.storeSettings) {
        await supabase.from('store_settings_v2').update({ ...settings, updated_at: new Date().toISOString() }).eq('id', data.storeSettings.id);
      } else {
        await supabase.from('store_settings_v2').insert({ user_id: user.id, ...settings });
      }
    }
  }, [user, data.storeSettings]);

  const updateProfile = useCallback(async (profileUpdate: Partial<PartnerProfile>) => {
    setData((prev) => prev.profile ? { ...prev, profile: { ...prev.profile, ...profileUpdate } } : prev);
    if (isSupabaseConfigured && supabase && user) {
      await supabase.from('partner_profiles').update(profileUpdate).eq('id', user.id);
    }
  }, [user]);

  const createRma = useCallback(async (rma: Omit<RmaRequest, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'status'>) => {
    if (!user) return;
    const nr: RmaRequest = { ...rma, id: crypto.randomUUID(), user_id: user.id, status: 'aguardando_troca', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    setData((prev) => ({ ...prev, rmaRequests: [nr, ...prev.rmaRequests] }));
    if (isSupabaseConfigured && supabase) await supabase.from('rma_requests_v2').insert(nr);
  }, [user]);

  const updateRmaStatus = useCallback(async (id: string, status: RmaStatus) => {
    setData((prev) => ({ ...prev, rmaRequests: prev.rmaRequests.map((r) => r.id === id ? { ...r, status, updated_at: new Date().toISOString() } : r) }));
    if (isSupabaseConfigured && supabase) await supabase.from('rma_requests_v2').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  }, []);

  const deleteRma = useCallback(async (id: string) => {
    setData((prev) => ({ ...prev, rmaRequests: prev.rmaRequests.filter((r) => r.id !== id) }));
    if (isSupabaseConfigured && supabase) await supabase.from('rma_requests_v2').delete().eq('id', id);
  }, []);

  const addBranch = useCallback(async (name: string, address: string) => {
    if (!user) return;
    const nb: PartnerBranch = { id: crypto.randomUUID(), user_id: user.id, name, address, is_active: true, created_at: new Date().toISOString() };
    setData((prev) => ({ ...prev, branches: [...prev.branches, nb] }));
    if (isSupabaseConfigured && supabase) await supabase.from('partner_branches').insert(nb);
  }, [user]);

  const addCategory = useCallback(async (name: string) => {
    if (!user) return;
    const nc: PartnerCategory = { id: crypto.randomUUID(), user_id: user.id, name, created_at: new Date().toISOString() };
    setData((prev) => ({ ...prev, categories: [nc, ...prev.categories] }));
    if (isSupabaseConfigured && supabase) await supabase.from('partner_categories').insert(nc);
  }, [user]);

  const deleteCategory = useCallback(async (id: string) => {
    setData((prev) => ({ ...prev, categories: prev.categories.filter((c) => c.id !== id) }));
    if (isSupabaseConfigured && supabase) await supabase.from('partner_categories').delete().eq('id', id);
  }, []);

  const addSupplier = useCallback(async (supplier: Omit<PartnerSupplier, 'id' | 'user_id' | 'created_at' | 'payable_balance'>) => {
    if (!user) return;
    const ns: PartnerSupplier = { ...supplier, id: crypto.randomUUID(), user_id: user.id, payable_balance: 0, created_at: new Date().toISOString() };
    setData((prev) => ({ ...prev, suppliers: [ns, ...prev.suppliers] }));
    if (isSupabaseConfigured && supabase) await supabase.from('partner_suppliers').insert(ns);
  }, [user]);

  const addSalesperson = useCallback(async (sp: Omit<PartnerSalesperson, 'id' | 'user_id' | 'created_at'>) => {
    if (!user) return;
    const nsp: PartnerSalesperson = { ...sp, id: crypto.randomUUID(), user_id: user.id, created_at: new Date().toISOString() };
    setData((prev) => ({ ...prev, salespeople: [nsp, ...prev.salespeople] }));
    if (isSupabaseConfigured && supabase) await supabase.from('partner_salespeople').insert(nsp);
  }, [user]);

  const updateSalesperson = useCallback(async (id: string, updates: Partial<PartnerSalesperson>) => {
    setData((prev) => ({ ...prev, salespeople: prev.salespeople.map((s) => s.id === id ? { ...s, ...updates } : s) }));
    if (isSupabaseConfigured && supabase) await supabase.from('partner_salespeople').update(updates).eq('id', id);
  }, []);

  const deleteSalesperson = useCallback(async (id: string) => {
    setData((prev) => ({ ...prev, salespeople: prev.salespeople.filter((s) => s.id !== id) }));
    if (isSupabaseConfigured && supabase) await supabase.from('partner_salespeople').delete().eq('id', id);
  }, []);

  const cancelSale = useCallback(async (
    id: string,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => {
    setData((prev) => ({ ...prev, sales: prev.sales.map((s) => s.id === id ? { ...s, status: 'cancelada' as const } : s) }));
    if (isSupabaseConfigured && supabase) {
      const sale = data.sales.find((s) => s.id === id);
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
      });
      if (rpcErr) throw rpcErr;
    }
  }, [data.sales]);

  const deleteSale = useCallback(async (
    id: string,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => {
    setData((prev) => ({ ...prev, sales: prev.sales.filter((s) => s.id !== id) }));
    if (isSupabaseConfigured && supabase) {
      const { error: rpcErr } = await supabase.rpc('execute_partner_sale_delete', {
        p_salesperson_id: operatorId ?? null,
        p_pin: operatorPin ?? null,
        p_sale_id: id,
      });
      if (rpcErr) throw rpcErr;
    }
  }, []);

  const addCombo = useCallback(async (combo: Omit<PartnerCombo, 'id' | 'user_id' | 'created_at'>) => {
    if (!user) return;
    const nc: PartnerCombo = { ...combo, id: crypto.randomUUID(), user_id: user.id, created_at: new Date().toISOString() };
    setData((prev) => ({ ...prev, combos: [nc, ...prev.combos] }));
    if (isSupabaseConfigured && supabase) await supabase.from('partner_combos').insert(nc);
  }, [user]);

  const deleteCombo = useCallback(async (id: string) => {
    setData((prev) => ({ ...prev, combos: prev.combos.filter((c) => c.id !== id) }));
    if (isSupabaseConfigured && supabase) await supabase.from('partner_combos').delete().eq('id', id);
  }, []);

  const addModifier = useCallback(async (mod: Omit<PartnerModifier, 'id' | 'user_id' | 'created_at'>) => {
    if (!user) return;
    const nm: PartnerModifier = { ...mod, id: crypto.randomUUID(), user_id: user.id, created_at: new Date().toISOString() };
    setData((prev) => ({ ...prev, modifiers: [nm, ...prev.modifiers] }));
    if (isSupabaseConfigured && supabase) await supabase.from('partner_modifiers').insert(nm);
  }, [user]);

  const deleteModifier = useCallback(async (id: string) => {
    setData((prev) => ({ ...prev, modifiers: prev.modifiers.filter((m) => m.id !== id) }));
    if (isSupabaseConfigured && supabase) await supabase.from('partner_modifiers').delete().eq('id', id);
  }, []);

  const payInvoice = useCallback(async (id: string) => {
    setData((prev) => ({ ...prev, invoices: prev.invoices.map((i) => i.id === id ? { ...i, status: 'paga' as const, paid_at: new Date().toISOString() } : i) }));
    if (isSupabaseConfigured && supabase) await supabase.from('partner_invoices').update({ status: 'paga', paid_at: new Date().toISOString() }).eq('id', id);
  }, []);

  return {
    products: data.products, customers: data.customers, sales: data.sales,
    movements: data.movements, storeSettings: data.storeSettings,
    profile: data.profile,
    rmaRequests: data.rmaRequests, branches: data.branches, categories: data.categories,
    suppliers: data.suppliers, salespeople: data.salespeople, combos: data.combos,
    modifiers: data.modifiers, invoices: data.invoices, loading: data.loading,
    addProduct, updateProduct, deleteProduct, addCustomer, createSale,
    createPreSale, finalizePreSale,
    updateStoreSettings, updateProfile, createRma, updateRmaStatus, deleteRma, addBranch,
    addCategory, deleteCategory, addSupplier, addSalesperson,
    updateSalesperson, deleteSalesperson, cancelSale, deleteSale,
    addCombo, deleteCombo, addModifier, deleteModifier, payInvoice,
  };
}
