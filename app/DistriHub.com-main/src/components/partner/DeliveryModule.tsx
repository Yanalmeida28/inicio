import { useMemo, useRef, useState } from 'react';
import {
  Truck, MapPin, Package, Check, Clock, X, Navigation,
} from 'lucide-react';
import type { DeliveryStatus, DeliveryDetails, PartnerSale, PartnerSalesperson, PartnerCustomer } from '../../types';
import { money } from '../../utils';
import { saleChargeTotal } from '../../lib/pdv';

type Props = {
  sales: PartnerSale[];
  salespeople: PartnerSalesperson[];
  customers?: PartnerCustomer[];
  selectedBranchId: string | null;
  onUpdateDelivery: (saleId: string, status: DeliveryStatus, driverId: string | null, details?: DeliveryDetails & { address: string; contact: string }) => Promise<void>;
};

const statusConfig: Record<DeliveryStatus, { label: string; color: string; icon: typeof Clock }> = {
  pendente: { label: 'Pendente', color: '#e6a06d', icon: Clock },
  em_rota: { label: 'Em Rota', color: '#55adf1', icon: Navigation },
  entregue: { label: 'Entregue', color: '#5bbc87', icon: Check },
  falhou: { label: 'Falhou', color: '#e3829b', icon: X },
};

