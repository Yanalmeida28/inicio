import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

export function OwnerPasswordSettings() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    setConfigured(null); setError('');
    void (async () => {
      try {
        if (!supabase) throw new Error('Serviço indisponível.');
        const { data, error: cause } = await supabase.rpc('partner_owner_password_configured');
        if (cause || typeof data !== 'boolean') throw new Error('Não foi possível consultar a senha do proprietário.');
        if (active) setConfigured(data);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível consultar a senha.'); }
    })();
    return () => { active = false; };
  }, [revision]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || configured === null) return;
    setError(''); setSaved(false);
    if (password.length < 8 || new TextEncoder().encode(password).length > 72) { setError('Use pelo menos 8 caracteres e no máximo 72 bytes.'); return; }
    if (password !== confirmation) { setError('As novas senhas não coincidem.'); return; }
    if (!current) { setError('Informe a senha atual.'); return; }
    pending.current = true; setBusy(true);
    try {
      if (!supabase) throw new Error('Serviço indisponível.');
      const { data, error: cause } = await supabase.rpc('change_partner_owner_password', {
        p_current_password: current, p_new_password: password,
      });
      if (cause || data !== true) throw new Error('Senha atual incorreta ou acesso temporariamente bloqueado por tentativas.');
      setCurrent(''); setPassword(''); setConfirmation(''); setConfigured(true); setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a senha.'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className="module-card">
    <h3>Senha da Área do proprietário</h3>
    <p>Esta senha libera o acesso geral às filiais. Alterá-la não modifica a senha de login.</p>
    {configured === false && <p>Para cadastrar sua senha exclusiva pela primeira vez, confirme a senha de login atual.</p>}
    {configured === null && !error && <p role="status">Verificando configuração…</p>}
    {configured !== null && <form className="rma-form" onSubmit={save}>
      <label>{configured ? 'Senha atual da Área do proprietário' : 'Senha de login atual'}<input aria-label="Senha atual do proprietário" type="password" autoComplete="current-password" value={current} onChange={event => setCurrent(event.target.value)} required disabled={busy} /></label>
      <label>Nova senha da Área do proprietário<input aria-label="Nova senha do proprietário" type="password" autoComplete="new-password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required disabled={busy} /></label>
      <label>Confirmar nova senha<input aria-label="Confirmar senha do proprietário" type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={event => setConfirmation(event.target.value)} required disabled={busy} /></label>
      <button className="module-submit-btn" disabled={busy}>{busy ? 'Salvando…' : configured ? 'Alterar senha do proprietário' : 'Cadastrar senha do proprietário'}</button>
    </form>}
    {error && <p role="alert">{error}{configured === null && <button type="button" onClick={() => setRevision(value => value + 1)}>Tentar novamente</button>}</p>}
    {saved && <p role="status">Senha da Área do proprietário salva. Sua senha de login continua igual.</p>}
  </section>;
}
