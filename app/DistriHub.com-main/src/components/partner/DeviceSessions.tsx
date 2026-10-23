import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

type DeviceSession = { id: string; name: string; branch_id: string | null; branch_name: string | null; last_seen: string; is_current: boolean; can_revoke: boolean };
export function DeviceSessions({ companyId, onChanged }: { companyId: string; onChanged?: () => void }) {
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const lock = useRef(false);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    if (!supabase) return;
    const { data, error: failure } = await supabase.rpc('list_saas_device_sessions', { p_company_id: companyId });
    if (request !== sequence.current) return;
    if (failure) { setError(failure.message); setSessions([]); }
    else { setError(''); setSessions(Array.isArray(data) ? data : []); }
  }, [companyId]);
  useEffect(() => { setSessions([]); void load(); const timer = window.setInterval(() => void load(), 30000);
    return () => { invalidate(); window.clearInterval(timer); };
  }, [load, invalidate]);
  async function revoke(id: string) {
    if (!supabase || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const { error: failure } = await supabase.rpc('revoke_saas_device_session', { p_session_id: id });
      if (failure) throw failure;
      setConfirmId(null); await load(); onChanged?.();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível encerrar a sessão.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="module-card" aria-label="Dispositivos conectados">
    <h4>Dispositivos conectados</h4>
    <p>O limite vale por filial. Abas com a mesma sessão contam como um acesso. Sessões sem contato por 3 minutos liberam a vaga automaticamente.</p>
    <button type="button" className="rma-advance-btn" disabled={busy} onClick={() => void load()}>Atualizar dispositivos</button>
    {error && <p role="alert">{error}</p>}
    {!sessions.length && !error && <p>Nenhuma sessão ativa encontrada.</p>}
    {sessions.map(session => <div key={session.id} className="subscription-session-row">
      <strong>{session.name}{session.is_current ? ' (este dispositivo)' : ''}</strong>
      <span>Filial: {session.branch_name ?? 'Não selecionada'}</span>
      <span>Último contato: {new Date(session.last_seen).toLocaleString('pt-BR')}</span>
      {session.can_revoke && <button type="button" className="rma-advance-btn" disabled={busy} onClick={() => setConfirmId(session.id)}>Encerrar sessão</button>}
      {confirmId === session.id && <div role="alert"><p>Encerrar este acesso? Confira se o terminal tem alguma venda em andamento. Ele precisará entrar novamente.</p>
        <button type="button" className="rma-advance-btn" disabled={busy} onClick={() => void revoke(session.id)}>Confirmar encerramento</button>
        <button type="button" className="rma-advance-btn" disabled={busy} onClick={() => setConfirmId(null)}>Voltar</button>
      </div>}
    </div>)}
  </section>;
}

export function DeviceAccessGate({ companyId, branchId, error, onBranchChange, onRetry, onLogout }: {
  companyId: string; branchId: string; error: string | null;
  onBranchChange: (id: string) => void; onRetry: () => void; onLogout: () => void;
}) {
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [branchError, setBranchError] = useState('');
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!supabase) return;
      const { data, error: failure } = await supabase.rpc('list_saas_access_branches', { p_company_id: companyId });
      if (!active) return;
      if (failure) setBranchError(failure.message);
      else setBranches(Array.isArray(data) ? data : []);
    })();
    return () => { active = false; };
  }, [companyId]);
  return <div className="partner-panel"><div className="module-card">
    <h3>Acesso deste dispositivo</h3>
    {error ? <p role="alert">{error}</p> : <p role="status">Verificando disponibilidade de acesso...</p>}
    {branchError && <p role="alert">{branchError}</p>}
    {branches.length > 0 && <label>Filial deste dispositivo<select value={branchId} onChange={e => onBranchChange(e.target.value)}>
      <option value="" disabled>Selecione uma filial</option>
      {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
    </select></label>}
    <button type="button" className="module-submit-btn" onClick={onRetry}>Tentar novamente</button>
    <button type="button" className="rma-advance-btn" onClick={onLogout}>Sair da conta</button>
    <DeviceSessions companyId={companyId} onChanged={onRetry} />
  </div></div>;
}
