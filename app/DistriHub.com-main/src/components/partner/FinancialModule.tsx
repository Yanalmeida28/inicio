import { useState } from 'react';
import { Wallet, CreditCard, Receipt, Check, QrCode, Copy } from 'lucide-react';
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
  const [copied, setCopied] = useState(false);

  const openInvoices = invoices.filter((i) => i.status === 'aberta');
  const totalOpen = openInvoices.reduce((sum, i) => sum + i.amount, 0);
  const creditAvailable = creditLimit - creditUsed;

  function handlePay(id: string) {
    setPayingId(id);
  }

  async function confirmPay(id: string) {
    await onPayInvoice(id);
    setPayingId(null);
    setPaid(id);
    setTimeout(() => setPaid(null), 3000);
  }

  function copyPix() {
    navigator.clipboard.writeText('00020126360014BR.GOV.BCB.PIX0114+5511940000000520400005303986580BR6009SAOPAULO62070503***6304ABCD');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

      <div className="fin-invoices">
        <h4>Extrato de Faturas</h4>
        <div className="stock-table-wrap">
          <table className="rma-table">
            <thead>
              <tr><th>Valor</th><th>Status</th><th>Vencimento</th><th>Pago em</th><th></th></tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr><td colSpan={5} className="empty-row">Nenhuma fatura registrada.</td></tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td><strong>{money.format(inv.amount)}</strong></td>
                    <td>
                      <span className="rma-status-badge" style={{
                        color: inv.status === 'paga' ? '#5bbc87' : '#e6a06d',
                        borderColor: inv.status === 'paga' ? '#5bbc87' : '#e6a06d',
                      }}>
                        {inv.status === 'paga' ? 'Paga' : 'Em Aberto'}
                      </span>
                    </td>
                    <td>{inv.due_date ? new Date(inv.due_date).toLocaleDateString('pt-BR') : '—'}</td>
                    <td>{inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('pt-BR') : '—'}</td>
                    <td>
                      {inv.status === 'aberta' && (
                        <>
                          {payingId === inv.id ? (
                            <div className="pix-modal-inline">
                              <div className="pix-qr-area">
                                <QrCode size={80} />
                                <small>PIX Dinâmico</small>
                              </div>
                              <div className="pix-copy-area">
                                <code>00020126360014BR.GOV.BCB.PIX...</code>
                                <button className="pix-copy-btn" onClick={copyPix}>
                                  {copied ? <Check size={14} /> : <Copy size={14} />} Copia e Cola
                                </button>
                              </div>
                              <div className="pix-actions">
                                <button className="module-submit-btn" onClick={() => confirmPay(inv.id)}>
                                  <Check size={16} /> Confirmar Pagamento
                                </button>
                                <button className="rma-advance-btn" onClick={() => setPayingId(null)}>Cancelar</button>
                              </div>
                            </div>
                          ) : (
                            <button className="rma-advance-btn" onClick={() => handlePay(inv.id)}>
                              Quitar via PIX
                            </button>
                          )}
                          {paid === inv.id && <span className="sent-message inline"><Check size={14} /> Paga!</span>}
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
