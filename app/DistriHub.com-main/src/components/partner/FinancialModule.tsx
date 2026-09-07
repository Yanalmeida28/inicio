import { useMemo, useState } from 'react';
import { Wallet, CreditCard, Receipt, Check } from 'lucide-react';
import type { PartnerInvoice } from '../../types';
import { money } from '../../utils';

type Props = {
  invoices: PartnerInvoice[];
  walletBalance: number;
  creditLimit: number;
  creditUsed: number;
  onPayInvoice: (id: string) => Promise<void>;
};

export function FinancialModule({ invoices, walletBalance, creditLimit, creditUsed, onPayInvoice }: Props) {
  const [payingId, setPayingId] = useState<string | null>(null);
  const [paid, setPaid] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'aberta' | 'paga'>('all');

  const openInvoices = invoices.filter((i) => i.status === 'aberta');
  const paidInvoices = invoices.filter((i) => i.status === 'paga');
  const totalOpen = openInvoices.reduce((sum, i) => sum + i.amount, 0);
  const totalPaid = paidInvoices.reduce((sum, i) => sum + Number(i.paid_amount ?? i.amount), 0);
  const totalInvoiced = invoices.reduce((sum, i) => sum + i.amount, 0);
  const creditAvailable = creditLimit - creditUsed;

  const overdueCount = useMemo(
    () => openInvoices.filter((invoice) => invoice.due_date && new Date(invoice.due_date) < new Date()).length,
    [openInvoices],
  );

  const visibleInvoices = useMemo(() => {
    if (filter === 'all') return invoices;
    return invoices.filter((invoice) => invoice.status === filter);
  }, [filter, invoices]);

  function handlePay(id: string) {
    setPayingId(id);
  }

  async function confirmPay(id: string) {
    setPaymentError(null);
    try {
      await onPayInvoice(id);
      setPayingId(null);
      setPaid(id);
      setTimeout(() => setPaid(null), 3000);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Não foi possível quitar o título.');
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
                    <td>{money.format(Number(inv.paid_amount ?? (inv.status === 'paga' ? inv.amount : 0)))}</td>
                    <td>{money.format(Math.max(0, Number(inv.amount) - Number(inv.paid_amount ?? (inv.status === 'paga' ? inv.amount : 0))))}</td>
                    <td>
                      <span className="rma-status-badge" style={{
                        color: inv.status === 'paga' ? '#5bbc87' : '#e6a06d',
                        borderColor: inv.status === 'paga' ? '#5bbc87' : '#e6a06d',
                      }}>
                        {inv.status === 'paga' ? 'Paga' : 'Em Aberto'}
                      </span>
                    </td>
                    <td>{inv.due_date ? new Date(inv.due_date).toLocaleDateString('pt-BR') : '—'}</td>
                    <td>
                      {inv.status === 'aberta' && (
                        <>
                          {payingId === inv.id ? (
                            <div className="pix-actions">
                              <button className="module-submit-btn" onClick={() => confirmPay(inv.id)}><Check size={16} /> Confirmar quitação</button>
                              <button className="rma-advance-btn" onClick={() => setPayingId(null)}>Cancelar</button>
                            </div>
                          ) : (
                            <button className="rma-advance-btn" onClick={() => handlePay(inv.id)}>
                              Quitar título
                            </button>
                          )}
                          {paid === inv.id && <span className="sent-message inline"><Check size={14} /> Quitada!</span>}
                          {paymentError && payingId === inv.id && <p className="otp-error-msg">{paymentError}</p>}
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