export function DeliveryModule({ sales, salespeople, customers = [], selectedBranchId, onUpdateDelivery }: Props) {
  const drivers = salespeople.filter((s) => s.role === 'logistica' && (s.active ?? s.is_active));
  const [savingSaleIds, setSavingSaleIds] = useState<Set<string>>(() => new Set());
  const savingRef = useRef(new Set<string>());
  const [saveError, setSaveError] = useState('');

  const deliveries = useMemo(
    () => sales
      .filter((sale) => sale.delivery_type === 'entrega' && sale.status !== 'cancelada')
      .filter((sale) => !selectedBranchId || sale.branch_id === selectedBranchId)
      .map((sale) => {
        return {
          saleId: sale.id,
          customerName: sale.customer_name ?? 'Cliente',
          address: sale.delivery_address ?? '',
          contact: sale.delivery_contact ?? '',
          details: sale.delivery_details ?? {},
          history: sale.delivery_history ?? [],
          items: Array.isArray(sale.items) ? sale.items.reduce((sum, item) => sum + item.quantity, 0) : 0,
          total: saleChargeTotal(sale),
          status: sale.delivery_status ?? 'pendente',
          driverId: sale.delivery_driver_id ?? null,
        };
      }),
    [sales, selectedBranchId],
  );

  const [query, setQuery] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [editing, setEditing] = useState<{ saleId: string; status: DeliveryStatus; driverId: string | null; address: string; contact: string; scheduled_date: string; failure_reason: string; received_by: string; notes: string } | null>(null);
  const [filter, setFilter] = useState<DeliveryStatus | 'all'>('all');

  const filtered = useMemo(
    () => deliveries.filter(d => (filter === 'all' || d.status === filter) && (!query.trim() || `${d.customerName} ${d.saleId}`.toLowerCase().includes(query.trim().toLowerCase())) && (!driverFilter || d.driverId === driverFilter) && (!dateFilter || d.details.scheduled_date === dateFilter)),
    [deliveries, filter, query, driverFilter, dateFilter],
  );

  const totalValue = useMemo(() => deliveries.filter(d => d.status === 'em_rota').reduce((sum, d) => sum + d.total, 0), [deliveries]);
  const assignedCount = useMemo(() => deliveries.filter((d) => d.driverId).length, [deliveries]);

  function editDelivery(saleId: string, status?: DeliveryStatus) {
    const d = deliveries.find(item => item.saleId === saleId);
    if (!d) return;
    const sale = sales.find(item => item.id === saleId);
    const customer = customers.find(item => item.id === sale?.customer_id);
    const address = d.address || [customer?.address, customer?.address_number, customer?.complement, customer?.neighborhood, customer?.city, customer?.state, customer?.zip_code].filter(Boolean).join(', ');
    setEditing({ saleId, status: status ?? d.status, driverId: d.driverId, address, contact: d.contact || customer?.phone || '', scheduled_date: d.details.scheduled_date ?? '', failure_reason: d.details.failure_reason ?? '', received_by: d.details.received_by ?? '', notes: d.details.notes ?? '' });
    setSaveError('');
  }

  async function saveDetails(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || savingRef.current.has(editing.saleId)) return;
    if (editing.status === 'falhou' && !editing.failure_reason.trim() || editing.status === 'entregue' && !editing.received_by.trim()) { setSaveError('Informe o motivo da falha ou quem recebeu a entrega.'); return; }
    savingRef.current.add(editing.saleId); setSavingSaleIds(new Set(savingRef.current)); setSaveError('');
    try { await onUpdateDelivery(editing.saleId, editing.status, editing.driverId, { address: editing.address, contact: editing.contact, scheduled_date: editing.scheduled_date, failure_reason: editing.failure_reason, received_by: editing.received_by, notes: editing.notes }); setEditing(null); }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'Não foi possível salvar os detalhes.'); }
    finally { savingRef.current.delete(editing.saleId); setSavingSaleIds(new Set(savingRef.current)); }
  }

  async function saveDelivery(saleId: string, status: DeliveryStatus, driverId: string | null) {
    if (savingRef.current.has(saleId)) return;
    savingRef.current.add(saleId);
    setSavingSaleIds(new Set(savingRef.current));
    setSaveError('');
    try {
      await onUpdateDelivery(saleId, status, driverId);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Não foi possível salvar a entrega.');
    } finally {
      savingRef.current.delete(saleId);
      setSavingSaleIds(new Set(savingRef.current));
    }
  }

  const stats = {
    pendente: deliveries.filter((d) => d.status === 'pendente').length,
    em_rota: deliveries.filter((d) => d.status === 'em_rota').length,
    entregue: deliveries.filter((d) => d.status === 'entregue').length,
    falhou: deliveries.filter((d) => d.status === 'falhou').length,
  };

  return (
    <div className="panel-module">
      <div className="module-header">
        <span className="module-icon"><Truck size={20} /></span>
        <div>
          <h3>Gestão de Entregas</h3>
          <p>Acompanhe e organize as entregas dos seus pedidos</p>
        </div>
      </div>

      {editing && <div className="modal-overlay"><form className="module-card" onSubmit={saveDetails} style={{ maxWidth: 620, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
        <h4>Detalhes da entrega</h4>
        <fieldset disabled={savingSaleIds.has(editing.saleId)} style={{ border: 0 }}>
          <label>Endereço<input value={editing.address} onChange={e => setEditing({ ...editing, address: e.target.value })} required maxLength={1500} /></label>
          <label>Contato<input value={editing.contact} onChange={e => setEditing({ ...editing, contact: e.target.value })} maxLength={200} /></label>
          <label>Previsão de entrega<input type="date" value={editing.scheduled_date} onChange={e => setEditing({ ...editing, scheduled_date: e.target.value })} /></label>
          <label>Status<select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value as DeliveryStatus })}>{Object.entries(statusConfig).map(([key,cfg]) => <option key={key} value={key}>{cfg.label}</option>)}</select></label>
          {editing.status === 'falhou' && <label>Motivo da falha<input value={editing.failure_reason} onChange={e => setEditing({ ...editing, failure_reason: e.target.value })} required /></label>}
          {editing.status === 'entregue' && <label>Recebido por<input value={editing.received_by} onChange={e => setEditing({ ...editing, received_by: e.target.value })} required /></label>}
          <label>Observações<textarea value={editing.notes} onChange={e => setEditing({ ...editing, notes: e.target.value })} maxLength={4000} /></label>
          {saveError && <p role="alert">{saveError}</p>}
          <button type="submit" className="module-action-btn">Salvar entrega</button>
          <button type="button" className="rma-advance-btn" onClick={() => setEditing(null)}>Fechar</button>
        </fieldset>
        <h4>Histórico</h4>{(deliveries.find(d => d.saleId === editing.saleId)?.history ?? []).map((entry,index) => <p key={index}>{new Date(entry.at).toLocaleString('pt-BR')} — {statusConfig[entry.status]?.label ?? entry.status}{entry.details?.received_by ? ' — ' + entry.details.received_by : ''}{entry.details?.failure_reason ? ' — ' + entry.details.failure_reason : ''}</p>)}
      </form></div>}
      {saveError && <p className="otp-error-msg" role="alert">{saveError}</p>}

      <div className="financial-dashboard">
        <div className="fin-card">
          <div className="wallet-icon" style={{ color: '#e6a06d', background: 'rgba(230,160,109,.12)' }}>
            <Clock size={22} />
          </div>
          <div>
            <small>Pendentes</small>
            <strong>{stats.pendente}</strong>
          </div>
        </div>
        <div className="fin-card">
          <div className="wallet-icon" style={{ color: '#55adf1', background: 'rgba(85,173,241,.12)' }}>
            <Navigation size={22} />
          </div>
          <div>
            <small>Em Rota</small>
            <strong>{stats.em_rota}</strong>
          </div>
        </div>
        <div className="fin-card">
          <div className="wallet-icon" style={{ color: '#5bbc87', background: 'rgba(80,211,148,.12)' }}>
            <Check size={22} />
          </div>
          <div>
            <small>Entregues</small>
            <strong>{stats.entregue}</strong>
          </div>
        </div>
        <div className="fin-card">
          <div className="wallet-icon" style={{ color: '#e3829b', background: 'rgba(227,130,155,.12)' }}>
            <X size={22} />
          </div>
          <div>
            <small>Falhas</small>
            <strong>{stats.falhou}</strong>
          </div>
        </div>
      </div>

      <div className="orders-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', margin: '18px 0 12px' }}>
        <div className="orders-summary-card" style={{ padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', background: '#0f1f2c' }}>
          <small style={{ color: '#8ba3b5' }}>Valor total em rota</small>
          <strong style={{ display: 'block', fontSize: '22px', marginTop: '6px' }}>{money.format(totalValue)}</strong>
        </div>
        <div className="orders-summary-card" style={{ padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', background: '#0f1f2c' }}>
          <small style={{ color: '#8ba3b5' }}>Entregas atribuídas</small>
          <strong style={{ display: 'block', fontSize: '22px', marginTop: '6px' }}>{assignedCount}</strong>
        </div>
        <div className="orders-summary-card" style={{ padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', background: '#0f1f2c' }}>
          <small style={{ color: '#8ba3b5' }}>Fila ativa</small>
          <strong style={{ display: 'block', fontSize: '22px', marginTop: '6px' }}>{deliveries.filter(d => d.status === 'pendente' || d.status === 'em_rota').length}</strong>
        </div>
      </div>

      <div className="orders-filter-row">
        <input type="search" aria-label="Buscar entrega" placeholder="Buscar cliente ou pedido" autoComplete="off" value={query} onChange={e => setQuery(e.target.value)} />
        <select aria-label="Filtrar entregador" value={driverFilter} onChange={e => setDriverFilter(e.target.value)}><option value="">Todos os entregadores</option>{drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <label>Previsão<input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} /></label>
      </div>
      <div className="subtab-bar">
        <button className={`subtab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          <Package size={15} /> Todas
        </button>
        {Object.entries(statusConfig).map(([key, cfg]) => (
          <button
            key={key}
            className={`subtab ${filter === key ? 'active' : ''}`}
            onClick={() => setFilter(key as DeliveryStatus)}
          >
            <cfg.icon size={15} /> {cfg.label}
          </button>
        ))}
      </div>

      <div className="stock-table-wrap">
        <table className="rma-table">
          <thead>
            <tr>
              <th>Cliente</th><th>Itens</th><th>Total</th><th>Entregador</th><th>Status</th><th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="empty-row">Nenhuma entrega encontrada.</td></tr>
            ) : (
              filtered.map((d) => {
                const cfg = statusConfig[d.status];
                const isSaving = savingSaleIds.has(d.saleId);
                return (
                  <tr key={d.saleId}>
                    <td>
                      <strong>{d.customerName}</strong><small>Pedido #{d.saleId.slice(0, 8)}</small>
                      {!d.address && <small>Endereço não informado — abra os detalhes</small>}
                      {d.contact && <small>{d.contact}</small>}
                      {d.details.scheduled_date && <small>Previsão: {d.details.scheduled_date.split('-').reverse().join('/')}</small>}
                      {d.address && <small><MapPin size={10} /> {d.address}</small>}
                    </td>
                    <td>{d.items} {d.items === 1 ? 'item' : 'itens'}</td>
                    <td>{money.format(d.total)}</td>
                    <td>
                      <select
                        value={d.driverId ?? ''}
                        onChange={(e) => saveDelivery(d.saleId, d.status, e.target.value || null)}
                        disabled={isSaving}
                        className="inline-input"
                        style={{ width: 'auto', minWidth: '120px' }}
                      >
                        <option value="">Sem entregador</option>
                        {drivers.filter(s => !s.branch_id || s.branch_id === sales.find(sale => sale.id === d.saleId)?.branch_id).map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className={`rma-status-badge status-${d.status === 'entregue' ? 'success' : d.status === 'falhou' ? 'danger' : d.status === 'em_rota' ? 'info' : 'warning'}`}>
                        <cfg.icon size={11} style={{ display: 'inline', marginRight: '4px' }} />
                        {cfg.label}
                      </span>
                    </td>
                    <td>
                      <div className="row-action-group">
                        <button type="button" className="rma-advance-btn" disabled={isSaving} onClick={() => editDelivery(d.saleId)}>Detalhes</button>
                        {d.status !== 'em_rota' && d.status !== 'entregue' && (
                          <button
                            className="rma-advance-btn"
                            onClick={() => saveDelivery(d.saleId, 'em_rota', d.driverId)}
                            disabled={isSaving}
                            title="Marcar Em Rota"
                          >
                            <Navigation size={14} />
                          </button>
                        )}
                        {d.status !== 'entregue' && (
                          <button
                            className="rma-advance-btn"
                            onClick={() => editDelivery(d.saleId, 'entregue')}
                            disabled={isSaving}
                            title="Marcar Entregue"
                          >
                            <Check size={14} />
                          </button>
                        )}
                        {d.status !== 'falhou' && d.status !== 'entregue' && (
                          <button
                            className="rma-advance-btn danger"
                            onClick={() => editDelivery(d.saleId, 'falhou')}
                            disabled={isSaving}
                            title="Marcar Falha"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {drivers.length === 0 && (
        <div className="delivery-info-banner">
          <Truck size={20} />
          <div>
            <strong>Nenhum entregador cadastrado</strong>
            <p>Cadastre funcionários com a função "Logística / Entregador" em Cadastros para atribuir entregas.</p>
          </div>
        </div>
      )}
    </div>
  );
}
