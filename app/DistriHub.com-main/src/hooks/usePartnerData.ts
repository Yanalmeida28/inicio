import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PartnerProduct,
  PartnerCustomer,
  PartnerSale,
  StockMovement,
  StoreSettings,
  RmaPayload,
  RmaRequest,
  RmaStatus,
  SaleItem,
  PartnerBranch,
  PartnerCategory,
  PartnerSupplier,
  PartnerSalesperson,
  PartnerCombo,
  PartnerModifier,
  PartnerInvoice,
  PartnerProfile,
  B2BOrder,
  PartnerIdentity,
  CustomerType,
  DeliveryType,
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

  addProduct: (
    product: Omit<
      PartnerProduct,
      'id' | 'user_id' | 'created_at' | 'updated_at'
    >,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => Promise<void>;

  replenishStock: (
    productId: string,
    branchId: string,
    quantity: number,
    unitCost?: number | null,
    reason?: string,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => Promise<{ newStock: number }>;

  updateProduct: (
    id: string,
    updates: Partial<PartnerProduct>,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => Promise<void>;

  deleteProduct: (
    id: string,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => Promise<void>;

  addCustomer: (
    customer: Omit<PartnerCustomer, 'id' | 'user_id' | 'created_at'>,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => Promise<void>;

  updateCustomer: (
    id: string,
    updates: PartnerCustomerUpdate,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => Promise<void>;

  refreshCustomer: (id: string) => Promise<PartnerCustomer>;

  deleteCustomer: (
    id: string,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => Promise<void>;

  createSale: (
    sale: SalePayload,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => Promise<void>;

  createPreSale: (
    sale: SalePayload,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => Promise<void>;

  finalizePreSale: (
    id: string,
    paymentMethod: string,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => Promise<void>;

  updateStoreSettings: (
    settings: Partial<StoreSettings>,
  ) => Promise<void>;

  updateProfile: (
    profile: Partial<PartnerProfile>,
  ) => Promise<void>;

  createRma: (
    rma: RmaPayload,
  ) => Promise<void>;

  updateRmaStatus: (
    id: string,
    status: RmaStatus,
  ) => Promise<void>;

  deleteRma: (
    id: string,
  ) => Promise<void>;

  addBranch: (
    name: string,
    address: string,
  ) => Promise<void>;

  updateBranch: (
    id: string,
    updates: Pick<PartnerBranch, 'name' | 'address'>,
  ) => Promise<void>;

  deleteBranch: (
    id: string,
  ) => Promise<void>;

  addCategory: (
    name: string,
  ) => Promise<void>;

  deleteCategory: (
    id: string,
  ) => Promise<void>;

  addSupplier: (
    supplier: Omit<
      PartnerSupplier,
      'id' | 'user_id' | 'created_at' | 'payable_balance'
    >,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => Promise<void>;

  updateSupplier: (
    id: string,
    updates: Partial<PartnerSupplier>,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => Promise<void>;

  deleteSupplier: (
    id: string,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => Promise<void>;

  addSalesperson: (
    sp: Omit<
      PartnerSalesperson,
      'id' | 'user_id' | 'created_at'
    >,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => Promise<void>;

  updateSalesperson: (
    id: string,
    updates: Partial<PartnerSalesperson>,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => Promise<void>;

  deleteSalesperson: (
    id: string,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => Promise<void>;

  cancelSale: (
    id: string,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => Promise<void>;

  deleteSale: (
    id: string,
    operatorId?: string | null,
    operatorPin?: string | null,
  ) => Promise<void>;

  addCombo: (
    combo: Omit<
      PartnerCombo,
      'id' | 'user_id' | 'created_at'
    >,
  ) => Promise<void>;

  deleteCombo: (
    id: string,
  ) => Promise<void>;

  addModifier: (
    mod: Omit<
      PartnerModifier,
      'id' | 'user_id' | 'created_at'
    >,
  ) => Promise<void>;

  deleteModifier: (
    id: string,
  ) => Promise<void>;

  payInvoice: (
    id: string,
  ) => Promise<void>;
};

export type PartnerCustomerUpdate = Partial<PartnerCustomer> & {
  photo_file?: File | null;
  remove_photo?: boolean;
};

// Somente os campos abaixo existem de fato na tabela partner_customers hoje.
// Campos da interface que não existem no banco não são enviados à RPC.
const customerRpcFields = (customer: PartnerCustomer) => ({
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
});

function customerMutationPayload(
  customer: PartnerCustomer,
  customerId: string | null,
  operatorId: string | null | undefined,
  operatorPin: string | null | undefined,
) {
  return {
    p_salesperson_id: operatorId ?? null,
    p_pin: operatorPin ?? null,
    p_customer_id: customerId,
    ...customerRpcFields(customer),
  };
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

type PartnerDataState = Pick<
  PartnerData,
  | 'products'
  | 'customers'
  | 'sales'
  | 'movements'
  | 'storeSettings'
  | 'profile'
  | 'rmaRequests'
  | 'branches'
  | 'categories'
  | 'suppliers'
  | 'salespeople'
  | 'combos'
  | 'modifiers'
  | 'invoices'
  | 'orders'
  | 'loading'
  | 'error'
>;

const emptyState: Omit<
  PartnerDataState,
  'loading' | 'error'
> = {
  products: [],
  customers: [],
  sales: [],
  movements: [],
  storeSettings: null,
  profile: null,
  rmaRequests: [],
  branches: [],
  categories: [],
  suppliers: [],
  salespeople: [],
  combos: [],
  modifiers: [],
  invoices: [],
  orders: [],
};

export function usePartnerData(
  identity: PartnerIdentity | null,
): PartnerData {
  const [data, setData] = useState<PartnerDataState>({
    ...emptyState,
    loading: false,
    error: null,
  });

  // Mantém o acesso à identidade seguro em callbacks assíncronos.
  // Em vez de usar "identity!" (que apenas silencia o TypeScript),
  // esta função valida a identidade no momento em que ela é usada.
  const requireIdentity = useCallback((): PartnerIdentity => {
    if (!identity) {
      throw new Error('Usuário não autenticado.');
    }

    return identity;
  }, [identity]);

  // Evita que uma resposta antiga sobrescreva dados de uma sessão/identidade nova.
  const loadRequestRef = useRef(0);

  const loadData = useCallback(async () => {
    const requestId = ++loadRequestRef.current;

    // Sem identidade, não podemos manter os dados anteriores na tela.
    if (!identity) {
      setData({
        ...emptyState,
        loading: false,
        error: null,
      });
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      setData({
        ...emptyState,
        loading: false,
        error: 'Supabase não configurado.',
      });
      return;
    }

    const client = supabase;

    setData((prev) => ({
      ...prev,
      loading: true,
      error: null,
    }));

    // Funcionário precisa obrigatoriamente estar associado a uma filial.
    if (requireIdentity().salespersonId && !requireIdentity().branchId) {
      setData((prev) => ({
        ...prev,
        loading: false,
        error:
          'O funcionário autenticado não possui uma filial atribuída.',
      }));
      return;
    }

    const tables = [
      'partner_products',
      'partner_customers',
      'partner_sales',
      'stock_movements',
      'rma_requests_v2',
      'partner_branches',
      'partner_categories',
      'partner_suppliers',
      'partner_salespeople',
      'partner_combos',
      'partner_modifiers',
      'partner_invoices',
      'b2b_orders',
    ];

    const branchScopedTables = new Set([
      'partner_products',
      'partner_customers',
      'partner_sales',
      'rma_requests_v2',
    ]);

    const results = await Promise.all(
      tables.map((table) => {
        if (
          requireIdentity().salespersonId &&
          table === 'stock_movements'
        ) {
          return Promise.resolve({
            data: [],
            error: null,
            status: 200,
          });
        }

        let query = client
          .from(table)
          .select('*')
          .eq('user_id', requireIdentity().companyUserId)
          .order('created_at', {
            ascending: false,
          });

        if (
          requireIdentity().branchId &&
          branchScopedTables.has(table)
        ) {
          query = query.eq(
            'branch_id',
            requireIdentity().branchId,
          );
        }

        if (
          requireIdentity().salespersonId &&
          table === 'partner_salespeople'
        ) {
          query = query.eq(
            'id',
            requireIdentity().salespersonId,
          );
        }

        return query;
      }),
    );

    const settingsRes = requireIdentity().salespersonId
      ? {
          data: null,
          error: null,
          status: 200,
        }
      : await client
          .from('store_settings_v2')
          .select('*')
          .eq(
            'user_id',
            requireIdentity().companyUserId,
          )
          .order('updated_at', {
            ascending: false,
          })
          .limit(1)
          .maybeSingle();

    const profileRes = requireIdentity().salespersonId
      ? {
          data: null,
          error: null,
          status: 200,
        }
      : await client
          .from('partner_profiles')
          .select('*')
          .eq(
            'id',
            requireIdentity().companyUserId,
          )
          .limit(1)
          .maybeSingle();

    // Se outra identidade já iniciou um carregamento mais recente,
    // esta resposta não pode sobrescrever o estado atual.
    if (requestId !== loadRequestRef.current) {
      return;
    }

    const failedResult = [
      ...results,
      settingsRes,
      profileRes,
    ].find((result) => result.error);

    if (failedResult?.error) {
      console.error(
        'Falha ao carregar dados do painel.',
        failedResult.error,
      );

      setData((prev) => ({
        ...prev,
        loading: false,
        error: `Não foi possível carregar os dados (${
          failedResult.status ?? 'sem status'
        }): ${failedResult.error.message}`,
      }));

      return;
    }

    setData({
      products:
        (results[0].data as PartnerProduct[]) ?? [],
      customers:
        (results[1].data as PartnerCustomer[]) ?? [],
      sales:
        (results[2].data as PartnerSale[]) ?? [],
      movements:
        (results[3].data as StockMovement[]) ?? [],
      storeSettings:
        (settingsRes.data as StoreSettings) ?? null,
      profile:
        (profileRes.data as PartnerProfile) ?? null,
      rmaRequests:
        (results[4].data as RmaRequest[]) ?? [],
      branches:
        (results[5].data as PartnerBranch[]) ?? [],
      categories:
        (results[6].data as PartnerCategory[]) ?? [],
      suppliers:
        (results[7].data as PartnerSupplier[]) ?? [],
      salespeople:
        (results[8].data as PartnerSalesperson[]) ?? [],
      combos:
        (results[9].data as PartnerCombo[]) ?? [],
      modifiers:
        (results[10].data as PartnerModifier[]) ?? [],
      invoices:
        (results[11].data as PartnerInvoice[]) ?? [],
      orders:
        (results[12].data as B2BOrder[]) ?? [],
      loading: false,
      error: null,
    });
  }, [identity]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const addProduct = useCallback(
    async (
      product: Omit<
        PartnerProduct,
        'id' | 'user_id' | 'created_at' | 'updated_at'
      >,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      if (!identity) return;

      if (!product.branch_id) {
        throw new Error(
          'Produto sem filial não pode ser cadastrado.',
        );
      }

      const np: PartnerProduct = {
        ...product,
        wholesale_price:
          product.wholesale_price ?? 0,
        ncm: product.ncm ?? null,
        cfop: product.cfop ?? null,
        cst_csosn:
          product.cst_csosn ?? null,
        icms_rate:
          product.icms_rate ?? 0,
        pis_rate:
          product.pis_rate ?? 0,
        cofins_rate:
          product.cofins_rate ?? 0,
        id: crypto.randomUUID(),
        user_id: requireIdentity().companyUserId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (isSupabaseConfigured && supabase) {
        const { error: rpcErr } =
          await supabase.rpc(
            'execute_partner_product_mutation',
            {
              p_salesperson_id:
                operatorId ?? null,
              p_pin:
                operatorPin ?? null,
              p_product_id: np.id,
              p_branch_id: np.branch_id,
              p_name: np.name,
              p_cost_price: np.cost_price,
              p_sale_price: np.sale_price,
              p_wholesale_price:
                np.wholesale_price,
              p_stock: np.stock,
              p_min_stock: np.min_stock,
              p_category:
                np.category ?? null,
              p_sku:
                np.sku ?? null,
              p_is_service:
                np.is_service ?? false,
              p_image_url:
                np.image_url ?? null,
            },
          );

        if (rpcErr) {
          throw rpcErr;
        }
      }

      setData((prev) => ({
        ...prev,
        products: [
          np,
          ...prev.products,
        ],
      }));
    },
    [identity, requireIdentity],
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
    ) => {
      if (!identity) {
        throw new Error(
          'Usuário não autenticado.',
        );
      }

      if (!isSupabaseConfigured || !supabase) {
        throw new Error(
          'Supabase não configurado.',
        );
      }

      if (!branchId) {
        throw new Error(
          'Selecione uma filial antes de repor o estoque.',
        );
      }

      if (
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        throw new Error(
          'A quantidade de reposição deve ser um número inteiro maior que zero.',
        );
      }

      const { data: result, error } =
        await supabase.rpc(
          'execute_partner_stock_replenishment',
          {
            p_salesperson_id:
              operatorId ?? null,
            p_pin:
              operatorPin ?? null,
            p_product_id: productId,
            p_branch_id: branchId,
            p_quantity: quantity,
            p_unit_cost:
              unitCost ?? null,
            p_reason:
              reason?.trim() || null,
          },
        );

      if (error) {
        console.error(
          'Falha ao repor estoque via execute_partner_stock_replenishment.',
          {
            error,
            productId,
            branchId,
            quantity,
            unitCost,
          },
        );

        throw error;
      }

      const confirmed =
        result as {
          product_id?: string;
          new_stock?: number;
        } | null;

      if (
        !confirmed?.product_id ||
        typeof confirmed.new_stock !== 'number'
      ) {
        throw new Error(
          'A reposição não foi confirmada pelo servidor.',
        );
      }

      setData((prev) => ({
        ...prev,

        products: prev.products.map(
          (product) =>
            product.id === productId
              ? {
                  ...product,
                  stock:
                    confirmed.new_stock as number,
                  ...(unitCost != null
                    ? {
                        cost_price: unitCost,
                      }
                    : {}),
                }
              : product,
        ),

        movements: [
          {
            id: crypto.randomUUID(),
            user_id:
              requireIdentity().companyUserId,
            product_id: productId,
            product_name:
              prev.products.find(
                (product) =>
                  product.id === productId,
              )?.name ?? 'Produto',
            branch_id: branchId,
            type: 'entrada',
            quantity,
            reason:
              reason?.trim() ||
              'Reposição de estoque',
            created_at:
              new Date().toISOString(),
          },
          ...prev.movements,
        ],
      }));

      return {
        newStock:
          confirmed.new_stock,
      };
    },
    [identity, requireIdentity],
  );

  const updateProduct = useCallback(
    async (
      id: string,
      updates: Partial<PartnerProduct>,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      const currentProd =
        data.products.find(
          (p) => p.id === id,
        );

      if (!currentProd) {
        throw new Error(
          'Produto não encontrado no estado atual. Atualize a página e tente novamente.',
        );
      }

      const merged = {
        ...currentProd,
        ...updates,
      };

      if (
        !merged.branch_id ||
        !merged.name
      ) {
        throw new Error(
          'Dados insuficientes para atualizar produto.',
        );
      }

      if (
        isSupabaseConfigured &&
        supabase
      ) {
        const { error: rpcErr } =
          await supabase.rpc(
            'execute_partner_product_mutation',
            {
              p_salesperson_id:
                operatorId ?? null,
              p_pin:
                operatorPin ?? null,
              p_product_id: id,
              p_branch_id:
                merged.branch_id,
              p_name:
                merged.name,
              p_cost_price:
                merged.cost_price ?? 0,
              p_sale_price:
                merged.sale_price ?? 0,
              p_wholesale_price:
                merged.wholesale_price ?? 0,
              p_stock:
                merged.stock ?? 0,
              p_min_stock:
                merged.min_stock ?? 5,
              p_category:
                merged.category ?? null,
              p_sku:
                merged.sku ?? null,
              p_is_service:
                merged.is_service ?? false,
              p_image_url:
                merged.image_url ?? null,
            },
          );

        if (rpcErr) {
          throw rpcErr;
        }
      }

      setData((prev) => ({
        ...prev,
        products:
          prev.products.map(
            (p) =>
              p.id === id
                ? {
                    ...p,
                    ...updates,
                    updated_at:
                      new Date().toISOString(),
                  }
                : p,
          ),
      }));
    },
    [data.products],
  );

  const deleteProduct = useCallback(
    async (
      id: string,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      if (
        isSupabaseConfigured &&
        supabase
      ) {
        const { error: rpcErr } =
          await supabase.rpc(
            'execute_partner_product_delete',
            {
              p_salesperson_id:
                operatorId ?? null,
              p_pin:
                operatorPin ?? null,
              p_product_id: id,
            },
          );

        if (rpcErr) {
          throw rpcErr;
        }
      }

      setData((prev) => ({
        ...prev,
        products:
          prev.products.filter(
            (p) => p.id !== id,
          ),
      }));
    },
    [],
  );

  const addCustomer = useCallback(
    async (
      customer: Omit<
        PartnerCustomer,
        'id' | 'user_id' | 'created_at'
      >,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      if (!identity) return;

      if (!customer.branch_id) {
        throw new Error(
          'Cliente sem filial não pode ser cadastrado.',
        );
      }

      const normalizedDocument =
        customer.document
          ? normalizeDocument(
              customer.document,
            )
          : null;

      if (
        normalizedDocument &&
        data.customers.some(
          (item) =>
            normalizeDocument(
              item.document ?? '',
            ) ===
              normalizedDocument,
        )
      ) {
        throw new Error(
          'Já existe um cliente com este CPF/CNPJ neste lojista.',
        );
      }

      const nc: PartnerCustomer = {
        ...customer,
        document:
          normalizedDocument,
        id: crypto.randomUUID(),
        user_id:
          requireIdentity().companyUserId,
        created_at:
          new Date().toISOString(),
      };

      if (
        isSupabaseConfigured &&
        supabase
      ) {
        const { error: rpcErr } =
          await supabase.rpc(
            'execute_partner_customer_mutation',
            customerMutationPayload(
              nc,
              null,
              operatorId,
              operatorPin,
            ),
          );

        if (rpcErr) {
          throw rpcErr;
        }
      }

      setData((prev) => ({
        ...prev,
        customers: [
          nc,
          ...prev.customers,
        ],
      }));
    },
    [identity, data.customers],
  );

  const updateCustomer = useCallback(
    async (
      id: string,
      updates: PartnerCustomerUpdate,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      const normalizedDocument =
        updates.document === undefined
          ? undefined
          : updates.document
            ? normalizeDocument(
                updates.document,
              )
            : null;

      if (
        normalizedDocument &&
        data.customers.some(
          (item) =>
            item.id !== id &&
            normalizeDocument(
              item.document ?? '',
            ) ===
              normalizedDocument,
        )
      ) {
        throw new Error(
          'Já existe um cliente com este CPF/CNPJ neste lojista.',
        );
      }

      const {
        photo_file: photoFile,
        remove_photo: removePhoto,
        ...persistedUpdates
      } = updates;

      const normalizedUpdates =
        normalizedDocument === undefined
          ? persistedUpdates
          : {
              ...persistedUpdates,
              document:
                normalizedDocument,
            };

      const currentCust =
        data.customers.find(
          (customer) =>
            customer.id === id,
        );

      if (!currentCust) {
        throw new Error(
          'Cliente não encontrado no estado atual. Atualize a página e tente novamente.',
        );
      }

      const merged = {
        ...currentCust,
        ...normalizedUpdates,
      };

      if (!merged.name) {
        throw new Error(
          'Nome do cliente é obrigatório.',
        );
      }

      if (
        (merged.credit_limit ?? 0) <
        0
      ) {
        throw new Error(
          'O limite de crédito não pode ser negativo.',
        );
      }

      if (merged.salesperson_id) {
        const salesperson =
          data.salespeople.find(
            (item) =>
              item.id ===
              merged.salesperson_id,
          );

        if (
          !salesperson ||
          (salesperson.branch_id &&
            salesperson.branch_id !==
              merged.branch_id)
        ) {
          throw new Error(
            'Vendedor responsável inválido para a filial do cliente.',
          );
        }
      }

      let uploadedPhotoPath:
        | string
        | null = null;

      let authUserId:
        | string
        | null = null;

      if (
        isSupabaseConfigured &&
        supabase
      ) {
        if (
          photoFile ||
          removePhoto
        ) {
          const {
            data: authUserData,
            error: authUserError,
          } =
            await supabase.auth.getUser();

          if (
            authUserError ||
            !authUserData.user
          ) {
            throw new Error(
              'Usuário autenticado não encontrado para enviar a foto.',
            );
          }

          authUserId =
            authUserData.user.id;
        }

        if (photoFile) {
          const extension =
            photoFile.name
              .split('.')
              .pop()
              ?.toLowerCase() ||
            'jpg';

          const candidatePhotoPath =
            `${authUserId}/customers/${id}/${crypto.randomUUID()}.${extension}`;

          const {
            data: uploadedObject,
            error: uploadError,
          } =
            await supabase.storage
              .from(
                'customer-photos',
              )
              .upload(
                candidatePhotoPath,
                photoFile,
                {
                  upsert: false,
                  contentType:
                    photoFile.type ||
                    'image/jpeg',
                },
              );

          if (uploadError) {
            throw new Error(
              `Não foi possível enviar a foto: ${uploadError.message}`,
            );
          }

          uploadedPhotoPath =
            uploadedObject.path;

          merged.photo_url =
            uploadedPhotoPath;
        } else if (removePhoto) {
          merged.photo_url = null;
        }

        const {
          error: rpcErr,
        } = await supabase.rpc(
          'execute_partner_customer_mutation',
          customerMutationPayload(
            merged as PartnerCustomer,
            id,
            operatorId,
            operatorPin,
          ),
        );

        if (rpcErr) {
          if (uploadedPhotoPath) {
            await supabase.storage
              .from(
                'customer-photos',
              )
              .remove([
                uploadedPhotoPath,
              ]);
          }

          throw rpcErr;
        }

        const previousPhotoBelongsToCustomer =
          currentCust.photo_url?.startsWith(
            `${authUserId}/customers/${id}/`,
          ) ?? false;

        if (
          (photoFile ||
            removePhoto) &&
          currentCust.photo_url &&
          currentCust.photo_url !==
            merged.photo_url &&
          previousPhotoBelongsToCustomer
        ) {
          const {
            error: removeError,
          } =
            await supabase.storage
              .from(
                'customer-photos',
              )
              .remove([
                currentCust.photo_url,
              ]);

          if (removeError) {
            console.warn(
              'Não foi possível remover a foto antiga do cliente.',
              removeError,
            );
          }
        }

        // maybeSingle evita erro de "0 rows" após uma atualização
        // válida ou durante uma alteração de visibilidade/RLS.
        const {
          data: savedCustomer,
          error: reloadError,
        } = await supabase
          .from(
            'partner_customers',
          )
          .select('*')
          .eq('id', id)
          .eq(
            'user_id',
            requireIdentity().companyUserId,
          )
          .maybeSingle();

        if (reloadError) {
          throw new Error(
            `Cliente salvo, mas não foi possível recarregar os dados: ${reloadError.message}`,
          );
        }

        const nextCustomer =
          (savedCustomer as PartnerCustomer | null) ??
          (merged as PartnerCustomer);

        setData((prev) => ({
          ...prev,
          customers:
            prev.customers.map(
              (customer) =>
                customer.id === id
                  ? nextCustomer
                  : customer,
            ),
        }));

        return;
      }

      setData((prev) => ({
        ...prev,
        customers:
          prev.customers.map(
            (customer) =>
              customer.id === id
                ? {
                    ...customer,
                    ...merged,
                  }
                : customer,
          ),
      }));
    },
    [
      data.customers,
      data.salespeople,
      identity,
    ],
  );

  const refreshCustomer = useCallback(
    async (id: string) => {
      if (!supabase || !identity) {
        throw new Error(
          'Sessão do cliente não disponível.',
        );
      }

      const {
        data: savedCustomer,
        error,
      } = await supabase
        .from('partner_customers')
        .select('*')
        .eq('id', id)
        .eq(
          'user_id',
          requireIdentity().companyUserId,
        )
        .maybeSingle();

      if (error) {
        throw new Error(
          `Não foi possível carregar os dados do cliente: ${error.message}`,
        );
      }

      const customer =
        (savedCustomer as PartnerCustomer | null) ??
        data.customers.find(
          (item) => item.id === id,
        );

      if (!customer) {
        throw new Error(
          'Cliente não encontrado.',
        );
      }

      setData((prev) => ({
        ...prev,
        customers:
          prev.customers.map(
            (item) =>
              item.id === id
                ? customer
                : item,
          ),
      }));

      return customer;
    },
    [
      identity,
      data.customers,
    ],
  );

  const deleteCustomer = useCallback(
    async (
      id: string,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      if (
        !isSupabaseConfigured ||
        !supabase
      ) {
        throw new Error(
          'Supabase não configurado. A exclusão não foi realizada.',
        );
      }

      const {
        data: deleted,
        error: rpcErr,
      } = await supabase.rpc(
        'execute_partner_customer_delete',
        {
          p_salesperson_id:
            operatorId ?? null,
          p_pin:
            operatorPin ?? null,
          p_customer_id: id,
        },
      );

      if (rpcErr) {
        throw rpcErr;
      }

      if (deleted !== id) {
        throw new Error(
          'A exclusão do cliente não foi confirmada pelo servidor.',
        );
      }

      setData((prev) => ({
        ...prev,
        customers:
          prev.customers.filter(
            (customer) =>
              customer.id !== id,
          ),
      }));
    },
    [],
  );

  const createSale = useCallback(
    async (
      sale: SalePayload,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      if (!identity) return;

      const branchId =
        sale.branch_id ?? null;

      if (!branchId) {
        throw new Error(
          'Venda sem filial selecionada.',
        );
      }

      const effectiveSpId =
        operatorId ??
        sale.salesperson_id ??
        null;

      if (
        sale.payment_method ===
        'faturado'
      ) {
        const customer =
          data.customers.find(
            (item) =>
              item.id ===
              sale.customer_id,
          );

        if (!customer) {
          throw new Error(
            'Faturado B2B exige um cliente selecionado.',
          );
        }

        if (!customer.allow_credit) {
          throw new Error(
            'Este cliente não possui crédito permitido.',
          );
        }
      }

      const ns: PartnerSale = {
        ...sale,
        id: crypto.randomUUID(),
        user_id:
          requireIdentity().companyUserId,
        status: 'concluida',
        created_at:
          new Date().toISOString(),
        imei:
          sale.imei ?? null,
        serial_number:
          sale.serial_number ??
          null,
        payment_method:
          sale.payment_method ??
          null,
        branch_id: branchId,
        salesperson_id:
          effectiveSpId,
        origin: 'pdv',
        online_payment: false,
        payment_status:
          sale.payment_method ===
          'faturado'
            ? 'pendente'
            : 'pago',
      };

      let createdInvoice:
        | PartnerInvoice
        | null = null;

      if (
        isSupabaseConfigured &&
        supabase
      ) {
        const {
          error: rpcErr,
        } = await supabase.rpc(
          'execute_partner_sale_mutation',
          {
            p_salesperson_id:
              effectiveSpId,
            p_pin:
              operatorPin ?? null,
            p_sale_id: ns.id,
            p_customer_id:
              ns.customer_id,
            p_customer_name:
              ns.customer_name,
            p_items: ns.items,
            p_total: ns.total,
            p_imei:
              ns.imei,
            p_serial_number:
              ns.serial_number,
            p_payment_method:
              ns.payment_method,
            p_branch_id:
              ns.branch_id,
            p_status:
              'concluida',
            p_origin:
              'pdv',
            p_customer_type:
              ns.customer_type,
            p_delivery_type:
              ns.delivery_type,
          },
        );

        if (rpcErr) {
          throw rpcErr;
        }

        if (
          sale.payment_method ===
          'faturado'
        ) {
          const {
            data: invoice,
            error: invoiceError,
          } =
            await supabase
              .from(
                'partner_invoices',
              )
              .select('*')
              .eq(
                'sale_id',
                ns.id,
              )
              .eq(
                'user_id',
                requireIdentity().companyUserId,
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
      }

      setData((prev) => {
        const newMovements: StockMovement[] =
          sale.items.map(
            (item) => ({
              id: crypto.randomUUID(),
              user_id:
                requireIdentity().companyUserId,
              product_id:
                item.product_id,
              product_name:
                item.name,
              type:
                'saida' as const,
              quantity:
                item.quantity,
              reason: 'Venda',
              created_at:
                new Date().toISOString(),
            }),
          );

        const updatedProducts =
          prev.products.map(
            (p) => {
              if (
                p.branch_id !==
                branchId
              ) {
                return p;
              }

              const item =
                sale.items.find(
                  (currentItem) =>
                    currentItem.product_id ===
                    p.id,
                );

              return item
                ? {
                    ...p,
                    stock:
                      Math.max(
                        0,
                        p.stock -
                          item.quantity,
                      ),
                  }
                : p;
            },
          );

        return {
          ...prev,
          sales: [
            ns,
            ...prev.sales,
          ],
          invoices:
            createdInvoice
              ? [
                  createdInvoice,
                  ...prev.invoices,
                ]
              : prev.invoices,
          movements: [
            ...newMovements,
            ...prev.movements,
          ],
          products:
            updatedProducts,
        };
      });
    },
    [data.customers, identity],
  );

  const createPreSale = useCallback(
    async (
      sale: SalePayload,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      if (!identity) return;

      const effectiveSpId =
        operatorId ??
        sale.salesperson_id ??
        null;

      const ns: PartnerSale = {
        ...sale,
        id: crypto.randomUUID(),
        user_id:
          requireIdentity().companyUserId,
        status: 'pre_venda',
        created_at:
          new Date().toISOString(),
        imei:
          sale.imei ?? null,
        serial_number:
          sale.serial_number ??
          null,
        payment_method: null,
        branch_id:
          sale.branch_id ??
          null,
        salesperson_id:
          effectiveSpId,
        origin: 'pdv',
        online_payment: false,
        payment_status:
          'pendente',
      };

      if (
        isSupabaseConfigured &&
        supabase
      ) {
        const {
          error: rpcErr,
        } = await supabase.rpc(
          'execute_partner_sale_mutation',
          {
            p_salesperson_id:
              effectiveSpId,
            p_pin:
              operatorPin ?? null,
            p_sale_id: ns.id,
            p_customer_id:
              ns.customer_id,
            p_customer_name:
              ns.customer_name,
            p_items: ns.items,
            p_total: ns.total,
            p_imei:
              ns.imei,
            p_serial_number:
              ns.serial_number,
            p_payment_method:
              null,
            p_branch_id:
              ns.branch_id,
            p_status:
              'pre_venda',
            p_origin:
              'pdv',
            p_customer_type:
              ns.customer_type,
            p_delivery_type:
              ns.delivery_type,
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
      const sale =
        data.sales.find(
          (currentSale) =>
            currentSale.id === id,
        );

      if (
        !sale ||
        !sale.branch_id
      ) {
        throw new Error(
          'Pré-venda não encontrada ou sem filial válida.',
        );
      }

      if (
        isSupabaseConfigured &&
        supabase
      ) {
        const {
          error: rpcErr,
        } = await supabase.rpc(
          'execute_partner_sale_mutation',
          {
            p_salesperson_id:
              operatorId ??
              sale.salesperson_id ??
              null,
            p_pin:
              operatorPin ?? null,
            p_sale_id: id,
            p_customer_id:
              sale.customer_id ??
              null,
            p_customer_name:
              sale.customer_name ??
              '',
            p_items:
              sale.items ?? [],
            p_total:
              sale.total ?? 0,
            p_imei:
              sale.imei ?? null,
            p_serial_number:
              sale.serial_number ??
              null,
            p_payment_method:
              paymentMethod,
            p_branch_id:
              sale.branch_id ??
              null,
            p_status:
              'concluida',
            p_origin:
              sale.origin ??
              'pdv',
            p_customer_type:
              sale.customer_type,
            p_delivery_type:
              sale.delivery_type,
          },
        );

        if (rpcErr) {
          throw rpcErr;
        }
      }

      setData((prev) => {
        const newMovements: StockMovement[] =
          sale.items.map(
            (item) => ({
              id: crypto.randomUUID(),
              user_id:
                sale.user_id,
              product_id:
                item.product_id,
              product_name:
                item.name,
              type:
                'saida' as const,
              quantity:
                item.quantity,
              reason:
                'Venda (Pré-venda)',
              created_at:
                new Date().toISOString(),
            }),
          );

        const updatedProducts =
          prev.products.map(
            (product) => {
              if (
                product.branch_id !==
                sale.branch_id
              ) {
                return product;
              }

              const item =
                sale.items.find(
                  (currentItem) =>
                    currentItem.product_id ===
                    product.id,
                );

              return item
                ? {
                    ...product,
                    stock:
                      Math.max(
                        0,
                        product.stock -
                          item.quantity,
                      ),
                  }
                : product;
            },
          );

        return {
          ...prev,
          sales:
            prev.sales.map(
              (currentSale) =>
                currentSale.id === id
                  ? {
                      ...currentSale,
                      status:
                        'concluida',
                      payment_method:
                        paymentMethod,
                    }
                  : currentSale,
            ),
          movements: [
            ...newMovements,
            ...prev.movements,
          ],
          products:
            updatedProducts,
        };
      });
    },
    [data.sales],
  );

  const updateStoreSettings =
    useCallback(
      async (
        settings: Partial<StoreSettings>,
      ) => {
        if (
          !isSupabaseConfigured ||
          !supabase ||
          !identity
        ) {
          throw new Error(
            'Supabase não configurado; não foi possível salvar as configurações da loja.',
          );
        }

        if (requireIdentity().salespersonId) {
          throw new Error(
            'Funcionários não podem alterar as configurações da loja.',
          );
        }

        const changes = {
          ...settings,
        };

        delete changes.id;
        delete changes.user_id;
        delete changes.updated_at;

        const {
          data: savedSettings,
          error,
        } = await supabase
          .from('store_settings_v2')
          .upsert(
            {
              user_id:
                requireIdentity().companyUserId,
              ...changes,
              updated_at:
                new Date().toISOString(),
            },
            {
              onConflict:
                'user_id',
            },
          )
          .select('*')
          .maybeSingle();

        if (error) {
          console.error(
            'Falha ao salvar configurações da loja.',
            error,
          );

          setData((prev) => ({
            ...prev,
            error: `Não foi possível salvar as configurações da loja: ${error.message}`,
          }));

          throw error;
        }

        if (!savedSettings) {
          throw new Error(
            'As configurações foram enviadas, mas não foi possível confirmar o registro salvo.',
          );
        }

        setData((prev) => ({
          ...prev,
          storeSettings:
            savedSettings as StoreSettings,
          error: null,
        }));
      },
      [identity, requireIdentity],
    );

  const updateProfile = useCallback(
    async (
      profileUpdate: Partial<PartnerProfile>,
    ) => {
      if (
        !identity ||
        !isSupabaseConfigured ||
        !supabase
      ) {
        throw new Error(
          'Supabase não configurado; não foi possível salvar o perfil.',
        );
      }

      const {
        data: savedProfile,
        error,
      } = await supabase
        .from('partner_profiles')
        .update(profileUpdate)
        .eq(
          'id',
          requireIdentity().companyUserId,
        )
        .select('*')
        .maybeSingle();

      if (error) {
        setData((prev) => ({
          ...prev,
          error: `Não foi possível salvar o perfil: ${error.message}`,
        }));

        throw error;
      }

      const nextProfile =
        (savedProfile as PartnerProfile | null) ??
        ({
          ...data.profile,
          ...profileUpdate,
        } as PartnerProfile);

      setData((prev) => ({
        ...prev,
        profile: nextProfile,
        error: null,
      }));
    },
    [identity, data.profile],
  );

  const createRma = useCallback(
    async (rma: RmaPayload) => {
      if (!identity) return;

      if (
        requireIdentity().salespersonId &&
        !requireIdentity().branchId
      ) {
        throw new Error(
          'Funcionário autenticado não possui uma filial atribuída.',
        );
      }

      if (
        requireIdentity().salespersonId &&
        rma.branch_id !== requireIdentity().branchId
      ) {
        throw new Error(
          'Funcionário só pode cadastrar devoluções na filial vinculada ao seu usuário.',
        );
      }

      const nr: RmaRequest = {
        ...rma,
        branch_id:
          rma.branch_id ??
          null,
        customer_name:
          rma.customer_name ??
          'Cliente não informado',
        id: crypto.randomUUID(),
        user_id:
          requireIdentity().companyUserId,
        status:
          'aguardando_troca',
        created_at:
          new Date().toISOString(),
        updated_at:
          new Date().toISOString(),
      };

      if (
        isSupabaseConfigured &&
        supabase
      ) {
        const {
          error,
        } = await supabase
          .from('rma_requests_v2')
          .insert(nr);

        if (error) {
          throw error;
        }
      }

      setData((prev) => ({
        ...prev,
        rmaRequests: [
          nr,
          ...prev.rmaRequests,
        ],
      }));
    },
    [identity, requireIdentity],
  );

  const updateRmaStatus =
    useCallback(
      async (
        id: string,
        status: RmaStatus,
      ) => {
        if (!identity) {
          throw new Error(
            'Usuário não autenticado.',
          );
        }

        if (
          !isSupabaseConfigured ||
          !supabase
        ) {
          throw new Error(
            'Supabase não configurado.',
          );
        }

        let rmaUpdate = supabase
          .from('rma_requests_v2')
          .update({
            status,
            updated_at:
              new Date().toISOString(),
          })
          .eq('id', id)
          .eq(
            'user_id',
            requireIdentity().companyUserId,
          );

        if (requireIdentity().salespersonId) {
          if (!requireIdentity().branchId) {
            throw new Error(
              'Funcionário autenticado não possui uma filial atribuída.',
            );
          }

          rmaUpdate = rmaUpdate.eq(
            'branch_id',
            requireIdentity().branchId,
          );
        }

        const { error } =
          await rmaUpdate;

        if (error) {
          throw error;
        }

        setData((prev) => ({
          ...prev,
          rmaRequests:
            prev.rmaRequests.map(
              (r) =>
                r.id === id
                  ? {
                      ...r,
                      status,
                      updated_at:
                        new Date().toISOString(),
                    }
                  : r,
            ),
        }));
      },
      [identity, requireIdentity],
    );

  const deleteRma = useCallback(
    async (id: string) => {
      if (!identity) {
        throw new Error(
          'Usuário não autenticado.',
        );
      }

      if (
        !isSupabaseConfigured ||
        !supabase
      ) {
        throw new Error(
          'Supabase não configurado.',
        );
      }

      let rmaDelete = supabase
        .from('rma_requests_v2')
        .delete()
        .eq('id', id)
        .eq(
          'user_id',
          requireIdentity().companyUserId,
        );

      if (requireIdentity().salespersonId) {
        if (!requireIdentity().branchId) {
          throw new Error(
            'Funcionário autenticado não possui uma filial atribuída.',
          );
        }

        rmaDelete = rmaDelete.eq(
          'branch_id',
          requireIdentity().branchId,
        );
      }

      const { error } =
        await rmaDelete;

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        rmaRequests:
          prev.rmaRequests.filter(
            (r) => r.id !== id,
          ),
      }));
    },
    [identity, requireIdentity],
  );

  const addBranch = useCallback(
    async (
      name: string,
      address: string,
    ) => {
      if (!identity) return;

      if (requireIdentity().salespersonId) {
        throw new Error(
          'Funcionários não têm permissão para adicionar filiais.',
        );
      }

      if (
        !isSupabaseConfigured ||
        !supabase
      ) {
        throw new Error(
          'Supabase não configurado.',
        );
      }

      const nb: PartnerBranch = {
        id: crypto.randomUUID(),
        user_id:
          requireIdentity().companyUserId,
        name,
        address,
        is_active: true,
        created_at:
          new Date().toISOString(),
      };

      const {
        error,
      } = await supabase
        .from('partner_branches')
        .insert(nb);

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        branches: [
          ...prev.branches,
          nb,
        ],
      }));
    },
    [identity, requireIdentity],
  );

  const updateBranch = useCallback(
    async (
      id: string,
      updates: Pick<
        PartnerBranch,
        'name' | 'address'
      >,
    ) => {
      if (!identity) return;

      if (requireIdentity().salespersonId) {
        throw new Error(
          'Funcionários não têm permissão para alterar filiais.',
        );
      }

      if (
        !isSupabaseConfigured ||
        !supabase
      ) {
        throw new Error(
          'Supabase não configurado.',
        );
      }

      const {
        error,
      } = await supabase
        .from('partner_branches')
        .update(updates)
        .eq('id', id)
        .eq(
          'user_id',
          requireIdentity().companyUserId,
        );

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        branches:
          prev.branches.map(
            (branch) =>
              branch.id === id
                ? {
                    ...branch,
                    ...updates,
                  }
                : branch,
          ),
      }));
    },
    [identity, requireIdentity],
  );

  const deleteBranch = useCallback(
    async (id: string) => {
      if (!identity) return;

      if (requireIdentity().salespersonId) {
        throw new Error(
          'Funcionários não têm permissão para excluir filiais.',
        );
      }

      if (
        !isSupabaseConfigured ||
        !supabase
      ) {
        throw new Error(
          'Supabase não configurado.',
        );
      }

      const {
        error,
      } = await supabase
        .from('partner_branches')
        .delete()
        .eq('id', id)
        .eq(
          'user_id',
          requireIdentity().companyUserId,
        );

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        branches:
          prev.branches.filter(
            (branch) =>
              branch.id !== id,
          ),
      }));
    },
    [identity, requireIdentity],
  );

  const addCategory = useCallback(
    async (name: string) => {
      if (!identity) return;

      if (
        !isSupabaseConfigured ||
        !supabase
      ) {
        throw new Error(
          'Supabase não configurado.',
        );
      }

      const nc: PartnerCategory = {
        id: crypto.randomUUID(),
        user_id:
          requireIdentity().companyUserId,
        name,
        created_at:
          new Date().toISOString(),
      };

      const {
        error,
      } = await supabase
        .from('partner_categories')
        .insert(nc);

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        categories: [
          nc,
          ...prev.categories,
        ],
      }));
    },
    [identity, requireIdentity],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      if (!identity) {
        throw new Error(
          'Usuário não autenticado.',
        );
      }

      if (
        !isSupabaseConfigured ||
        !supabase
      ) {
        throw new Error(
          'Supabase não configurado.',
        );
      }

      const {
        error,
      } = await supabase
        .from('partner_categories')
        .delete()
        .eq('id', id)
        .eq(
          'user_id',
          requireIdentity().companyUserId,
        );

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        categories:
          prev.categories.filter(
            (c) => c.id !== id,
          ),
      }));
    },
    [identity, requireIdentity],
  );

  const addSupplier = useCallback(
    async (
      supplier: Omit<
        PartnerSupplier,
        'id' |
          'user_id' |
          'created_at' |
          'payable_balance'
      >,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      if (!identity) return;

      if (
        !isSupabaseConfigured ||
        !supabase
      ) {
        throw new Error(
          'Supabase não configurado. O fornecedor não foi salvo.',
        );
      }

      const {
        data: newId,
        error: rpcErr,
      } = await supabase.rpc(
        'execute_partner_supplier_mutation',
        {
          p_operator_id:
            operatorId ?? null,
          p_operator_pin:
            operatorPin ?? null,
          p_supplier_id: null,
          p_name:
            supplier.name,
          p_phone:
            supplier.phone ?? null,
          p_notes:
            supplier.notes ?? null,
        },
      );

      if (rpcErr) {
        throw rpcErr;
      }

      if (!newId) {
        throw new Error(
          'O fornecedor foi enviado, mas o servidor não retornou o ID.',
        );
      }

      const ns: PartnerSupplier = {
        ...supplier,
        id: newId as string,
        user_id:
          requireIdentity().companyUserId,
        payable_balance: 0,
        created_at:
          new Date().toISOString(),
      };

      setData((prev) => ({
        ...prev,
        suppliers: [
          ns,
          ...prev.suppliers,
        ],
      }));
    },
    [identity, requireIdentity],
  );

  const updateSupplier = useCallback(
    async (
      id: string,
      updates: Partial<PartnerSupplier>,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      if (
        !identity ||
        !isSupabaseConfigured ||
        !supabase
      ) {
        throw new Error(
          'Supabase não configurado.',
        );
      }

      const current =
        data.suppliers.find(
          (supplier) =>
            supplier.id === id,
        );

      if (!current) {
        throw new Error(
          'Fornecedor não encontrado no estado atual. Atualize a página e tente novamente.',
        );
      }

      const merged = {
        ...current,
        ...updates,
      };

      const {
        error: rpcErr,
      } = await supabase.rpc(
        'execute_partner_supplier_mutation',
        {
          p_operator_id:
            operatorId ?? null,
          p_operator_pin:
            operatorPin ?? null,
          p_supplier_id:
            id,
          p_name:
            merged.name,
          p_phone:
            merged.phone ?? null,
          p_notes:
            merged.notes ?? null,
        },
      );

      if (rpcErr) {
        throw rpcErr;
      }

      setData((prev) => ({
        ...prev,
        suppliers:
          prev.suppliers.map(
            (supplier) =>
              supplier.id === id
                ? merged
                : supplier,
          ),
      }));
    },
    [identity, data.suppliers],
  );

  const deleteSupplier = useCallback(
    async (
      id: string,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      if (
        !identity ||
        !isSupabaseConfigured ||
        !supabase
      ) {
        throw new Error(
          'Supabase não configurado.',
        );
      }

      const {
        error: rpcErr,
      } = await supabase.rpc(
        'execute_partner_supplier_delete',
        {
          p_operator_id:
            operatorId ?? null,
          p_operator_pin:
            operatorPin ?? null,
          p_supplier_id:
            id,
        },
      );

      if (rpcErr) {
        throw rpcErr;
      }

      setData((prev) => ({
        ...prev,
        suppliers:
          prev.suppliers.filter(
            (supplier) =>
              supplier.id !== id,
          ),
      }));
    },
    [identity, requireIdentity],
  );

  const addSalesperson = useCallback(
    async (
      sp: Omit<
        PartnerSalesperson,
        'id' |
          'user_id' |
          'created_at'
      >,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      if (!identity) return;

      if (
        !isSupabaseConfigured ||
        !supabase
      ) {
        throw new Error(
          'Supabase não configurado. O colaborador não foi salvo.',
        );
      }

      const {
        data: newId,
        error: rpcErr,
      } = await supabase.rpc(
        'execute_partner_salesperson_mutation',
        {
          p_operator_id:
            operatorId ?? null,
          p_operator_pin:
            operatorPin ?? null,
          p_salesperson_id:
            null,
          p_name:
            sp.name,
          p_role:
            sp.role,
          p_commission_rate:
            sp.commission_rate ??
            0,
          p_branch_id:
            sp.branch_id ??
            null,
          p_active:
            sp.active ??
            true,
          p_new_pin:
            sp.pin ?? null,
        },
      );

      if (rpcErr) {
        throw rpcErr;
      }

      if (!newId) {
        throw new Error(
          'O colaborador foi enviado, mas o servidor não retornou o ID.',
        );
      }

      const confirmed:
        PartnerSalesperson = {
        ...sp,
        id:
          newId as string,
        user_id:
          requireIdentity().companyUserId,
        created_at:
          new Date().toISOString(),

        // PIN nunca deve ficar armazenado
        // no estado local após a gravação.
        pin: null,
        pin_configured:
          Boolean(sp.pin),
      };

      setData((prev) => ({
        ...prev,
        salespeople: [
          confirmed,
          ...prev.salespeople,
        ],
      }));
    },
    [identity, requireIdentity],
  );

  const updateSalesperson = useCallback(
    async (
      id: string,
      updates: Partial<PartnerSalesperson>,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      if (!identity) return;

      if (
        !isSupabaseConfigured ||
        !supabase
      ) {
        throw new Error(
          'Supabase não configurado. O colaborador não foi atualizado.',
        );
      }

      const current =
        data.salespeople.find(
          (salesperson) =>
            salesperson.id === id,
        );

      if (!current) {
        throw new Error(
          'Colaborador não encontrado no estado atual. Atualize a página e tente novamente.',
        );
      }

      const merged = {
        ...current,
        ...updates,
      };

      const {
        error: rpcErr,
      } = await supabase.rpc(
        'execute_partner_salesperson_mutation',
        {
          p_operator_id:
            operatorId ?? null,
          p_operator_pin:
            operatorPin ?? null,
          p_salesperson_id:
            id,
          p_name:
            merged.name,
          p_role:
            merged.role,
          p_commission_rate:
            merged.commission_rate ??
            0,
          p_branch_id:
            merged.branch_id ??
            null,
          p_active:
            merged.active ??
            merged.is_active ??
            true,
          p_new_pin:
            updates.pin ??
            null,
        },
      );

      if (rpcErr) {
        throw rpcErr;
      }

      setData((prev) => ({
        ...prev,
        salespeople:
          prev.salespeople.map(
            (salesperson) =>
              salesperson.id === id
                ? {
                    ...merged,
                    pin: null,
                    pin_configured:
                      updates.pin
                        ? true
                        : salesperson.pin_configured ??
                          false,
                  }
                : salesperson,
          ),
      }));
    },
    [identity, data.salespeople],
  );

  const deleteSalesperson =
    useCallback(
      async (
        id: string,
        operatorId?: string | null,
        operatorPin?: string | null,
      ) => {
        if (
          !isSupabaseConfigured ||
          !supabase
        ) {
          throw new Error(
            'Supabase não configurado. O colaborador não foi excluído.',
          );
        }

        const {
          error: rpcErr,
        } = await supabase.rpc(
          'execute_partner_salesperson_delete',
          {
            p_operator_id:
              operatorId ?? null,
            p_operator_pin:
              operatorPin ?? null,
            p_salesperson_id:
              id,
          },
        );

        if (rpcErr) {
          throw rpcErr;
        }

        setData((prev) => ({
          ...prev,
          salespeople:
            prev.salespeople.filter(
              (s) => s.id !== id,
            ),
        }));
      },
      [],
    );

  const cancelSale = useCallback(
    async (
      id: string,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      if (
        isSupabaseConfigured &&
        supabase
      ) {
        const sale =
          data.sales.find(
            (s) => s.id === id,
          );

        if (!sale) {
          throw new Error(
            'Venda não encontrada.',
          );
        }

        const {
          error: rpcErr,
        } = await supabase.rpc(
          'execute_partner_sale_mutation',
          {
            p_salesperson_id:
              operatorId ??
              sale.salesperson_id ??
              null,
            p_pin:
              operatorPin ?? null,
            p_sale_id:
              id,
            p_customer_id:
              sale.customer_id ??
              null,
            p_customer_name:
              sale.customer_name ??
              '',
            p_items:
              sale.items ?? [],
            p_total:
              sale.total ?? 0,
            p_imei:
              sale.imei ?? null,
            p_serial_number:
              sale.serial_number ??
              null,
            p_payment_method:
              sale.payment_method ??
              null,
            p_branch_id:
              sale.branch_id ??
              null,
            p_status:
              'cancelada',
            p_origin:
              sale.origin ??
              'pdv',
            p_customer_type:
              sale.customer_type ??
              'varejo',
            p_delivery_type:
              sale.delivery_type ??
              'balcao',
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
        sales:
          prev.sales.map(
            (s) =>
              s.id === id
                ? {
                    ...s,
                    status:
                      'cancelada' as const,
                  }
                : s,
          ),
      }));
    },
    [data.sales, loadData],
  );

  const deleteSale = useCallback(
    async (
      id: string,
      operatorId?: string | null,
      operatorPin?: string | null,
    ) => {
      if (
        !isSupabaseConfigured ||
        !supabase
      ) {
        throw new Error(
          'Supabase não configurado. A venda não foi excluída.',
        );
      }

      const {
        data: deleted,
        error: rpcErr,
      } = await supabase.rpc(
        'execute_partner_sale_delete',
        {
          p_salesperson_id:
            operatorId ?? null,
          p_pin:
            operatorPin ?? null,
          p_sale_id:
            id,
        },
      );

      if (rpcErr) {
        throw rpcErr;
      }

      if (deleted !== id) {
        throw new Error(
          'A exclusão da venda não foi confirmada pelo servidor.',
        );
      }

      setData((prev) => ({
        ...prev,
        sales:
          prev.sales.filter(
            (sale) =>
              sale.id !== id,
          ),
      }));
    },
    [],
  );

  const addCombo = useCallback(
    async (
      combo: Omit<
        PartnerCombo,
        'id' |
          'user_id' |
          'created_at'
      >,
    ) => {
      if (!identity) return;

      if (
        !isSupabaseConfigured ||
        !supabase
      ) {
        throw new Error(
          'Supabase não configurado.',
        );
      }

      const nc: PartnerCombo = {
        ...combo,
        id: crypto.randomUUID(),
        user_id:
          requireIdentity().companyUserId,
        created_at:
          new Date().toISOString(),
      };

      const {
        error,
      } = await supabase
        .from('partner_combos')
        .insert(nc);

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        combos: [
          nc,
          ...prev.combos,
        ],
      }));
    },
    [identity, requireIdentity],
  );

  const deleteCombo = useCallback(
    async (id: string) => {
      if (!identity) {
        throw new Error(
          'Usuário não autenticado.',
        );
      }

      if (
        !isSupabaseConfigured ||
        !supabase
      ) {
        throw new Error(
          'Supabase não configurado.',
        );
      }

      const {
        error,
      } = await supabase
        .from('partner_combos')
        .delete()
        .eq('id', id)
        .eq(
          'user_id',
          requireIdentity().companyUserId,
        );

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        combos:
          prev.combos.filter(
            (c) => c.id !== id,
          ),
      }));
    },
    [identity, requireIdentity],
  );

  const addModifier = useCallback(
    async (
      mod: Omit<
        PartnerModifier,
        'id' |
          'user_id' |
          'created_at'
      >,
    ) => {
      if (!identity) return;

      if (
        !isSupabaseConfigured ||
        !supabase
      ) {
        throw new Error(
          'Supabase não configurado.',
        );
      }

      const nm: PartnerModifier = {
        ...mod,
        id: crypto.randomUUID(),
        user_id:
          requireIdentity().companyUserId,
        created_at:
          new Date().toISOString(),
      };

      const {
        error,
      } = await supabase
        .from('partner_modifiers')
        .insert(nm);

      if (error) {
        throw error;
      }

      setData((prev) => ({
        ...prev,
        modifiers: [
          nm,
          ...prev.modifiers,
        ],
      }));
    },
    [identity, requireIdentity],
  );

  const deleteModifier =
    useCallback(
      async (id: string) => {
        if (!identity) {
          throw new Error(
            'Usuário não autenticado.',
          );
        }

        if (
          !isSupabaseConfigured ||
          !supabase
        ) {
          throw new Error(
            'Supabase não configurado.',
          );
        }

        const {
          error,
        } = await supabase
          .from(
            'partner_modifiers',
          )
          .delete()
          .eq('id', id)
          .eq(
            'user_id',
            requireIdentity().companyUserId,
          );

        if (error) {
          throw error;
        }

        setData((prev) => ({
          ...prev,
          modifiers:
            prev.modifiers.filter(
              (m) => m.id !== id,
            ),
        }));
      },
      [identity, requireIdentity],
    );

  const payInvoice = useCallback(
    async (id: string) => {
      if (
        !isSupabaseConfigured ||
        !supabase ||
        !identity
      ) {
        throw new Error(
          'Supabase não configurado.',
        );
      }

      const invoice =
        data.invoices.find(
          (item) => item.id === id,
        );

      if (!invoice) {
        throw new Error(
          'Título não encontrado.',
        );
      }

      if (
        requireIdentity().salespersonId &&
        invoice.branch_id !==
          requireIdentity().branchId
      ) {
        throw new Error(
          'Acesso negado: o título não pertence à filial do funcionário.',
        );
      }

      const paidAt =
        new Date().toISOString();

      let invoiceUpdate =
        supabase
          .from(
            'partner_invoices',
          )
          .update({
            status: 'paga',
            paid_amount:
              invoice.amount,
            paid_at: paidAt,
          })
          .eq('id', id)
          .eq(
            'user_id',
            requireIdentity().companyUserId,
          );

      if (invoice.branch_id) {
        invoiceUpdate =
          invoiceUpdate.eq(
            'branch_id',
            invoice.branch_id,
          );
      }

      const {
        data: updatedInvoice,
        error,
      } =
        await invoiceUpdate
          .select('*')
          .maybeSingle();

      if (error) {
        throw error;
      }

      if (!updatedInvoice) {
        throw new Error(
          'O título não foi encontrado ou não pôde ser atualizado.',
        );
      }

      setData((prev) => ({
        ...prev,
        invoices:
          prev.invoices.map(
            (currentInvoice) =>
              currentInvoice.id === id
                ? (updatedInvoice as PartnerInvoice)
                : currentInvoice,
          ),
      }));
    },
    [data.invoices, identity],
  );

  return {
    products: data.products,
    customers: data.customers,
    sales: data.sales,
    movements: data.movements,
    storeSettings:
      data.storeSettings,
    profile: data.profile,
    orders: data.orders,
    error: data.error,
    rmaRequests:
      data.rmaRequests,
    branches: data.branches,
    categories:
      data.categories,
    suppliers:
      data.suppliers,
    salespeople:
      data.salespeople,
    combos: data.combos,
    modifiers:
      data.modifiers,
    invoices:
      data.invoices,
    loading:
      data.loading,

    addProduct,
    replenishStock,
    updateProduct,
    deleteProduct,

    addCustomer,
    updateCustomer,
    refreshCustomer,
    deleteCustomer,

    createSale,
    createPreSale,
    finalizePreSale,

    updateStoreSettings,
    updateProfile,

    createRma,
    updateRmaStatus,
    deleteRma,

    addBranch,
    updateBranch,
    deleteBranch,

    addCategory,
    deleteCategory,

    addSupplier,
    updateSupplier,
    deleteSupplier,

    addSalesperson,
    updateSalesperson,
    deleteSalesperson,

    cancelSale,
    deleteSale,

    addCombo,
    deleteCombo,

    addModifier,
    deleteModifier,

    payInvoice,
  };
}