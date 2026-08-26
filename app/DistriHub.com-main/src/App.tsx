import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Lock, ShieldAlert, Eye, KeyRound, Mail, ShieldCheck, CheckCircle2 } from 'lucide-react';
import type { CartItem, Product, BusinessSegment } from './types';
import { formatWhatsAppMessage, openWhatsApp } from './utils';
import { useProducts } from './hooks/useProducts';
import { useAuth } from './hooks/useAuth';
import { useSuperAdminAuth } from './hooks/useSuperAdminAuth';
import { Header } from './components/Header';
import { NavBar } from './components/NavBar';
import { CartDrawer } from './components/CartDrawer';
import { Footer } from './components/Footer';
import { PartnerPanel } from './components/PartnerPanel';
import { HubHome } from './components/HubHome';
import { AuthScreen } from './components/AuthScreen';
import { AdminPanel } from './components/AdminPanel';
import { supabase, isSupabaseConfigured } from './lib/supabase';

type View = 'hub' | 'partner' | 'auth' | 'admin' | 'super-admin';

function App() {
  const { products, loading } = useProducts();
  const auth = useAuth();
  const superAdminAuth = useSuperAdminAuth();

  const [view, setView] = useState<View>('hub');
  const [partnerInitialTab, setPartnerInitialTab] = useState<string | undefined>(undefined);
  const [superAdminUnlocked, setSuperAdminUnlocked] = useState(false);
  const [superAdminPassword, setSuperAdminPassword] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('Todos');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [city, setCity] = useState('');

  useEffect(() => {
    if (auth.passwordRecovery) setView('auth');
  }, [auth.passwordRecovery]);

  const segment: BusinessSegment = auth.profile?.segment ?? 'assistencia';

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const term = search.toLowerCase();
        const matchesSearch =
          !term ||
          `${product.name} ${product.subtitle} ${product.sku}`
            .toLowerCase()
            .includes(term);
        const matchesBrand = selectedBrand === 'Todos' || product.brand === selectedBrand;
        const matchesCategory =
          !selectedCategory || product.category === selectedCategory;
        return matchesSearch && matchesBrand && matchesCategory;
      }),
    [products, search, selectedBrand, selectedCategory],
  );

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const cartTotal = cart.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  );

  const cartQuantities = useMemo(() => {
    const map: Record<number, number> = {};
    for (const item of cart) map[item.id] = item.quantity;
    return map;
  }, [cart]);

  const productCountByBrand = useMemo(() => {
    const map: Record<string, number> = {};
    for (const product of products) {
      map[product.brand] = (map[product.brand] ?? 0) + 1;
    }
    return map;
  }, [products]);

  function addToCart(product: Product) {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        return current.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...current, { ...product, quantity: 1 }];
    });
  }

  function incrementQuantity(id: number) {
    setCart((current) =>
      current.map((item) =>
        item.id === id ? { ...item, quantity: item.quantity + 1 } : item,
      ),
    );
  }

  function decrementQuantity(id: number) {
    setCart((current) =>
      current.flatMap((item) => {
        if (item.id !== id) return [item];
        const quantity = item.quantity - 1;
        return quantity > 0 ? [{ ...item, quantity }] : [];
      }),
    );
  }

  function removeFromCart(id: number) {
    setCart((current) => current.filter((item) => item.id !== id));
  }

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
    const message = formatWhatsAppMessage(cart, businessName, city, cartTotal);
    openWhatsApp(message);
  }

  function clearFilters() {
    setSelectedBrand('Todos');
    setSelectedCategory('');
    setSearch('');
  }

  function handlePartnerClick() {
    if (auth.user) {
      setView('partner');
    } else {
      setView('auth');
    }
  }

  async function handleSuperAdminUnlock(password: string): Promise<boolean> {
    const ok = await superAdminAuth.verifyPassword(password);
    if (ok) {
      setSuperAdminPassword(password);
      setSuperAdminUnlocked(true);
      setView('super-admin');
    }
    return ok;
  }

  async function handleSignIn(email: string, password: string) {
    const result = await auth.signIn(email, password);
    if (!result.error) {
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
        <AuthScreen
          onBack={() => setView('hub')}
          onSignIn={handleSignIn}
          onSignUp={handleSignUp}
          onRequestPasswordReset={auth.requestPasswordReset}
          onUpdatePassword={auth.updatePassword}
          recoveryMode={auth.passwordRecovery}
        />
      )}

      {view === 'partner' && (
        <PartnerPanel
          onBack={() => setView('hub')}
          user={auth.user}
          segment={segment}
          initialTab={partnerInitialTab}
          onConsumeInitialTab={() => setPartnerInitialTab(undefined)}
        />
      )}

      {view === 'admin' && (
        <AdminPanel onBack={() => setView('hub')} accessPassword={superAdminPassword} />
      )}

      {view === 'super-admin' && !superAdminUnlocked && (
        <SuperAdminGate
          onBack={() => setView('hub')}
          onUnlock={handleSuperAdminUnlock}
          auth={superAdminAuth}
        />
      )}

      {view === 'super-admin' && superAdminUnlocked && (
        <AdminPanel onBack={() => setView('hub')} accessPassword={superAdminPassword} />
      )}

      <CartDrawer
        open={cartOpen}
        cart={cart}
        cartCount={cartCount}
        cartTotal={cartTotal}
        businessName={businessName}
        city={city}
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
  onUnlock: (password: string) => Promise<boolean>;
  auth: SuperAdminAuth;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const ok = await onUnlock(password);
    setSubmitting(false);
    if (!ok) {
      setError(true);
      setPassword('');
    }
  }

  if (showRecovery) {
    return (
      <RecoveryFlow
        auth={auth}
        onBack={() => setShowRecovery(false)}
        onSuccess={() => { setShowRecovery(false); setPassword(''); setError(false); }}
      />
    );
  }

  return (
    <div className="super-admin-gate">
      <div className="super-admin-gate-card">
        <div className="super-admin-gate-header">
          <span className="super-admin-gate-icon"><ShieldAlert size={28} /></span>
          <h2>Painel Super Admin — Distribuidora</h2>
          <p>Área restrita ao proprietário do sistema. Insira a credencial de acesso.</p>
        </div>
        <form onSubmit={handleSubmit} className="super-admin-gate-form">
          <label>
            <span className="social-label"><Lock size={14} /> Senha de Super Admin</span>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              placeholder="••••••••••••"
              autoFocus
              required
            />
          </label>
          {error && <p className="super-admin-gate-error">Credencial inválida. Acesso negado.</p>}
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
    const { code: returnedCode, error: err } = await auth.requestRecovery(email);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    if (returnedCode) {
      setInfo(`Código de recuperação gerado: ${returnedCode}`);
      setStep('verify');
    }
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
    const { error: err } = await auth.resetPassword(code, newPassword);
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
