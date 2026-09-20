import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type {
  AdminCompany,
  AdminFinancialMonth,
  AdminLojista,
  AuditLog,
  B2BOrder,
  BusinessSegment,
  Category,
  CustomerGroup,
  DeliveryType,
  PartnerBranch,
  PartnerCategory,
  PartnerCombo,
  PartnerCustomer,
  PartnerIdentity,
  PartnerInvoice,
  PartnerModifier,
  PartnerProduct,
  PartnerProfile,
  PartnerSalesperson,
  PartnerSale,
  PartnerSupplier,
  PermissionOverride,
  RmaPayload,
  RmaRequest,
  RmaStatus,
  SalespersonRole,
  ServiceOrder,
  ServiceOrderApprovalStatus,
  ServiceOrderItem,
  ServiceOrderPhoto,
  ServiceOrderStatus,
  StockMovement,
  StoreSettings,
} from '../types';

type SalePayload = Omit<
  PartnerSale,
  | 'id'
  | 'user_id'
  | 'created_at'
  | 'status'
  | 'origin'
  | 'online_payment'
  | 'payment_status'
  | 'imei'
  | 'serial_number'
  | 'payment_method'
> & {
  status?: PartnerSale['status'];
  origin?: PartnerSale['origin'];
  online_payment?: PartnerSale['online_payment'];
  payment_status?: PartnerSale['payment_status'];
  imei?: string | null;
  serial_number?: string | null;
  payment_method?: string | null;
};

type CustomerPayload = Omit<
  PartnerCustomer,
  'id' | 'user_id' | 'created_at' | 'updated_at'
>;

type ProductPayload = Omit<
  PartnerProduct,
  'id' | 'user_id' | 'created_at' | 'updated_at'
>;

type SupplierPayload = Omit<
  PartnerSupplier,
  | 'id'
  | 'user_id'
  | 'created_at'
  | 'updated_at'
  | 'payable_balance'
>;

type SalespersonPayload = Omit<
  PartnerSalesperson,
  'id' | 'user_id' | 'created_at' | 'updated_at'
>;

type CategoryPayload = Omit<
  PartnerCategory,
  'id' | 'user_id' | 'created_at' | 'updated_at'
>;

type BranchPayload = Omit<
  PartnerBranch,
  'id' | 'user_id' | 'created_at' | 'updated_at'
>;

interface PartnerDataState {
  profile: PartnerProfile | null;
  branches: PartnerBranch[];
  customers: PartnerCustomer[];
  suppliers: PartnerSupplier[];
  categories: PartnerCategory[];
  products: PartnerProduct[];
  salespeople: PartnerSalesperson[];
  sales: PartnerSale[];
  movements: StockMovement[];
  settings: StoreSettings | null;
  rmas: RmaRequest[];
  combos: PartnerCombo[];
  modifiers: PartnerModifier[];
  invoices: PartnerInvoice[];
  orders: B2BOrder[];
  adminCompanies: AdminCompany[];
  adminLojistas: AdminLojista[];
  financialMonths: AdminFinancialMonth[];
  permissionOverrides: PermissionOverride[];
  auditLogs: AuditLog[];
  serviceOrders: ServiceOrder[];
  serviceOrderItems: ServiceOrderItem[];
  serviceOrderPhotos: ServiceOrderPhoto[];
}

const initialData: PartnerDataState = {
  profile: null,
  branches: [],
  customers: [],
  suppliers: [],
  categories: [],
  products: [],
  salespeople: [],
  sales: [],
  movements: [],
  settings: null,
  rmas: [],
  combos: [],
  modifiers: [],
  invoices: [],
  orders: [],
  adminCompanies: [],
  adminLojistas: [],
  financialMonths: [],
  permissionOverrides: [],
  auditLogs: [],
  serviceOrders: [],
  serviceOrderItems: [],
  serviceOrderPhotos: [],
};

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return new Error(error.message);
  }

  return new Error(String(error));
}

function isEmployeeIdentity(identity: PartnerIdentity | null): boolean {
  return Boolean(identity?.salespersonId);
}

function ensureEmployeeBranch(
  identity: PartnerIdentity,
  branchId: string | null | undefined,
): void {
  if (!identity.salespersonId) {
    return;
  }

  if (!identity.branchId) {
    throw new Error(
      'Funcionário autenticado não possui uma filial atribuída.',
    );
  }

  if (!branchId || branchId !== identity.branchId) {
    throw new Error(
      'Acesso negado: a operação não pertence à filial vinculada ao seu usuário.',
    );
  }
}

