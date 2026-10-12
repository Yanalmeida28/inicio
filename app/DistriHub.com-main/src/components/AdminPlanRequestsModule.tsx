import { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { AdminResponsiveTable } from './AdminResponsiveTable';

type PlanChangeRequest = {
  request_id: string;
  company_name: string;
  current_plan: string;
  requested_plan: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  resolved_at: string | null;
  resolution_reason: string | null;
};

const planLabels: Record<string, string> = {
  basico: 'Básico',
  profissional: 'Profissional',
  enterprise: 'Enterprise',
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('pt-BR') : '—';
}

export function AdminPlanRequestsModule({ onChanged }: { onChanged?: () => void }) {
  const [requests, setRequests] = useState<PlanChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingRequest, setPendingRequest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('pending');
  const [decision, setDecision] = useState<{ id: string; approved: boolean; name: string } | null>(null);
  const [reason, setReason] = useState('');

  const loadRequests = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase não configurado.');
    }
    const { data, error: loadError } = await supabase.rpc('get_super_admin_plan_requests');
    if (loadError) throw loadError;
    setRequests((data as PlanChangeRequest[] | null) ?? []);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadRequests();
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as solicitações.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [loadRequests]);

  async function resolveRequest(requestId: string, approved: boolean) {
    if (!supabase || pendingRequest) return;
    if (reason.trim().length < 5 || reason.length > 500) { setError('Informe um motivo de 5 a 500 caracteres.'); return; }
    setPendingRequest(requestId);
    setError(null);
    setNotice(null);
    try {
      const { data: confirmed, error: resolveError } = await supabase.rpc('resolve_partner_plan_change_with_reason', {
        p_request_id: requestId,
        p_approved: approved,
        p_reason: reason.trim(),
      });
      if (resolveError) throw resolveError;
      if (confirmed !== true) throw new Error('O servidor não confirmou a decisão.');
      await loadRequests();
      setDecision(null); setReason(''); onChanged?.();
      setNotice(approved
        ? 'Solicitação aprovada. O plano foi atualizado; isso não confirma nem registra pagamento.'
        : 'Solicitação rejeitada.');
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : 'Não foi possível resolver a solicitação.');
    } finally {
      setPendingRequest(null);
    }
  }
  const filtered = requests.filter(r => (filter === 'all' || r.status === filter) && r.company_name.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')));

  return (
    <div className="panel-module">
      <div className="module-header">
        <span className="module-icon"><Check size={20} /></span>
        <div>
          <h3>Solicitações de mudança de plano</h3>
          <p>A aprovação atualiza o plano, mas não altera o estado de pagamento.</p>
        </div>
      </div>
      {error && <p className="admin-load-error" role="alert">{error}</p>}
      {notice && <p className="super-admin-change-success" role="status">{notice}</p>}
      <div className="rma-form inline admin-filters"><label>Buscar empresa<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label><label>Status<select value={filter} onChange={e => setFilter(e.target.value)}><option value="pending">Pendentes</option><option value="all">Todas</option><option value="approved">Aprovadas</option><option value="rejected">Rejeitadas</option></select></label></div>
      {decision && <form className="rma-form module-card" onSubmit={e => { e.preventDefault(); void resolveRequest(decision.id, decision.approved); }}><h4>{decision.approved ? 'Aprovar' : 'Rejeitar'} plano: {decision.name}</h4><label>Motivo<textarea required minLength={5} maxLength={500} disabled={!!pendingRequest} value={reason} onChange={e => setReason(e.target.value)} /></label><div className="subscription-actions"><button type="submit" className="module-submit-btn" disabled={!!pendingRequest}>{pendingRequest ? 'Salvando...' : 'Confirmar decisão'}</button><button type="button" className="rma-advance-btn" disabled={!!pendingRequest} onClick={() => { setDecision(null); setReason(''); }}>Cancelar</button></div></form>}
      <AdminResponsiveTable>
        <table className="rma-table">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Plano atual</th>
              <th>Plano solicitado</th>
              <th>Solicitado em</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="empty-row">Carregando solicitações...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="empty-row">Nenhuma solicitação de mudança de plano.</td></tr>
            ) : filtered.map((request) => (
              <tr key={request.request_id}>
                <td><strong>{request.company_name}</strong></td>
                <td>{planLabels[request.current_plan] ?? request.current_plan}</td>
                <td>{planLabels[request.requested_plan] ?? request.requested_plan}</td>
                <td>{formatDate(request.created_at)}</td>
                <td>{request.status === 'pending' ? 'Pendente' : request.status === 'approved' ? 'Aprovada' : 'Rejeitada'}</td>
                <td>
                  {request.status === 'pending' ? (
                    <div className="admin-plan-actions">
                      <button
                        type="button"
                        className="module-submit-btn"
                        disabled={pendingRequest !== null}
                        onClick={() => { setDecision({ id: request.request_id, approved: true, name: request.company_name }); setReason(''); setError(null); }}
                      >
                        <Check size={14} /> {pendingRequest === request.request_id ? 'Salvando...' : 'Aprovar'}
                      </button>
                      <button
                        type="button"
                        className="rma-advance-btn"
                        disabled={pendingRequest !== null}
                        onClick={() => { setDecision({ id: request.request_id, approved: false, name: request.company_name }); setReason(''); setError(null); }}
                      >
                        <X size={14} /> Rejeitar
                      </button>
                    </div>
                  ) : <><span>{formatDate(request.resolved_at)}</span><small className="admin-cell-note">{request.resolution_reason ?? 'Sem motivo registrado'}</small></>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminResponsiveTable>
    </div>
  );
}
