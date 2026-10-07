import { useRef, useState } from 'react';
import type { PartnerSale } from '../../types';
import { money } from '../../utils';
import { pdvErrorMessage } from '../../lib/pdv';

type Props = {
  sale: PartnerSale;
  selectedBranchId: string | null;
  canCheckout: boolean;
  onFinalize: (id: string, paymentMethod: string) => Promise<void>;
  onClose: () => void;
};

export function PreSaleCheckout({ sale, selectedBranchId, canCheckout, onFinalize, onClose }: Props) {
  const [paymentMethod, setPaymentMethod] = useState(sale.payment_method || 'pix');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const available = sale.status === 'pre_venda' && sale.branch_id === selectedBranchId;

  async function finalize() {
    if (!available || !canCheckout || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try { await onFinalize(sale.id, paymentMethod); onClose(); }
    catch (failure) { setError(pdvErrorMessage(failure)); }
    finally { inFlight.current = false; setSaving(false); }
  }

  return <div className="pdv-cart-panel">
    <h4>Pré-venda resgatada — #{sale.id.slice(0, 8).toUpperCase()}</h4>
    <p><strong>{sale.customer_name || 'Cliente'}</strong></p>
    <div className="pdv-cart-items">
      {sale.items.map((item, index) => <div className="pdv-cart-item" key={`${item.product_id}-${index}`}>
        <div><strong>{item.name}</strong><small>{item.quantity} × {money.format(item.unit_price)}</small></div>
        <strong>{money.format(item.quantity * item.unit_price)}</strong>
      </div>)}
    </div>
    <label>Forma de pagamento
      <select value={paymentMethod} disabled={saving || !available} onChange={event => setPaymentMethod(event.target.value)}>
        <option value="pix">PIX</option><option value="dinheiro">Dinheiro</option>
        <option value="cartao">Cartão</option><option value="faturado">Faturado</option>
      </select>
    </label>
    <div className="pdv-total-bar"><span>Total da pré-venda</span><strong>{money.format(sale.total)}</strong></div>
    {!available && <p role="alert">Esta pré-venda já foi finalizada ou não pertence à filial selecionada.</p>}
    {error && <p className="otp-error-msg" role="alert">{error}</p>}
    <div className="otp-actions">
      <button className="rma-advance-btn" disabled={saving} onClick={onClose}>Voltar ao PDV</button>
      <button className="module-submit-btn" disabled={saving || !available || !canCheckout} onClick={() => void finalize()}>{saving ? 'Finalizando...' : 'Finalizar pré-venda'}</button>
    </div>
  </div>;
}
