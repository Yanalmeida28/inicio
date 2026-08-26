import { ClipboardList, PackageCheck } from 'lucide-react';
import type { B2BOrder } from '../../types';
import { money } from '../../utils';

type Props = { orders: B2BOrder[] };

export function OrderHistoryModule({ orders }: Props) {
  return (
    <div className="panel-module">
      <div className="module-header">
        <span className="module-icon"><ClipboardList size={20} /></span>
        <div>
          <h3>Histórico de Compras</h3>
          <p>Pedidos realizados por esta conta na plataforma</p>
        </div>
      </div>
      <div className="stock-table-wrap">
        <table className="rma-table">
          <thead><tr><th>Pedido</th><th>Data</th><th>Total</th><th>Pagamento</th><th>Status</th></tr></thead>
          <tbody>
            {orders.length === 0 ? (
              <tr><td colSpan={5} className="empty-row"><PackageCheck size={18} /> Nenhuma compra registrada.</td></tr>
            ) : orders.map((order) => (
              <tr key={order.id}>
                <td><strong>#{order.id.slice(0, 8)}</strong></td>
                <td>{new Date(order.created_at).toLocaleDateString('pt-BR')}</td>
                <td>{money.format(order.total)}</td>
                <td>{order.payment_method ?? '—'}</td>
                <td><span className="rma-status-badge">{order.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
