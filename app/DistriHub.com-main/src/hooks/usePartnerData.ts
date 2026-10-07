import { useCallback, useEffect, useRef, useState } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { billedSaleError, isDefinitiveSaleRejection, PdvSaleAttemptStore, pdvErrorMessage, type CustomerCredit } from '../lib/pdv';
import type {
  AdminCompany,
  AdminFinancialMonth,
  AdminLojista,
  AuditLog,
  B2BOrder,
  BusinessSegment,
  Category,
  CustomerGroup,
  DeliveryStatus,
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

function normalizeSalespersonEmail(
  email: string | null | undefined,
): string | null {
  const normalized = email?.trim().toLowerCase() ?? '';
  return normalized || null;
}

function formatSalespersonSaveError(error: unknown): Error | unknown {
  if (!error || typeof error !== 'object') {
    return error;
  }

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    constraint?: unknown;
  };
  const text = [
    candidate.message,
    candidate.details,
    candidate.constraint,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');

  if (
    candidate.code === '23505' ||
    text.includes('idx_partner_salespeople_email_unique')
  ) {
    return new Error(
      'Este e-mail já está cadastrado para outro colaborador.',
    );
  }

  return error;
}

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

const DATA_PAGE_SIZE = 500;

async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<{ data: T[] | null; error: PostgrestError | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += DATA_PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + DATA_PAGE_SIZE - 1);
    if (error) return { data: null, error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < DATA_PAGE_SIZE) return { data: rows, error: null };
  }
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
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const syncInFlight = useRef(false);

  const [pdvCredits, setPdvCredits] = useState<CustomerCredit[]>([]);
  const [pdvSyncWarning, setPdvSyncWarning] = useState<string | null>(null);
  const [pendingSale, setPendingSale] = useState<PartnerSale | null>(null);
  const saleInFlight = useRef(false);
  const pdvRequestId = useRef(0);
  const identityScope = identity ? identity.authUserId + ':' + identity.companyUserId : '';
  const identityScopeRef = useRef(identityScope);
  identityScopeRef.current = identityScope;
  useEffect(() => {
    setPdvCredits([]);
    setPdvSyncWarning(null);
    ++pdvRequestId.current;
    try {
      setPendingSale(identityScope ? new PdvSaleAttemptStore(sessionStorage, identityScope).read() : null);
    } catch (err) {
      setPdvSyncWarning(pdvErrorMessage(err));
    }
  }, [identityScope]);

  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
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

  // Garante que existe uma SESSÃO Supabase viva (JWT) antes de uma RPC
  // protegida. O `identity` é apenas estado React e pode existir mesmo sem
  // sessão válida; esta checagem lê a sessão real do client. Não expõe token.
  // Retorna o client Supabase já validado (não-nulo) junto da identity, para
  // que o TypeScript faça o narrowing e a RPC nunca rode sem sessão.
  const requireAuthenticatedSession = useCallback(
    async (): Promise<{ identity: PartnerIdentity; client: NonNullable<typeof supabase> }> => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) {
        throw error;
      }
      if (!data.session || !data.session.user) {
        throw new Error('Sessão expirada. Faça login novamente.');
      }

      return { identity: currentIdentity, client: supabase };
    },
    [requireIdentity],
  );

  const clearData = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }

    setData(initialData);
    setError(null);
  }, []);

  const loadData = useCallback(async (background = false) => {
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

    if (!background) {
      setLoading(true);
      setError(null);
    }

    try {
      const currentIdentity = requireIdentity();
      const companyUserId = currentIdentity.companyUserId;

      // SELECT explícito e restritivo de colaboradores: somente colunas
      // que existem em producao (a coluna real de ativacao eh `active`;
      // `is_active` nao existe em partner_salespeople). O PIN em texto
      // puro (pin) e o hash (pin_hash) jamais saem do banco para o
      // estado do React. No mapeamento abaixo, is_active eh derivado de
      // `active`.
      // `client` fixa o narrowing de `supabase` (nao-nulo neste ponto).
      const client = supabase;
      const fetchSalespeople = () =>
        client
          .from('partner_salespeople')
          .select(
            'id, user_id, auth_user_id, name, role, commission_rate, phone, email, active, branch_id, created_at',
          )
          .eq('user_id', companyUserId)
          .order('name');

      // Consultas essenciais: qualquer falha bloqueia o carregamento,
      // pois o painel não funciona sem elas.
      const [
        profileResult,
        branchesResult,
        customersResult,
        productsResult,
        salespeopleResult,
        salesResult,
      ] = await Promise.all([
        client
  .from('partner_profiles')
  .select('*')
  .eq('id', companyUserId)
  .maybeSingle(),

fetchAllPages((from, to) => client
  .from('partner_branches')
  .select('*')
  .eq('user_id', companyUserId)
  .order('name')
  .order('id')
  .range(from, to)),

fetchAllPages((from, to) => client
  .from('partner_customers')
  .select('*')
  .eq('user_id', companyUserId)
  .order('name')
  .order('id')
  .range(from, to)),

fetchAllPages((from, to) => client
  .from('partner_products')
  .select('*')
  .eq('user_id', companyUserId)
  .order('name')
  .order('id')
  .range(from, to)),

fetchAllPages((from, to) => fetchSalespeople().range(from, to)),

fetchAllPages((from, to) => client
  .from('partner_sales')
  .select('*')
  .eq('user_id', companyUserId)
  .order('created_at', { ascending: false })
  .order('id', { ascending: false })
  .range(from, to)),
      ]);

      const essentialResults = [
        ['partner_profiles', profileResult],
        ['partner_branches', branchesResult],
        ['partner_customers', customersResult],
        ['partner_products', productsResult],
        ['partner_salespeople', salespeopleResult],
        ['partner_sales', salesResult],
      ] as const;

      const essentialError = essentialResults.find(
        ([, result]) => result.error,
      );

      if (essentialError?.[1].error) {
        throw essentialError[1].error;
      }

      // Consultas secundárias: falham individualmente sem derrubar o
      // carregamento; cada uma assume fallback seguro ([], null).
      const [
        suppliersResult,
        categoriesResult,
        movementsResult,
        settingsResult,
        rmasResult,
        combosResult,
        modifiersResult,
        invoicesResult,
        ordersResult,
        auditLogsResult,
        serviceOrdersResult,
        serviceOrderItemsResult,
        serviceOrderPhotosResult,
      ] = await Promise.all([
        fetchAllPages((from, to) => client
          .from('partner_suppliers')
          .select('*')
          .eq('user_id', companyUserId)
          .order('name').order('id').range(from, to)),

        fetchAllPages((from, to) => client
          .from('partner_categories')
          .select('*')
          .eq('user_id', companyUserId)
          .order('name').order('id').range(from, to)),

        fetchAllPages((from, to) => client
          .from('partner_stock_movements')
          .select('*')
          .eq('user_id', companyUserId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }).range(from, to)),

        supabase
          .from('partner_store_settings')
          .select('*')
          .eq('user_id', companyUserId)
          .maybeSingle(),

        fetchAllPages((from, to) => client
          .from('rma_requests_v2')
          .select('*')
          .eq('user_id', companyUserId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }).range(from, to)),

        fetchAllPages((from, to) => client
          .from('partner_combos')
          .select('*')
          .eq('user_id', companyUserId)
          .order('name').order('id').range(from, to)),

        fetchAllPages((from, to) => client
          .from('partner_modifiers')
          .select('*')
          .eq('user_id', companyUserId)
          .order('name').order('id').range(from, to)),

        fetchAllPages((from, to) => client
          .from('partner_invoices')
          .select('*')
          .eq('user_id', companyUserId)
          .order('due_date').order('id').range(from, to)),

        fetchAllPages((from, to) => client
          .from('b2b_orders')
          .select('*')
          .eq('user_id', companyUserId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }).range(from, to)),

        fetchAllPages((from, to) => client
          .from('partner_audit_logs')
          .select('*')
          .eq('user_id', companyUserId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }).range(from, to)),

        fetchAllPages((from, to) => client
          .from('service_orders')
          .select('*')
          .eq('user_id', companyUserId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }).range(from, to)),

        fetchAllPages((from, to) => client
          .from('service_order_items')
          .select('*')
          .eq('user_id', companyUserId)
          .range(from, to)),

        fetchAllPages((from, to) => client
          .from('service_order_photos')
          .select('*')
          .eq('user_id', companyUserId)
          .order('created_at')
          .order('id').range(from, to)),
      ]);

      // Diagnóstico técnico de falhas secundárias — sem PIN, tokens
      // ou dados de linhas; apenas nome da consulta e mensagem de erro.
      const secondaryResults = [
        ['partner_suppliers', suppliersResult],
        ['partner_categories', categoriesResult],
        ['partner_stock_movements', movementsResult],
        ['partner_store_settings', settingsResult],
        ['rma_requests_v2', rmasResult],
        ['partner_combos', combosResult],
        ['partner_modifiers', modifiersResult],
        ['partner_invoices', invoicesResult],
        ['b2b_orders', ordersResult],
        ['partner_audit_logs', auditLogsResult],
        ['service_orders', serviceOrdersResult],
        ['service_order_items', serviceOrderItemsResult],
        ['service_order_photos', serviceOrderPhotosResult],
      ] as const;

      for (const [queryName, result] of secondaryResults) {
        if (result.error) {
          console.warn(
            `[usePartnerData] Falha na consulta secundária "${queryName}":`,
            result.error.message,
          );
        }
      }

      // Keep the current snapshot if a background refresh is incomplete.
      if (background) {
        const failed = secondaryResults.find(([, result]) => result.error);
        if (failed) throw failed[1].error;
      }

      if (
        !mountedRef.current ||
        currentRequestId !== requestIdRef.current
      ) {
        return;
      }

      const branchId = currentIdentity.branchId;

      // includeCompanyWide: clientes e vendedores com branch_id null são
      // registros company-wide válidos e devem ser preservados; produtos,
      // vendas e estoque seguem com filtro estrito de filial.
      const filterBranch = <T extends { branch_id?: string | null }>(
        rows: T[] | null,
        includeCompanyWide = false,
      ): T[] => {
        const values = rows ?? [];

        if (!currentIdentity.salespersonId) {
          return values;
        }

        return values.filter(
          (row) =>
            (includeCompanyWide && row.branch_id == null) ||
            row.branch_id === branchId,
        );
      };

      setData({
        profile:
          (profileResult.data as PartnerProfile | null) ?? null,
        branches:
  (branchesResult.data as PartnerBranch[] | null) ?? [],
        customers: filterBranch(
          customersResult.data as PartnerCustomer[] | null,
          true,
        ),
        suppliers:
          (suppliersResult.data as PartnerSupplier[] | null) ?? [],
        categories:
          (categoriesResult.data as PartnerCategory[] | null) ?? [],
        products: filterBranch(
          productsResult.data as PartnerProduct[] | null,
        ),
        salespeople: filterBranch(
          (
            (salespeopleResult.data as PartnerSalesperson[] | null) ?? []
          ).map((sp) => ({
            ...sp,
            // partner_salespeople nao possui is_active; deriva de active.
            is_active: sp.active ?? true,
          })),
          true,
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
        financialMonths: [],
        permissionOverrides: [],
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
      setLastSyncedAt(new Date());
      setSyncError(null);
    } catch (err) {
      if (
        !mountedRef.current ||
        currentRequestId !== requestIdRef.current
      ) {
        return;
      }

      const normalized = normalizeError(err);
      if (background) setSyncError(normalized.message);
      else setError(normalized.message);
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
    setLastSyncedAt(null);
    setSyncError(null);
    void loadData();
    return () => { ++requestIdRef.current; };
  }, [loadData]);

  const synchronize = useCallback(async () => {
    if (!identity || !supabase || !isSupabaseConfigured || loading || syncInFlight.current) return;
    if (!navigator.onLine) {
      setSyncError('Sem internet. A sincronizacao sera retomada quando a conexao voltar.');
      return;
    }
    syncInFlight.current = true;
    setSyncing(true);
    try { await loadData(true); }
    finally {
      syncInFlight.current = false;
      if (mountedRef.current) setSyncing(false);
    }
  }, [identity, loading, loadData]);

  useEffect(() => {
    if (!identity || !supabase || !isSupabaseConfigured || loading) return;
    const client = supabase;
    let debounce: number | undefined;
    const refresh = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => { void synchronize(); }, 500);
    };
    const channel = client.channel(`partner-sync-${identity.authUserId}-${identity.companyUserId}`);
    for (const table of ['partner_sales', 'partner_products', 'partner_invoices', 'b2b_orders']) {
      channel.on('postgres_changes', {
        event: '*', schema: 'public', table, filter: `user_id=eq.${identity.companyUserId}`,
      }, refresh);
    }
    channel.subscribe((status) => { if (status === 'SUBSCRIBED') refresh(); });
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearTimeout(debounce);
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
      void client.removeChannel(channel);
    };
  }, [identity, loading, synchronize]);

  useEffect(() => {
    const profileId = identity?.companyUserId;
    if (!profileId || !isSupabaseConfigured || !supabase) return;

    const client = supabase;
    let active = true;
    const refreshProfile = async () => {
      const { data: profile, error: profileError } = await client
        .from('partner_profiles')
        .select('*')
        .eq('id', profileId)
        .maybeSingle();
      if (!active) return;
      if (profileError) {
        setError(profileError.message);
        return;
      }
      if (profile) {
        setData((previous) => ({ ...previous, profile: profile as PartnerProfile }));
      }
    };
    const channel = client
      .channel(`partner-profile-${profileId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'partner_profiles', filter: `id=eq.${profileId}` },
        (payload) => {
          const updatedProfile = payload.new as PartnerProfile;
          if (updatedProfile.id === profileId) {
            setData((previous) => ({ ...previous, profile: updatedProfile }));
          }
        },
      )
      .subscribe();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshProfile();
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      active = false;
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      void client.removeChannel(channel);
    };
  }, [identity?.companyUserId]);

  const addCustomer = useCallback(
    async (
      customer: CustomerPayload,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      const { identity: currentIdentity, client } =
        await requireAuthenticatedSession();

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
        await client.rpc(
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
    [requireAuthenticatedSession],
  );

  const updateCustomer = useCallback(
    async (
      id: string,
      customer: Partial<CustomerPayload>,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      const { identity: currentIdentity, client } =
        await requireAuthenticatedSession();

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
        await client.rpc(
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
    [data.customers, requireAuthenticatedSession],
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
      const { identity: currentIdentity, client } =
        await requireAuthenticatedSession();

      ensureEmployeeBranch(
        currentIdentity,
        product.branch_id,
      );

      // Mesma regra de operador: id + PIN do modal ou null (auth.uid()).
      const effectiveOperatorId = operatorId ?? null;
      const effectiveOperatorPin = operatorPin ?? null;

      const { data: created, error: rpcError } =
        await client.rpc(
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
            p_supplier_id: product.supplier_id ?? null,
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
    [requireAuthenticatedSession],
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
            p_supplier_id: product.supplier_id === undefined ? existing.supplier_id ?? null : product.supplier_id,
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
    async (name: string) => {
      const currentIdentity = requireIdentity();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const { data: created, error } = await supabase
        .from('partner_categories')
        .insert({
          name,
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
    async (name: string, address: string) => {
      const currentIdentity = requireIdentity();

      if (currentIdentity.salespersonId) {
        throw new Error(
          'Funcionários não podem cadastrar filiais.',
        );
      }

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase não configurado.');
      }

      const { data: created, error } = await supabase.rpc(
        'create_partner_branch',
        { p_name: name.trim(), p_address: address.trim() || null },
      );

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

  // One authorized snapshot: current branch records plus company-wide credit totals.
  const refreshPdv = useCallback(async (branchId: string) => {
    const currentIdentity = requireIdentity();
    ensureEmployeeBranch(currentIdentity, branchId);
    const scope = currentIdentity.authUserId + ':' + currentIdentity.companyUserId;
    const request = ++pdvRequestId.current;
    setPdvCredits([]);
    if (!isSupabaseConfigured || !supabase) throw new Error('Sincronização do PDV requer Supabase.');
    const { data: snapshot, error: syncError } = await supabase.rpc('get_partner_pdv_snapshot', { p_branch_id: branchId });
    if (syncError) throw syncError;
    if (!snapshot || !Array.isArray(snapshot.credits) || !Array.isArray(snapshot.products)
      || !Array.isArray(snapshot.sales) || !Array.isArray(snapshot.invoices) || !Array.isArray(snapshot.movements)) {
      throw new Error('Resposta de sincronização do PDV inválida.');
    }
    const result = snapshot as { credits: CustomerCredit[]; products: PartnerProduct[]; sales: PartnerSale[]; invoices: PartnerInvoice[]; movements: StockMovement[] };
    if (mountedRef.current && identityScopeRef.current === scope && request === pdvRequestId.current) {
      const mergeBranch = <T extends { branch_id?: string | null }>(old: T[], rows: T[]) =>
        [...rows, ...old.filter(row => row.branch_id !== branchId)];
      setData(prev => ({ ...prev,
        products: mergeBranch(prev.products, result.products),
        sales: mergeBranch(prev.sales, result.sales),
        invoices: mergeBranch(prev.invoices, result.invoices),
        movements: mergeBranch(prev.movements, result.movements),
      }));
      setPdvCredits(result.credits);
      setPdvSyncWarning(null);
    }
    return result;
  }, [requireIdentity]);

  const syncConfirmedSale = useCallback(async (branchId: string) => {
    try { await refreshPdv(branchId); }
    catch {
      setPdvCredits([]);
      setPdvSyncWarning('Operação confirmada. Não foi possível atualizar os dados do PDV. Use Atualizar dados; não repita a venda.');
    }
  }, [refreshPdv]);

  const validateBilledSale = useCallback(async (sale: Pick<PartnerSale, 'customer_id' | 'branch_id' | 'total'>) => {
    if (!sale.customer_id) throw new Error(billedSaleError(undefined, null, sale.total)!);
    const snapshot = await refreshPdv(sale.branch_id!);
    const message = billedSaleError(snapshot.credits.find(c => c.customer_id === sale.customer_id), sale.customer_id, sale.total);
    if (message) throw new Error(message);
  }, [refreshPdv]);

  const createSale = useCallback(
    async (sale: SalePayload, operatorId?: string | null, operatorPin?: string | null) => {
      if (saleInFlight.current) throw new Error('Aguarde a conclusão da venda em andamento.');
      saleInFlight.current = true;
      try {
        const currentIdentity = requireIdentity();
        if (!sale.branch_id) throw new Error('Venda sem filial selecionada.');
        ensureEmployeeBranch(currentIdentity, sale.branch_id);
        const scope = currentIdentity.authUserId + ':' + currentIdentity.companyUserId;
        const attempts = new PdvSaleAttemptStore(sessionStorage, scope);
        const previous = attempts.read();
        // Validate a NEW billed request. A retry may already have consumed its credit.
        if (!previous && sale.payment_method === 'faturado') await validateBilledSale(sale);
        const candidate: PartnerSale = {
          ...sale, id: crypto.randomUUID(), user_id: currentIdentity.companyUserId,
          status: sale.status ?? 'concluida', created_at: new Date().toISOString(),
          imei: sale.imei ?? null, serial_number: sale.serial_number ?? null,
          payment_method: sale.payment_method ?? null, branch_id: sale.branch_id,
          salesperson_id: previous && 'id' in sale && sale.id === previous.id
            ? previous.salesperson_id
            : currentIdentity.salespersonId ?? sale.salesperson_id ?? operatorId ?? null,
          origin: sale.origin ?? 'pdv', online_payment: false,
          payment_status: sale.status === 'pre_venda' || sale.payment_method === 'faturado' ? 'pendente' : 'pago',
        };
        const ns = attempts.begin(candidate);
        setPendingSale(ns);
        if (isSupabaseConfigured && supabase) {
          try {
            const { data: confirmedId, error: rpcError } = await supabase.rpc('execute_partner_sale_mutation', {
              p_salesperson_id: operatorId ?? null, p_pin: operatorPin ?? null,
              p_commercial_salesperson_id: ns.salesperson_id,
              p_sale_id: ns.id, p_customer_id: ns.customer_id, p_customer_name: ns.customer_name,
              p_items: ns.items, p_total: ns.total, p_imei: ns.imei, p_serial_number: ns.serial_number,
              p_payment_method: ns.payment_method, p_branch_id: ns.branch_id, p_status: ns.status,
              p_origin: ns.origin, p_customer_type: ns.customer_type, p_delivery_type: ns.delivery_type,
            });
            if (rpcError) {
              // A PostgreSQL rejection of the first request guarantees rollback. Transport
              // failures and retries of an uncertain request must keep the same sale ID.
              if (!previous && isDefinitiveSaleRejection(rpcError.code ?? '')) {
                attempts.complete(ns.id);
                setPendingSale(null);
                throw new Error(pdvErrorMessage(rpcError));
              }
              throw rpcError;
            }
            if (confirmedId !== ns.id) throw new Error('Confirmação da venda não recebida.');
          } catch (err) {
            if (attempts.read()) {
              throw new Error('Resultado da venda ainda não confirmado. Use Recuperar venda pendente; o mesmo ID será reutilizado. ' + pdvErrorMessage(err));
            }
            throw err;
          }
        }
        // Success is final even if the following read fails. Never throw a checkout failure here.
        if (identityScopeRef.current === scope) {
          setData(prev => ({ ...prev, sales: [ns, ...prev.sales.filter(item => item.id !== ns.id)] }));
        }
        try { attempts.complete(ns.id); setPendingSale(null); }
        catch { setPdvSyncWarning('Venda confirmada. A recuperação local permanece pendente; não repita com outro ID.'); }
        if (isSupabaseConfigured && supabase) await syncConfirmedSale(ns.branch_id!);
        return ns;
      } finally { saleInFlight.current = false; }
    }, [requireIdentity, validateBilledSale, syncConfirmedSale],
  );

  const retryPendingSale = useCallback(async (operatorId?: string | null, operatorPin?: string | null) => {
    const currentIdentity = requireIdentity();
    const attempt = new PdvSaleAttemptStore(sessionStorage, currentIdentity.authUserId + ':' + currentIdentity.companyUserId).read();
    if (!attempt) throw new Error('Nenhuma venda pendente para recuperar.');
    return createSale(attempt, operatorId, operatorPin);
  }, [createSale, requireIdentity]);

  // Share the persisted attempt and synchronous guard with checkout. The status is
  // part of the immutable request key, so a pending pre-sale cannot become a sale.
  const createPreSale = useCallback(
    (sale: SalePayload, operatorId?: string | null, operatorPin?: string | null) =>
      createSale({ ...sale, status: 'pre_venda', payment_method: null, origin: 'pdv' }, operatorId, operatorPin),
    [createSale],
  );

  const updatePreSaleItems = useCallback(async (id: string, items: PartnerSale['items'], operatorId?: string | null, operatorPin?: string | null) => {
    if (saleInFlight.current) throw new Error('Aguarde a operação em andamento.');
    saleInFlight.current = true;
    try {
      const currentIdentity = requireIdentity();
      const sale = data.sales.find(item => item.id === id);
      if (!sale?.branch_id || sale.status !== 'pre_venda') throw new Error('Somente pré-vendas pendentes podem ser editadas.');
      ensureEmployeeBranch(currentIdentity, sale.branch_id);
      if (!items.length || items.some(item => !Number.isInteger(item.quantity) || item.quantity <= 0)) throw new Error('Adicione pelo menos um produto com quantidade válida.');
      const total = Math.round(items.reduce((sum, item) => sum + Math.round(item.unit_price * 100) * item.quantity, 0)) / 100;
      if (isSupabaseConfigured && supabase) {
        const { data: confirmedId, error } = await supabase.rpc('execute_partner_sale_mutation', {
          p_salesperson_id: operatorId ?? null, p_pin: operatorPin ?? null,
          p_commercial_salesperson_id: sale.salesperson_id, p_sale_id: sale.id,
          p_customer_id: sale.customer_id, p_customer_name: sale.customer_name,
          p_items: items, p_total: total, p_imei: sale.imei, p_serial_number: sale.serial_number,
          p_payment_method: sale.payment_method, p_branch_id: sale.branch_id, p_status: 'pre_venda',
          p_origin: sale.origin, p_customer_type: sale.customer_type, p_delivery_type: sale.delivery_type,
        });
        if (error) throw new Error(pdvErrorMessage(error));
        if (confirmedId !== id) throw new Error('Não foi possível confirmar a edição. Atualize os pedidos antes de tentar novamente.');
      }
      setData(prev => ({ ...prev, sales: prev.sales.map(item => item.id === id ? { ...item, items, total } : item) }));
      if (isSupabaseConfigured && supabase) await syncConfirmedSale(sale.branch_id);
    } finally { saleInFlight.current = false; }
  }, [data.sales, requireIdentity, syncConfirmedSale]);

  const updateOpenOrderCustomer = useCallback(async (id: string, customerId: string, operatorId?: string | null, operatorPin?: string | null) => {
    if (saleInFlight.current) throw new Error('Aguarde a operação em andamento.');
    saleInFlight.current = true;
    try {
      const currentIdentity = requireIdentity();
      const sale = data.sales.find(item => item.id === id);
      if (!sale?.branch_id || !['pre_venda', 'aberta'].includes(sale.status)) throw new Error('Somente pedidos abertos e pré-vendas podem alterar o cliente.');
      ensureEmployeeBranch(currentIdentity, sale.branch_id);
      const customer = data.customers.find(item => item.id === customerId && item.user_id === currentIdentity.companyUserId && (!item.branch_id || item.branch_id === sale.branch_id));
      if (!customer) throw new Error('Cliente inválido para esta filial.');
      if (sale.payment_status !== 'pendente' || sale.online_payment) throw new Error('Pedidos com pagamento não podem alterar o cliente.');
      if (isSupabaseConfigured && supabase) {
        const { data: confirmed, error } = await supabase.rpc('execute_partner_open_order_customer_mutation', {
          p_salesperson_id: operatorId ?? null, p_pin: operatorPin ?? null, p_sale_id: id, p_customer_id: customerId,
        });
        if (error) throw new Error(pdvErrorMessage(error));
        if (confirmed !== true) throw new Error('O servidor não confirmou a alteração do cliente.');
      }
      setData(previous => ({ ...previous, sales: previous.sales.map(item => item.id === id ? { ...item, customer_id: customerId, customer_name: customer.name } : item) }));
      if (isSupabaseConfigured && supabase) await syncConfirmedSale(sale.branch_id);
    } finally { saleInFlight.current = false; }
  }, [data.sales, data.customers, requireIdentity, syncConfirmedSale]);

  const updateDelivery = useCallback(
    async (
      saleId: string,
      status: DeliveryStatus,
      driverId: string | null,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      const { identity: currentIdentity, client } = await requireAuthenticatedSession();
      const sale = data.sales.find((item) => item.id === saleId);
      if (!sale || sale.user_id !== currentIdentity.companyUserId) {
        throw new Error('Venda não encontrada nesta empresa.');
      }
      if (sale.delivery_type !== 'entrega' || sale.status === 'cancelada') {
        throw new Error('Esta venda não está disponível para gestão de entrega.');
      }

      const { data: confirmed, error } = await client.rpc('execute_partner_delivery_mutation', {
        p_salesperson_id: operatorId ?? null,
        p_pin: operatorPin ?? null,
        p_sale_id: saleId,
        p_status: status,
        p_driver_id: driverId,
      });
      if (error) {
        throw new Error(pdvErrorMessage(error));
      }
      if (confirmed !== true) throw new Error('O servidor não confirmou o salvamento da entrega.');

      const scope = currentIdentity.authUserId + ':' + currentIdentity.companyUserId;
      if (identityScopeRef.current === scope) {
        setData((prev) => ({
          ...prev,
          sales: prev.sales.map((item) => item.id === saleId
            ? { ...item, delivery_status: status, delivery_driver_id: driverId }
            : item),
        }));
      }
    },
    [data.sales, requireAuthenticatedSession],
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

      if (sale.status !== 'pre_venda') throw new Error('Esta pré-venda já foi finalizada ou cancelada.');
      if (paymentMethod === 'faturado') {
        // Refresh first: another checkout may already have finalized this same sale.
        const snapshot = await refreshPdv(sale.branch_id);
        const persisted = snapshot.sales.find(item => item.id === id);
        if (persisted?.status === 'concluida' && persisted.payment_method === paymentMethod) return;
        const message = billedSaleError(snapshot.credits.find(c => c.customer_id === sale.customer_id), sale.customer_id, sale.total);
        if (message) throw new Error(message);
      }

      if (isSupabaseConfigured && supabase) {
        const { error: rpcErr } =
          await supabase.rpc(
            'execute_partner_sale_mutation',
            {
              p_salesperson_id:
                effectiveOperatorId,
              p_pin: effectiveOperatorPin,
              p_commercial_salesperson_id: sale.salesperson_id,
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

      setData(prev => ({ ...prev, sales: prev.sales.map(item => item.id === id
        ? { ...item, status: 'concluida', completed_at: new Date().toISOString(), payment_method: paymentMethod, payment_status: paymentMethod === 'faturado' ? 'pendente' : 'pago' }
        : item) }));
      if (isSupabaseConfigured && supabase) await syncConfirmedSale(sale.branch_id);
    },
    [data.sales, requireIdentity, refreshPdv, syncConfirmedSale],
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

        setData(prev => ({ ...prev,
          sales: prev.sales.map(item => item.id === id
            ? { ...item, status: 'cancelada', payment_status: item.payment_method === 'faturado' ? 'cancelado' : item.payment_status }
            : item),
          invoices: prev.invoices.map(invoice => invoice.sale_id === id && invoice.status === 'aberta' && Number(invoice.paid_amount ?? 0) === 0
            ? { ...invoice, status: 'cancelada' } : invoice),
        }));
        await syncConfirmedSale(sale.branch_id!);
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
    [data.sales, syncConfirmedSale, requireIdentity],
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
          Math.round(Number(invoice.amount ?? 0) * 100) -
            Math.round(Number(invoice.paid_amount ?? 0) * 100),
        ) / 100;

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
    async (settings: Partial<StoreSettings>) => {
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
        .from('store_settings_v2')
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
        .eq('id', currentIdentity.companyUserId)
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

      if (status === 'reintegrado_estoque' && existing.branch_id) {
        await syncConfirmedSale(existing.branch_id);
      }
      return updated as RmaRequest;
    },
    [data.rmas, requireIdentity, syncConfirmedSale],
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
    async (
      combo: Omit<PartnerCombo, 'id' | 'user_id' | 'created_at'>,
    ) => {
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
    async (
      modifier: Omit<
        PartnerModifier,
        'id' | 'user_id' | 'created_at'
      >,
    ) => {
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
            p_email: normalizeSalespersonEmail(salesperson.email),
            p_is_active:
              salesperson.is_active ?? true,
            p_branch_id:
              salesperson.branch_id ?? null,
            p_operator_id: operatorId ?? null,
            p_operator_pin: operatorPin ?? null,
            p_new_pin: salesperson.new_pin ?? null,
          },
        );

      if (error) {
        throw formatSalespersonSaveError(error);
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
        // Campos protegidos: ficam DEPOIS dos spreads para que o novo PIN
        // em texto puro enviado no formulário (new_pin) nunca seja copiado
        // para o estado. Guardamos apenas se um PIN foi configurado.
        new_pin: null,
        pin_configured: !!salesperson.new_pin,
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
              salesperson.email === undefined
                ? normalizeSalespersonEmail(existing.email)
                : normalizeSalespersonEmail(salesperson.email),
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
              salesperson.new_pin ?? null,
          },
        );

      if (error) {
        throw formatSalespersonSaveError(error);
      }

      // A RPC retorna o id (uuid) do colaborador, não a linha completa.
      const updatedSalesperson: PartnerSalesperson = {
        ...existing,
        ...salesperson,
        id,
        new_pin: null,
        pin_configured: salesperson.new_pin
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
    synchronize,
    syncing,
    syncError,
    lastSyncedAt,

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

    pdvCredits,
    pdvSyncWarning,
    pendingSale,
    refreshPdv,
    retryPendingSale,
    createSale,
    createPreSale,
    updatePreSaleItems,
    updateOpenOrderCustomer,
    updateDelivery,
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
