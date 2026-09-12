import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Lock, ShieldAlert, Eye, KeyRound, Mail, ShieldCheck, CheckCircle2 } from 'lucide-react';
import type { BusinessSegment } from './types';
import { formatWhatsAppMessage } from './utils';
import { useProducts } from './hooks/useProducts';
import { useAuth } from './hooks/useAuth';
import { useSuperAdminAuth } from './hooks/useSuperAdminAuth';
import { useCart } from './hooks/useCart';
import { useCatalogFilters } from './hooks/useCatalogFilters';
import { Header } from './components/Header';
import { NavBar } from './components/NavBar';
import { CartDrawer } from './components/CartDrawer';
import { Footer } from './components/Footer';
import { HubHome } from './components/HubHome';
import { supabase, isSupabaseConfigured } from './lib/supabase';

const PartnerPanel = lazy(() => import('./components/PartnerPanel').then((module) => ({ default: module.PartnerPanel })));
const AuthScreen = lazy(() => import('./components/AuthScreen').then((module) => ({ default: module.AuthScreen })));
const AdminPanel = lazy(() => import('./components/AdminPanel').then((module) => ({ default: module.AdminPanel })));

type View = 'hub' | 'partner' | 'auth' | 'admin' | 'super-admin';

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="super-admin-gate">
      <div className="super-admin-gate-card">
        <div className="super-admin-gate-header">
          <h2>{label}</h2>
          <p>Carregando painel...</p>
        </div>
      </div>
    </div>
  );
}

