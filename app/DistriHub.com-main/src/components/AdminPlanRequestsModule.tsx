import { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

type PlanChangeRequest = {
  request_id: string;
  company_name: string;
  current_plan: string;
  requested_plan: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  resolved_at: string | null;
};

const planLabels: Record<string, string> = {
  basico: 'Básico',
  profissional: 'Profissional',
  enterprise: 'Enterprise',
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('pt-BR') : '—';
}

export function AdminPlanRequestsModule() {
  const [requests, setRequests] = useState<PlanChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingRequest, setPendingRequest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase não configurado.');
    }
    const { data, error: loadError } = await supabase.rpc('get_partner_plan_change_requests');
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
    setPendingRequest(requestId);
    setError(null);
    setNotice(null);
    try {
      const { error: resolveError } = await supabase.rpc('resolve_partner_plan_change', {
        p_request_id: requestId,
        p_approved: approved,
      });
      if (resolveError) throw resolveError;
      await loadRequests();
      setNotice(approved
        ? 'Solicitação aprovada. O plano foi atualizado; isso não confirma nem registra pagamento.'
        : 'Solicitação rejeitada.');
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : 'Não foi possível resolver a solicitação.');
    } finally {
      setPendingRequest(null);
    }
  }

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
      <div className="stock-table-wrap">
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
            ) : requests.length === 0 ? (
              <tr><td colSpan={6} className="empty-row">Nenhuma solicitação de mudança de plano.</td></tr>
            ) : requests.map((request) => (
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
                        onClick={() => void resolveRequest(request.request_id, true)}
                      >
                        <Check size={14} /> {pendingRequest === request.request_id ? 'Salvando...' : 'Aprovar'}
                      </button>
                      <button
                        type="button"
                        className="rma-advance-btn"
                        disabled={pendingRequest !== null}
                        onClick={() => void resolveRequest(request.request_id, false)}
                      >
                        <X size={14} /> Rejeitar
                      </button>
                    </div>
                  ) : formatDate(request.resolved_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
