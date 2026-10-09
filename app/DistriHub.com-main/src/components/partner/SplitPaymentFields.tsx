import { money } from '../../utils';
import { draftPayments, salePaymentLabels, type SplitPaymentDraft } from '../../lib/pdv';

export function SplitPaymentFields({ total, value, onChange, disabled = false }: {
  total: number; value: SplitPaymentDraft; onChange: (value: SplitPaymentDraft) => void; disabled?: boolean;
}) {
  const paid = draftPayments(value).reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
  const remaining = (Math.round(total * 100) - paid) / 100;
  const otherCents = Math.round(Number(value.dinheiro || 0) * 100) + Math.round(Number(value.cartao || 0) * 100);
  return <fieldset className="split-payment-panel" disabled={disabled}>
    <legend>Pagamento dividido</legend>
    <div className="split-payment-fields">{(['dinheiro', 'pix', 'cartao'] as const).map(method => <label key={method}>{salePaymentLabels[method]} (R$)
      <input type="number" min="0" max="99999999.99" step="0.01" inputMode="decimal" aria-label={`Valor em ${salePaymentLabels[method]}`} value={value[method]} onChange={event => onChange({ ...value, [method]: event.target.value })} />
    </label>)}</div>
    <div className="split-payment-summary"><span>{Number.isFinite(remaining) ? remaining === 0 ? 'Total dos pagamentos conferido' : remaining > 0 ? `Faltam ${money.format(remaining)}` : `Excedeu ${money.format(-remaining)}` : 'Confira os valores informados'}</span>
      <button type="button" className="rma-advance-btn" disabled={!Number.isFinite(otherCents) || otherCents >= Math.round(total * 100)} onClick={() => onChange({ ...value, pix: ((Math.round(total * 100) - otherCents) / 100).toFixed(2) })}>Completar restante no PIX</button>
    </div>
  </fieldset>;
}