function App() {
  const { products, loading } = useProducts();
  const auth = useAuth();
  const superAdminAuth = useSuperAdminAuth();

  const [view, setView] = useState<View>('hub');
  const [partnerInitialTab, setPartnerInitialTab] = useState<string | undefined>(undefined);
  const [superAdminUnlocked, setSuperAdminUnlocked] = useState(false);
  const { cart, cartCount, cartTotal, cartQuantities, incrementQuantity, decrementQuantity, removeFromCart, setCart } = useCart();
  const {
    selectedBrand,
    setSelectedBrand,
    selectedCategory,
    setSelectedCategory,
    search,
    setSearch,
    filteredProducts,
    productCountByBrand,
    clearFilters,
  } = useCatalogFilters(products);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [city, setCity] = useState('');
  const storeWhatsapp = auth.profile?.whatsapp ?? null;

  useEffect(() => {
    if (auth.passwordRecovery) {
      setView('auth');
    }
  }, [auth.passwordRecovery]);

  const segment: BusinessSegment = auth.profile?.segment ?? 'assistencia';

  async function sendOrder(paymentMethod = 'pix', deliveryMethod = 'balcao') {
    if (!cart.length || !businessName.trim() || !city.trim()) return;
    if (isSupabaseConfigured && supabase && auth.user) {
      await supabase.from('b2b_orders').insert({
        user_id: auth.user.id,
        business_name: businessName.trim(),
        items: cart,
        total: cartTotal + (deliveryMethod === 'motoboy' ? 15 : 0),
        payment_method: paymentMethod,
        delivery_method: deliveryMethod,
        delivery_rate: deliveryMethod === 'motoboy' ? 15 : 0,
        status: 'pendente',
      });
    }
    // O envio via WhatsApp fica centralizado no checkout para respeitar a escolha do destino.
    return;
  }

  function handlePartnerClick() {
    if (auth.user) {
      setView('partner');
    } else {
      setView('auth');
    }
  }

  async function handleSuperAdminUnlock(email: string, password: string): Promise<{ ok: boolean; error: string | null }> {
    const result = await superAdminAuth.verifyPassword(email, password);
    if (result.ok) {
      setSuperAdminUnlocked(true);
      setView('super-admin');
    }
    return result;
  }

  function handleSuperAdminBack() {
    setSuperAdminUnlocked(false);
    setView('hub');
  }

  async function handlePartnerBack() {
    setPartnerInitialTab(undefined);
    setCartOpen(false);

    // Sair da área do parceiro também encerra a sessão do Supabase.
    // Isso evita voltar ao Hub com uma sessão antiga e, ao clicar
    // novamente em "Cadastrar ou Entrar", entrar sem refazer a autenticação.
    await auth.signOut();

    setView('hub');
  }

  function handleAuthBack() {
    setView('hub');
  }

  async function handleSignIn(email: string, password: string) {
    const result = await auth.signIn(email, password);
    if (!result.error) {
      setPartnerInitialTab(undefined);
      setView('partner');
    }
    return result;
  }

  async function handleSignUp(data: {
    businessName: string;
    whatsapp: string;
    email: string;
    password: string;
  }) {
    const result = await auth.signUp(data);
    if (!result.error) {
      setPartnerInitialTab(undefined);
      setView('partner');
    }
    return result;
  }

  function handleNavigateFromAdmin(tab: string) {
    setPartnerInitialTab(tab);
    setView('partner');
  }

  return (
    <div className="app-shell">
      {view === 'hub' && (
        <HubHome
          onAccessPanel={handlePartnerClick}
          onAccessSuperAdmin={() => setView('super-admin')}
          superAdminActive={superAdminUnlocked}
        />
      )}

      {view === 'auth' && (
        <Suspense fallback={<LoadingScreen label="Autenticação" />}>
          <AuthScreen
            onBack={handleAuthBack}
            onSignIn={handleSignIn}
            onSignUp={handleSignUp}
            onRequestPasswordReset={auth.requestPasswordReset}
            onUpdatePassword={auth.updatePassword}
            recoveryMode={auth.passwordRecovery}
          />
        </Suspense>
      )}

      {view === 'partner' && (
        <Suspense fallback={<LoadingScreen label="Área do parceiro" />}>
          <PartnerPanel
            onBack={handlePartnerBack}
            user={auth.user}
            identity={auth.identity}
            identityError={auth.error}
            segment={segment}
            initialTab={partnerInitialTab}
            onConsumeInitialTab={() => setPartnerInitialTab(undefined)}
          />
        </Suspense>
      )}

      {view === 'admin' && (
        <Suspense fallback={<LoadingScreen label="Administração" />}>
          <AdminPanel onBack={handleSuperAdminBack} />
        </Suspense>
      )}

      {view === 'super-admin' && !superAdminUnlocked && (
        <SuperAdminGate
          onBack={handleSuperAdminBack}
          onUnlock={handleSuperAdminUnlock}
          auth={superAdminAuth}
        />
      )}

      {view === 'super-admin' && superAdminUnlocked && (
        <Suspense fallback={<LoadingScreen label="Painel master" />}>
          <AdminPanel onBack={handleSuperAdminBack} />
        </Suspense>
      )}

      <CartDrawer
        open={cartOpen}
        cart={cart}
        cartCount={cartCount}
        cartTotal={cartTotal}
        businessName={businessName}
        city={city}
        storeWhatsapp={storeWhatsapp}
        customerWhatsapp={null}
        onClose={() => setCartOpen(false)}
        onIncrement={incrementQuantity}
        onDecrement={decrementQuantity}
        onRemove={removeFromCart}
        onBusinessNameChange={setBusinessName}
        onCityChange={setCity}
        onSendOrder={sendOrder}
        isAuthenticated={Boolean(auth.user)}
        onLoginRequired={() => { setCartOpen(false); setView('auth'); }}
        onExplore={() => setCartOpen(false)}
      />
    </div>
  );
}

export default App;

type SuperAdminAuth = ReturnType<typeof useSuperAdminAuth>;

type RecoveryStep = 'request' | 'verify' | 'done';

