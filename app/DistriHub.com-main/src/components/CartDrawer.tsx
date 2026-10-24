import { useState, useRef } from 'react';
import {
  ArrowRight, Check, Minus, Plus, ShoppingBag, Trash2, X,
  QrCode, CreditCard, Wallet, Truck, Store, ShieldCheck, MessageCircle,
} from 'lucide-react';
import type { CartItem } from '../types';
import { money, formatWhatsAppMessage, openWhatsApp } from '../utils';
import { paymentMethods, deliveryMethods, WHATSAPP_NUMBER } from '../data';
import { B2bOrderRejected } from '../lib/b2bOrder';

type CartDrawerProps = {
  open: boolean;
  cart: CartItem[];
  cartCount: number;
  cartTotal: number;
  businessName: string;
  city: string;
  storeWhatsapp?: string | null;
  customerWhatsapp?: string | null;
  onClose: () => void;
  onIncrement: (id: number) => void;
  onDecrement: (id: number) => void;
  onRemove: (id: number) => void;
  onBusinessNameChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onSendOrder: (paymentMethod: string, deliveryMethod: string, requestId: string) => Promise<{ id: string; total: number }>;
  onExplore: () => void;
  isAuthenticated: boolean;
  onLoginRequired: () => void;
};

export function CartDrawer({
  open, cart, cartCount, cartTotal, businessName, city, storeWhatsapp, customerWhatsapp,
  onClose, onIncrement, onDecrement, onRemove,
  onBusinessNameChange, onCityChange, onSendOrder, onExplore,
  isAuthenticated, onLoginRequired,
}: CartDrawerProps) {
  const [step, setStep] = useState<'cart' | 'checkout' | 'confirmation'>('cart');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [deliveryMethod, setDeliveryMethod] = useState('balcao');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedTotal, setConfirmedTotal] = useState(0);
  const submittingRef = useRef(false);
  const pendingRef = useRef<{ id: string; fingerprint: string; uncertain: boolean } | null>(null);
  const [confirmedOrderId, setConfirmedOrderId] = useState('');
  const [whatsappTarget, setWhatsappTarget] = useState<'store' | 'customer' | 'both'>(() => {
    if (customerWhatsapp && storeWhatsapp) return 'store';
    if (customerWhatsapp) return 'customer';
    return 'store';
  });

  const creditPayment = paymentMethod === 'faturado' || paymentMethod === 'rma';
  const whatsappOptions = [
    { value: 'store' as const, label: 'Loja', enabled: Boolean(storeWhatsapp || WHATSAPP_NUMBER) },
    { value: 'customer' as const, label: 'Cliente', enabled: Boolean(customerWhatsapp) },
    { value: 'both' as const, label: 'Loja + cliente', enabled: Boolean(storeWhatsapp || WHATSAPP_NUMBER) && Boolean(customerWhatsapp) },
  ].filter((option) => option.enabled);

  function handleConfirmClick() {
    void submitOrder(false);
  }

  function openSelectedWhatsApp(message: string) {
    const entries = (() => {
      switch (whatsappTarget) {
        case 'customer':
          return customerWhatsapp ? [customerWhatsapp] : [storeWhatsapp ?? WHATSAPP_NUMBER];
        case 'both':
          return [storeWhatsapp ?? WHATSAPP_NUMBER, customerWhatsapp].filter(Boolean) as string[];
        case 'store':
        default:
          return [storeWhatsapp ?? WHATSAPP_NUMBER];
      }
    })();

    entries.forEach((phone) => {
      if (!phone) return;
      openWhatsApp(message, phone);
    });
  }

  async function submitOrder(share: boolean) {
    if (submittingRef.current) return;
    if (!isAuthenticated) { onLoginRequired(); return; }
    if (!cart.length || !businessName.trim() || !city.trim()) return;
    if (creditPayment) {
      setSubmitError('Pagamento com crédito precisa de autorização do estabelecimento. Escolha PIX ou cartão para enviar o pedido.');
      return;
    }
    const fingerprint = JSON.stringify({ cart, businessName, city, paymentMethod, deliveryMethod });
    if (pendingRef.current && pendingRef.current.fingerprint !== fingerprint) {
      setSubmitError('Há um envio sem confirmação. Restaure os dados do pedido anterior e tente novamente antes de enviar outro pedido.');
      return;
    }
    const attempt = pendingRef.current ?? { id: crypto.randomUUID(), fingerprint, uncertain: false };
    pendingRef.current = attempt;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const saved = await onSendOrder(paymentMethod, deliveryMethod, attempt.id);
      setConfirmedOrderId(saved.id);
      setConfirmedTotal(saved.total);
      pendingRef.current = null;
      setStep('confirmation');
      if (share || paymentMethod === 'pix') {
        const message = formatWhatsAppMessage(cart, businessName, city, saved.total, saved.id, paymentMethod, deliveryMethod);
        openSelectedWhatsApp(message);
      }
    } catch (error) {
      if (error instanceof B2bOrderRejected && !attempt.uncertain) pendingRef.current = null;
      else attempt.uncertain = true;
      setSubmitError(error instanceof Error ? error.message : 'Não foi possível confirmar o pedido. Tente novamente.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function handleWhatsAppDirectOrder() {
    void submitOrder(true);
  }

  if (!open) return null;

  const canSubmit = cart.length > 0 && businessName.trim() && city.trim();
  const deliveryFee = deliveryMethod === 'motoboy' ? 15.0 : 0;
  const grandTotal = cartTotal + deliveryFee;

  function handleCheckout() {
    if (!isAuthenticated) {
      onLoginRequired();
      return;
    }
    setStep('checkout');
  }

  function handleClose() {
    if (submittingRef.current) return;
    setStep('cart');
    setSubmitError(null);
    onClose();
  }

  const paymentIcons: Record<string, typeof QrCode> = {
    pix: QrCode, cartao: CreditCard, faturado: Wallet, rma: ShieldCheck,
  };

  const deliveryIcons: Record<string, typeof Store> = {
    balcao: Store, motoboy: Truck, rota_manha: Truck, rota_tarde: Truck,
  };

  return (
    <div className="cart-backdrop" onClick={handleClose}>
      <aside className="cart-drawer" onClick={(e) => e.stopPropagation()}>
        {submitError && <p role="alert" className="otp-error-msg">{submitError}</p>}
        <div className="drawer-header">
          <div>
            <span className="section-kicker">
              {step === 'cart' ? 'Seu pedido' : step === 'checkout' ? 'Checkout B2B' : 'Confirmação'}
            </span>
            <h2>
              {step === 'cart' && <>Lista de compra <span>{cartCount}</span></>}
              {step === 'checkout' && 'Finalizar Pedido'}
              {step === 'confirmation' && 'Pedido Enviado!'}
            </h2>
          </div>
          <button className="close-button" onClick={handleClose} aria-label="Fechar">
            <X size={21} />
          </button>
        </div>

        {step === 'cart' && (
          <>
            {cart.length ? (
              <>
                <div className="drawer-items">
                  {cart.map((item) => (
                    <div className="drawer-item" key={item.id}>
                      <img src={item.image} alt="" loading="lazy" />
                      <div className="drawer-item-info">
                        <strong>{item.name}</strong>
                        <small>{money.format(item.price)} / un.</small>
                        <div className="quantity-control">
                          <button disabled={submitting} onClick={() => onDecrement(item.id)} className="qty-btn-touch"><Minus size={14} /></button>
                          <b>{item.quantity}</b>
                          <button disabled={submitting} onClick={() => onIncrement(item.id)} className="qty-btn-touch"><Plus size={14} /></button>
                        </div>
                      </div>
                      <div className="drawer-item-end">
                        <strong>{money.format(item.price * item.quantity)}</strong>
                        <button disabled={submitting} onClick={() => onRemove(item.id)} aria-label="Remover item" className="qty-btn-touch">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="order-form">
                  <span className="section-kicker">Para enviar o pedido</span>
                  <label>
                    Nome da empresa/assistência
                    <input disabled={submitting} value={businessName} onChange={(e) => onBusinessNameChange(e.target.value)} placeholder="Ex: Conserta Tudo" />
                  </label>
                  <label>
                    Cidade
                    <input disabled={submitting} value={city} onChange={(e) => onCityChange(e.target.value)} placeholder="Ex: São Paulo, SP" />
                  </label>
                </div>

                <div className="drawer-summary">
                  <div>
                    <span>Total geral</span>
                    <strong>{money.format(cartTotal)}</strong>
                  </div>
                  <small>Valores de atacado • Frete calculado no checkout</small>
                  <button className="whatsapp-button" onClick={handleCheckout} disabled={!canSubmit || submitting}>
                    Ir para checkout <ArrowRight size={17} />
                  </button>
                  <button
                    className="whatsapp-direct-button"
                    onClick={handleWhatsAppDirectOrder}
                    disabled={!canSubmit || submitting}
                  >
                    <MessageCircle size={18} /> Fazer Pedido via WhatsApp
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-cart">
                <ShoppingBag size={40} />
                <h3>Seu pedido está vazio</h3>
                <p>Adicione produtos do catálogo para começar.</p>
                <button className="primary-button" onClick={onExplore}>
                  Explorar catálogo <ArrowRight size={16} />
                </button>
              </div>
            )}
          </>
        )}

        {step === 'checkout' && (
          <div className="checkout-step">
            <div className="checkout-section">
              <h4>Forma de Pagamento</h4>
              <div className="payment-options">
                {paymentMethods.map((pm) => {
                  const Icon = paymentIcons[pm.value] ?? Wallet;
                  return (
                    <button
                      key={pm.value}
                      className={`payment-option ${paymentMethod === pm.value ? 'selected' : ''}`}
                      disabled={submitting}
                      onClick={() => setPaymentMethod(pm.value)}
                    >
                      <Icon size={18} /> {pm.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="checkout-section">
              <h4>Logística & Entrega</h4>
              <div className="delivery-options">
                {deliveryMethods.map((dm) => {
                  const Icon = deliveryIcons[dm.value] ?? Store;
                  return (
                    <button
                      key={dm.value}
                      className={`delivery-option ${deliveryMethod === dm.value ? 'selected' : ''}`}
                      disabled={submitting}
                      onClick={() => setDeliveryMethod(dm.value)}
                    >
                      <Icon size={18} /> {dm.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {whatsappOptions.length > 0 && (
              <div className="checkout-section">
                <h4>Destino do WhatsApp</h4>
                <div className="delivery-options" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                  {whatsappOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`delivery-option ${whatsappTarget === option.value ? 'selected' : ''}`}
                      onClick={() => setWhatsappTarget(option.value)}
                    >
                      <MessageCircle size={18} /> {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {paymentMethod === 'pix' && (
              <div className="pix-checkout">
                <div className="pix-qr-area">
                  <QrCode size={100} />
                  <small>PIX Instantâneo</small>
                </div>
                <div className="pix-copy-area">
                  <small>Chave PIX será informada pelo estabelecimento após a confirmação do pedido.</small>
                </div>
              </div>
            )}

            <div className="checkout-summary">
              <div className="summary-row">
                <span>Subtotal</span><span>{money.format(cartTotal)}</span>
              </div>
              <div className="summary-row">
                <span>Entrega</span><span>{deliveryFee > 0 ? money.format(deliveryFee) : 'Grátis'}</span>
              </div>
              <div className="summary-row total">
                <span>Total</span><strong>{money.format(grandTotal)}</strong>
              </div>
            </div>

            {creditPayment && <p role="note">Pagamentos com crédito dependem de autorização do estabelecimento e estão indisponíveis neste checkout.</p>}
            <div className="checkout-actions">
              <button className="rma-advance-btn" disabled={submitting} onClick={() => setStep('cart')}>Voltar</button>
              <button className="module-submit-btn" disabled={!canSubmit || submitting || creditPayment} onClick={handleConfirmClick}>
                <Check size={16} /> {submitting ? 'Enviando...' : 'Confirmar Pedido'}
              </button>
            </div>
          </div>
        )}

        {step === 'confirmation' && (
          <div className="empty-cart confirmation">
            <div className="confirmation-icon"><Check size={48} /></div>
            <h3>Pedido confirmado com sucesso!</h3>
            <p>
              Seu pedido <strong>#{confirmedOrderId}</strong> foi enviado e está sendo processado.
              Acompanhe o status pela área de consulta de pedidos.
            </p>
            <div className="confirmation-details">
              <div><span>Pedido:</span><strong>#{confirmedOrderId}</strong></div>
              <div><span>Pagamento:</span><strong>{paymentMethods.find((p) => p.value === paymentMethod)?.label}</strong></div>
              <div><span>Entrega:</span><strong>{deliveryMethods.find((d) => d.value === deliveryMethod)?.label}</strong></div>
              <div><span>Total:</span><strong>{money.format(confirmedTotal)}</strong></div>
            </div>
            {paymentMethod === 'pix' && (
              <div className="confirmation-pix-area">
                <p>A chave PIX será informada pelo estabelecimento após a confirmação do pedido.</p>
              </div>
            )}
            {paymentMethod !== 'pix' && (
              <p className="confirmation-hint">
                <MessageCircle size={14} /> Seu pedido foi registrado. Entre em contato com o estabelecimento para combinar o pagamento.
              </p>
            )}
            {whatsappOptions.length > 0 && (
              <button className="whatsapp-direct-button" onClick={() => openSelectedWhatsApp(
                formatWhatsAppMessage(cart, businessName, city, confirmedTotal, confirmedOrderId, paymentMethod, deliveryMethod),
              )}>
                <MessageCircle size={18} /> Enviar pedido pelo WhatsApp
              </button>
            )}
            <button className="primary-button" onClick={handleClose}>
              Concluir <ArrowRight size={16} />
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