export function usePartnerData(identity: PartnerIdentity | null) {
  const [data, setData] = useState<PartnerDataState>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const requireIdentity = useCallback((): PartnerIdentity => {
    if (!identity) {
      throw new Error('Usuário não autenticado.');
    }

    return identity;
  }, [identity]);

  const clearData = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }

    setData(initialData);
    setError(null);
  }, []);

  const loadData = useCallback(async () => {
    const currentRequestId = ++requestIdRef.current;

    if (!identity) {
      clearData();
      setLoading(false);
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const currentIdentity = requireIdentity();
      const companyUserId = currentIdentity.companyUserId;

      const [
        profileResult,
        branchesResult,
        customersResult,
        suppliersResult,
        categoriesResult,
        productsResult,
        salespeopleResult,
        salesResult,
        movementsResult,
        settingsResult,
        rmasResult,
        combosResult,
        modifiersResult,
        invoicesResult,
        ordersResult,
        financialMonthsResult,
        permissionOverridesResult,
        auditLogsResult,
        serviceOrdersResult,
        serviceOrderItemsResult,
        serviceOrderPhotosResult,
      ] = await Promise.all([
        supabase
  .from('partner_profiles')
  .select('*')
  .eq('id', companyUserId)
  .maybeSingle(),

supabase
  .from('partner_branches')
  .select('*')
  .eq('user_id', companyUserId)
  .order('name'),

        supabase
          .from('partner_customers')
          .select('*')
          .eq('user_id', companyUserId)
          .order('name'),

        supabase
          .from('partner_suppliers')
          .select('*')
          .eq('user_id', companyUserId)
          .order('name'),

        supabase
          .from('partner_categories')
          .select('*')
          .eq('user_id', companyUserId)
          .order('name'),

        supabase
          .from('partner_products')
          .select('*')
          .eq('user_id', companyUserId)
          .order('name'),

        supabase
          .from('partner_salespeople')
          .select('*')
          .eq('user_id', companyUserId)
          .order('name'),

        supabase
          .from('partner_sales')
          .select('*')
          .eq('user_id', companyUserId)
          .order('created_at', { ascending: false }),

        supabase
          .from('partner_stock_movements')
          .select('*')
          .eq('user_id', companyUserId)
          .order('created_at', { ascending: false }),

        supabase
          .from('partner_store_settings')
          .select('*')
          .eq('user_id', companyUserId)
          .maybeSingle(),

        supabase
          .from('rma_requests_v2')
          .select('*')
          .eq('user_id', companyUserId)
          .order('created_at', { ascending: false }),

        supabase
          .from('partner_combos')
          .select('*')
          .eq('user_id', companyUserId)
          .order('name'),

        supabase
          .from('partner_modifiers')
          .select('*')
          .eq('user_id', companyUserId)
          .order('name'),

        supabase
          .from('partner_invoices')
          .select('*')
          .eq('user_id', companyUserId)
          .order('due_date'),

        supabase
          .from('b2b_orders')
          .select('*')
          .eq('user_id', companyUserId)
          .order('created_at', { ascending: false }),

        supabase
          .from('admin_financial_months')
          .select('*')
          .eq('user_id', companyUserId)
          .order('month'),

        supabase
          .from('permission_overrides')
          .select('*')
          .eq('user_id', companyUserId),

        supabase
          .from('partner_audit_logs')
          .select('*')
          .eq('user_id', companyUserId)
          .order('created_at', { ascending: false }),

        supabase
          .from('service_orders')
          .select('*')
          .eq('user_id', companyUserId)
          .order('created_at', { ascending: false }),

        supabase
          .from('service_order_items')
          .select('*')
          .eq('user_id', companyUserId),

        supabase
          .from('service_order_photos')
          .select('*')
          .eq('user_id', companyUserId)
          .order('created_at'),
      ]);

      const results = [
        profileResult,
        branchesResult,
        customersResult,
        suppliersResult,
        categoriesResult,
        productsResult,
        salespeopleResult,
        salesResult,
        movementsResult,
        settingsResult,
        rmasResult,
        combosResult,
        modifiersResult,
        invoicesResult,
        ordersResult,
        financialMonthsResult,
        permissionOverridesResult,
        auditLogsResult,
        serviceOrdersResult,
        serviceOrderItemsResult,
        serviceOrderPhotosResult,
      ];

      const firstError = results.find(
        (result) => result.error,
      );

      if (firstError?.error) {
        throw firstError.error;
      }

      if (
        !mountedRef.current ||
        currentRequestId !== requestIdRef.current
      ) {
        return;
      }

      const branchId = currentIdentity.branchId;

      const filterBranch = <T extends { branch_id?: string | null }>(
        rows: T[] | null,
      ): T[] => {
        const values = rows ?? [];

        if (!currentIdentity.salespersonId) {
          return values;
        }

        return values.filter(
          (row) => row.branch_id === branchId,
        );
      };

      setData({
        profile:
          (profileResult.data as PartnerProfile | null) ?? null,
        branches:
  (branchesResult.data as PartnerBranch[] | null) ?? [],
        customers: filterBranch(
          customersResult.data as PartnerCustomer[] | null,
        ),
        suppliers:
          (suppliersResult.data as PartnerSupplier[] | null) ?? [],
        categories:
          (categoriesResult.data as PartnerCategory[] | null) ?? [],
        products: filterBranch(
          productsResult.data as PartnerProduct[] | null,
        ),
        salespeople: filterBranch(
          salespeopleResult.data as PartnerSalesperson[] | null,
        ),
        sales: filterBranch(
          salesResult.data as PartnerSale[] | null,
        ),
        movements: filterBranch(
          movementsResult.data as StockMovement[] | null,
        ),
        settings:
          (settingsResult.data as StoreSettings | null) ?? null,
        rmas: filterBranch(
          rmasResult.data as RmaRequest[] | null,
        ),
        combos:
          (combosResult.data as PartnerCombo[] | null) ?? [],
        modifiers:
          (modifiersResult.data as PartnerModifier[] | null) ?? [],
        invoices: filterBranch(
          invoicesResult.data as PartnerInvoice[] | null,
        ),
        orders: filterBranch(
          ordersResult.data as B2BOrder[] | null,
        ),
        adminCompanies: [],
        adminLojistas: [],
        financialMonths:
          (financialMonthsResult.data as AdminFinancialMonth[] | null) ??
          [],
        permissionOverrides:
          (permissionOverridesResult.data as PermissionOverride[] | null) ??
          [],
        auditLogs:
          (auditLogsResult.data as AuditLog[] | null) ?? [],
        serviceOrders: filterBranch(
          serviceOrdersResult.data as ServiceOrder[] | null,
        ),
        serviceOrderItems:
          (serviceOrderItemsResult.data as ServiceOrderItem[] | null) ??
          [],
        serviceOrderPhotos:
          (serviceOrderPhotosResult.data as ServiceOrderPhoto[] | null) ??
          [],
      });
    } catch (err) {
      if (
        !mountedRef.current ||
        currentRequestId !== requestIdRef.current
      ) {
        return;
      }

      const normalized = normalizeError(err);
      setError(normalized.message);
    } finally {
      if (
        mountedRef.current &&
        currentRequestId === requestIdRef.current
      ) {
        setLoading(false);
      }
    }
  }, [clearData, identity, requireIdentity]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const addCustomer = useCallback(
    async (
      customer: CustomerPayload,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      ensureEmployeeBranch(
        currentIdentity,
        customer.branch_id,
      );

      // Operador que autoriza a operação (fluxo A: id + PIN do modal).
      // Quando não informado, envia null para que a RPC resolva o
      // operador pelo auth.uid() da sessão (fluxo B). Nunca enviar o id
      // da sessão com PIN nulo: a RPC exige PIN válido nesse caso.
      const effectiveOperatorId = operatorId ?? null;
      const effectiveOperatorPin = operatorPin ?? null;

      const { data: created, error: rpcError } =
        await supabase.rpc(
          'execute_partner_customer_mutation',
          {
            p_salesperson_id: effectiveOperatorId,
            p_pin: effectiveOperatorPin,
            p_customer_id: null,
            p_branch_id: customer.branch_id ?? null,
            p_name: customer.name,
            p_document: customer.document ?? null,
            p_phone: customer.phone ?? null,
            p_email: customer.email ?? null,
            p_birthday: customer.birthday ?? null,
            p_address: customer.address ?? null,
            p_neighborhood: customer.neighborhood ?? null,
            p_city: customer.city ?? null,
            p_device_model: customer.device_model ?? null,
            p_notes: customer.notes ?? null,
            p_customer_type: customer.customer_type ?? 'varejo',
            p_credit_limit: customer.credit_limit ?? 0,
            p_allow_credit: customer.allow_credit ?? false,
          },
        );

      if (rpcError) {
        throw rpcError;
      }

      // A RPC retorna o id (uuid) do cliente, não a linha completa.
      const createdCustomer: PartnerCustomer = {
        ...customer,
        id:
          (created as string | null) ??
          crypto.randomUUID(),
        user_id: currentIdentity.companyUserId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setData((prev) => ({
        ...prev,
        customers: [
          createdCustomer,
          ...prev.customers.filter(
            (item) => item.id !== createdCustomer.id,
          ),
        ],
      }));

      return createdCustomer;
    },
    [requireIdentity],
  );

  const updateCustomer = useCallback(
    async (
      id: string,
      customer: Partial<CustomerPayload>,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const existing = data.customers.find(
        (item) => item.id === id,
      );

      if (!existing) {
        throw new Error('Cliente não encontrado.');
      }

      ensureEmployeeBranch(
        currentIdentity,
        customer.branch_id ?? existing.branch_id,
      );

      // Mesma regra de operador: id + PIN do modal ou null (auth.uid()).
      const effectiveOperatorId = operatorId ?? null;
      const effectiveOperatorPin = operatorPin ?? null;

      const { data: updated, error: rpcError } =
        await supabase.rpc(
          'execute_partner_customer_mutation',
          {
            p_salesperson_id: effectiveOperatorId,
            p_pin: effectiveOperatorPin,
            p_customer_id: id,
            p_branch_id:
              customer.branch_id ?? existing.branch_id ?? null,
            p_name: customer.name ?? existing.name,
            p_document:
              customer.document ?? existing.document ?? null,
            p_phone: customer.phone ?? existing.phone ?? null,
            p_email: customer.email ?? existing.email ?? null,
            p_birthday:
              customer.birthday ?? existing.birthday ?? null,
            p_address:
              customer.address ?? existing.address ?? null,
            p_neighborhood:
              customer.neighborhood ??
              existing.neighborhood ??
              null,
            p_city: customer.city ?? existing.city ?? null,
            p_device_model:
              customer.device_model ??
              existing.device_model ??
              null,
            p_notes: customer.notes ?? existing.notes ?? null,
            p_customer_type:
              customer.customer_type ?? existing.customer_type,
            p_credit_limit:
              customer.credit_limit ?? existing.credit_limit ?? 0,
            p_allow_credit:
              customer.allow_credit ??
              existing.allow_credit ??
              false,
          },
        );

      if (rpcError) {
        throw rpcError;
      }

      // A RPC retorna o id (uuid) do cliente, não a linha completa.
      const updatedCustomer: PartnerCustomer = {
        ...existing,
        ...customer,
        id,
        updated_at: new Date().toISOString(),
      };

      setData((prev) => ({
        ...prev,
        customers: prev.customers.map((item) =>
          item.id === id ? updatedCustomer : item,
        ),
      }));

      return updatedCustomer;
    },
    [data.customers, requireIdentity],
  );

  const deleteCustomer = useCallback(
    async (
      id: string,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const existing = data.customers.find(
        (item) => item.id === id,
      );

      if (!existing) {
        throw new Error('Cliente não encontrado.');
      }

      ensureEmployeeBranch(
        currentIdentity,
        existing.branch_id,
      );

      // Mesma regra de operador: id + PIN do modal ou null (auth.uid()).
      const effectiveOperatorId = operatorId ?? null;
      const effectiveOperatorPin = operatorPin ?? null;

      const { error: rpcError } = await supabase.rpc(
        'execute_partner_customer_delete',
        {
          p_salesperson_id: effectiveOperatorId,
          p_pin: effectiveOperatorPin,
          p_customer_id: id,
        },
      );

      if (rpcError) {
        throw rpcError;
      }

      setData((prev) => ({
        ...prev,
        customers: prev.customers.filter(
          (item) => item.id !== id,
        ),
      }));
    },
    [data.customers, requireIdentity],
  );

  const addProduct = useCallback(
    async (
      product: ProductPayload,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      ensureEmployeeBranch(
        currentIdentity,
        product.branch_id,
      );

      // Mesma regra de operador: id + PIN do modal ou null (auth.uid()).
      const effectiveOperatorId = operatorId ?? null;
      const effectiveOperatorPin = operatorPin ?? null;

      const { data: created, error: rpcError } =
        await supabase.rpc(
          'execute_partner_product_mutation',
          {
            p_salesperson_id: effectiveOperatorId,
            p_pin: effectiveOperatorPin,
            p_product_id: null,
            p_branch_id: product.branch_id ?? null,
            p_name: product.name,
            p_cost_price: product.cost_price,
            p_sale_price: product.sale_price,
            p_wholesale_price: product.wholesale_price,
            p_stock: product.stock,
            p_min_stock: product.min_stock,
            p_category: product.category,
            p_sku: product.sku,
            p_is_service: product.is_service,
            p_image_url: product.image_url ?? null,
          },
        );

      if (rpcError) {
        throw rpcError;
      }

      // A RPC retorna o id (uuid) do produto, não a linha completa.
      const createdProduct: PartnerProduct = {
        ...product,
        id:
          (created as string | null) ??
          crypto.randomUUID(),
        user_id: currentIdentity.companyUserId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setData((prev) => ({
        ...prev,
        products: [
          createdProduct,
          ...prev.products.filter(
            (item) => item.id !== createdProduct.id,
          ),
        ],
      }));

      return createdProduct;
    },
    [requireIdentity],
  );

  const updateProduct = useCallback(
    async (
      id: string,
      product: Partial<ProductPayload>,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const existing = data.products.find(
        (item) => item.id === id,
      );

      if (!existing) {
        throw new Error('Produto não encontrado.');
      }

      ensureEmployeeBranch(
        currentIdentity,
        product.branch_id ?? existing.branch_id,
      );

      // Mesma regra de operador: id + PIN do modal ou null (auth.uid()).
      const effectiveOperatorId = operatorId ?? null;
      const effectiveOperatorPin = operatorPin ?? null;

      const { data: updated, error: rpcError } =
        await supabase.rpc(
          'execute_partner_product_mutation',
          {
            p_salesperson_id: effectiveOperatorId,
            p_pin: effectiveOperatorPin,
            p_product_id: id,
            p_branch_id:
              product.branch_id ?? existing.branch_id ?? null,
            p_name: product.name ?? existing.name,
            p_cost_price:
              product.cost_price ?? existing.cost_price,
            p_sale_price:
              product.sale_price ?? existing.sale_price,
            p_wholesale_price:
              product.wholesale_price ??
              existing.wholesale_price,
            p_stock: product.stock ?? existing.stock,
            p_min_stock:
              product.min_stock ?? existing.min_stock,
            p_category:
              product.category ?? existing.category,
            p_sku: product.sku ?? existing.sku,
            p_is_service:
              product.is_service ?? existing.is_service,
            p_image_url:
              product.image_url ?? existing.image_url ?? null,
          },
        );

      if (rpcError) {
        throw rpcError;
      }

      // A RPC retorna o id (uuid) do produto, não a linha completa.
      const updatedProduct: PartnerProduct = {
        ...existing,
        ...product,
        id,
        updated_at: new Date().toISOString(),
      };

      setData((prev) => ({
        ...prev,
        products: prev.products.map((item) =>
          item.id === id ? updatedProduct : item,
        ),
      }));

      return updatedProduct;
    },
    [data.products, requireIdentity],
  );

  const deleteProduct = useCallback(
    async (
      id: string,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const existing = data.products.find(
        (item) => item.id === id,
      );

      if (!existing) {
        throw new Error('Produto não encontrado.');
      }

      ensureEmployeeBranch(
        currentIdentity,
        existing.branch_id,
      );

      // Mesma regra de operador: id + PIN do modal ou null (auth.uid()).
      const effectiveOperatorId = operatorId ?? null;
      const effectiveOperatorPin = operatorPin ?? null;

      const { error: rpcError } = await supabase.rpc(
        'execute_partner_product_delete',
        {
          p_salesperson_id: effectiveOperatorId,
          p_pin: effectiveOperatorPin,
          p_product_id: id,
        },
      );

      if (rpcError) {
        throw rpcError;
      }

      setData((prev) => ({
        ...prev,
        products: prev.products.filter(
          (item) => item.id !== id,
        ),
      }));
    },
    [data.products, requireIdentity],
  );

  const addSupplier = useCallback(
    async (
      supplier: SupplierPayload,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      // Mesma regra de operador: id + PIN do modal ou null (auth.uid()).
      const effectiveOperatorId = operatorId ?? null;
      const effectiveOperatorPin = operatorPin ?? null;

      // A RPC atual aceita apenas nome, telefone e observações.
      // Os demais campos do formulário (documento, e-mail, endereço,
      // cidade, estado, CEP, status) seguem apenas na UI/local state.
      const { data: created, error: rpcError } =
        await supabase.rpc(
          'execute_partner_supplier_mutation',
          {
            p_operator_id: effectiveOperatorId,
            p_operator_pin: effectiveOperatorPin,
            p_supplier_id: null,
            p_name: supplier.name,
            p_phone: supplier.phone ?? null,
            p_notes: supplier.notes ?? null,
          },
        );

      if (rpcError) {
        throw rpcError;
      }

      // A RPC retorna o id (uuid) do fornecedor, não a linha completa.
      const createdSupplier: PartnerSupplier = {
        ...supplier,
        id:
          (created as string | null) ??
          crypto.randomUUID(),
        user_id: currentIdentity.companyUserId,
        // A RPC sempre insere o fornecedor com saldo a pagar zerado.
        payable_balance: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setData((prev) => ({
        ...prev,
        suppliers: [
          createdSupplier,
          ...prev.suppliers.filter(
            (item) => item.id !== createdSupplier.id,
          ),
        ],
      }));

      return createdSupplier;
    },
    [requireIdentity],
  );

  const updateSupplier = useCallback(
    async (
      id: string,
      supplier: Partial<SupplierPayload>,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const existing = data.suppliers.find(
        (item) => item.id === id,
      );

      if (!existing) {
        throw new Error('Fornecedor não encontrado.');
      }

      // Mesma regra de operador: id + PIN do modal ou null (auth.uid()).
      const effectiveOperatorId = operatorId ?? null;
      const effectiveOperatorPin = operatorPin ?? null;

      // A RPC atual aceita apenas nome, telefone e observações.
      const { data: updated, error: rpcError } =
        await supabase.rpc(
          'execute_partner_supplier_mutation',
          {
            p_operator_id: effectiveOperatorId,
            p_operator_pin: effectiveOperatorPin,
            p_supplier_id: id,
            p_name: supplier.name ?? existing.name,
            p_phone: supplier.phone ?? existing.phone ?? null,
            p_notes: supplier.notes ?? existing.notes ?? null,
          },
        );

      if (rpcError) {
        throw rpcError;
      }

      // A RPC retorna o id (uuid) do fornecedor, não a linha completa.
      const updatedSupplier: PartnerSupplier = {
        ...existing,
        ...supplier,
        id,
        updated_at: new Date().toISOString(),
      };

      setData((prev) => ({
        ...prev,
        suppliers: prev.suppliers.map((item) =>
          item.id === id ? updatedSupplier : item,
        ),
      }));

      return updatedSupplier;
    },
    [data.suppliers, requireIdentity],
  );

  const deleteSupplier = useCallback(
    async (
      id: string,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const existing = data.suppliers.find(
        (item) => item.id === id,
      );

      if (!existing) {
        throw new Error('Fornecedor não encontrado.');
      }

      // Mesma regra de operador: id + PIN do modal ou null (auth.uid()).
      const effectiveOperatorId = operatorId ?? null;
      const effectiveOperatorPin = operatorPin ?? null;

      const { error: rpcError } = await supabase.rpc(
        'execute_partner_supplier_delete',
        {
          p_operator_id: effectiveOperatorId,
          p_operator_pin: effectiveOperatorPin,
          p_supplier_id: id,
        },
      );

      if (rpcError) {
        throw rpcError;
      }

      setData((prev) => ({
        ...prev,
        suppliers: prev.suppliers.filter(
          (item) => item.id !== id,
        ),
      }));
    },
    [data.suppliers, requireIdentity],
  );

  const addCategory = useCallback(
    async (category: CategoryPayload) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      ensureEmployeeBranch(
        currentIdentity,
        category.branch_id,
      );

      const { data: created, error } = await supabase
        .from('partner_categories')
        .insert({
          ...category,
          user_id: currentIdentity.companyUserId,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      const createdCategory =
        created as PartnerCategory;

      setData((prev) => ({
        ...prev,
        categories: [
          createdCategory,
          ...prev.categories,
        ],
      }));

      return createdCategory;
    },
    [requireIdentity],
  );

  const updateCategory = useCallback(
    async (
      id: string,
      category: Partial<CategoryPayload>,
    ) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const existing = data.categories.find(
        (item) => item.id === id,
      );

      if (!existing) {
        throw new Error('Categoria não encontrada.');
      }

      ensureEmployeeBranch(
        currentIdentity,
        category.branch_id ?? existing.branch_id,
      );

      const { data: updated, error } = await supabase
        .from('partner_categories')
        .update(category)
        .eq('id', id)
        .eq('user_id', currentIdentity.companyUserId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        categories: prev.categories.map((item) =>
          item.id === id
            ? (updated as PartnerCategory)
            : item,
        ),
      }));

      return updated as PartnerCategory;
    },
    [data.categories, requireIdentity],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const existing = data.categories.find(
        (item) => item.id === id,
      );

      if (!existing) {
        throw new Error('Categoria não encontrada.');
      }

      ensureEmployeeBranch(
        currentIdentity,
        existing.branch_id,
      );

      const { error } = await supabase
        .from('partner_categories')
        .delete()
        .eq('id', id)
        .eq('user_id', currentIdentity.companyUserId);

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        categories: prev.categories.filter(
          (item) => item.id !== id,
        ),
      }));
    },
    [data.categories, requireIdentity],
  );

  const addBranch = useCallback(
    async (branch: BranchPayload) => {
      const currentIdentity = requireIdentity();

      if (currentIdentity.salespersonId) {
        throw new Error(
          'Funcionários não podem cadastrar filiais.',
        );
      }

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const { data: created, error } = await supabase
        .from('partner_branches')
        .insert({
          ...branch,
          user_id: currentIdentity.companyUserId,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      const createdBranch = created as PartnerBranch;

      setData((prev) => ({
        ...prev,
        branches: [
          ...prev.branches,
          createdBranch,
        ],
      }));

      return createdBranch;
    },
    [requireIdentity],
  );

  const updateBranch = useCallback(
    async (
      id: string,
      branch: Partial<BranchPayload>,
    ) => {
      const currentIdentity = requireIdentity();

      if (currentIdentity.salespersonId) {
        throw new Error(
          'Funcionários não podem alterar filiais.',
        );
      }

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const { data: updated, error } = await supabase
        .from('partner_branches')
        .update(branch)
        .eq('id', id)
        .eq('user_id', currentIdentity.companyUserId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        branches: prev.branches.map((item) =>
          item.id === id
            ? (updated as PartnerBranch)
            : item,
        ),
      }));

      return updated as PartnerBranch;
    },
    [requireIdentity],
  );

  const deleteBranch = useCallback(
    async (id: string) => {
      const currentIdentity = requireIdentity();

      if (currentIdentity.salespersonId) {
        throw new Error(
          'Funcionários não podem excluir filiais.',
        );
      }

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const { error } = await supabase
        .from('partner_branches')
        .delete()
        .eq('id', id)
        .eq('user_id', currentIdentity.companyUserId);

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        branches: prev.branches.filter(
          (item) => item.id !== id,
        ),
      }));
    },
    [requireIdentity],
  );

  const createSale = useCallback(
    async (
      sale: SalePayload,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      const currentIdentity = requireIdentity();

      if (!sale.branch_id) {
        throw new Error(
          'Venda sem filial selecionada.',
        );
      }

      ensureEmployeeBranch(
        currentIdentity,
        sale.branch_id,
      );

      // Atribuição comercial da venda (relatórios/comissões) — preservada.
      const effectiveSalespersonId =
        currentIdentity.salespersonId
          ? currentIdentity.salespersonId
          : operatorId ?? sale.salesperson_id ?? null;

      // Autorização da RPC: operador do modal (id + PIN) ou null para
      // que a RPC resolva o operador pelo auth.uid() da sessão.
      const effectiveOperatorId = operatorId ?? null;
      const effectiveOperatorPin = operatorPin ?? null;

      const ns: PartnerSale = {
        ...sale,
        id: crypto.randomUUID(),
        user_id: currentIdentity.companyUserId,
        status: sale.status ?? 'concluida',
        created_at: new Date().toISOString(),
        imei: sale.imei ?? null,
        serial_number: sale.serial_number ?? null,
        payment_method: sale.payment_method ?? null,
        branch_id: sale.branch_id,
        salesperson_id: effectiveSalespersonId,
        origin: sale.origin ?? 'pdv',
        online_payment: sale.online_payment ?? false,
        payment_status:
          sale.payment_status ?? 'pendente',
      };

      if (isSupabaseConfigured && supabase) {
        const { error: rpcErr } =
          await supabase.rpc(
            'execute_partner_sale_mutation',
            {
              p_salesperson_id:
                effectiveOperatorId,
              p_pin: effectiveOperatorPin,
              p_sale_id: ns.id,
              p_customer_id: ns.customer_id,
              p_customer_name: ns.customer_name,
              p_items: ns.items,
              p_total: ns.total,
              p_imei: ns.imei,
              p_serial_number: ns.serial_number,
              p_payment_method:
                ns.payment_method ?? null,
              p_branch_id: ns.branch_id,
              p_status: ns.status,
              p_origin: ns.origin,
              p_customer_type:
                ns.customer_type ?? 'varejo',
              p_delivery_type:
                ns.delivery_type ?? 'balcao',
            },
          );

        if (rpcErr) {
          throw rpcErr;
        }
      }

      let createdInvoice: PartnerInvoice | null =
        null;

      if (sale.payment_method === 'faturado') {
        if (!isSupabaseConfigured || !supabase) {
          throw new Error(
            'Venda faturada requer Supabase configurado.',
          );
        }

        const { data: invoice, error: invoiceError } =
          await supabase
            .from('partner_invoices')
            .select('*')
            .eq('sale_id', ns.id)
            .eq(
              'user_id',
              currentIdentity.companyUserId,
            )
            .maybeSingle();

        if (invoiceError) {
          throw new Error(
            `Venda criada, mas o título B2B não pôde ser localizado: ${invoiceError.message}`,
          );
        }
        
        if (!invoice) {
          throw new Error(
            'Venda criada, mas o título B2B não foi localizado.',
          );
        }

        createdInvoice =
          invoice as PartnerInvoice;
      }

      setData((prev) => ({
        ...prev,
        sales: [
          ns,
          ...prev.sales,
        ],
        invoices: createdInvoice
          ? [
              createdInvoice,
              ...prev.invoices.filter(
                (invoice) =>
                  invoice.id !== createdInvoice!.id,
              ),
            ]
          : prev.invoices,
      }));

      return ns;
    },
    [identity, requireIdentity],
  );

  const createPreSale = useCallback(
    async (
      sale: SalePayload,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      const currentIdentity = requireIdentity();
      const branchId = sale.branch_id ?? null;

      if (!branchId) {
        throw new Error(
          'Pré-venda sem filial selecionada.',
        );
      }

      ensureEmployeeBranch(
        currentIdentity,
        branchId,
      );

      // Atribuição comercial da venda (relatórios/comissões) — preservada.
      const effectiveSpId =
        currentIdentity.salespersonId
          ? currentIdentity.salespersonId
          : operatorId ?? sale.salesperson_id ?? null;

      // Autorização da RPC: operador do modal (id + PIN) ou null para
      // que a RPC resolva o operador pelo auth.uid() da sessão.
      const effectiveOperatorId = operatorId ?? null;
      const effectiveOperatorPin = operatorPin ?? null;

      const ns: PartnerSale = {
        ...sale,
        id: crypto.randomUUID(),
        user_id: currentIdentity.companyUserId,
        status: 'pre_venda',
        created_at: new Date().toISOString(),
        imei: sale.imei ?? null,
        serial_number: sale.serial_number ?? null,
        payment_method: null,
        branch_id: branchId,
        salesperson_id: effectiveSpId,
        origin: 'pdv',
        online_payment: false,
        payment_status: 'pendente',
      };

      if (isSupabaseConfigured && supabase) {
        const { error: rpcErr } =
          await supabase.rpc(
            'execute_partner_sale_mutation',
            {
              p_salesperson_id: effectiveOperatorId,
              p_pin: effectiveOperatorPin,
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
              p_customer_type:
                ns.customer_type ?? 'varejo',
              p_delivery_type:
                ns.delivery_type ?? 'balcao',
            },
          );

        if (rpcErr) {
          throw rpcErr;
        }
      }

      setData((prev) => ({
        ...prev,
        sales: [
          ns,
          ...prev.sales,
        ],
      }));

      return ns;
    },
    [identity, requireIdentity],
  );

  const finalizePreSale = useCallback(
    async (
      id: string,
      paymentMethod: string,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      const currentIdentity = requireIdentity();

      const sale = data.sales.find(
        (currentSale) =>
          currentSale.id === id,
      );

      if (!sale || !sale.branch_id) {
        throw new Error(
          'Pré-venda não encontrada ou sem filial válida.',
        );
      }

      ensureEmployeeBranch(
        currentIdentity,
        sale.branch_id,
      );

      // Autorização da RPC: operador do modal (id + PIN) ou null para
      // que a RPC resolva o operador pelo auth.uid() da sessão.
      const effectiveOperatorId = operatorId ?? null;
      const effectiveOperatorPin = operatorPin ?? null;

      if (isSupabaseConfigured && supabase) {
        const { error: rpcErr } =
          await supabase.rpc(
            'execute_partner_sale_mutation',
            {
              p_salesperson_id:
                effectiveOperatorId,
              p_pin: effectiveOperatorPin,
              p_sale_id: id,
              p_customer_id:
                sale.customer_id ?? null,
              p_customer_name:
                sale.customer_name ?? '',
              p_items: sale.items ?? [],
              p_total: sale.total ?? 0,
              p_imei: sale.imei ?? null,
              p_serial_number:
                sale.serial_number ?? null,
              p_payment_method: paymentMethod,
              p_branch_id: sale.branch_id,
              p_status: 'concluida',
              p_origin:
                sale.origin ?? 'pdv',
              p_customer_type:
                sale.customer_type ?? 'varejo',
              p_delivery_type:
                sale.delivery_type ?? 'balcao',
            },
          );

        if (rpcErr) {
          throw rpcErr;
        }
      }

      setData((prev) => {
        const newMovements: StockMovement[] =
          sale.items.map((item) => ({
            id: crypto.randomUUID(),
            user_id:
              currentIdentity.companyUserId,
            product_id: item.product_id,
            product_name: item.name,
            type: 'saida',
            quantity: item.quantity,
            reason: 'Venda (Pré-venda)',
            created_at:
              new Date().toISOString(),
            branch_id: sale.branch_id,
          }));

        const updatedProducts =
          prev.products.map((product) => {
            if (
              product.branch_id !==
              sale.branch_id
            ) {
              return product;
            }

            const item = sale.items.find(
              (currentItem) =>
                currentItem.product_id ===
                product.id,
            );

            return item
              ? {
                  ...product,
                  stock: Math.max(
                    0,
                    product.stock -
                      item.quantity,
                  ),
                }
              : product;
          });

        return {
          ...prev,
          sales: prev.sales.map(
            (currentSale) =>
              currentSale.id === id
                ? {
                    ...currentSale,
                    status: 'concluida',
                    payment_method:
                      paymentMethod,
                    payment_status:
                      paymentMethod ===
                      'faturado'
                        ? 'pendente'
                        : 'pago',
                  }
                : currentSale,
          ),
          movements: [
            ...newMovements,
            ...prev.movements,
          ],
          products: updatedProducts,
        };
      });
    },
    [data.sales, identity, requireIdentity],
  );

  const cancelSale = useCallback(
    async (
      id: string,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      const currentIdentity = requireIdentity();

      const sale = data.sales.find(
        (item) => item.id === id,
      );

      if (!sale) {
        throw new Error('Venda não encontrada.');
      }

      ensureEmployeeBranch(
        currentIdentity,
        sale.branch_id,
      );

      // Cancelar venda exige autorização de Administrador ou Gerente digitada
      // na hora (ver PdvModule). Quando um operatorId é explicitamente
      // informado, ele é usado com o PIN digitado. Sem operador informado,
      // envia null para que a RPC resolva pelo auth.uid() da sessão.
      // Nunca enviar id de colaborador com PIN nulo.
      const effectiveOperatorId = operatorId ?? null;
      const effectiveOperatorPin = operatorPin ?? null;

      if (isSupabaseConfigured && supabase) {
        const { error: rpcErr } =
          await supabase.rpc(
            'execute_partner_sale_mutation',
            {
              p_salesperson_id:
                effectiveOperatorId,
              p_pin: effectiveOperatorPin,
              p_sale_id: id,
              p_customer_id:
                sale.customer_id ?? null,
              p_customer_name:
                sale.customer_name ?? '',
              p_items: sale.items ?? [],
              p_total: sale.total ?? 0,
              p_imei: sale.imei ?? null,
              p_serial_number:
                sale.serial_number ?? null,
              p_payment_method:
                sale.payment_method ?? null,
              p_branch_id:
                sale.branch_id ?? null,
              p_status: 'cancelada',
              p_origin:
                sale.origin ?? 'pdv',
              p_customer_type:
                sale.customer_type ?? 'varejo',
              p_delivery_type:
                sale.delivery_type ?? 'balcao',
            },
          );

        if (rpcErr) {
          throw rpcErr;
        }

        await loadData();
        return;
      }

      setData((prev) => ({
        ...prev,
        sales: prev.sales.map(
          (item) =>
            item.id === id
              ? {
                  ...item,
                  status: 'cancelada',
                }
              : item,
        ),
      }));
    },
    [data.sales, loadData, identity, requireIdentity],
  );

  const deleteSale = useCallback(
    async (
      id: string,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      const currentIdentity = requireIdentity();

      const sale = data.sales.find(
        (item) => item.id === id,
      );

      if (!sale) {
        throw new Error('Venda não encontrada.');
      }

      ensureEmployeeBranch(
        currentIdentity,
        sale.branch_id,
      );

      // Mesma regra de autorização do cancelamento: operador informado
      // na hora (id + PIN) ou null para resolução via auth.uid().
      const effectiveOperatorId = operatorId ?? null;
      const effectiveOperatorPin = operatorPin ?? null;

      if (isSupabaseConfigured && supabase) {
        const { error: rpcErr } =
          await supabase.rpc(
            'execute_partner_sale_delete',
            {
              p_sale_id: id,
              p_salesperson_id:
                effectiveOperatorId,
              p_pin: effectiveOperatorPin,
            },
          );

        if (rpcErr) {
          throw rpcErr;
        }
      }

      setData((prev) => ({
        ...prev,
        sales: prev.sales.filter(
          (item) => item.id !== id,
        ),
        invoices: prev.invoices.filter(
          (invoice) =>
            invoice.sale_id !== id,
        ),
      }));
    },
    [data.sales, requireIdentity],
  );

  const replenishStock = useCallback(
    async (
      productId: string,
      branchId: string,
      quantity: number,
      unitCost?: number | null,
      reason?: string,
      operatorId?: string | null,
      operatorPin?: string | null,
    ): Promise<{ newStock: number }> => {
      const currentIdentity = requireIdentity();

      if (quantity <= 0) {
        throw new Error(
          'A quantidade de reposição deve ser maior que zero.',
        );
      }

      const product = data.products.find(
        (item) => item.id === productId,
      );

      if (!product) {
        throw new Error(
          'Produto não encontrado.',
        );
      }

      ensureEmployeeBranch(
        currentIdentity,
        branchId,
      );

      // Mesma regra de operador: id + PIN do modal ou null (auth.uid()).
      const effectiveOperatorId = operatorId ?? null;
      const effectiveOperatorPin = operatorPin ?? null;

      let newStock = product.stock + quantity;

      if (isSupabaseConfigured && supabase) {
        const { data: replenishment, error: rpcError } =
          await supabase.rpc(
            'execute_partner_stock_replenishment',
            {
              p_salesperson_id: effectiveOperatorId,
              p_pin: effectiveOperatorPin,
              p_product_id: productId,
              p_branch_id: branchId,
              p_quantity: quantity,
              p_unit_cost: unitCost ?? null,
              p_reason: reason ?? null,
            },
          );

        if (rpcError) {
          throw rpcError;
        }

        // A RPC retorna jsonb com new_stock já calculado no banco.
        const serverNewStock = (
          replenishment as {
            new_stock?: number;
          } | null
        )?.new_stock;

        if (typeof serverNewStock === 'number') {
          newStock = serverNewStock;
        }
      }

      setData((prev) => ({
        ...prev,
        products: prev.products.map(
          (item) =>
            item.id === productId
              ? {
                  ...item,
                  stock: newStock,
                }
              : item,
        ),
        movements: [
          {
            id: crypto.randomUUID(),
            user_id:
              currentIdentity.companyUserId,
            product_id: product.id,
            product_name: product.name,
            type: 'entrada',
            quantity,
            reason:
              reason ?? 'Reposição de estoque',
            created_at:
              new Date().toISOString(),
            branch_id: branchId,
          },
          ...prev.movements,
        ],
      }));

      return { newStock };
    },
    [data.products, requireIdentity],
  );

  const payInvoice = useCallback(
    async (
      id: string,
      amount?: number,
    ) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const invoice = data.invoices.find(
        (item) => item.id === id,
      );

      if (!invoice) {
        throw new Error(
          'Fatura não encontrada.',
        );
      }

      if (invoice.user_id !== currentIdentity.companyUserId) {
        throw new Error(
          'Acesso negado à fatura.',
        );
      }

      const outstandingAmount =
        Math.max(
          0,
          Number(invoice.amount ?? 0) -
            Number(invoice.paid_amount ?? 0),
        );

      const paymentAmount =
        amount ?? outstandingAmount;

      if (
        !Number.isFinite(paymentAmount) ||
        paymentAmount <= 0
      ) {
        throw new Error(
          'Valor de recebimento inválido.',
        );
      }

      if (
        paymentAmount >
        outstandingAmount + 0.000001
      ) {
        throw new Error(
          'Valor excede o saldo da fatura.',
        );
      }

      const { data: paidInvoiceId, error } =
        await supabase.rpc(
          'record_partner_invoice_payment',
          {
            p_invoice_id: id,
            p_amount: paymentAmount,
          },
        );

      if (error) {
        throw error;
      }

      if (paidInvoiceId !== id) {
        throw new Error(
          'O recebimento não foi confirmado pelo servidor.',
        );
      }

      await loadData();
    },
    [data.invoices, loadData, requireIdentity],
  );

  const updateStoreSettings = useCallback(
    async (settings: StoreSettings) => {
      const currentIdentity = requireIdentity();

      if (currentIdentity.salespersonId) {
        throw new Error(
          'Funcionários não podem alterar as configurações da loja.',
        );
      }

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const { data: updated, error } = await supabase
        .from('partner_store_settings')
        .upsert(
          {
            ...settings,
            user_id:
              currentIdentity.companyUserId,
          },
          {
            onConflict: 'user_id',
          },
        )
        .select()
        .single();

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        settings:
          updated as StoreSettings,
      }));

      return updated as StoreSettings;
    },
    [identity, requireIdentity],
  );

  const updateProfile = useCallback(
    async (
      profile: Partial<PartnerProfile>,
    ) => {
      const currentIdentity = requireIdentity();

      if (currentIdentity.salespersonId) {
        throw new Error(
          'Funcionários não podem alterar o perfil da empresa.',
        );
      }

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const { data: updated, error } = await supabase
        .from('partner_profiles')
        .update(profile)
        .eq(
          'user_id',
          currentIdentity.companyUserId,
        )
        .select()
        .single();

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        profile:
          updated as PartnerProfile,
      }));

      return updated as PartnerProfile;
    },
    [identity, requireIdentity],
  );

  const createRma = useCallback(
    async (rma: RmaPayload) => {
      const currentIdentity = requireIdentity();

      if (!rma.branch_id) {
        throw new Error(
          'RMA sem filial selecionada.',
        );
      }

      ensureEmployeeBranch(
        currentIdentity,
        rma.branch_id,
      );

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const { data: created, error } =
        await supabase
          .from('rma_requests_v2')
          .insert({
            ...rma,
            user_id:
              currentIdentity.companyUserId,
          })
          .select()
          .single();

      if (error) {
        throw error;
      }

      const createdRma =
        created as RmaRequest;

      setData((prev) => ({
        ...prev,
        rmas: [
          createdRma,
          ...prev.rmas,
        ],
      }));

      return createdRma;
    },
    [identity, requireIdentity],
  );

  const updateRmaStatus = useCallback(
    async (
      id: string,
      status: RmaStatus,
    ) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const existing = data.rmas.find(
        (item) => item.id === id,
      );

      if (!existing) {
        throw new Error(
          'RMA não encontrado.',
        );
      }

      ensureEmployeeBranch(
        currentIdentity,
        existing.branch_id,
      );

      const { data: updated, error } =
        await supabase
          .from('rma_requests_v2')
          .update({
            status,
            updated_at:
              new Date().toISOString(),
          })
          .eq('id', id)
          .eq(
            'user_id',
            currentIdentity.companyUserId,
          )
          .select()
          .single();

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        rmas: prev.rmas.map(
          (item) =>
            item.id === id
              ? (updated as RmaRequest)
              : item,
        ),
      }));

      return updated as RmaRequest;
    },
    [data.rmas, requireIdentity],
  );

  const deleteRma = useCallback(
    async (id: string) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const existing = data.rmas.find(
        (item) => item.id === id,
      );

      if (!existing) {
        throw new Error(
          'RMA não encontrado.',
        );
      }

      ensureEmployeeBranch(
        currentIdentity,
        existing.branch_id,
      );

      const { error } = await supabase
        .from('rma_requests_v2')
        .delete()
        .eq('id', id)
        .eq(
          'user_id',
          currentIdentity.companyUserId,
        );

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        rmas: prev.rmas.filter(
          (item) => item.id !== id,
        ),
      }));
    },
    [data.rmas, requireIdentity],
  );

  const addCombo = useCallback(
    async (combo: PartnerCombo) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const payload = {
        ...combo,
        user_id:
          currentIdentity.companyUserId,
      };

      const { data: created, error } =
        await supabase
          .from('partner_combos')
          .insert(payload)
          .select()
          .single();

      if (error) {
        throw error;
      }

      const createdCombo =
        created as PartnerCombo;

      setData((prev) => ({
        ...prev,
        combos: [
          createdCombo,
          ...prev.combos,
        ],
      }));

      return createdCombo;
    },
    [requireIdentity],
  );

  const updateCombo = useCallback(
    async (
      id: string,
      combo: Partial<PartnerCombo>,
    ) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const { data: updated, error } =
        await supabase
          .from('partner_combos')
          .update(combo)
          .eq('id', id)
          .eq(
            'user_id',
            currentIdentity.companyUserId,
          )
          .select()
          .single();

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        combos: prev.combos.map(
          (item) =>
            item.id === id
              ? (updated as PartnerCombo)
              : item,
        ),
      }));

      return updated as PartnerCombo;
    },
    [requireIdentity],
  );

  const deleteCombo = useCallback(
    async (id: string) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const { error } = await supabase
        .from('partner_combos')
        .delete()
        .eq('id', id)
        .eq(
          'user_id',
          currentIdentity.companyUserId,
        );

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        combos: prev.combos.filter(
          (item) => item.id !== id,
        ),
      }));
    },
    [requireIdentity],
  );

  const addModifier = useCallback(
    async (modifier: PartnerModifier) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const payload = {
        ...modifier,
        user_id:
          currentIdentity.companyUserId,
      };

      const { data: created, error } =
        await supabase
          .from('partner_modifiers')
          .insert(payload)
          .select()
          .single();

      if (error) {
        throw error;
      }

      const createdModifier =
        created as PartnerModifier;

      setData((prev) => ({
        ...prev,
        modifiers: [
          createdModifier,
          ...prev.modifiers,
        ],
      }));

      return createdModifier;
    },
    [requireIdentity],
  );

  const updateModifier = useCallback(
    async (
      id: string,
      modifier: Partial<PartnerModifier>,
    ) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const { data: updated, error } =
        await supabase
          .from('partner_modifiers')
          .update(modifier)
          .eq('id', id)
          .eq(
            'user_id',
            currentIdentity.companyUserId,
          )
          .select()
          .single();

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        modifiers: prev.modifiers.map(
          (item) =>
            item.id === id
              ? (updated as PartnerModifier)
              : item,
        ),
      }));

      return updated as PartnerModifier;
    },
    [requireIdentity],
  );

  const deleteModifier = useCallback(
    async (id: string) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const { error } = await supabase
        .from('partner_modifiers')
        .delete()
        .eq('id', id)
        .eq(
          'user_id',
          currentIdentity.companyUserId,
        );

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        modifiers: prev.modifiers.filter(
          (item) => item.id !== id,
        ),
      }));
    },
    [requireIdentity],
  );

  const addSalesperson = useCallback(
    async (
      salesperson: SalespersonPayload,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      if (currentIdentity.salespersonId) {
        throw new Error(
          'Funcionários não podem cadastrar operadores.',
        );
      }

      // Assinatura em produção (verificada diretamente no PostgREST):
      // execute_partner_salesperson_mutation(p_salesperson_id, p_name,
      //   p_role, p_commission_rate, p_phone, p_email, p_is_active,
      //   p_branch_id, p_operator_id, p_operator_pin, p_new_pin)
      // p_salesperson_id = colaborador criado/editado (null na criação);
      // p_operator_id/p_operator_pin = operador que autoriza a operação;
      // p_new_pin = novo PIN do colaborador, quando aplicável.
      const { data: created, error } =
        await supabase.rpc(
          'execute_partner_salesperson_mutation',
          {
            p_salesperson_id: null,
            p_name: salesperson.name,
            p_role: salesperson.role,
            p_commission_rate:
              salesperson.commission_rate ?? 0,
            p_phone: salesperson.phone ?? null,
            p_email: salesperson.email ?? null,
            p_is_active:
              salesperson.is_active ?? true,
            p_branch_id:
              salesperson.branch_id ?? null,
            p_operator_id: operatorId ?? null,
            p_operator_pin: operatorPin ?? null,
            p_new_pin: salesperson.pin ?? null,
          },
        );

      if (error) {
        throw error;
      }

      // A RPC retorna a linha completa de partner_salespeople criada,
      // não um UUID. Usamos o id e os dados retornados, apenas
      // completando campos que o banco pode não devolver.
      const returned =
        created as Partial<PartnerSalesperson> | null;

      const createdSalesperson: PartnerSalesperson = {
        // Dados enviados como base...
        ...salesperson,
        // ...sobrescritos pelo que o banco realmente persistiu.
        ...returned,
        id:
          returned?.id ?? crypto.randomUUID(),
        user_id:
          returned?.user_id ??
          currentIdentity.companyUserId,
        created_at:
          returned?.created_at ??
          new Date().toISOString(),
        // Campos protegidos: ficam DEPOIS dos spreads para que o PIN em
        // texto puro enviado no formulário nunca seja copiado para o
        // estado. Guardamos apenas se um PIN foi configurado.
        pin: null,
        pin_configured: !!salesperson.pin,
      };

      setData((prev) => ({
        ...prev,
        salespeople: [
          createdSalesperson,
          ...prev.salespeople,
        ],
      }));

      return createdSalesperson;
    },
    [requireIdentity],
  );

  const updateSalesperson = useCallback(
    async (
      id: string,
      salesperson: Partial<PartnerSalesperson>,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      const currentIdentity = requireIdentity();

      if (currentIdentity.salespersonId) {
        throw new Error(
          'Funcionários não podem alterar operadores.',
        );
      }

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const existing =
        data.salespeople.find(
          (item) => item.id === id,
        );

      if (!existing) {
        throw new Error(
          'Operador não encontrado.',
        );
      }

      // Mesma assinatura de produção da criação (11 parâmetros);
      // p_salesperson_id identifica o colaborador que está sendo editado.
      const { data: updated, error } =
        await supabase.rpc(
          'execute_partner_salesperson_mutation',
          {
            p_salesperson_id: id,
            p_name:
              salesperson.name ??
              existing.name,
            p_role:
              salesperson.role ??
              existing.role,
            p_commission_rate:
              salesperson.commission_rate ??
              existing.commission_rate ??
              0,
            p_phone:
              salesperson.phone ??
              existing.phone ??
              null,
            p_email:
              salesperson.email ??
              existing.email ??
              null,
            p_is_active:
              salesperson.is_active ??
              existing.is_active,
            p_branch_id:
              salesperson.branch_id ??
              existing.branch_id ??
              null,
            p_operator_id:
              operatorId ?? null,
            p_operator_pin:
              operatorPin ?? null,
            p_new_pin:
              salesperson.pin ?? null,
          },
        );

      if (error) {
        throw error;
      }

      // A RPC retorna o id (uuid) do colaborador, não a linha completa.
      const updatedSalesperson: PartnerSalesperson = {
        ...existing,
        ...salesperson,
        id,
        pin: null,
        pin_configured: salesperson.pin
          ? true
          : existing.pin_configured ?? false,
      };

      setData((prev) => ({
        ...prev,
        salespeople:
          prev.salespeople.map(
            (item) =>
              item.id === id
                ? updatedSalesperson
                : item,
          ),
      }));

      return updatedSalesperson;
    },
    [data.salespeople, requireIdentity],
  );

  const deleteSalesperson = useCallback(
    async (
      id: string,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const { error } = await supabase.rpc(
        'execute_partner_salesperson_delete',
        {
          p_salesperson_id: id,
          p_operator_id: operatorId ?? null,
          p_operator_pin: operatorPin ?? null,
        },
      );

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        salespeople:
          prev.salespeople.filter(
            (item) => item.id !== id,
          ),
      }));
    },
    [],
  );

  const createInvoice = useCallback(
    async (
      invoice: PartnerInvoice,
    ) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      ensureEmployeeBranch(
        currentIdentity,
        invoice.branch_id,
      );

      const { data: created, error } =
        await supabase
          .from('partner_invoices')
          .insert({
            ...invoice,
            user_id:
              currentIdentity.companyUserId,
          })
          .select()
          .single();

      if (error) {
        throw error;
      }

      const createdInvoice =
        created as PartnerInvoice;

      setData((prev) => ({
        ...prev,
        invoices: [
          createdInvoice,
          ...prev.invoices,
        ],
      }));

      return createdInvoice;
    },
    [requireIdentity],
  );

  const updateInvoice = useCallback(
    async (
      id: string,
      invoice: Partial<PartnerInvoice>,
    ) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const existing =
        data.invoices.find(
          (item) => item.id === id,
        );

      if (!existing) {
        throw new Error(
          'Fatura não encontrada.',
        );
      }

      ensureEmployeeBranch(
        currentIdentity,
        invoice.branch_id ??
          existing.branch_id,
      );

      const { data: updated, error } =
        await supabase
          .from('partner_invoices')
          .update(invoice)
          .eq('id', id)
          .eq(
            'user_id',
            currentIdentity.companyUserId,
          )
          .select()
          .single();

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        invoices: prev.invoices.map(
          (item) =>
            item.id === id
              ? (updated as PartnerInvoice)
              : item,
        ),
      }));

      return updated as PartnerInvoice;
    },
    [data.invoices, requireIdentity],
  );

  const addServiceOrder = useCallback(
    async (
      serviceOrder: ServiceOrder,
    ) => {
      const currentIdentity = requireIdentity();

      if (!serviceOrder.branch_id) {
        throw new Error(
          'Ordem de serviço sem filial.',
        );
      }

      ensureEmployeeBranch(
        currentIdentity,
        serviceOrder.branch_id,
      );

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const { data: created, error } =
        await supabase
          .from('service_orders')
          .insert({
            ...serviceOrder,
            user_id:
              currentIdentity.companyUserId,
          })
          .select()
          .single();

      if (error) {
        throw error;
      }

      const createdOrder =
        created as ServiceOrder;

      setData((prev) => ({
        ...prev,
        serviceOrders: [
          createdOrder,
          ...prev.serviceOrders,
        ],
      }));

      return createdOrder;
    },
    [requireIdentity],
  );

  const updateServiceOrder = useCallback(
    async (
      id: string,
      serviceOrder: Partial<ServiceOrder>,
    ) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const existing =
        data.serviceOrders.find(
          (item) => item.id === id,
        );

      if (!existing) {
        throw new Error(
          'Ordem de serviço não encontrada.',
        );
      }

      ensureEmployeeBranch(
        currentIdentity,
        serviceOrder.branch_id ??
          existing.branch_id,
      );

      const { data: updated, error } =
        await supabase
          .from('service_orders')
          .update(serviceOrder)
          .eq('id', id)
          .eq(
            'user_id',
            currentIdentity.companyUserId,
          )
          .select()
          .single();

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        serviceOrders:
          prev.serviceOrders.map(
            (item) =>
              item.id === id
                ? (updated as ServiceOrder)
                : item,
          ),
      }));

      return updated as ServiceOrder;
    },
    [data.serviceOrders, requireIdentity],
  );

  const updateServiceOrderStatus = useCallback(
    async (
      id: string,
      status: ServiceOrderStatus,
    ) => {
      return updateServiceOrder(id, {
        status,
      });
    },
    [updateServiceOrder],
  );

  const updateServiceOrderApproval = useCallback(
    async (
      id: string,
      approvalStatus: ServiceOrderApprovalStatus,
    ) => {
      return updateServiceOrder(id, {
        approval_status:
          approvalStatus,
      });
    },
    [updateServiceOrder],
  );

  const addServiceOrderItem = useCallback(
    async (
      item: ServiceOrderItem,
    ) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const order =
        data.serviceOrders.find(
          (serviceOrder) =>
            serviceOrder.id ===
            item.service_order_id,
        );

      if (!order) {
        throw new Error(
          'Ordem de serviço não encontrada.',
        );
      }

      ensureEmployeeBranch(
        currentIdentity,
        order.branch_id,
      );

      const { data: created, error } =
        await supabase
          .from('service_order_items')
          .insert({
            ...item,
            user_id:
              currentIdentity.companyUserId,
          })
          .select()
          .single();

      if (error) {
        throw error;
      }

      const createdItem =
        created as ServiceOrderItem;

      setData((prev) => ({
        ...prev,
        serviceOrderItems: [
          createdItem,
          ...prev.serviceOrderItems,
        ],
      }));

      return createdItem;
    },
    [data.serviceOrders, requireIdentity],
  );

  const deleteServiceOrderItem = useCallback(
    async (id: string) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const item =
        data.serviceOrderItems.find(
          (currentItem) =>
            currentItem.id === id,
        );

      if (!item) {
        throw new Error(
          'Item da ordem de serviço não encontrado.',
        );
      }

      const order =
        data.serviceOrders.find(
          (serviceOrder) =>
            serviceOrder.id ===
            item.service_order_id,
        );

      if (!order) {
        throw new Error(
          'Ordem de serviço não encontrada.',
        );
      }

      ensureEmployeeBranch(
        currentIdentity,
        order.branch_id,
      );

      const { error } = await supabase
        .from('service_order_items')
        .delete()
        .eq('id', id)
        .eq(
          'user_id',
          currentIdentity.companyUserId,
        );

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        serviceOrderItems:
          prev.serviceOrderItems.filter(
            (currentItem) =>
              currentItem.id !== id,
          ),
      }));
    },
    [
      data.serviceOrderItems,
      data.serviceOrders,
      requireIdentity,
    ],
  );

  const addServiceOrderPhoto = useCallback(
    async (
      photo: ServiceOrderPhoto,
    ) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const order =
        data.serviceOrders.find(
          (serviceOrder) =>
            serviceOrder.id ===
            photo.service_order_id,
        );

      if (!order) {
        throw new Error(
          'Ordem de serviço não encontrada.',
        );
      }

      ensureEmployeeBranch(
        currentIdentity,
        order.branch_id,
      );

      const { data: created, error } =
        await supabase
          .from('service_order_photos')
          .insert({
            ...photo,
            user_id:
              currentIdentity.companyUserId,
          })
          .select()
          .single();

      if (error) {
        throw error;
      }

      const createdPhoto =
        created as ServiceOrderPhoto;

      setData((prev) => ({
        ...prev,
        serviceOrderPhotos: [
          ...prev.serviceOrderPhotos,
          createdPhoto,
        ],
      }));

      return createdPhoto;
    },
    [data.serviceOrders, requireIdentity],
  );

  const deleteServiceOrderPhoto = useCallback(
    async (id: string) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const photo =
        data.serviceOrderPhotos.find(
          (currentPhoto) =>
            currentPhoto.id === id,
        );

      if (!photo) {
        throw new Error(
          'Foto da ordem de serviço não encontrada.',
        );
      }

      const order =
        data.serviceOrders.find(
          (serviceOrder) =>
            serviceOrder.id ===
            photo.service_order_id,
        );

      if (!order) {
        throw new Error(
          'Ordem de serviço não encontrada.',
        );
      }

      ensureEmployeeBranch(
        currentIdentity,
        order.branch_id,
      );

      const { error } = await supabase
        .from('service_order_photos')
        .delete()
        .eq('id', id)
        .eq(
          'user_id',
          currentIdentity.companyUserId,
        );

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        serviceOrderPhotos:
          prev.serviceOrderPhotos.filter(
            (currentPhoto) =>
              currentPhoto.id !== id,
          ),
      }));
    },
    [
      data.serviceOrderPhotos,
      data.serviceOrders,
      requireIdentity,
    ],
  );

  const createB2BOrder = useCallback(
    async (order: B2BOrder) => {
      const currentIdentity = requireIdentity();

      if (!order.branch_id) {
        throw new Error(
          'Pedido sem filial selecionada.',
        );
      }

      ensureEmployeeBranch(
        currentIdentity,
        order.branch_id,
      );

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const { data: created, error } =
        await supabase
          .from('b2b_orders')
          .insert({
            ...order,
            user_id:
              currentIdentity.companyUserId,
          })
          .select()
          .single();

      if (error) {
        throw error;
      }

      const createdOrder =
        created as B2BOrder;

      setData((prev) => ({
        ...prev,
        orders: [
          createdOrder,
          ...prev.orders,
        ],
      }));

      return createdOrder;
    },
    [requireIdentity],
  );

  const updateB2BOrder = useCallback(
    async (
      id: string,
      order: Partial<B2BOrder>,
    ) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const existing =
        data.orders.find(
          (item) => item.id === id,
        );

      if (!existing) {
        throw new Error(
          'Pedido não encontrado.',
        );
      }

      ensureEmployeeBranch(
        currentIdentity,
        order.branch_id ??
          existing.branch_id,
      );

      const { data: updated, error } =
        await supabase
          .from('b2b_orders')
          .update(order)
          .eq('id', id)
          .eq(
            'user_id',
            currentIdentity.companyUserId,
          )
          .select()
          .single();

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        orders: prev.orders.map(
          (item) =>
            item.id === id
              ? (updated as B2BOrder)
              : item,
        ),
      }));

      return updated as B2BOrder;
    },
    [data.orders, requireIdentity],
  );

  const recordStockMovement = useCallback(
    async (
      movement: StockMovement,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      const currentIdentity = requireIdentity();

      if (!movement.branch_id) {
        throw new Error(
          'Movimentação sem filial.',
        );
      }

      ensureEmployeeBranch(
        currentIdentity,
        movement.branch_id,
      );

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const { data: created, error } =
        await supabase.rpc(
          'record_partner_stock_movement',
          {
            p_product_id:
              movement.product_id,
            p_branch_id:
              movement.branch_id,
            p_type: movement.type,
            p_quantity:
              movement.quantity,
            p_reason:
              movement.reason,
          },
        );

      if (error) {
        throw error;
      }

      // A RPC retorna a linha do movimento criado. Se algum dia retornar
      // apenas o id, ainda montamos o objeto local a partir do payload.
      const returned =
        created as StockMovement | string | null;

      const createdMovement: StockMovement =
        typeof returned === 'object' &&
        returned !== null
          ? {
              ...movement,
              ...returned,
            }
          : {
              ...movement,
              id:
                typeof returned === 'string'
                  ? returned
                  : crypto.randomUUID(),
              user_id:
                currentIdentity.companyUserId,
              created_at:
                new Date().toISOString(),
            };

      setData((prev) => ({
        ...prev,
        movements: [
          createdMovement,
          ...prev.movements,
        ],
      }));

      return createdMovement;
    },
    [requireIdentity],
  );

  const recordAuditLog = useCallback(
    async (
      action: string,
      entityType: string,
      entityId: string | null,
      details: string,
      actorRole: SalespersonRole = 'administrador',
    ) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        return;
      }

      // Nome real do ator já disponível no fluxo: o vendedor da sessão
      // autenticada ou o proprietário. A coluna actor_name é NOT NULL no
      // banco, então sem um nome real não registramos o evento.
      const actorName =
        data.salespeople.find(
          (salesperson) =>
            salesperson.id ===
            currentIdentity.salespersonId,
        )?.name ?? data.profile?.name;

      if (!actorName) {
        return;
      }

      const { data: created, error } =
        await supabase.rpc(
          'record_partner_audit_event',
          {
            p_actor_name: actorName,
            p_actor_role: actorRole,
            p_action: action,
            p_entity_type: entityType,
            p_entity_id:
              entityId ?? null,
            p_details: details,
          },
        );

      if (error) {
        throw error;
      }

      if (created) {
        const log =
          created as AuditLog;

        if (mountedRef.current) {
          setData((prev) => ({
            ...prev,
            auditLogs: [
              log,
              ...prev.auditLogs,
            ],
          }));
        }
      } else {
        void currentIdentity;
      }
    },
    [requireIdentity],
  );

  const load = useCallback(
    async () => {
      await loadData();
    },
    [loadData],
  );

  return {
    ...data,

    loading,
    error,

    isEmployee: isEmployeeIdentity(identity),
    identity,

    load,
    loadData,

    addCustomer,
    updateCustomer,
    deleteCustomer,

    addProduct,
    updateProduct,
    deleteProduct,

    addSupplier,
    updateSupplier,
    deleteSupplier,

    addCategory,
    updateCategory,
    deleteCategory,

    addBranch,
    updateBranch,
    deleteBranch,

    createSale,
    createPreSale,
    finalizePreSale,
    cancelSale,
    deleteSale,

    replenishStock,
    recordStockMovement,

    payInvoice,
    createInvoice,
    updateInvoice,

    updateStoreSettings,
    updateProfile,

    createRma,
    updateRmaStatus,
    deleteRma,

    addCombo,
    updateCombo,
    deleteCombo,

    addModifier,
    updateModifier,
    deleteModifier,

    addSalesperson,
    updateSalesperson,
    deleteSalesperson,

    addServiceOrder,
    updateServiceOrder,
    updateServiceOrderStatus,
    updateServiceOrderApproval,

    addServiceOrderItem,
    deleteServiceOrderItem,

    addServiceOrderPhoto,
    deleteServiceOrderPhoto,

    createB2BOrder,
    updateB2BOrder,

    recordAuditLog,
  };
}