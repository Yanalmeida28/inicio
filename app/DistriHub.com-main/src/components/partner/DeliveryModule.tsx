import { useState } from 'react';
import {
  Truck, MapPin, Package, Check, Clock, X, Phone, Navigation,
} from 'lucide-react';
import type { PartnerSale, PartnerSalesperson } from '../../types';
import { money } from '../../utils';

type DeliveryStatus = 'pendente' | 'em_rota' | 'entregue' | 'falhou';

type Delivery = {
  saleId: string;
  customerName: string;
  address: string;
  items: number;
  total: number;
  status: DeliveryStatus;
  driverId: string | null;
  phone: string;
};

type Props = {
  sales: PartnerSale[];
  salespeople: PartnerSalesperson[];
  selectedBranchId: string | null;
};

const statusConfig: Record<DeliveryStatus, { label: string; color: string; icon: typeof Clock }> = {
  pendente: { label: 'Pendente', color: '#e6a06d', icon: Clock },
  em_rota: { label: 'Em Rota', color: '#55adf1', icon: Navigation },
  entregue: { label: 'Entregue', color: '#5bbc87', icon: Check },
  falhou: { label: 'Falhou', color: '#e3829b', icon: X },
};

export function DeliveryModule({ sales, salespeople, selectedBranchId }: Props) {
  const drivers = salespeople.filter((s) => s.role === 'logistica' && s.active);

  const [deliveries, setDeliveries] = useState<Delivery[]>(
    sales
      .filter((s) => s.status !== 'cancelada')
      .slice(0, 20)
      .map((s) => ({
        saleId: s.id,
        customerName: s.customer_name ?? 'Cliente',
        address: '',
        items: s.items.length,
        total: s.total,
        status: 'pendente' as DeliveryStatus,
        driverId: null,
        phone: '',
      }))
  );

  const [filter, setFilter] = useState<DeliveryStatus | 'all'>('all');

  const filtered = filter === 'all' ? deliveries : deliveries.filter((d) => d.status === filter);

  function updateStatus(saleId: string, status: DeliveryStatus) {
    setDeliveries((prev) => prev.map((d) => d.saleId === saleId ? { ...d, status } : d));
  }

  function assignDriver(saleId: string, driverId: string) {
    setDeliveries((prev) => prev.map((d) => d.saleId === saleId ? { ...d, driverId: driverId || null } : d));
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
                const driver = drivers.find((s) => s.id === d.driverId);
                return (
                  <tr key={d.saleId}>
                    <td>
                      <strong>{d.customerName}</strong>
                      {d.address && <small><MapPin size={10} /> {d.address}</small>}
                    </td>
                    <td>{d.items} {d.items === 1 ? 'item' : 'itens'}</td>
                    <td>{money.format(d.total)}</td>
                    <td>
                      <select
                        value={d.driverId ?? ''}
                        onChange={(e) => assignDriver(d.saleId, e.target.value)}
                        className="inline-input"
                        style={{ width: 'auto', minWidth: '120px' }}
                      >
                        <option value="">Sem entregador</option>
                        {drivers.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className="rma-status-badge" style={{ color: cfg.color, borderColor: cfg.color }}>
                        <cfg.icon size={11} style={{ display: 'inline', marginRight: '4px' }} />
                        {cfg.label}
                      </span>
                    </td>
                    <td>
                      <div className="row-action-group">
                        {d.status !== 'em_rota' && (
                          <button
                            className="rma-advance-btn"
                            onClick={() => updateStatus(d.saleId, 'em_rota')}
                            title="Marcar Em Rota"
                          >
                            <Navigation size={14} />
                          </button>
                        )}
                        {d.status !== 'entregue' && (
                          <button
                            className="rma-advance-btn"
                            onClick={() => updateStatus(d.saleId, 'entregue')}
                            title="Marcar Entregue"
                          >
                            <Check size={14} />
                          </button>
                        )}
                        {d.status !== 'falhou' && d.status !== 'entregue' && (
                          <button
                            className="rma-advance-btn danger"
                            onClick={() => updateStatus(d.saleId, 'falhou')}
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
