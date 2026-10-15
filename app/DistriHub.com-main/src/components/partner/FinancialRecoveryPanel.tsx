import { useEffect, useRef, useState } from 'react';
import type { FinancialRecovery } from '../../lib/invoicePayments';

export function FinancialRecoveryPanel({ actions = [], error = '', disabled = false }: { actions?: FinancialRecovery[]; error?: string; disabled?: boolean }) {
  const [busy, setBusy] = useState('');
  const [failure, setFailure] = useState('');
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (!actions.length && !error && !failure) return null;
  async function recover(action: FinancialRecovery) {
    if (lock.current || disabled) return;
    lock.current = true; setBusy(action.id); setFailure('');
    try { await action.run(); }
    catch (cause) { if (mounted.current) setFailure(cause instanceof Error ? cause.message : 'Não foi possível confirmar a operação.'); }
    finally { lock.current = false; if (mounted.current) setBusy(''); }
  }
  return <aside className="module-card" aria-label="Operações financeiras pendentes">
    <p>Há uma operação aguardando confirmação. Recuperar repete os mesmos dados e identificador.</p>
    {actions.map(action => <button key={action.id} type="button" className="rma-advance-btn" disabled={Boolean(busy) || disabled} onClick={() => void recover(action)}>{busy === action.id ? 'Confirmando…' : action.label}</button>)}
    {(error || failure) && <p role="alert">{error || failure}</p>}
  </aside>;
}
