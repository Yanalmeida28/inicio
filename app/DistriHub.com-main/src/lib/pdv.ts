import type { PartnerSale } from '../types';

// Catalog prices are stored in cents. Avoid binary floating point drift in the declared total.
// This is display/request arithmetic only; the RPC validates every price and the total.
export function pdvTotal(items: Pick<PartnerSale['items'][number], 'unit_price' | 'quantity'>[]): number {
  return items.reduce((cents, item) => cents + Math.round(item.unit_price * 100) * item.quantity, 0) / 100;
}

export interface CustomerCredit {
  customer_id: string;
  allow_credit: boolean;
  credit_limit: number;
  used: number;
  available: number;
}

export function billedSaleError(credit: CustomerCredit | undefined, customerId: string | null, total: number): string | null {
  if (!customerId) return 'Selecione um cliente para usar Faturado B2B.';
  if (!credit) return 'Não foi possível consultar o crédito. Atualize os dados antes de finalizar.';
  if (!credit.allow_credit) return 'Este cliente não possui crédito permitido.';
  if (total > Number(credit.available)) return 'Crédito disponível insuficiente para esta venda.';
  return null;
}

export function pdvErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return 'Não foi possível concluir a operação.';
}

export function isDefinitiveSaleRejection(code: string): boolean {
  // Connection errors (08xxx) and unknown completion (40003) are deliberately excluded.
  return /^(22|23)/.test(code) || ['P0001', '42501', '40001', '40P01', '57014', '42883', 'PGRST202'].includes(code);
}

// Only the immutable business request is compared. No operator credentials enter this object.
export function saleRequestKey(sale: Partial<PartnerSale>): string {
  return JSON.stringify([
    sale.customer_id ?? null, sale.customer_name, sale.items, sale.total,
    sale.imei ?? null, sale.serial_number ?? null, sale.payment_method ?? null,
    sale.branch_id, sale.salesperson_id ?? null, sale.customer_type ?? 'varejo',
    sale.delivery_type ?? 'balcao', sale.origin ?? 'pdv', sale.status ?? 'concluida',
  ]);
}

// Per authenticated user/company and browser tab. Persist the draft, never a PIN or session token.
export class PdvSaleAttemptStore {
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, private scope: string) {}
  private get key() { return `distrihub:pdv-attempt:${this.scope}`; }
  read(): PartnerSale | null {
    const value = this.storage.getItem(this.key);
    if (!value) return null;
    const sale = JSON.parse(value) as PartnerSale;
    if (!sale.id || !sale.branch_id || !Array.isArray(sale.items)) {
      throw new Error('Tentativa de venda inválida no navegador. Solicite conciliação antes de iniciar outra venda.');
    }
    return sale;
  }
  begin(sale: PartnerSale): PartnerSale {
    const pending = this.read();
    if (pending) {
      if (saleRequestKey(pending) !== saleRequestKey(sale)) {
        throw new Error('Existe uma venda com resultado pendente. Use Recuperar venda pendente antes de iniciar outra.');
      }
      return pending;
    }
    // Persist an explicit allowlist, even if a caller supplies extra runtime properties.
    const stored: PartnerSale = {
      id: sale.id, user_id: sale.user_id, customer_id: sale.customer_id, customer_name: sale.customer_name,
      items: sale.items.map(({ product_id, name, quantity, unit_price }) => ({ product_id, name, quantity, unit_price })),
      total: sale.total, imei: sale.imei, serial_number: sale.serial_number, payment_method: sale.payment_method,
      salesperson_id: sale.salesperson_id, branch_id: sale.branch_id, customer_type: sale.customer_type,
      delivery_type: sale.delivery_type, status: sale.status, origin: sale.origin, online_payment: sale.online_payment,
      payment_status: sale.payment_status, created_at: sale.created_at,
    };
    this.storage.setItem(this.key, JSON.stringify(stored));
    return stored;
  }
  complete(id: string): void {
    if (this.read()?.id === id) this.storage.removeItem(this.key);
  }
}
