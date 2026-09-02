import { useState } from 'react';
import {
  Settings, User, Mail, Phone, FileText, Lock, CreditCard, Calendar,
  Check, X, Crown, Zap, Building2, Receipt, ArrowUpCircle, ArrowDownCircle,
  Shield, Eye, EyeOff,
} from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { PartnerProfile } from '../../types';
import { supabase } from '../../lib/supabase';
import { money } from '../../utils';

type Props = {
  user: SupabaseUser | null;
  profile: PartnerProfile | null;
  onProfileUpdate: (profile: Partial<PartnerProfile>) => void;
};

type Plan = {
  id: string;
  name: string;
  price: number;
  features: string[];
  icon: typeof Crown;
  highlighted?: boolean;
};

const plans: Plan[] = [
  {
    id: 'basico',
    name: 'Básico',
    price: 49.90,
    icon: Building2,
    features: ['1 loja', 'PDV ilimitado', 'Cadastros básicos', 'Relatórios simples'],
  },
  {
    id: 'profissional',
    name: 'Profissional',
    price: 99.90,
    icon: Zap,
    highlighted: true,
    features: ['Até 3 lojas', 'Catálogo online público', 'Relatórios & CRM avançado', 'Gestão de entregas', 'Cupons de desconto'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 199.90,
    icon: Crown,
    features: ['Lojas ilimitadas', 'Integração Instagram', 'API & Webhooks', 'Suporte prioritário', 'White-label completo'],
  },
];

const planLabels: Record<string, string> = {
  basico: 'Básico',
  profissional: 'Profissional',
  enterprise: 'Enterprise',
};

const statusLabels: Record<string, { label: string; color: string }> = {
  ativa: { label: 'Ativa', color: '#5bbc87' },
  trial: { label: 'Trial', color: '#5cb5f1' },
  cancelada: { label: 'Cancelada', color: '#e6706d' },
  suspensa: { label: 'Suspensa', color: '#e6a06d' },
};

export function SettingsModule({ user, profile, onProfileUpdate }: Props) {
  const [accountName, setAccountName] = useState(profile?.account_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp ?? '');
  const [document, setDocument] = useState(profile?.document ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState<Plan | null>(null);

  const currentPlan = profile?.subscription_plan ?? 'basico';
  const subStatus = profile?.subscription_status ?? 'trial';
  const nextBilling = profile?.next_billing_date;
  const paymentMethod = profile?.payment_method;

  async function handleSave() {
    setSaving(true);
    try {
      onProfileUpdate({
        account_name: accountName || null,
        whatsapp: whatsapp || null,
        document: document || null,
      });

      if (user && supabase) {
        await supabase.from('partner_profiles').update({
          account_name: accountName || null,
          whatsapp: whatsapp || null,
          document: document || null,
        }).eq('id', user.id);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordChange(newPassword: string) {
    if (!supabase) return;
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  }

  async function handlePlanChange(plan: Plan) {
    if (!user || !supabase) return;
    onProfileUpdate({
      subscription_plan: plan.id,
      subscription_status: 'ativa',
      next_billing_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    });
    await supabase.from('partner_profiles').update({
      subscription_plan: plan.id,
      subscription_status: 'ativa',
      next_billing_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    }).eq('id', user.id);
    setShowPlanModal(null);
  }

  return (
    <div className="panel-module">
      <div className="module-header">
        <span className="module-icon"><Settings size={20} /></span>
        <div>
          <h3>Configurações do Sistema</h3>
          <p>Perfil, segurança e gerenciamento de assinatura</p>
        </div>
      </div>

      {/* Profile Section */}
      <div className="section-divider">
        <span className="section-divider-label"><User size={14} /> Perfil da Conta</span>
      </div>

      <div className="module-card">
        <div className="rma-form">
          <label>
            <span className="social-label"><User size={14} /> Nome do Responsável</span>
            <input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Seu nome completo"
            />
          </label>
          <label>
            <span className="social-label"><Mail size={14} /> E-mail da Conta</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
          </label>
          <label>
            <span className="social-label"><Phone size={14} /> Telefone / WhatsApp</span>
            <input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="(11) 99999-9999"
            />
          </label>
          <label>
            <span className="social-label"><FileText size={14} /> CNPJ / CPF</span>
            <input
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              placeholder="00.000.000/0000-00"
            />
          </label>
        </div>
        <div className="otp-actions">
          <button className="module-submit-btn" onClick={handleSave} disabled={saving}>
            {saved ? <><Check size={16} /> Salvo!</> : saving ? 'Salvando...' : <><Check size={16} /> Salvar Configurações</>}
          </button>
        </div>
      </div>

      {/* Security Section */}
      <div className="section-divider">
        <span className="section-divider-label"><Shield size={14} /> Segurança</span>
      </div>

      <div className="module-card security-card">
        <div className="security-info">
          <div className="catalog-toggle-icon"><Lock size={20} /></div>
          <div>
            <strong>Senha de Acesso</strong>
            <small>Altere sua senha periodicamente para maior segurança</small>
          </div>
        </div>
        <button className="rma-advance-btn" onClick={() => setShowPasswordModal(true)}>
          <Lock size={14} /> Alterar Senha
        </button>
      </div>

      {/* SaaS Billing Section */}
      <div className="section-divider">
        <span className="section-divider-label"><CreditCard size={14} /> Assinatura & Faturamento</span>
      </div>

      <div className="module-card subscription-card">
        <div className="subscription-header">
          <div className="subscription-status-badge" style={{ color: statusLabels[subStatus]?.color, background: `${statusLabels[subStatus]?.color}1f`, borderColor: `${statusLabels[subStatus]?.color}55` }}>
            <span className="subscription-status-dot" style={{ background: statusLabels[subStatus]?.color }} />
            {statusLabels[subStatus]?.label ?? subStatus}
          </div>
          <div className="subscription-plan-name">
            Plano {planLabels[currentPlan] ?? currentPlan}
          </div>
        </div>

        <div className="subscription-details-grid">
          <div className="subscription-detail-item">
            <Calendar size={16} />
            <div>
              <small>Próxima Cobrança</small>
              <strong>{nextBilling ? new Date(nextBilling).toLocaleDateString('pt-BR') : '—'}</strong>
            </div>
          </div>
          <div className="subscription-detail-item">
            <CreditCard size={16} />
            <div>
              <small>Método de Pagamento</small>
              <strong>{paymentMethod === 'cartao' ? 'Cartão de Crédito' : paymentMethod === 'pix' ? 'PIX (Auto-renovar)' : 'Não configurado'}</strong>
            </div>
          </div>
        </div>

        <div className="subscription-actions">
          <button className="rma-advance-btn" onClick={() => setShowPlanModal(plans.find((p) => p.id !== currentPlan) ?? plans[1])}>
            {currentPlan === 'enterprise' ? <><ArrowDownCircle size={14} /> Downgrade Plano</> : <><ArrowUpCircle size={14} /> Upgrade Plano</>}
          </button>
        </div>
      </div>

      {/* Plan Cards */}
      <div className="plan-cards-grid">
        {plans.map((plan) => {
          const Icon = plan.icon;
          const isCurrent = plan.id === currentPlan;
          return (
            <div key={plan.id} className={`plan-card ${plan.highlighted ? 'highlighted' : ''} ${isCurrent ? 'current' : ''}`}>
              {plan.highlighted && <span className="plan-badge">Mais Popular</span>}
              {isCurrent && <span className="plan-current-badge">Plano Atual</span>}
              <div className="plan-card-icon"><Icon size={24} /></div>
              <strong>{plan.name}</strong>
              <div className="plan-price">
                <span className="plan-price-value">{money.format(plan.price)}</span>
                <span className="plan-price-period">/mês</span>
              </div>
              <ul className="plan-features">
                {plan.features.map((f, i) => (
                  <li key={i}><Check size={13} /> {f}</li>
                ))}
              </ul>
              {!isCurrent && (
                <button
                  className={`plan-select-btn ${plan.highlighted ? 'primary' : ''}`}
                  onClick={() => setShowPlanModal(plan)}
                >
                  Selecionar {plan.name}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Invoice History */}
      <div className="section-divider">
        <span className="section-divider-label"><Receipt size={14} /> Histórico de Faturas</span>
      </div>

      <div className="stock-table-wrap">
        <table className="rma-table">
          <thead><tr><th>Fatura</th><th>Data</th><th>Plano</th><th>Valor</th><th>Status</th></tr></thead>
          <tbody>
            <tr><td colSpan={5}>Nenhuma fatura real registrada.</td></tr>
          </tbody>
        </table>
      </div>

      {/* Password Modal */}
      {showPasswordModal && (
        <PasswordModal
          onClose={() => setShowPasswordModal(false)}
          onSubmit={handlePasswordChange}
        />
      )}

      {/* Plan Change Modal */}
      {showPlanModal && (
        <PlanModal
          plan={showPlanModal}
          currentPlanName={planLabels[currentPlan] ?? currentPlan}
          onClose={() => setShowPlanModal(null)}
          onConfirm={() => handlePlanChange(showPlanModal)}
        />
      )}
    </div>
  );
}

function PasswordModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (pw: string) => Promise<void> }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (newPassword.length < 6) { setError('A senha deve ter no mínimo 6 caracteres.'); return; }
    if (newPassword !== confirmPassword) { setError('As senhas não coincidem.'); return; }
    setLoading(true);
    try {
      await onSubmit(newPassword);
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar senha.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4><Lock size={18} /> Alterar Senha</h4>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        {success ? (
          <div className="modal-body">
            <div className="otp-sent-hint" style={{ color: '#5bbc87' }}>
              <Check size={16} /> Senha alterada com sucesso!
            </div>
          </div>
        ) : (
          <div className="modal-body">
            <div className="rma-form">
              <label>
                Nova Senha
                <div className="password-input-wrap">
                  <input
                    type={show ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                  />
                  <button type="button" className="password-toggle" onClick={() => setShow(!show)}>
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              <label>
                Confirmar Senha
                <input
                  type={show ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                />
              </label>
            </div>
            {error && <div className="otp-sent-hint" style={{ color: '#e6706d' }}>{error}</div>}
            <div className="otp-actions">
              <button className="rma-advance-btn" onClick={onClose}>Cancelar</button>
              <button className="module-submit-btn" onClick={handleSubmit} disabled={loading}>
                {loading ? 'Alterando...' : 'Confirmar Alteração'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PlanModal({ plan, currentPlanName, onClose, onConfirm }: { plan: Plan; currentPlanName: string; onClose: () => void; onConfirm: () => void }) {
  const Icon = plan.icon;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4><Icon size={18} /> Confirmar Mudança de Plano</h4>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="plan-modal-summary">
            <div className="plan-modal-row">
              <small>Plano Atual</small>
              <strong>{currentPlanName}</strong>
            </div>
            <div className="plan-modal-arrow">→</div>
            <div className="plan-modal-row">
              <small>Novo Plano</small>
              <strong>{plan.name} — {money.format(plan.price)}/mês</strong>
            </div>
          </div>
          <ul className="plan-features">
            {plan.features.map((f, i) => (
              <li key={i}><Check size={13} /> {f}</li>
            ))}
          </ul>
          <div className="otp-sent-hint">
            A cobrança será ajustada na próxima fatura. Você pode cancelar a qualquer momento.
          </div>
          <div className="otp-actions">
            <button className="rma-advance-btn" onClick={onClose}>Cancelar</button>
            <button className="module-submit-btn" onClick={onConfirm}>
              <Check size={16} /> Confirmar Mudança
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
