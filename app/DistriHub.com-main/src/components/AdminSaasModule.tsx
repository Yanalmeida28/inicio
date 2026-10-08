import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { saasAccessDateForInput, saasInvoiceLabels, saasStatusLabels, type SaasOverview, type SaasPlanId, type SaasSubscription } from '../lib/saas';
import { money } from '../utils';
import { saasAdminDraft, saasAdminError, type SaasAdminAction } from '../lib/saasAdminControls';

const date = (value: string | null) => value ? new Date(value).toLocaleDateString('pt-BR') : '—';
export function AdminSaasModule({ view, initialCompanyId, onChanged }: { view: 'subscriptions' | 'invoices' | 'financial'; initialCompanyId?: string | null; onChanged?: () => void }) {
  const [data, setData] = useState<SaasOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<SaasSubscription | null>(null);
  const [reason, setReason] = useState('');
  const [cancelInvoice, setCancelInvoice] = useState<string | null>(null);
  const [cancelRenewal, setCancelRenewal] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [accessFilter, setAccessFilter] = useState('all');
  const [message, setMessage] = useState<string | null>(null);
  const openedCompany = useRef<string | null>(null);
  const mutationPending = useRef(false);
  const refresh = useCallback(async () => {
    if (!supabase) { setError('Supabase não configurado.'); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const { data: overview, error: rpcError } = await supabase.rpc('get_saas_admin_overview');
      if (rpcError) throw rpcError;
      setData(overview as SaasOverview);
    } catch (failure) { setError(saasAdminError(failure)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!initialCompanyId || !data || openedCompany.current === initialCompanyId) return;
    const company = data.subscriptions.find(s => s.company_id === initialCompanyId);
    if (company) { openedCompany.current = initialCompanyId; setEditing(saasAdminDraft(company, 'manage')); }
  }, [initialCompanyId, data]);
  function edit(subscription: SaasSubscription, action: SaasAdminAction = 'manage') {
    setEditing(saasAdminDraft(subscription, action)); setCancelInvoice(null); setCancelRenewal(null); setReason(''); setError(null); setMessage(null);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || mutationPending.current) return;
    mutationPending.current = true;
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = editing ? await supabase.rpc('admin_update_saas_subscription', {
        p_company_id: editing.company_id, p_plan_id: editing.plan_id, p_billing_mode: editing.billing_mode,
        p_full_access: editing.full_access, p_status: editing.status, p_reason: reason,
        p_admin_access_until: editing.admin_access_until,
      }) : cancelRenewal ? await supabase.rpc('cancel_saas_renewal', { p_company_id: cancelRenewal, p_reason: reason })
        : await supabase.rpc('admin_cancel_saas_invoice', { p_invoice_id: cancelInvoice, p_reason: reason });
      if (result.error) throw result.error;
      setMessage(editing ? `${editing.company_name}: configuração salva. ${result.data?.can_access ? 'Acesso ao aplicativo liberado.' : 'Acesso ao aplicativo bloqueado.'}`
        : cancelRenewal ? 'Renovação cancelada. O período já pago permanece disponível.' : 'Cancelamento da cobrança registrado.');
      setEditing(null); setCancelInvoice(null); setCancelRenewal(null); setReason('');
      await refresh();
      onChanged?.();
    } catch (failure) { setError(saasAdminError(failure)); }
    finally { mutationPending.current = false; setBusy(false); }
  }
  const subscriptions = data?.subscriptions ?? [];
  const invoices = data?.invoices ?? [];
  const paid = invoices.filter(i => i.status === 'paid');
  const pending = invoices.filter(i => i.status === 'pending');
  const filtered = subscriptions.filter(s => (!search || `${s.company_name ?? ''} ${s.company_id}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
    && (accessFilter === 'all' || (accessFilter === 'allowed' && s.can_access) || (accessFilter === 'blocked' && !s.can_access) || (accessFilter === 'exempt' && s.billing_mode === 'exempt')));
  return <section className="panel-module">
    <div className="module-header"><div><h3>{view === 'subscriptions' ? 'Controle de acesso ao aplicativo' : view === 'financial' ? 'Financeiro SaaS' : 'Faturas SaaS'}</h3>
      <p>Controle quem pode utilizar o DistriHub, o plano e a cobrança de cada empresa.</p></div>
      <button className="rma-advance-btn" disabled={loading || busy} onClick={() => { void refresh(); }}>Atualizar</button>
    </div>
    {loading && <p role="status">Carregando assinaturas...</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {data && view === 'subscriptions' && <>
      <div className="admin-financial-kpis">
        {[
          ['Empresas cadastradas', subscriptions.length], ['Acesso liberado', subscriptions.filter(s => s.can_access).length],
          ['Acesso bloqueado', subscriptions.filter(s => !s.can_access).length], ['Isentas de cobrança', subscriptions.filter(s => s.billing_mode === 'exempt').length],
        ].map(([label, value]) => <div className="admin-financial-kpi" key={label}><small>{label}</small><strong>{value}</strong></div>)}
      </div>
      <div className="rma-form inline">
        <label>Buscar empresa<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome da empresa" /></label>
        <label>Mostrar<select value={accessFilter} onChange={e => setAccessFilter(e.target.value)}>
          <option value="all">Todas as empresas</option><option value="allowed">Com acesso liberado</option><option value="blocked">Com acesso bloqueado</option><option value="exempt">Isentas de cobrança</option>
        </select></label>
      </div>
    </>}
    {data && view === 'financial' && <div className="admin-financial-kpis">
      {[
        ['Recebido', money.format(paid.reduce((sum, i) => sum + Number(i.amount), 0))],
        ['Pendente', money.format(pending.reduce((sum, i) => sum + Number(i.amount), 0))],
        ['Assinaturas com acesso', subscriptions.filter(s => s.can_access).length],
        ['Contas isentas', subscriptions.filter(s => s.billing_mode === 'exempt').length],
      ].map(([label, value]) => <div className="admin-financial-kpi" key={label}><small>{label}</small><strong>{value}</strong></div>)}
    </div>}
    {data && view === 'subscriptions' && <div className="stock-table-wrap"><table className="rma-table">
      <thead><tr><th>Empresa</th><th>Plano</th><th>Cobrança</th><th>Status</th><th>Acesso ao app</th><th>Renovação</th><th>Controles</th></tr></thead>
      <tbody>{filtered.map(s => <tr key={s.company_id}>
        <td>{s.company_name}</td><td>{s.effective_plan}</td><td>{s.billing_mode === 'exempt' ? 'Isenta' : money.format(s.monthly_amount)}</td>
        <td>{saasStatusLabels[s.status]}</td><td>{s.can_access ? 'Liberado' : 'Bloqueado'}</td><td>{s.auto_renew ? 'Ativa' : 'Desativada'}</td>
        <td><div className="subscription-actions">
          <button className="rma-advance-btn" disabled={busy || loading} onClick={() => edit(s)}>Gerenciar</button>
          <button className="rma-advance-btn" disabled={busy || loading} onClick={() => edit(s, s.can_access ? 'suspend' : 'activate')}>{s.can_access ? 'Suspender acesso' : 'Ativar acesso'}</button>
          {s.billing_mode !== 'exempt' && <button className="rma-advance-btn" disabled={busy || loading} onClick={() => edit(s, 'exempt')}>Isentar cobrança</button>}
          {s.auto_renew && <button className="rma-advance-btn" disabled={busy || loading} onClick={() => { setCancelRenewal(s.company_id); setEditing(null); setCancelInvoice(null); setReason(''); setMessage(null); }}>Cancelar renovação</button>}
        </div></td>
      </tr>)}</tbody>
    </table>{!filtered.length && <p>Nenhuma empresa encontrada.</p>}</div>}
    {data && view === 'invoices' && <div className="stock-table-wrap"><table className="rma-table">
      <thead><tr><th>Empresa</th><th>Valor</th><th>Período</th><th>Status</th><th>Pago em</th><th>Ações</th></tr></thead>
      <tbody>{invoices.map(i => <tr key={i.id}>
        <td>{i.company_name}</td><td>{money.format(i.amount)}</td><td>{date(i.period_start)} a {date(i.period_end)}</td>
        <td>{saasInvoiceLabels[i.status]}</td><td>{date(i.paid_at)}</td><td>{i.status === 'pending' &&
          <button className="rma-advance-btn" disabled={busy} onClick={() => { setCancelInvoice(i.id); setCancelRenewal(null); setEditing(null); setReason(''); setMessage(null); }}>Cancelar cobrança</button>}</td>
      </tr>)}</tbody>
    </table>{!invoices.length && <p>Nenhuma cobrança registrada.</p>}</div>}
    {!!data?.jobs.length && <div className="module-card"><h4>Cancelamentos no gateway</h4>
      {data.jobs.map(job => <p key={job.id}>{subscriptions.find(s => s.company_id === job.company_id)?.company_name ?? job.company_id}: {job.status}{job.last_error ? ` · ${job.last_error}` : ''}</p>)}
    </div>}
    {(editing || cancelInvoice || cancelRenewal) && <form className="rma-form module-card" onSubmit={save}>
      <h4>{editing ? `Controlar acesso: ${editing.company_name}` : cancelRenewal ? 'Cancelar renovação' : 'Cancelar cobrança pendente'}</h4>
      {editing && <>
        <label>Plano<select value={editing.plan_id} disabled={busy} onChange={e => setEditing({ ...editing, plan_id: e.target.value as SaasPlanId })}>
          <option value="basico">Básico</option><option value="profissional">Profissional</option><option value="enterprise">Enterprise</option>
        </select></label>
        <label>Cobrança da empresa<select value={editing.billing_mode} disabled={busy} onChange={e => setEditing({ ...editing, billing_mode: e.target.value as 'paid' | 'exempt', full_access: false })}>
          <option value="paid">Cobrar mensalidade do plano</option><option value="exempt">Isentar de cobrança</option>
        </select></label>
        {editing.billing_mode === 'exempt' && <label><input type="checkbox" checked={editing.full_access} disabled={busy} onChange={e => setEditing({ ...editing, full_access: e.target.checked })} /> Liberar todos os recursos</label>}
        <label>Situação do acesso<select value={editing.status} disabled={busy} onChange={e => setEditing({ ...editing, status: e.target.value as SaasSubscription['status'] })}>
          <option value="trial">Período de teste</option><option value="active">Ativado</option><option value="suspended">Suspenso — impedir uso do app</option><option value="cancelled">Assinatura cancelada</option>
        </select></label>
        <label>Liberar acesso até<input type="date" disabled={busy} value={saasAccessDateForInput(editing.admin_access_until)}
          onChange={e => setEditing({ ...editing, admin_access_until: e.target.value ? `${e.target.value}T23:59:59-03:00` : null })} /></label>
        <p>{editing.status === 'suspended' ? 'A suspensão bloqueia as operações da empresa e de seus funcionários, mesmo com pagamento ou isenção.'
          : editing.billing_mode === 'exempt' ? 'A empresa poderá utilizar o aplicativo sem mensalidade. Marque acesso completo para liberar todos os recursos.'
          : 'Para ativar sem pagamento ou teste vigente, defina uma data em Liberar acesso até. Essa liberação não registra pagamento.'}</p>
        <p>A mudança de plano encerra a renovação anterior no Mercado Pago. A remoção da isenção exige autorização de pagamento pelo titular.</p>
      </>}
      {cancelRenewal && <p>As próximas cobranças serão canceladas. O período já pago permanece disponível; use Suspender acesso para bloquear o uso do aplicativo.</p>}
      {cancelInvoice && <p>O cancelamento concede acesso até o fim desta cobrança e desativa a renovação. Pagamentos já recebidos exigem estorno no Mercado Pago.</p>}
      <label>Motivo<textarea required minLength={5} maxLength={500} disabled={busy} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <div className="subscription-actions"><button className="module-submit-btn" disabled={busy || reason.trim().length < 5}>{busy ? 'Salvando...' : 'Confirmar alteração'}</button>
        <button type="button" className="rma-advance-btn" disabled={busy} onClick={() => { setEditing(null); setCancelInvoice(null); setCancelRenewal(null); }}>Voltar</button></div>
    </form>}
  </section>;
}
