type ScopedRow = { id: string; user_id: string; branch_id?: string | null; status?: string | null };

export const partnerCollections = ['profile', 'branches', 'settings', 'salespeople', 'customers', 'products', 'sales', 'suppliers', 'categories', 'movements', 'rmas', 'combos', 'modifiers', 'invoices', 'orders', 'auditLogs', 'serviceOrders', 'serviceOrderItems', 'serviceOrderPhotos'] as const;
export type PartnerCollection = typeof partnerCollections[number];
const baseCollections: PartnerCollection[] = ['profile', 'branches', 'settings', 'salespeople'];
const moduleCollections: Record<string, PartnerCollection[]> = {
  cadastros: ['products', 'categories', 'suppliers'],
  'cadastros:produtos': ['products', 'categories', 'suppliers'],
  'cadastros:categorias': ['categories'], 'cadastros:fornecedores': ['suppliers'],
  'cadastros:clientes': ['customers', 'sales', 'rmas'], 'cadastros:vendedores': [],
  'cadastros:xml': ['products', 'categories', 'suppliers'],
  'cadastros:importar': ['products', 'categories', 'suppliers', 'customers'],
  'cadastros:combos': ['products', 'combos'], 'cadastros:modificadores': ['modifiers'],
  'cadastros:reposicao': ['products', 'sales'],
  pdv: ['products', 'customers', 'categories', 'combos', 'modifiers'],
  pedidos: ['products', 'customers', 'sales', 'invoices', 'rmas'],
  caixa: ['customers'], os: ['products', 'customers'],
  historico: ['customers', 'orders'],
  suporte: [], 'white-label': [], configuracoes: [],
  entregas: ['sales', 'customers'], fiscal: ['sales', 'products', 'customers'],
  financeiro: ['invoices', 'customers', 'rmas'],
  relatorios: ['sales', 'products', 'customers', 'invoices', 'movements', 'categories'],
  administrativo: ['sales', 'products', 'customers', 'invoices', 'movements', 'categories', 'suppliers', 'rmas', 'combos', 'modifiers', 'auditLogs'],
};
export function partnerResources(scope: string | null): PartnerCollection[] {
  return scope === null ? [...partnerCollections] : [...new Set([...baseCollections, ...(moduleCollections[scope] ?? [])])];
}
export class PartnerLoadCache {
  private scope = '';
  private loaded = new Map<string, number>();
  private pending = new Map<string, Promise<unknown>>();
  reset(scope: string): boolean {
    if (this.scope === scope) return false;
    this.scope = scope; this.loaded.clear(); this.pending.clear(); return true;
  }
  has(key: string): boolean { return this.loaded.has(key); }
  needs(key: string, now = Date.now()): boolean { return !this.loaded.has(key) || now - this.loaded.get(key)! >= 30_000; }
  stale(key: string): void { if (this.loaded.has(key)) this.loaded.set(key, 0); }
  mark(key: string): void { this.loaded.set(key, Date.now()); }
  read<T>(key: string, loader: () => PromiseLike<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;
    const request = Promise.resolve().then(loader);
    this.pending.set(key, request);
    void request.finally(() => { if (this.pending.get(key) === request) this.pending.delete(key); }).catch(() => {});
    return request;
  }
}

// Versions are independent per collection, including local mutations and events.
export class PartnerDataVersions {
  private revision = 0;
  private versions = new Map<string, number>();
  constructor(private readonly keys: string[]) {}
  begin(keys = this.keys): number {
    const revision = ++this.revision;
    for (const key of keys) this.versions.set(key, revision);
    return revision;
  }
  invalidate(keys = this.keys): void { this.begin(keys); }
  isCurrent(revision: number, key: string): boolean { return this.versions.get(key) === revision; }
}

// Realtime DELETE events expose only the primary key under RLS. Remove only
// records that are already known and authorized in the current local scope.
export function mergePartnerChange<T extends ScopedRow>(
  rows: T[], event: string, record: Partial<T>, oldId: unknown,
  companyId: string, branchId: string | null,
  preserveClosedSale = false,
): T[] {
  if (event === 'DELETE') {
    if (typeof oldId !== 'string') return rows;
    if (!rows.some(row => row.id === oldId && row.user_id === companyId && (!branchId || row.branch_id === branchId))) return rows;
    return rows.filter(row => row.id !== oldId || row.user_id !== companyId ||
      (branchId !== null && row.branch_id !== branchId));
  }
  if ((event !== 'INSERT' && event !== 'UPDATE') || typeof record.id !== 'string' || record.user_id !== companyId) return rows;
  if (branchId && record.branch_id !== branchId) return rows;
  const index = rows.findIndex(row => row.id === record.id);
  if (preserveClosedSale && index >= 0) {
    // A queued older Realtime event must not undo a locally confirmed checkout.
    const status = rows[index].status;
    if (status === 'cancelada' && record.status !== 'cancelada') return rows;
    if (status === 'concluida' && (record.status === 'pre_venda' || record.status === 'aberta')) return rows;
  }
  if (index < 0) return [record as T, ...rows];
  return rows.map((row, position) => position === index ? { ...row, ...record } : row);
}
