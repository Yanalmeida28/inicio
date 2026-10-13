import { useRef, useState } from 'react';
import type { RmaRequest } from '../../types';
import { OperationAttempts } from '../../lib/operationAttempts';
import { cashAmount } from '../../lib/cashRegister';
import { isDefinitiveSaleRejection, pdvErrorMessage } from '../../lib/pdv';

export type RmaRefundHandler = (id: string, amount: number, method: 'dinheiro' | 'pix' | 'cartao', reason: string, requestId: string) => Promise<void>;
type Payload = { amount: number; method: 'dinheiro' | 'pix' | 'cartao'; reason: string };

export function RmaRefundForm({ rma, onConfirm, onClose }: { rma: RmaRequest; onConfirm: RmaRefundHandler; onClose: () => void }) {
  const scope = `${rma.user_id}:${rma.branch_id}`;
  const kind = `rma-refund:${rma.id}`;
  const [store] = useState(() => new OperationAttempts(localStorage));
  const [initial] = useState(() => {
    try { return { attempt: store.pending<Payload>(scope, kind), error: '' }; }
    catch (error) { return { attempt: null, error: pdvErrorMessage(error) }; }
  });
  const [pending, setPending] = useState(initial.attempt);
  const [amount, setAmount] = useState(initial.attempt ? String(initial.attempt.payload.amount) : '');
  const [method, setMethod] = useState<Payload['method']>(initial.attempt?.payload.method ?? 'dinheiro');
  const [reason, setReason] = useState(initial.attempt?.payload.reason ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initial.error);
  const lock = useRef(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || initial.error) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const value = pending?.payload ?? { amount: cashAmount(amount), method, reason: reason.trim() };
      if (value.amount <= 0 || !value.reason || value.reason.length > 500) throw new Error('Informe valor maior que zero e um motivo de até 500 caracteres.');
      const attempt = pending ?? store.get(scope, kind, value);
      setPending(attempt);
      try { await onConfirm(rma.id, attempt.payload.amount, attempt.payload.method, attempt.payload.reason, attempt.id); }
      catch (failure) {
        const code = failure && typeof failure === 'object' && 'code' in failure ? String(failure.code) : '';
        if (isDefinitiveSaleRejection(code)) { store.confirm(scope, kind); setPending(null); }
        throw failure;
      }
      store.confirm(scope, kind); onClose();
    } catch (failure) { setError(pdvErrorMessage(failure)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="modal-overlay"><form className="modal-card rma-form" onSubmit={submit}>
    <h4>Registrar reembolso ao cliente</h4>
    <p>{rma.customer_name} · {rma.product_name} · {rma.quantity ?? 1} unidade(s)</p>
    <p>Registre somente após devolver o dinheiro ou confirmar o estorno no provedor. O sistema registra a saída no caixa aberto do operador, sem movimentar a peça ou executar transferências.</p>
    {pending && <p role="status">Existe uma tentativa sem confirmação. Recuperar reutiliza os mesmos dados e não registra um segundo reembolso.</p>}
    <fieldset disabled={busy || Boolean(pending) || Boolean(initial.error)}>
      <label>Valor devolvido (R$)<input aria-label="Valor do reembolso" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} required /></label>
      <label>Forma do recebimento a estornar<select aria-label="Forma do reembolso" value={method} onChange={event => setMethod(event.target.value as Payload['method'])}><option value="dinheiro">Dinheiro</option><option value="pix">PIX</option><option value="cartao">Cartão</option></select></label>
      <label>Motivo / comprovante<textarea aria-label="Motivo do reembolso" value={reason} onChange={event => setReason(event.target.value)} maxLength={500} required /></label>
    </fieldset>
    <p>O valor não pode superar os itens devolvidos nem o saldo recebido nessa forma. Crédito e reembolso são alternativas para a mesma solicitação.</p>
    {error && <p role="alert" className="form-error-msg">{error}</p>}
    <div className="pix-actions"><button type="submit" disabled={busy || Boolean(initial.error)} className="module-submit-btn">{busy ? 'Registrando...' : pending ? 'Recuperar reembolso pendente' : 'Confirmar reembolso realizado'}</button><button type="button" disabled={busy} className="rma-advance-btn" onClick={onClose}>Fechar</button></div>
  </form></div>;
}
