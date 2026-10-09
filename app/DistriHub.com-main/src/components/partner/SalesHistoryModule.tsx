import { salePaymentDescription } from '../../lib/pdv';
import { useMemo, useState } from 'react';
import { Ban, Lock, Trash2, X } from 'lucide-react';
import type { PartnerSale, PartnerCustomer, PartnerSalesperson, RmaRequest } from '../../types';
import { saleReturnLabel, saleItemDescription } from '../../lib/saleReturns';
import { SaleActionsMenu } from './SaleActionsMenu';
import { money } from '../../utils';
import { saleChargeTotal } from '../../lib/pdv';
import { printSale, type PrintableSale, type ReceiptDetails } from '../../lib/salePrint';
import { saleShareUrl } from '../../lib/saleShare';

type Props = {
  sales: PartnerSale[];
  rmaRequests?: RmaRequest[];
  customers: PartnerCustomer[];
  salespeople: PartnerSalesperson[];
  segment: string;
  receiptDetails?: ReceiptDetails;
  onCancelSale: (id: string, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
  onDeleteSale: (id: string, operatorId?: string | null, operatorPin?: string | null) => Promise<void>;
};

function localDate(value: string | Date) {
  const date = new Date(value);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function SalesHistoryModule({ sales, rmaRequests = [], customers, salespeople, segment, receiptDetails, onCancelSale, onDeleteSale }: Props) {
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState(() => localDate(new Date()));
  const [endDate, setEndDate] = useState(() => localDate(new Date()));
  const [status, setStatus] = useState('all');
  const traceabilityLabel = segment === 'assistencia' ? 'IMEI / Selo' : 'Serie';
  const filteredSales = useMemo(() => {
    const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const term = normalize(search.trim());
    return sales.filter(sale => {
      const date = localDate(sale.created_at);
      return sale.status !== 'pre_venda' && (!startDate || date >= startDate) && (!endDate || date <= endDate)
        && (status === 'all' || (status === 'devolucao' ? !!saleReturnLabel(sale, rmaRequests) || sale.status === status : sale.status === status && !saleReturnLabel(sale, rmaRequests)))
        && (!term || normalize([sale.id, sale.customer_name, sale.imei, sale.serial_number].join(' ')).includes(term));
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [sales, rmaRequests, search, startDate, endDate, status]);
  const [printError, setPrintError] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  function handleShare(sale: PrintableSale, channel: 'whatsapp' | 'email') {
    setPrintError(null);
    setShareNotice(null);
    try {
      const url = saleShareUrl(sale, channel,
        customers.find((customer) => customer.id === sale.customer_id),
        salespeople.find((person) => person.id === sale.salesperson_id)?.name);
      if (channel === 'whatsapp') {
        const popup = window.open('about:blank', '_blank');
        if (!popup) throw new Error('Permita pop-ups neste navegador para abrir o WhatsApp.');
        popup.opener = null;
        popup.location.replace(url);
        setShareNotice('Confirme o envio no WhatsApp conectado ao número da empresa. O resumo vai em texto, sem PDF anexado.');
      } else {
        const link = document.createElement('a');
        link.href = url;
        document.body.append(link);
        link.click();
        link.remove();
        setShareNotice('Confirme o envio usando o e-mail da empresa. Se nada abriu, configure um aplicativo de e-mail padrão no dispositivo. O resumo vai em texto, sem PDF anexado.');
      }
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : 'Não foi possível preparar o envio.');
    }
  }

  function handlePrint(sale: PrintableSale, format: 'receipt' | 'label') {
    setPrintError(null);
    try { printSale(sale, format, {
      ...receiptDetails,
      customer: customers.find((customer) => customer.id === sale.customer_id),
      salespersonName: salespeople.find((person) => person.id === sale.salesperson_id)?.name,
    }); } catch (error) {
      setPrintError(error instanceof Error ? error.message : 'Não foi possível abrir a impressão.');
    }
  }
  const [cancelTarget, setCancelTarget] = useState<PartnerSale | null>(null);
  const [supervisorId, setSupervisorId] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const managers = salespeople.filter((s) => s.role === 'administrador' || s.role === 'gerente');
  function requestCancelSale(sale: PartnerSale) {
    setCancelTarget(sale);
    setSupervisorId(managers[0]?.id ?? '');
    setPinInput('');
    setPinError(null);
  }

  async function verifyPinAndCancel(action: 'cancel' | 'delete') {
    if (!cancelTarget) return;
    if (!supervisorId) {
      setPinError('Selecione o responsável (Administrador ou Gerente).');
      return;
    }
    if (!pinInput) {
      setPinError('Digite o PIN do responsável selecionado.');
      return;
    }
    setIsVerifyingPin(true);
    setPinError(null);
    try {
      if (action === 'cancel') {
        await onCancelSale(cancelTarget.id, supervisorId, pinInput);
      } else {
        await onDeleteSale(cancelTarget.id, supervisorId, pinInput);
      }
      setCancelTarget(null);
      setSupervisorId('');
      setPinInput('');
      setPinError(null);
    } catch (error) {
      setPinError(error instanceof Error ? error.message : 'Não foi possível autorizar. Verifique o PIN.');
    } finally {
      setIsVerifyingPin(false);
    }
  }

  return (<>
    <div className="orders-filter-row sales-history-filters">
      <label>Buscar venda<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cliente, número, IMEI ou série" /></label>
      <label>De<input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></label>
      <label>Até<input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></label>
      <label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todos</option><option value="concluida">Concluída</option><option value="cancelada">Cancelada</option><option value="aberta">Aberta</option><option value="devolucao">Devolução</option></select></label>
      <button className="rma-advance-btn" onClick={() => { const today = localDate(new Date()); setStartDate(today); setEndDate(today); }}>Hoje</button>
      <button className="rma-advance-btn" onClick={() => { setStartDate(''); setEndDate(''); }}>Todo o período</button>
    </div>
    <p>{filteredSales.length} vendas encontradas nos dados carregados da filial. Total concluído: <strong>{money.format(filteredSales.filter(s => s.status === 'concluida').reduce((sum, s) => sum + Number(s.total), 0))}</strong></p>
      {printError && <p className="otp-error-msg" role="alert">{printError}</p>}
      {shareNotice && <p role="status">{shareNotice}</p>}
      <div className="pdv-recent-sales">
        <h4>Vendas</h4>
        <div className="stock-table-wrap">
          <table className="rma-table">
            <thead><tr><th>Cliente</th><th>Itens</th><th>Total</th><th>Pagamento</th><th>{traceabilityLabel}</th><th>Status</th><th>Data</th><th></th></tr></thead>
            <tbody>
              {filteredSales.length === 0 ? (
                <tr><td colSpan={8} className="empty-row">Nenhuma venda registrada.</td></tr>
              ) : (
                filteredSales.map((s) => (
                  <tr key={s.id} className={s.status === 'cancelada' ? 'cancelled-row' : ''}>
                    <td><strong>{s.customer_name ?? '—'}</strong><small className="sales-history-id" title={s.id}>#{s.id.slice(0, 8)}</small></td>
                    <td>
                      {s.items.length} {s.items.length === 1 ? 'item' : 'itens'}
                      {s.items.length > 0 && <details style={{ marginTop: '6px' }}>
                        <summary style={{ cursor: 'pointer', color: '#5cb5f1' }}>Visualizar produtos</summary>
                        <small style={{ display: 'block', whiteSpace: 'normal', overflowWrap: 'anywhere', maxWidth: '360px', maxHeight: '260px', overflowY: 'auto', marginTop: '8px' }}>
                          {saleItemDescription(s, rmaRequests)}
                        </small>
                      </details>}
                    </td>
                    <td>{money.format(saleChargeTotal(s))}{s.freight_fee ? <small>Frete: {money.format(s.freight_fee)}</small> : null}</td>
                    <td>{salePaymentDescription(s)}</td>
                    <td>{s.imei ?? s.serial_number ?? '—'}</td>
                    <td>
                      {s.status === 'cancelada' ? (
                        <span className="rma-status-badge" style={{ color: '#e3829b', borderColor: '#e3829b' }}>Cancelada</span>
                      ) : (
                        <span className="rma-status-badge" style={{ color: '#5bbc87', borderColor: '#5bbc87' }}>{saleReturnLabel(s, rmaRequests) || (s.status === 'concluida' ? 'Concluída' : s.status === 'aberta' ? 'Aberta' : 'Devolução')}</span>
                      )}
                    </td>
                    <td>{new Date(s.created_at).toLocaleString('pt-BR')}</td>
                    <td>
                      {s.status !== 'cancelada' && (
                        <SaleActionsMenu
                          onPrintReceipt={() => handlePrint(s, 'receipt')}
                          onPrintLabel={() => handlePrint(s, 'label')}
                          onWhatsApp={() => handleShare(s, 'whatsapp')}
                          onEmail={() => handleShare(s, 'email')}
                          onCancel={saleReturnLabel(s, rmaRequests) ? undefined : () => requestCancelSale(s)}
                        />
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>


      {cancelTarget && (
        <div className="modal-backdrop" onClick={() => setCancelTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '380px' }}>
            <div className="modal-header">
              <h3><Lock size={18} style={{ display: 'inline', marginRight: '6px' }} /> Confirmação Necessária</h3>
              <button onClick={() => setCancelTarget(null)}><X size={18} /></button>
            </div>
            <p className="otp-description">
              Cancelar ou apagar uma venda requer permissão de Administrador ou Gerente. Selecione o responsável e digite o PIN dele para continuar.
            </p>
            {managers.length === 0 ? (
              <p className="otp-error-msg">Nenhum Administrador ou Gerente cadastrado com PIN. Cadastre um em Colaboradores antes de continuar.</p>
            ) : (
              <>
                <label style={{ display: 'block', marginBottom: '12px' }}>
                  <strong>Responsável</strong>
                  <select
                    value={supervisorId}
                    onChange={(e) => { setSupervisorId(e.target.value); setPinError(null); }}
                    style={{ width: '100%', marginTop: '6px' }}
                  >
                    {managers.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.role === 'administrador' ? 'Administrador' : 'Gerente'})</option>)}
                  </select>
                </label>
                <label style={{ display: 'block', marginBottom: '12px' }}>
                  <strong>PIN do responsável</strong>
                  <input
                    type="password"
                    value={pinInput}
                    onChange={(e) => { setPinInput(e.target.value); setPinError(null); }}
                    placeholder="Digite o PIN"
                    maxLength={8}
                    style={{ width: '100%', marginTop: '6px' }}
                    autoFocus
                  />
                </label>
              </>
            )}
            {pinError && <p className="otp-error-msg">{pinError}</p>}
            <div className="otp-actions">
              <button className="rma-advance-btn danger" onClick={() => verifyPinAndCancel('delete')} disabled={isVerifyingPin || managers.length === 0}>
                <Trash2 size={16} /> {isVerifyingPin ? 'Verificando...' : 'Apagar Venda'}
              </button>
              <button className="module-submit-btn" onClick={() => verifyPinAndCancel('cancel')} disabled={isVerifyingPin || managers.length === 0}>
                <Ban size={16} /> {isVerifyingPin ? 'Verificando...' : 'Cancelar Venda'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
