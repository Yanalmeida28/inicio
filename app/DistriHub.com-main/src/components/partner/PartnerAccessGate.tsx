import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { Lock, Shield, UserCheck, X } from 'lucide-react';
import type { PartnerIdentity } from '../../types';
import { supabase } from '../../lib/supabase';
import { authorizeOwner, authorizePin, type PartnerAccess, type PinOperator } from '../../lib/partnerAccess';
import { OperatorSelectionStore } from '../../lib/checkoutCash';
import { useDeviceHeartbeat } from '../../hooks/useDeviceHeartbeat';

type Mode = 'employee' | 'owner';
type Props = {
  user: User | null;
  identity: PartnerIdentity | null;
  identityError?: string | null;
  onRetryIdentity?: () => void;
  onSwitchAccount: () => Promise<void>;
  children: (operator: PinOperator | null, requestAccess: (mode: Mode) => void, accessLocked: boolean) => ReactNode;
};

// Render the actual panel immediately, with operational access locked until
// confirmed. A saved operator selection is never an authorization.
export function PartnerAccessGate({ user, identity, identityError, onRetryIdentity, onSwitchAccount, children }: Props) {
  const scope = identity ? `${identity.authUserId}:${identity.companyUserId}` : '';
  const [authorized, setAuthorized] = useState<{ scope: string; access: PartnerAccess } | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const current = authorized?.scope === scope ? authorized.access : null;
  function allow(access: PartnerAccess) {
    if (!identity) return;
    try { new OperatorSelectionStore(sessionStorage, scope).save({
      operatorId: access.kind === 'employee' ? access.operator.id : null,
      branchId: access.kind === 'employee' ? access.operator.branchId : '',
    }); } catch { /* PIN and password are never persisted. */ }
    setAuthorized({ scope, access });
    setMode(null);
  }
  if (!identity || !user) return <div className="partner-panel"><p role="status">
    {identityError || 'Validando sua sessão…'}</p>
    {identityError && onRetryIdentity && <button type="button" className="module-submit-btn" onClick={onRetryIdentity}>Tentar novamente</button>}
  </div>;
  return <>
    {children(current?.kind === 'employee' ? current.operator : null, setMode, !current)}
    {mode && <PinAccessDialog key={`${scope}:${mode}`} mode={mode} prepareDevice={!current}
      identity={identity} user={user} onAuthorize={allow} onSwitchAccount={onSwitchAccount}
      onClose={() => setMode(null)} />}
  </>;
}

type DirectoryEntry = { id: string; name: string };
type DialogProps = {
  mode: Mode; prepareDevice?: boolean; identity: PartnerIdentity; user: User;
  onAuthorize: (access: PartnerAccess) => void; onSwitchAccount: () => Promise<void>; onClose?: () => void;
};

