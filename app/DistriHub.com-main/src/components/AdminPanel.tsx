import { useEffect, useState } from 'react';
import {
  ArrowLeft, Users, Check, BarChart3, ClipboardList,
  Receipt, ShieldCheck, Lock, Eye, EyeOff, Headphones,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useSuperAdminAuth } from '../hooks/useSuperAdminAuth';
import type { AdminCompany, AdminLojista } from '../types';
import { money } from '../utils';
import { AdminSaasModule } from './AdminSaasModule';
import { AdminSupportModule } from './AdminSupportModule';
import { AdminPlanRequestsModule } from './AdminPlanRequestsModule';


type AdminPanelProps = {
  onBack: () => void;
};

type AdminTab = 'lojistas' | 'financeiro' | 'faturas' | 'planos' | 'seguranca' | 'suporte' | 'assinaturas';


export function AdminPanel({ onBack }: AdminPanelProps) {
  const [tab, setTab] = useState<AdminTab>('assinaturas');
  const [accessCompanyId, setAccessCompanyId] = useState<string | null>(null);
  const [companiesVersion, setCompaniesVersion] = useState(0);
  const [lojistas, setLojistas] = useState<AdminCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const superAdminAuth = useSuperAdminAuth();

  useEffect(() => {
    let cancelled = false;
    async function loadAdminData() {
      setLoading(true);
      setError(null);
      if (!isSupabaseConfigured || !supabase) {
        setError('Supabase não configurado. Não foi possível carregar o painel master.');
        setLoading(false);
        return;
      }
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) throw new Error('Sessão do super admin inválida.');

        const { data: isSuperAdmin, error: authError } = await supabase.rpc('is_super_admin');
        if (authError || isSuperAdmin !== true) {
          throw new Error('Operador não autorizado para o painel master.');
        }

        const loj = await supabase.rpc('get_super_admin_company_overview_auth');
        if (loj.error) throw loj.error;
        if (cancelled) return;
        setLojistas((loj.data as AdminCompany[]) ?? []);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o painel master.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadAdminData();
    return () => { cancelled = true; };
  }, [companiesVersion]);

  async function updateLojista(id: string, updates: Partial<AdminCompany>) {
    setLojistas((prev) => prev.map((l) => l.id === id ? { ...l, ...updates, client_status: updates.status ?? l.client_status } : l));
    if (isSupabaseConfigured && supabase) {
      await supabase.rpc('update_super_admin_client_auth', {
        client_id: id,
        new_status: updates.status ?? null,
        new_credit_limit: updates.credit_limit ?? null,
      });
    }
  }

  const tabs: { id: AdminTab; label: string; icon: typeof Users }[] = [
    { id: 'lojistas', label: 'Gestão de Clientes', icon: Users },
    { id: 'financeiro', label: 'Financeiro SaaS', icon: BarChart3 },
    { id: 'faturas', label: 'Faturas SaaS', icon: Receipt },
    { id: 'assinaturas', label: 'Acesso ao aplicativo', icon: ShieldCheck },
    { id: 'planos', label: 'Solicitações de Plano', icon: ClipboardList },
    { id: 'suporte', label: 'Suporte', icon: Headphones },
    { id: 'seguranca', label: 'Segurança', icon: ShieldCheck },
  ];

  return (
    <div className="partner-panel admin-panel">
      <div className="partner-header admin-header">
        <div className="page-container partner-header-inner">
          <button className="partner-back-btn" onClick={onBack}>
            <ArrowLeft size={18} /> Voltar ao início
          </button>
          <div className="partner-title">
            <h2>Painel Super Admin</h2>
            <p>Controle de acesso, empresas, assinaturas e cobranças</p>
          </div>
          {loading && <span className="partner-loading">Carregando...</span>}
          {error && <span className="admin-load-error" role="alert">{error}</span>}
        </div>
      </div>

      <div className="page-container partner-body">
        <div className="partner-tabs">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`partner-tab ${tab === id ? 'active' : ''}`} onClick={() => { setAccessCompanyId(null); setTab(id); }}>
              <Icon size={17} /> {label}
            </button>
          ))}
        </div>

        <div className="partner-content">
          {error && !loading && <div className="admin-load-error admin-load-error-panel" role="alert">{error}</div>}

          {tab === 'lojistas' && (
            <div className="panel-module">
              <div className="module-header">
                <span className="module-icon"><Users size={20} /></span>
                <div>
                  <h3>Clientes da Plataforma</h3>
                  <p>Gerencie o cadastro comercial e abra os controles de acesso de cada empresa.</p>
                </div>
              </div>
              <div className="admin-client-summary">
                <strong>{lojistas.length}</strong> clientes cadastrados
              </div>
              <div className="stock-table-wrap">
                <table className="rma-table">
                  <thead>
                    <tr><th>Empresa</th><th>Login</th><th>Contato</th><th>Documento</th><th>Segmento</th><th>Assinatura</th><th>Compras</th><th>Cadastro comercial</th><th>Acesso ao aplicativo</th></tr>
                  </thead>
                  <tbody>
                    {lojistas.length === 0 ? (
                      <tr><td colSpan={9} className="empty-row">Nenhuma empresa cadastrada.</td></tr>
                    ) : (
                      lojistas.map((cliente) => (
                        <tr key={cliente.id}>
                          <td><strong>{cliente.business_name}</strong><small className="admin-client-id">{cliente.account_name ?? cliente.user_id?.slice(0, 8)}</small></td>
                          <td>{cliente.email ?? '—'}</td>
                          <td>{cliente.whatsapp ?? '—'}</td>
                          <td>{cliente.document ?? '—'}</td>
                          <td>{cliente.segment}</td>
                          <td>
                            <span>{cliente.subscription_plan ?? 'basico'} · {cliente.subscription_status ?? 'trial'}</span>
                          </td>
                          <td>{cliente.orders_count} · {money.format(cliente.orders_total)}</td>
                          <td>
                            <select className="inline-select" value={cliente.client_status} onChange={(e) => updateLojista(cliente.id, { status: e.target.value as AdminLojista['status'] })}>
                              <option value="pendente">Pendente</option>
                              <option value="aprovado">Aprovado</option>
                              <option value="reprovado">Bloqueado</option>
                            </select>
                          </td>
                          <td><button className="rma-advance-btn" disabled={!cliente.user_id} onClick={() => {
                            setAccessCompanyId(cliente.user_id); setTab('assinaturas');
                          }}>Controlar acesso</button></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'financeiro' && <AdminSaasModule view="financial" />}
          {tab === 'faturas' && <AdminSaasModule view="invoices" />}
          {tab === 'assinaturas' && <AdminSaasModule view="subscriptions" initialCompanyId={accessCompanyId} onChanged={() => setCompaniesVersion(version => version + 1)} />}

          {tab === 'suporte' && <AdminSupportModule companies={lojistas} />}

          {tab === 'planos' && <AdminPlanRequestsModule />}

          {tab === 'seguranca' && (
            <ChangePasswordSection auth={superAdminAuth} />
          )}
        </div>
      </div>
    </div>
  );
}

function ChangePasswordSection({ auth }: { auth: ReturnType<typeof useSuperAdminAuth> }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError('As senhas não conferem.');
      return;
    }
    if (newPassword.length < 6) {
      setError('A nova senha deve ter ao menos 6 caracteres.');
      return;
    }
    setLoading(true);
    const ok = await auth.changePassword(newPassword);
    setLoading(false);
    if (!ok) {
      setError('Não foi possível atualizar a senha do super admin.');
      return;
    }
    setSuccess(true);
    setNewPassword('');
    setConfirmPassword('');
  }

  return (
    <div className="panel-module">
      <div className="module-header">
        <span className="module-icon"><ShieldCheck size={20} /></span>
        <div>
          <h3>Segurança — Alterar Senha Master</h3>
          <p>Atualize a credencial de acesso ao painel super admin</p>
        </div>
      </div>
      <form className="rma-form" onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
        <label>
          <span className="social-label"><Lock size={14} /> Nova Senha</span>
          <div className="password-input-wrap">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setError(null); setSuccess(false); }}
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
              minLength={6}
              required
            />
            <button type="button" className="password-toggle" onClick={() => setShowNew(!showNew)} aria-label={showNew ? 'Ocultar nova senha' : 'Mostrar nova senha'}>
              {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
        <label>
          <span className="social-label"><Lock size={14} /> Confirmar Nova Senha</span>
          <div className="password-input-wrap">
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setError(null); setSuccess(false); }}
              placeholder="Repita a nova senha"
              autoComplete="new-password"
              minLength={6}
              required
            />
            <button type="button" className="password-toggle" onClick={() => setShowConfirm(!showConfirm)} aria-label={showConfirm ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'}>
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
        {error && <p className="super-admin-gate-error" role="alert" aria-live="polite">{error}</p>}
        {success && (
          <p className="super-admin-change-success" aria-live="polite">
            <Check size={14} /> Senha master atualizada com sucesso!
          </p>
        )}
        <button type="submit" className="module-submit-btn" disabled={loading}>
          <ShieldCheck size={16} /> {loading ? 'Atualizando...' : 'Atualizar senha master'}
        </button>
      </form>
    </div>
  );
}
