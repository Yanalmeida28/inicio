import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { saasAccessDateForInput, saasInvoiceLabels, saasStatusLabels, type SaasOverview, type SaasPlanId, type SaasSubscription } from '../lib/saas';
import { money } from '../utils';
import { saasAdminDraft, saasAdminError, type SaasAdminAction } from '../lib/saasAdminControls';
import { accessDeadline, accessExplanation, adminDay, downloadAdminCsv, matchesPeriod, monthlyReceipts, recurringRevenue } from '../lib/adminOverview';
import { AdminActivityModule, AdminPendingSummary } from './AdminActivityModule';
import { AdminResponsiveTable } from './AdminResponsiveTable';

const date = (value: string | null) => value ? new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
export function AdminSaasModule({ view, initialCompanyId, onChanged, onNavigate }: { view: 'subscriptions' | 'invoices' | 'financial' | 'overview' | 'history'; initialCompanyId?: string | null; onChanged?: () => void; onNavigate?: (tab: 'assinaturas' | 'faturas' | 'suporte' | 'planos') => void }) {
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
  const [planFilter, setPlanFilter] = useState('all');
  const [invoiceFilter, setInvoiceFilter] = useState('all');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
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
    if (mutationPending.current) return;
    if (!supabase) { setError('Supabase não configurado. As alterações não foram salvas.'); return; }
    if (reason.trim().length < 5 || reason.length > 500) {
      setError('Preencha o motivo da alteração com 5 a 500 caracteres para salvar.');
      return;
    }
    mutationPending.current = true;
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = editing ? await supabase.rpc('admin_update_saas_subscription', {
        p_company_id: editing.company_id, p_plan_id: editing.plan_id, p_billing_mode: editing.billing_mode,
        p_full_access: editing.full_access, p_status: editing.status, p_reason: reason.trim(),
        p_admin_access_until: editing.admin_access_until,
      }) : cancelRenewal ? await supabase.rpc('cancel_saas_renewal', { p_company_id: cancelRenewal, p_reason: reason })
        : await supabase.rpc('admin_cancel_saas_invoice', { p_invoice_id: cancelInvoice, p_reason: reason });
      if (result.error) throw result.error;
      if (editing && !result.data) throw new Error('O servidor não confirmou o salvamento. Suas alterações continuam no formulário.');
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
  const filteredInvoices = invoices.filter(i => `${i.company_name ?? ''} ${i.company_id} ${i.id}`.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))
    && (invoiceFilter === 'all' || i.status === invoiceFilter) && matchesPeriod(view === 'financial' && i.status === 'paid' ? i.paid_at : i.created_at, start, end));
  const paid = filteredInvoices.filter(i => i.status === 'paid');
  const pending = filteredInvoices.filter(i => i.status === 'pending');
  const expiring = subscriptions.filter(s => { const deadline = accessDeadline(s); return deadline && Date.parse(deadline) >= Date.now() && Date.parse(deadline) <= Date.now() + 7 * 86400000; });
  const filtered = subscriptions.filter(s => (!search || `${s.company_name ?? ''} ${s.company_id}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
    && (planFilter === 'all' || s.plan_id === planFilter)
    && (accessFilter === 'all' || (accessFilter === 'allowed' && s.can_access) || (accessFilter === 'blocked' && !s.can_access) || (accessFilter === 'exempt' && s.billing_mode === 'exempt') || (accessFilter === 'expiring' && expiring.includes(s)) || (accessFilter === 'trial' && s.status === 'trial')));
  const months = monthlyReceipts(filteredInvoices);
  return <section className="panel-module">
    <div className="module-header"><div><h3>{view === 'overview' ? 'Visão geral da plataforma' : view === 'history' ? 'Histórico administrativo' : view === 'subscriptions' ? 'Controle de acesso ao aplicativo' : view === 'financial' ? 'Financeiro SaaS' : 'Faturas SaaS'}</h3>
      <p>Controle quem pode utilizar o DistriHub, o plano e a cobrança de cada empresa.</p></div>
      <button className="rma-advance-btn" disabled={loading || busy} onClick={() => { void refresh(); }}>Atualizar</button>
    </div>
    {loading && <p role="status">Carregando assinaturas...</p>}
    {error && <p className="admin-feedback admin-feedback-error" role="alert">{error}</p>}
    {message && <p className="admin-feedback admin-feedback-success" role="status">{message}</p>}
    {view === 'history' && <AdminActivityModule subscriptions={subscriptions} />}
    {data && view === 'overview' && <>
      <div className="admin-financial-kpis">{[
        ['Empresas cadastradas', subscriptions.length], ['Acesso liberado', subscriptions.filter(s => s.can_access).length],
        ['Acesso bloqueado', subscriptions.filter(s => !s.can_access).length], ['Vencimentos em 7 dias', expiring.length],
        ['Cobranças pendentes', invoices.filter(i => i.status === 'pending').length], ['Receita recorrente prevista', money.format(recurringRevenue(subscriptions))],
      ].map(([label, value]) => <div className="admin-financial-kpi" key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
      <div className="subscription-actions admin-overview-actions"><button className="rma-advance-btn" onClick={() => onNavigate?.('assinaturas')}>Gerenciar acessos</button><button className="rma-advance-btn" onClick={() => onNavigate?.('faturas')}>Consultar cobranças</button><button className="rma-advance-btn" onClick={() => onNavigate?.('suporte')}>Abrir suporte</button><button className="rma-advance-btn" onClick={() => onNavigate?.('planos')}>Solicitações de plano</button></div>
      <AdminPendingSummary />
      <h4>Acessos que vencem nos próximos 7 dias</h4>
      <div className="admin-overview-list">{expiring.map(s => <div className="module-card" key={s.company_id}><strong>{s.company_name}</strong><p>{accessExplanation(s)} · até {date(accessDeadline(s))}</p><button className="rma-advance-btn" disabled={busy || loading} onClick={() => edit(s)}>Gerenciar</button></div>)}</div>
      {!expiring.length && <p>Nenhum vencimento nos próximos 7 dias.</p>}
    </>}
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
          <option value="all">Todas as empresas</option><option value="allowed">Com acesso liberado</option><option value="blocked">Com acesso bloqueado</option><option value="exempt">Isentas de cobrança</option><option value="trial">Em teste</option><option value="expiring">Vencendo em 7 dias</option>
        </select></label>
        <label>Filtrar por plano<select value={planFilter} onChange={e => setPlanFilter(e.target.value)}><option value="all">Todos</option><option value="basico">Básico</option><option value="profissional">Profissional</option><option value="enterprise">Enterprise</option></select></label>
      </div>
    </>}
    {data && (view === 'financial' || view === 'invoices') && <div className="rma-form inline admin-filters">
      <label>Buscar cobrança<input type="search" placeholder="Empresa ou identificador" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <label>Status<select value={invoiceFilter} onChange={e => setInvoiceFilter(e.target.value)}><option value="all">Todos</option>{Object.entries(saasInvoiceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>De<input type="date" value={start} max={end || undefined} onChange={e => setStart(e.target.value)} /></label><label>Até<input type="date" value={end} min={start || undefined} onChange={e => setEnd(e.target.value)} /></label>
      <button className="rma-advance-btn" onClick={() => { setSearch(''); setInvoiceFilter('all'); setStart(''); setEnd(''); }}>Limpar filtros</button>
      <button className="rma-advance-btn" disabled={!filteredInvoices.length} onClick={() => downloadAdminCsv('distrihub-faturas.csv', [['Empresa', 'Fatura', 'Valor', 'Status', 'Criada em', 'Período inicial', 'Período final', 'Pago em'], ...filteredInvoices.map(i => [i.company_name ?? i.company_id, i.id, Number(i.amount), saasInvoiceLabels[i.status], adminDay(i.created_at), adminDay(i.period_start), adminDay(i.period_end), adminDay(i.paid_at)])])}>Exportar CSV</button>
    </div>}
    {data && view === 'financial' && <div className="admin-financial-kpis">
      {[
        ['Recebido', money.format(paid.reduce((sum, i) => sum + Number(i.amount), 0))],
        ['Pendente', money.format(pending.reduce((sum, i) => sum + Number(i.amount), 0))],
        ['Assinaturas com acesso', subscriptions.filter(s => s.can_access).length],
        ['Receita recorrente prevista', money.format(recurringRevenue(subscriptions))],
      ].map(([label, value]) => <div className="admin-financial-kpi" key={label}><small>{label}</small><strong>{value}</strong></div>)}
    </div>}
    {data && view === 'financial' && <>
      <p className="admin-context-note">Recebido usa a data do pagamento; pendente usa a data de emissão. Receita recorrente prevista considera planos ativos com renovação automática, sem testes ou isenções.</p>
      <h4>Evolução mensal dos recebimentos</h4><div className="admin-revenue-months">{months.map(([month, total]) => <div key={month}><span>{month.split('-').reverse().join('/')}</span><progress max={Math.max(...months.map(([, amount]) => amount), 1)} value={total} aria-label={`Recebido em ${month}`} /><strong>{money.format(total)}</strong></div>)}</div>{!months.length && <p>Nenhum recebimento neste período.</p>}
      <h4>Detalhamento por empresa</h4><div className="admin-overview-list">{[...new Set(filteredInvoices.map(i => i.company_id))].map(id => <div className="module-card" key={id}><strong>{subscriptions.find(s => s.company_id === id)?.company_name ?? filteredInvoices.find(i => i.company_id === id)?.company_name ?? id}</strong><p>Recebido: {money.format(paid.filter(i => i.company_id === id).reduce((sum, i) => sum + Number(i.amount), 0))}</p><p>Pendente: {money.format(pending.filter(i => i.company_id === id).reduce((sum, i) => sum + Number(i.amount), 0))}</p></div>)}</div>
    </>}
    {(editing || cancelInvoice || cancelRenewal) && <form className="rma-form module-card admin-access-editor" aria-busy={busy} onSubmit={save}>
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
      <label>Motivo da alteração (obrigatório)<textarea required minLength={5} maxLength={500} disabled={busy} value={reason}
        aria-describedby="admin-change-reason-help" placeholder="Ex.: Alteração do plano solicitada pela empresa"
        onChange={e => setReason(e.target.value)} /></label>
      <small id="admin-change-reason-help">Informe de 5 a 500 caracteres. O motivo fica registrado junto com a alteração.</small>
      {error && <p className="admin-editor-error">{error}</p>}
      <div className="subscription-actions admin-save-actions"><button type="submit" className="module-submit-btn" disabled={busy}>{busy ? 'Salvando...' : editing ? 'Salvar alterações' : 'Confirmar cancelamento'}</button>
        <button type="button" className="rma-advance-btn" disabled={busy} onClick={() => { setEditing(null); setCancelInvoice(null); setCancelRenewal(null); setReason(''); setError(null); }}>Cancelar edição</button></div>
    </form>}
    {data && view === 'subscriptions' && <AdminResponsiveTable><table className="rma-table">
      <thead><tr><th>Empresa</th><th>Plano</th><th>Cobrança</th><th>Status</th><th>Acesso ao app</th><th>Renovação</th><th>Vencimentos</th><th>Controles</th></tr></thead>
      <tbody>{filtered.map(s => <tr key={s.company_id}>
        <td>{s.company_name}</td><td><span className="admin-plan-badge">{s.effective_plan}</span></td><td>{s.billing_mode === 'exempt' ? 'Isenta' : money.format(s.monthly_amount)}</td>
        <td>{saasStatusLabels[s.status]}</td><td><span className={`admin-access-badge ${s.can_access ? 'allowed' : 'blocked'}`}>{s.can_access ? 'Liberado' : 'Bloqueado'}</span><small className="admin-cell-note">{accessExplanation(s)}</small></td><td>{s.auto_renew ? 'Ativa' : 'Desativada'}</td>
        <td><small className="admin-cell-note">Teste: {date(s.trial_ends_at)}</small><small className="admin-cell-note">Pago até: {date(s.paid_until)}</small><small className="admin-cell-note">Manual: {date(s.admin_access_until)}</small>{s.status === 'past_due' && <small className="admin-cell-note">Tolerância: {date(s.grace_until ?? null)}</small>}</td>
        <td><div className="subscription-actions">
          <button className="rma-advance-btn" disabled={busy || loading} onClick={() => edit(s)}>Gerenciar</button>
          <button className="rma-advance-btn" disabled={busy || loading} onClick={() => edit(s, s.can_access ? 'suspend' : 'activate')}>{s.can_access ? 'Suspender acesso' : 'Ativar acesso'}</button>
          {s.billing_mode !== 'exempt' && <button className="rma-advance-btn" disabled={busy || loading} onClick={() => edit(s, 'exempt')}>Isentar cobrança</button>}
          {s.auto_renew && <button className="rma-advance-btn" disabled={busy || loading} onClick={() => { setCancelRenewal(s.company_id); setEditing(null); setCancelInvoice(null); setReason(''); setMessage(null); }}>Cancelar renovação</button>}
        </div></td>
      </tr>)}</tbody>
    </table>{!filtered.length && <p>Nenhuma empresa encontrada.</p>}</AdminResponsiveTable>}
    {data && view === 'invoices' && <AdminResponsiveTable><table className="rma-table">
      <thead><tr><th>Empresa</th><th>Valor</th><th>Período</th><th>Status</th><th>Pago em</th><th>Ações</th></tr></thead>
      <tbody>{filteredInvoices.map(i => <tr key={i.id}>
        <td>{i.company_name}<small className="admin-cell-note">{i.id}</small></td><td>{money.format(i.amount)}</td><td>{date(i.period_start)} a {date(i.period_end)}</td>
        <td>{saasInvoiceLabels[i.status]}</td><td>{date(i.paid_at)}</td><td><details><summary>Ver detalhes</summary><p>Emitida em: {date(i.created_at)}</p><p>Pagamento Mercado Pago: {i.provider_payment_id ?? 'Não informado'}</p>{i.cancellation_reason && <p>Motivo do cancelamento: {i.cancellation_reason}</p>}</details>{i.status === 'pending' &&
          <button className="rma-advance-btn" disabled={busy} onClick={() => { setCancelInvoice(i.id); setCancelRenewal(null); setEditing(null); setReason(''); setMessage(null); }}>Cancelar cobrança</button>}</td>
      </tr>)}</tbody>
    </table>{!filteredInvoices.length && <p>Nenhuma cobrança encontrada.</p>}</AdminResponsiveTable>}
    {!!data?.jobs.length && <div className="module-card"><h4>Cancelamentos no gateway</h4>
      {data.jobs.map(job => <p key={job.id}>{subscriptions.find(s => s.company_id === job.company_id)?.company_name ?? job.company_id}: {job.status}{job.last_error ? ` · ${job.last_error}` : ''}</p>)}
    </div>}
  </section>;
}