export function PinAccessDialog({ mode, prepareDevice = false, identity, user, onAuthorize, onSwitchAccount, onClose }: DialogProps) {
  const device = useDeviceHeartbeat(prepareDevice && mode === 'employee' ? identity.companyUserId : undefined, identity.salespersonId ? identity.branchId : null);
  const directoryReady = !prepareDevice || device.ready;
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [selected, setSelected] = useState(identity.salespersonId ?? '');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const pending = useRef(false);
  const generation = useRef({ value: 0 });
  useEffect(() => {
    if (mode !== 'employee' || !directoryReady) return;
    const lifetime = generation.current;
    let live = true;
    setLoading(true); setDirectoryError('');
    async function load() {
      try {
        if (!supabase) throw new Error('Serviço indisponível.');
        let query = supabase.from('partner_salespeople').select('id,name').eq('user_id', identity.companyUserId).eq('active', true).order('name');
        if (identity.salespersonId) query = query.eq('id', identity.salespersonId);
        const { data, error: cause } = await query;
        if (cause) throw cause;
        if (!live) return;
        const rows = (data ?? []) as DirectoryEntry[];
        setDirectory(rows);
        let saved = identity.salespersonId ?? '';
        try { saved ||= new OperatorSelectionStore(sessionStorage, `${identity.authUserId}:${identity.companyUserId}`).read()?.operatorId ?? ''; }
        catch { /* PIN must still be entered. */ }
        setSelected(rows.some(row => row.id === saved) ? saved : '');
      } catch { if (live) setDirectoryError('Não foi possível carregar os colaboradores. Tente novamente.'); }
      finally { if (live) setLoading(false); }
    }
    void load();
    return () => { live = false; lifetime.value++; };
  }, [identity.authUserId, identity.companyUserId, identity.salespersonId, retry, mode, directoryReady]);
  useEffect(() => {
    generation.current.value++; pending.current = false; setBusy(false);
    setPin(''); setPassword(''); setError('');
  }, [mode, selected]);
  function close() { if (!pending.current) onClose?.(); }
  async function exitAccount() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await onSwitchAccount(); }
    catch { setError('Não foi possível sair da conta. Tente novamente.'); }
    finally { pending.current = false; setBusy(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || (mode === 'employee' && !directoryReady)) return;
    pending.current = true; setBusy(true); setError('');
    const attempt = ++generation.current.value;
    try {
      if (mode === 'owner' && identity.salespersonId) { await onSwitchAccount(); return; }
      const access = mode === 'owner'
        ? await authorizeOwner(identity, user, password)
        : await authorizePin(identity, selected, directory.find(row => row.id === selected)?.name ?? 'Colaborador', pin);
      if (attempt === generation.current.value) { setPin(''); setPassword(''); onAuthorize(access); }
    } catch (cause) {
      if (attempt === generation.current.value) setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar o acesso.');
    } finally {
      if (attempt === generation.current.value) { pending.current = false; setBusy(false); }
    }
  }
  const owner = mode === 'owner';
  return <div className="modal-backdrop" onClick={close}>
    <div className="modal-content operator-selection-modal" role="dialog" aria-modal="true"
      aria-labelledby="operator-access-title" onClick={event => event.stopPropagation()}>
      <div className="modal-header"><h3 id="operator-access-title">
        {owner ? <Shield size={18} /> : <UserCheck size={18} />}{' '}
        {owner ? 'Acesso do proprietário' : 'Acesso do colaborador'}</h3>
        {onClose && <button type="button" aria-label="Fechar" disabled={busy} onClick={close}><X size={18} /></button>}
      </div>
      <div className="rma-form">
        <form onSubmit={submit} className="rma-form">
          {!owner ? <>
            {device.error && <p role="alert">{device.error} <button type="button" onClick={device.retry}>Tentar novamente</button></p>}
            <p>Selecione seu nome e digite o PIN para entrar diretamente na sua filial.</p>
            <label>Colaborador<select aria-label="Colaborador" value={selected} disabled={busy || loading || !directoryReady} onChange={event => setSelected(event.target.value)} required>
              <option value="">{loading ? 'Carregando…' : 'Selecione seu nome'}</option>
              {directory.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select></label>
            <label><Lock size={14} /> PIN de acesso<input aria-label="PIN de acesso" type="password" inputMode="numeric" autoComplete="off"
              value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ''))} minLength={4} maxLength={8} required disabled={busy} /></label>
            {directoryError && <p role="alert">{directoryError} <button type="button" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></p>}
            {!loading && !directoryError && directory.length === 0 && <p role="status">Nenhum colaborador ativo disponível nesta conta. Verifique o cadastro na Área do proprietário.</p>}
          </> : identity.salespersonId ? <p>Para liberar o acesso geral, entre com a conta do proprietário.</p> : <>
            <p>Confirme a senha do proprietário para liberar todas as filiais.</p>
            <label>Senha do proprietário<input aria-label="Senha do proprietário" type="password" autoComplete="current-password" value={password}
              onChange={event => setPassword(event.target.value)} required disabled={busy} /></label>
          </>}
          {error && <p role="alert" className="otp-error-msg">{error}</p>}
          <button className="module-submit-btn" disabled={busy || (!owner && (!directoryReady || loading || Boolean(directoryError) || directory.length === 0))}>
            {busy ? 'Conferindo…' : owner ? identity.salespersonId ? 'Entrar com a conta do proprietário' : 'Confirmar proprietário' : 'Entrar na minha filial'}
          </button>
          {onClose && <button type="button" className="rma-advance-btn" disabled={busy} onClick={close}>Cancelar</button>}
          {!onClose && <button type="button" className="rma-advance-btn" disabled={busy} onClick={() => void exitAccount()}>Sair da conta</button>}
        </form>
      </div>
    </div>
  </div>;
}