function SuperAdminGate({
  onBack,
  onUnlock,
  auth,
}: {
  onBack: () => void;
  onUnlock: (email: string, password: string) => Promise<{ ok: boolean; error: string | null }>;
  auth: SuperAdminAuth;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const result = await onUnlock(email, password);
      if (!result.ok) {
        setError(result.error ?? 'Credencial inválida. Acesso negado.');
        setPassword('');
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível validar a credencial.');
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  if (showRecovery) {
    return (
      <RecoveryFlow
        auth={auth}
        onBack={() => setShowRecovery(false)}
        onSuccess={() => { setShowRecovery(false); setPassword(''); setError(null); }}
      />
    );
  }

  return (
    <div className="super-admin-gate">
      <div className="super-admin-gate-card">
        <div className="super-admin-gate-header">
          <span className="super-admin-gate-icon"><ShieldAlert size={28} /></span>
          <h2>Painel Super Admin — Distribuidora</h2>
          <p>Área restrita ao proprietário do sistema. Use sua conta autenticada do Super Admin.</p>
        </div>
        <form onSubmit={handleSubmit} className="super-admin-gate-form">
          <label>
            <span className="social-label text-slate-900"><Mail size={14} /> E-mail do Super Admin</span>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              placeholder="admin@distrihub.com"
              autoFocus
              required
            />
          </label>
          <label>
            <span className="social-label text-slate-900"><Lock size={14} /> Senha</span>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder="••••••••••••"
              required
            />
          </label>
          {error && <p className="super-admin-gate-error">{error}</p>}
          <button
            type="button"
            className="super-admin-forgot-link"
            onClick={() => setShowRecovery(true)}
          >
            <KeyRound size={13} /> Esqueci minha senha
          </button>
          <div className="super-admin-gate-actions">
            <button type="button" className="partner-back-btn" onClick={onBack}>
              <ArrowLeft size={16} /> Voltar ao início
            </button>
            <button type="submit" className="module-submit-btn" disabled={submitting}>
              <Eye size={16} /> {submitting ? 'Verificando...' : 'Liberar Acesso'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RecoveryFlow({
  auth,
  onBack,
  onSuccess,
}: {
  auth: SuperAdminAuth;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<RecoveryStep>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err } = await auth.requestRecovery(email);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    setInfo('Link de recuperação enviado para o e-mail informado. Use a redefinição segura do Supabase Auth para concluir a troca de senha.');
    setStep('done');
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('As senhas não conferem.');
      return;
    }
    if (newPassword.length < 6) {
      setError('A nova senha deve ter ao menos 6 caracteres.');
      return;
    }
    setLoading(true);
    setError(null);
    const { error: err } = await auth.resetPassword(newPassword);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    setStep('done');
  }

  return (
    <div className="super-admin-gate">
      <div className="super-admin-gate-card">
        <div className="super-admin-gate-header">
          <span className="super-admin-gate-icon"><KeyRound size={28} /></span>
          <h2>Recuperar Acesso Master</h2>
          {step !== 'done' && <p>Verifique sua identidade para redefinir a senha master.</p>}
        </div>

        {step === 'request' && (
          <form onSubmit={handleRequestCode} className="super-admin-gate-form">
            <label>
              <span className="social-label"><Mail size={14} /> E-mail do Admin Master</span>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                placeholder="admin@distrihub.com"
                autoFocus
                required
              />
            </label>
            {error && <p className="super-admin-gate-error">{error}</p>}
            <div className="super-admin-gate-actions">
              <button type="button" className="partner-back-btn" onClick={onBack}>
                <ArrowLeft size={16} /> Voltar ao login
              </button>
              <button type="submit" className="module-submit-btn" disabled={loading}>
                <ShieldCheck size={16} /> {loading ? 'Enviando...' : 'Gerar código'}
              </button>
            </div>
          </form>
        )}

        {step === 'verify' && (
          <form onSubmit={handleReset} className="super-admin-gate-form">
            {info && <p className="super-admin-recovery-info">{info}</p>}
            <label>
              <span className="social-label"><KeyRound size={14} /> Código de Verificação</span>
              <input
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value); setError(null); }}
                placeholder="XXXXXXXX"
                autoFocus
                required
              />
            </label>
            <label>
              <span className="social-label"><Lock size={14} /> Nova Senha Master</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setError(null); }}
                placeholder="Mínimo 6 caracteres"
                required
              />
            </label>
            <label>
              <span className="social-label"><Lock size={14} /> Confirmar Nova Senha</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                placeholder="Repita a nova senha"
                required
              />
            </label>
            {error && <p className="super-admin-gate-error">{error}</p>}
            <div className="super-admin-gate-actions">
              <button type="button" className="partner-back-btn" onClick={() => setStep('request')}>
                <ArrowLeft size={16} /> Voltar
              </button>
              <button type="submit" className="module-submit-btn" disabled={loading}>
                <ShieldCheck size={16} /> {loading ? 'Redefinindo...' : 'Redefinir senha'}
              </button>
            </div>
          </form>
        )}

        {step === 'done' && (
          <div className="super-admin-gate-form">
            <div className="super-admin-recovery-success">
              <CheckCircle2 size={40} />
              <h3>Senha redefinida com sucesso!</h3>
              <p>Você já pode acessar o painel master com sua nova senha.</p>
            </div>
            <button type="button" className="module-submit-btn" onClick={onSuccess}>
              <ArrowLeft size={16} /> Voltar ao login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
