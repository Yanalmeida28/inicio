import { useEffect, useState } from 'react';
import {
  ArrowLeft, Users, Truck, MapPin, Plus, Check, X,
  Receipt, ShieldCheck, Lock, Eye, EyeOff,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useSuperAdminAuth } from '../hooks/useSuperAdminAuth';
import type { AdminCompany, AdminLojista, DeliveryRoute, DeliveryRate, PartnerInvoice } from '../types';
import { money } from '../utils';

type AdminPanelProps = {
  onBack: () => void;
  accessPassword: string;
};

type AdminTab = 'lojistas' | 'rotas' | 'faturas' | 'seguranca';

export function AdminPanel({ onBack, accessPassword }: AdminPanelProps) {
  const [tab, setTab] = useState<AdminTab>('lojistas');
  const [lojistas, setLojistas] = useState<AdminCompany[]>([]);
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [rates, setRates] = useState<DeliveryRate[]>([]);
  const [invoices, setInvoices] = useState<PartnerInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const superAdminAuth = useSuperAdminAuth();

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) { setLoading(false); return; }
    (async () => {
      const [loj, rt, rt2, inv] = await Promise.all([
        supabase.rpc('get_super_admin_company_overview', { input_password: accessPassword }),
        supabase.from('delivery_routes').select('*').order('created_at'),
        supabase.from('delivery_rates').select('*').order('created_at', { ascending: false }),
        supabase.from('partner_invoices').select('*').order('created_at', { ascending: false }),
      ]);
      setLojistas((loj.data as AdminCompany[]) ?? []);
      setRoutes((rt.data as DeliveryRoute[]) ?? []);
      setRates((rt2.data as DeliveryRate[]) ?? []);
      setInvoices((inv.data as PartnerInvoice[]) ?? []);
      setLoading(false);
    })();
  }, []);

  async function updateLojista(id: string, updates: Partial<AdminCompany>) {
    setLojistas((prev) => prev.map((l) => l.id === id ? { ...l, ...updates, client_status: updates.status ?? l.client_status } : l));
    if (isSupabaseConfigured && supabase) {
      await supabase.rpc('update_super_admin_client', {
        input_password: accessPassword,
        client_id: id,
        new_status: updates.status ?? null,
        new_credit_limit: updates.credit_limit ?? null,
      });
    }
  }


  async function addRate(neighborhood: string, rate: number, routeId: string) {
    const newRate: DeliveryRate = {
      id: crypto.randomUUID(), neighborhood, rate, route_id: routeId || null,
      created_at: new Date().toISOString(),
    };
    setRates((prev) => [newRate, ...prev]);
    if (isSupabaseConfigured && supabase) {
      await supabase.from('delivery_rates').insert(newRate);
    }
  }

  async function deleteRate(id: string) {
    setRates((prev) => prev.filter((r) => r.id !== id));
    if (isSupabaseConfigured && supabase) {
      await supabase.from('delivery_rates').delete().eq('id', id);
    }
  }

  const tabs: { id: AdminTab; label: string; icon: typeof Users }[] = [
    { id: 'lojistas', label: 'Gestão de Clientes', icon: Users },
    { id: 'rotas', label: 'Rotas de Entrega', icon: Truck },
    { id: 'faturas', label: 'Faturas SaaS', icon: Receipt },
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
            <h2>Painel Super Admin — Distribuidora</h2>
            <p>Controle geral de lojistas, crédito B2B, faturamento e rotas</p>
          </div>
          {loading && <span className="partner-loading">Carregando...</span>}
        </div>
      </div>

      <div className="page-container partner-body">
        <div className="partner-tabs">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`partner-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              <Icon size={17} /> {label}
            </button>
          ))}
        </div>

        <div className="partner-content">
          {tab === 'lojistas' && (
            <div className="panel-module">
              <div className="module-header">
                <span className="module-icon"><Users size={20} /></span>
                <div>
                  <h3>Clientes da Plataforma</h3>
                  <p>Controle os clientes cadastrados pelo acesso Entrar</p>
                </div>
              </div>
              <div className="admin-client-summary">
                <strong>{lojistas.length}</strong> clientes cadastrados
              </div>
              <div className="stock-table-wrap">
                <table className="rma-table">
                  <thead>
                    <tr><th>Empresa</th><th>Login</th><th>Contato</th><th>Documento</th><th>Segmento</th><th>Assinatura</th><th>Compras</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {lojistas.length === 0 ? (
                      <tr><td colSpan={8} className="empty-row">Nenhuma empresa cadastrada.</td></tr>
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
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'rotas' && (
            <div className="panel-module">
              <div className="module-header">
                <span className="module-icon"><Truck size={20} /></span>
                <div>
                  <h3>Gestão de Rotas de Entrega Local</h3>
                  <p>Taxas de motoboy por bairro/região e horários de corte</p>
                </div>
              </div>

              <div className="route-cards">
                {routes.map((r) => (
                  <div key={r.id} className="route-card">
                    <MapPin size={18} />
                    <div>
                      <strong>{r.name}</strong>
                      <small>Horário de corte: {r.cutoff_time ?? 'Sem corte'}</small>
                    </div>
                  </div>
                ))}
              </div>

              <RateForm routes={routes} onAdd={addRate} />

              <div className="stock-table-wrap">
                <table className="rma-table">
                  <thead><tr><th>Bairro/Região</th><th>Taxa</th><th>Rota</th><th></th></tr></thead>
                  <tbody>
                    {rates.length === 0 ? (
                      <tr><td colSpan={4} className="empty-row">Nenhuma taxa cadastrada.</td></tr>
                    ) : (
                      rates.map((r) => (
                        <tr key={r.id}>
                          <td><strong>{r.neighborhood}</strong></td>
                          <td>{money.format(r.rate)}</td>
                          <td>{routes.find((rt) => rt.id === r.route_id)?.name ?? '—'}</td>
                          <td><button className="rma-advance-btn danger" onClick={() => deleteRate(r.id)}><X size={14} /></button></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'faturas' && (
            <div className="panel-module">
              <div className="module-header">
                <span className="module-icon"><Receipt size={20} /></span>
                <div>
                  <h3>Extrato de Faturas Recorrentes (SaaS)</h3>
                  <p>Faturas do plano de assinatura dos lojistas</p>
                </div>
              </div>
              <div className="stock-table-wrap">
                <table className="rma-table">
                  <thead><tr><th>Valor</th><th>Status</th><th>Vencimento</th><th>Pago em</th></tr></thead>
                  <tbody>
                    {invoices.length === 0 ? (
                      <tr><td colSpan={4} className="empty-row">Nenhuma fatura.</td></tr>
                    ) : (
                      invoices.map((inv) => (
                        <tr key={inv.id}>
                          <td><strong>{money.format(inv.amount)}</strong></td>
                          <td>
                            <span className="rma-status-badge" style={{
                              color: inv.status === 'paga' ? '#5bbc87' : '#e6a06d',
                              borderColor: inv.status === 'paga' ? '#5bbc87' : '#e6a06d',
                            }}>{inv.status}</span>
                          </td>
                          <td>{inv.due_date ? new Date(inv.due_date).toLocaleDateString('pt-BR') : '—'}</td>
                          <td>{inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('pt-BR') : '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'seguranca' && (
            <ChangePasswordSection auth={superAdminAuth} />
          )}
        </div>
      </div>
    </div>
  );
}

function ChangePasswordSection({ auth }: { auth: ReturnType<typeof useSuperAdminAuth> }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
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
    const ok = await auth.changePassword(currentPassword, newPassword);
    setLoading(false);
    if (!ok) {
      setError('Senha atual incorreta. Tente novamente.');
      return;
    }
    setSuccess(true);
    setCurrentPassword('');
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
          <span className="social-label"><Lock size={14} /> Senha Atual</span>
          <div className="password-input-wrap">
            <input
              type={showCurrent ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => { setCurrentPassword(e.target.value); setError(null); setSuccess(false); }}
              placeholder="••••••••••••"
              required
              autoFocus
            />
            <button type="button" className="password-toggle" onClick={() => setShowCurrent(!showCurrent)}>
              {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
        <label>
          <span className="social-label"><Lock size={14} /> Nova Senha</span>
          <div className="password-input-wrap">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setError(null); setSuccess(false); }}
              placeholder="Mínimo 6 caracteres"
              required
            />
            <button type="button" className="password-toggle" onClick={() => setShowNew(!showNew)}>
              {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
        <label>
          <span className="social-label"><Lock size={14} /> Confirmar Nova Senha</span>
          <input
            type={showNew ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setError(null); setSuccess(false); }}
            placeholder="Repita a nova senha"
            required
          />
        </label>
        {error && <p className="super-admin-gate-error">{error}</p>}
        {success && (
          <p className="super-admin-change-success">
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

function RateForm({ routes, onAdd }: {
  routes: DeliveryRoute[];
  onAdd: (neighborhood: string, rate: number, routeId: string) => void;
}) {
  const [neighborhood, setNeighborhood] = useState('');
  const [rate, setRate] = useState('');
  const [routeId, setRouteId] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!neighborhood.trim() || !rate) return;
    onAdd(neighborhood, Number(rate), routeId);
    setNeighborhood(''); setRate(''); setRouteId('');
  }

  return (
    <form className="rma-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>
          Bairro/Região
          <input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="Ex: Centro" required />
        </label>
        <label>
          Taxa (R$)
          <input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0,00" required />
        </label>
        <label>
          Rota
          <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="">Selecione...</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
      </div>
      <button type="submit" className="module-submit-btn"><Plus size={16} /> Adicionar taxa</button>
    </form>
  );
}
