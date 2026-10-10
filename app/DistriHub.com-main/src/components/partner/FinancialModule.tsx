import { useMemo, useRef, useState } from 'react';
import { Wallet, CreditCard, Receipt, Check } from 'lucide-react';
import type { PartnerInvoice } from '../../types';
import { money } from '../../utils';

type Props = {
  invoices: PartnerInvoice[];
  walletBalance: number;
  creditLimit: number;
  creditUsed: number;
  onPayInvoice: (id: string, amount?: number) => Promise<void>;
};

const paidAmount = (invoice: PartnerInvoice) => Number(invoice.paid_amount ?? (invoice.status === 'paga' ? invoice.amount : 0));
const balance = (invoice: PartnerInvoice) => Math.max(0, Math.round(Number(invoice.amount) * 100) - Math.round(paidAmount(invoice) * 100)) / 100;
const isOpen = (invoice: PartnerInvoice) => invoice.status === 'aberta' || invoice.status === 'parcial';

export function FinancialModule({ invoices, walletBalance, creditLimit, creditUsed, onPayInvoice }: Props) {
  const [payingId, setPayingId] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<'full' | 'partial'>('full');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'aberta' | 'paga'>('all');

  const openInvoices = invoices.filter(isOpen);
  const totalOpen = openInvoices.reduce((sum, i) => sum + balance(i), 0);
  const totalPaid = invoices.reduce((sum, i) => sum + paidAmount(i), 0);
  const totalInvoiced = invoices.reduce((sum, i) => sum + i.amount, 0);
  const creditAvailable = creditLimit - creditUsed;

  const overdueCount = useMemo(
    () => openInvoices.filter((invoice) => invoice.due_date && new Date(invoice.due_date) < new Date()).length,
    [openInvoices],
  );

  const visibleInvoices = useMemo(() => {
    if (filter === 'all') return invoices;
    if (filter === 'aberta') return invoices.filter(isOpen);
    return invoices.filter((invoice) => invoice.status === filter);
  }, [filter, invoices]);

  function handlePay(id: string, mode: 'full' | 'partial') {
    setPaymentMode(mode);
    setAmount('');
    setPaymentError(null);
    setSuccess(null);
    setPayingId(id);
  }

  async function confirmPay(invoice: PartnerInvoice) {
    if (submittingRef.current) return;
    setPaymentError(null);
    const normalizedAmount = amount.trim().replace(',', '.');
    const value = paymentMode === 'partial' ? Number(normalizedAmount) : balance(invoice);
    if (paymentMode === 'partial' && (!/^\d+(\.\d{1,2})?$/.test(normalizedAmount) || !Number.isFinite(value) || value <= 0 || value >= balance(invoice))) {
      setPaymentError('Informe um valor maior que zero e menor que o saldo, com até duas casas decimais. Para pagar todo o saldo, use Quitar título.');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onPayInvoice(invoice.id, value);
      setPayingId(null);
      setSuccess(paymentMode === 'partial' ? 'Amortização registrada com sucesso!' : 'Título quitado com sucesso!');
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Não foi possível registrar o pagamento.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="panel-module">
      <div className="module-header">
        <span className="module-icon"><Wallet size={20} /></span>
        <div>
          <h3>Módulo Financeiro & Pagamentos B2B</h3>
          <p>Limite de crédito, faturas, quitação via PIX e saldo de RMA</p>
        </div>
      </div>

      <div className="financial-dashboard">
        <div className="fin-card tone-blue">
          <CreditCard size={22} />
          <div>
            <small>Limite de Crédito Aprovado</small>
            <strong>{money.format(creditLimit)}</strong>
          </div>
        </div>
        <div className="fin-card tone-amber">
          <Receipt size={22} />
          <div>
            <small>Faturas em Aberto</small>
            <strong>{money.format(totalOpen)}</strong>
            <small className="fin-sub">{openInvoices.length} fatura(s)</small>
          </div>
        </div>
        <div className="fin-card tone-green">
          <Wallet size={22} />
          <div>
            <small>Crédito Disponível</small>
            <strong>{money.format(creditAvailable)}</strong>
          </div>
        </div>
        <div className="fin-card tone-slate">
          <Wallet size={22} />
          <div>
            <small>Saldo de Crédito RMA</small>
            <strong>{money.format(walletBalance)}</strong>
          </div>
        </div>
      </div>

      <div className="orders-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', margin: '18px 0 12px' }}>
        <div className="orders-summary-card" style={{ padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', background: '#0f1f2c' }}>
          <small style={{ color: '#8ba3b5' }}>Total faturado</small>
          <strong style={{ display: 'block', fontSize: '22px', marginTop: '6px' }}>{money.format(totalInvoiced)}</strong>
        </div>
        <div className="orders-summary-card" style={{ padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', background: '#0f1f2c' }}>
          <small style={{ color: '#8ba3b5' }}>Pago</small>
          <strong style={{ display: 'block', fontSize: '22px', marginTop: '6px' }}>{money.format(totalPaid)}</strong>
        </div>
        <div className="orders-summary-card" style={{ padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', background: '#0f1f2c' }}>
          <small style={{ color: '#8ba3b5' }}>Vencidas</small>
          <strong style={{ display: 'block', fontSize: '22px', marginTop: '6px' }}>{overdueCount}</strong>
        </div>
      </div>

      <div className="fin-invoices">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <h4 style={{ margin: 0 }}>Extrato de Faturas</h4>
          <div className="orders-filter-row" style={{ gap: '8px' }}>
            {(['all', 'aberta', 'paga'] as const).map((option) => (
              <button
                key={option}
                className={`rma-advance-btn ${filter === option ? 'active' : ''}`}
                onClick={() => setFilter(option)}
                style={{ minWidth: '110px' }}
              >
                {option === 'all' ? 'Todas' : option === 'aberta' ? 'Abertas' : 'Pagas'}
              </button>
            ))}
          </div>
        </div>

        {success && <p className="sent-message" role="status"><Check size={14} /> {success}</p>}
        <div className="stock-table-wrap">
          <table className="rma-table">
            <thead>
              <tr><th>Cliente</th><th>Venda/Título</th><th>Original</th><th>Pago</th><th>Saldo</th><th>Vencimento</th><th>Status</th><th>Ação</th></tr>
            </thead>
            <tbody>
              {visibleInvoices.length === 0 ? (
                <tr><td colSpan={8} className="empty-row">Nenhuma fatura registrada.</td></tr>
              ) : (
                visibleInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.customer_name || '—'}</td>
                    <td>{inv.number || inv.sale_id?.slice(0, 8) || '—'}</td>
                    <td><strong>{money.format(inv.amount)}</strong></td>
                    <td>{money.format(paidAmount(inv))}</td>
                    <td>{money.format(balance(inv))}</td>
                    <td>{inv.due_date ? new Date(inv.due_date).toLocaleDateString('pt-BR') : '—'}</td>
                    <td>
                      <span className={`rma-status-badge status-${inv.status === 'paga' ? 'success' : inv.status === 'cancelada' ? 'danger' : 'warning'}`}>
                        {inv.status === 'paga' ? 'Paga' : inv.status === 'parcial' ? 'Parcialmente paga' : inv.status === 'cancelada' ? 'Cancelada' : 'Em Aberto'}
                      </span>
                    </td>
                    <td>
                      {isOpen(inv) && (
                        <>
                          {payingId === inv.id ? (
                            <form onSubmit={(event) => { event.preventDefault(); void confirmPay(inv); }}>
                              <p>Saldo em aberto: {money.format(balance(inv))}</p>
                              {paymentMode === 'partial' && (
                                <label>
                                  Valor a amortizar (R$)
                                  <input type="text" inputMode="decimal" placeholder="0,00" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={submitting} required autoFocus />
                                </label>
                              )}
                              <div className="pix-actions">
                                <button type="submit" className="module-submit-btn" disabled={submitting}><Check size={16} /> {submitting ? 'Registrando...' : paymentMode === 'partial' ? 'Confirmar amortização' : 'Confirmar quitação'}</button>
                                <button type="button" className="rma-advance-btn" disabled={submitting} onClick={() => setPayingId(null)}>Cancelar</button>
                              </div>
                            </form>
                          ) : (
                            <div className="pix-actions">
                              <button className="rma-advance-btn" disabled={submitting} onClick={() => handlePay(inv.id, 'partial')}>Amortizar</button>
                              <button className="rma-advance-btn" disabled={submitting} onClick={() => handlePay(inv.id, 'full')}>Quitar título</button>
                            </div>
                          )}
                          {paymentError && payingId === inv.id && <p className="otp-error-msg" role="alert">{paymentError}</p>}
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
