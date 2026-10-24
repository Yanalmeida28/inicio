import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { SaasSubscription } from '../lib/saas';
import { matchesPeriod } from '../lib/adminOverview';
import { saasAdminError } from '../lib/saasAdminControls';

type BillingEvent = { id: string; company_id: string; actor_id: string | null; action: string; details: Record<string, unknown>; created_at: string };
const actions: Record<string, string> = { admin_subscription_update: 'Alteração de assinatura', plan_request_approved: 'Plano aprovado', plan_request_rejected: 'Plano rejeitado', admin_invoice_cancel: 'Cancelamento de cobrança', renewal_cancelled: 'Cancelamento de renovação' };
export function AdminActivityModule({ subscriptions }: { subscriptions: SaasSubscription[] }) {
  const [events, setEvents] = useState<BillingEvent[]>([]);
  const [search, setSearch] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const load = useCallback(async () => {
    if (!supabase) { setError('Supabase não configurado.'); return; }
    setLoading(true); setError(null);
    try {
      const { data, error: failure } = await supabase.from('saas_billing_events').select('id,company_id,actor_id,action,details,created_at').order('created_at', { ascending: false }).order('id', { ascending: false }).range(page * 100, page * 100 + 100);
      if (failure) throw failure;
      setEvents((data ?? []).slice(0, 100) as BillingEvent[]); setHasMore((data?.length ?? 0) > 100);
    } catch (failure) { setError(saasAdminError(failure)); } finally { setLoading(false); }
  }, [page]);
  useEffect(() => { void load(); }, [load]);
  const companyName = (id: string) => subscriptions.find(s => s.company_id === id)?.company_name ?? id;
  const filtered = events.filter(e => `${companyName(e.company_id)} ${e.actor_id ?? ''} ${actions[e.action] ?? e.action} ${String(e.details.reason ?? '')}`.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')) && matchesPeriod(e.created_at, start, end));
  return <>
    <p>Registro de alterações de planos, acessos e cobranças. Os filtros abaixo se aplicam à página atual de 100 registros.</p>
    <div className="rma-form inline admin-filters"><label>Buscar histórico<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Empresa, ação, operador ou motivo" /></label><label>De<input type="date" value={start} max={end || undefined} onChange={e => setStart(e.target.value)} /></label><label>Até<input type="date" min={start || undefined} value={end} onChange={e => setEnd(e.target.value)} /></label><button className="rma-advance-btn" disabled={loading} onClick={() => void load()}>Atualizar histórico</button></div>
    {error && <p role="alert" className="admin-feedback admin-feedback-error">{error}</p>}
    {loading ? <p role="status">Carregando histórico...</p> : <div className="admin-overview-list">{filtered.map(e => <article className="module-card" key={e.id}><strong>{companyName(e.company_id)}</strong><p>{actions[e.action] ?? e.action}</p><small>{new Date(e.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</small><p>Operador: {e.actor_id ?? 'Sistema / gateway'}</p>{e.details.reason != null && <p>Motivo: {String(e.details.reason)}</p>}<details><summary>Detalhes da alteração</summary><pre className="admin-event-details">{JSON.stringify(e.details, null, 2)}</pre></details></article>)}</div>}
    {!loading && !filtered.length && <p>Nenhum registro encontrado nesta página.</p>}
    <div className="subscription-actions"><button className="rma-advance-btn" disabled={loading || page === 0} onClick={() => setPage(p => p - 1)}>Anterior</button><span>Página {page + 1}</span><button className="rma-advance-btn" disabled={loading || !hasMore} onClick={() => setPage(p => p + 1)}>Próxima</button></div>
  </>;
}

export function AdminPendingSummary() {
  const [summary, setSummary] = useState<{ support: number; plans: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!supabase) return;
    void supabase.rpc('get_super_admin_pending_summary').then(({ data, error: failure }) => {
      if (!active) return;
      if (failure) setError(saasAdminError(failure)); else setSummary(data);
    });
    return () => { active = false; };
  }, []);
  return error ? <p role="alert" className="admin-feedback admin-feedback-error">Pendências: {error}</p> : <div className="admin-financial-kpis"><div className="admin-financial-kpi"><small>Atendimentos aguardando resposta</small><strong>{summary?.support ?? '…'}</strong></div><div className="admin-financial-kpi"><small>Solicitações de plano pendentes</small><strong>{summary?.plans ?? '…'}</strong></div></div>;
}
