type Attempt = { token: string; amount: number };
export class InvoicePaymentAttempts {
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {}
  get(scope: string, invoiceId: string, amount: number, token: string): Attempt {
    const key = `distrihub-invoice-payment:${scope}:${invoiceId}`;
    const raw = this.storage.getItem(key);
    if (raw) {
      const previous = JSON.parse(raw) as Attempt;
      if (!previous.token || !Number.isFinite(previous.amount)) throw new Error('Registro de tentativa inválido. Verifique o recebimento antes de continuar.');
      if (previous.amount !== amount) throw new Error('Há um recebimento sem confirmação para esta fatura. Tente novamente com o valor anterior antes de registrar outro.');
      return previous;
    }
    const attempt = { token, amount };
    this.storage.setItem(key, JSON.stringify(attempt));
    return attempt;
  }
  confirm(scope: string, invoiceId: string) { this.storage.removeItem(`distrihub-invoice-payment:${scope}:${invoiceId}`); }
}
