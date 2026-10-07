type ScopedRow = { id: string; user_id: string; branch_id?: string | null; status?: string | null };

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
