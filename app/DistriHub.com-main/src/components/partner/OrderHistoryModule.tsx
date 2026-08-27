import { useMemo, useState } from 'react';
import { ClipboardList, PackageCheck, Search } from 'lucide-react';
import type { B2BOrder } from '../../types';
import { money } from '../../utils';

type Props = { orders: B2BOrder[] };

const statusMap: Record<string, { label: string; color: string }> = {
  pendente: { label: 'Pendente', color: '#e6a06d' },
  pago: { label: 'Pago', color: '#5bbc87' },
  concluido: { label: 'Concluído', color: '#5bbc87' },
  cancelado: { label: 'Cancelado', color: '#e3829b' },
  em_producao: { label: 'Em produção', color: '#7eb1ff' },
  enviado: { label: 'Enviado', color: '#62d0ff' },
  entregue: { label: 'Entregue', color: '#3fbf8d' },
};

const paymentMap: Record<string, string> = {
  pix: 'PIX',
  cartao: 'Cartão',
  faturado: 'Faturado',
  rma: 'RMA',
  dinheiro: 'Dinheiro',
};

export function OrderHistoryModule({ orders }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredOrders = useMemo(() => {
    const term = search.toLowerCase();
    return orders.filter((order) => {
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      const matchesSearch =
        !term ||
        order.business_name?.toLowerCase().includes(term) ||
        order.id.toLowerCase().includes(term) ||
        (order.payment_method ?? '').toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [orders, search, statusFilter]);

  const totalValue = filteredOrders.reduce((sum, order) => sum + order.total, 0);
  const pendingCount = filteredOrders.filter((order) => order.status === 'pendente').length;

  return (
    <div className="panel-module">
      <div className="module-header">
        <span className="module-icon"><ClipboardList size={20} /></span>
        <div>
          <h3>Histórico de Compras</h3>
          <p>Pedidos realizados por esta conta na plataforma</p>
        </div>
      </div>

      <div className="orders-filter-bar" style={{ marginBottom: '16px' }}>
        <div className="orders-filter-row">
          <label className="orders-filter-field">
            <Search size={14} /> Buscar pedido
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pedido, loja ou pagamento"
            />
          </label>

          <label className="orders-filter-field">
            Status
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todos</option>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="concluido">Concluído</option>
              <option value="em_producao">Em produção</option>
              <option value="enviado">Enviado</option>
              <option value="entregue">Entregue</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </label>
        </div>
      </div>

      <div className="orders-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <div className="orders-summary-card" style={{ padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', background: '#0f1f2c' }}>
          <small style={{ color: '#8ba3b5' }}>Pedidos</small>
          <strong style={{ display: 'block', fontSize: '22px', marginTop: '6px' }}>{filteredOrders.length}</strong>
        </div>
        <div className="orders-summary-card" style={{ padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', background: '#0f1f2c' }}>
          <small style={{ color: '#8ba3b5' }}>Valor total</small>
          <strong style={{ display: 'block', fontSize: '22px', marginTop: '6px' }}>{money.format(totalValue)}</strong>
        </div>
        <div className="orders-summary-card" style={{ padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', background: '#0f1f2c' }}>
          <small style={{ color: '#8ba3b5' }}>Pendentes</small>
          <strong style={{ display: 'block', fontSize: '22px', marginTop: '6px' }}>{pendingCount}</strong>
        </div>
      </div>

      <div className="stock-table-wrap">
        <table className="rma-table">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Loja</th>
              <th>Data</th>
              <th>Total</th>
              <th>Pagamento</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length === 0 ? (
              <tr><td colSpan={6} className="empty-row"><PackageCheck size={18} /> Nenhuma compra registrada.</td></tr>
            ) : filteredOrders.map((order) => {
              const mappedStatus = statusMap[order.status] ?? { label: order.status, color: '#7f97a9' };
              const mappedPayment = paymentMap[order.payment_method ?? ''] ?? order.payment_method ?? '—';

              return (
                <tr key={order.id}>
                  <td><strong>#{order.id.slice(0, 8)}</strong></td>
                  <td>{order.business_name ?? '—'}</td>
                  <td>{new Date(order.created_at).toLocaleDateString('pt-BR')}</td>
                  <td>{money.format(order.total)}</td>
                  <td>{mappedPayment}</td>
                  <td>
                    <span className="rma-status-badge" style={{ color: mappedStatus.color, borderColor: mappedStatus.color }}>
                      {mappedStatus.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
