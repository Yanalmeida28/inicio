import { useRef, useState } from 'react';
import { Shield, UserCheck, X } from 'lucide-react';

type Props = {
  mode: 'employee' | 'owner';
  onClose: () => void;
  onContinue: () => Promise<void>;
};

export function AccountAccessDialog({ mode, onClose, onContinue }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const owner = mode === 'owner';

  async function proceed() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try { await onContinue(); }
    catch { setError('Não foi possível encerrar a sessão. Tente novamente.'); }
    finally { lock.current = false; setBusy(false); }
  }

  return <div className="modal-backdrop" onClick={() => { if (!busy) onClose(); }}>
    <div className="modal-content operator-selection-modal" role="dialog" aria-modal="true"
      aria-labelledby="account-access-title" onClick={event => event.stopPropagation()}>
      <div className="modal-header">
        <h3 id="account-access-title">{owner ? <Shield size={18} /> : <UserCheck size={18} />}{' '}
          {owner ? 'Área do proprietário' : 'Trocar conta de funcionário'}</h3>
        <button type="button" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={18} /></button>
      </div>
      <div className="rma-form">
        <p>{owner
          ? 'Para acessar todas as filiais e as configurações da empresa, entre com o e-mail e a senha do proprietário.'
          : 'Cada funcionário deve entrar com seu próprio e-mail e senha. O acesso segue a filial e as permissões cadastradas para essa conta.'}</p>
        <p>A sessão atual será encerrada. Salve o trabalho em andamento antes de continuar.</p>
        {error && <p role="alert" className="otp-error-msg">{error}</p>}
        <button type="button" className="module-submit-btn" disabled={busy} onClick={() => void proceed()}>
          {busy ? 'Encerrando sessão…' : owner ? 'Continuar para o login do proprietário' : 'Continuar para o login do funcionário'}
        </button>
        <button type="button" className="rma-advance-btn" disabled={busy} onClick={onClose}>Cancelar</button>
      </div>
    </div>
  </div>;
}
