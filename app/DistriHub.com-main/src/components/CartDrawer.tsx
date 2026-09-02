import { useState, useEffect } from 'react';
import {
  ArrowRight, Check, Minus, Plus, ShoppingBag, Trash2, X,
  QrCode, CreditCard, Wallet, Truck, Store, ShieldCheck, MessageCircle,
} from 'lucide-react';
import type { CartItem } from '../types';
import { money, formatWhatsAppMessage, openWhatsApp, generateOrderId } from '../utils';
import { paymentMethods, deliveryMethods, WHATSAPP_NUMBER } from '../data';

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
  onSendOrder: (paymentMethod?: string, deliveryMethod?: string) => void | Promise<void>;
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
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState(['', '', '', '']);
  const [otpError, setOtpError] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [otpVerified, setOtpVerified] = useState(false);
  const [confirmedOrderId, setConfirmedOrderId] = useState('');
  const [whatsappTarget, setWhatsappTarget] = useState<'store' | 'customer' | 'both'>(() => {
    if (customerWhatsapp && storeWhatsapp) return 'store';
    if (customerWhatsapp) return 'customer';
    return 'store';
  });

  const needsOtp = (paymentMethod === 'faturado' || paymentMethod === 'rma') && !otpVerified;
  const whatsappOptions = [
    { value: 'store' as const, label: 'Loja', enabled: Boolean(storeWhatsapp || WHATSAPP_NUMBER) },
    { value: 'customer' as const, label: 'Cliente', enabled: Boolean(customerWhatsapp) },
    { value: 'both' as const, label: 'Loja + cliente', enabled: Boolean(storeWhatsapp || WHATSAPP_NUMBER) && Boolean(customerWhatsapp) },
  ].filter((option) => option.enabled);

  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer]);

  function sendOtp() {
    setOtpSent(true);
    setResendTimer(30);
    setOtpCode(['', '', '', '']);
    setOtpError(false);
  }

  function handleOtpChange(idx: number, val: string) {
    if (!/\d?/.test(val)) return;
    const next = [...otpCode];
    next[idx] = val.slice(-1);
    setOtpCode(next);
    setOtpError(false);
    if (val && idx < 3) {
      const nextInput = document.getElementById(`otp-${idx + 1}`);
      nextInput?.focus();
    }
  }

  function verifyOtp() {
    const entered = otpCode.join('');
    if (entered.length === 4 && entered === '1234') {
      setOtpVerified(true);
      setShowOtp(false);
      setOtpSent(false);
    } else {
      setOtpError(true);
    }
  }

  function handleConfirmClick() {
    if (needsOtp) {
      sendOtp();
      setShowOtp(true);
      return;
    }
    submitOrder();
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

  function submitOrder() {
    const orderId = generateOrderId();
    setConfirmedOrderId(orderId);
    onSendOrder(paymentMethod, deliveryMethod);
    if (paymentMethod === 'pix') {
      const msg = formatWhatsAppMessage(cart, businessName, city, grandTotal, orderId, paymentMethod, deliveryMethod);
      openSelectedWhatsApp(msg);
    }
    setStep('confirmation');
  }

  function handleWhatsAppDirectOrder() {
    if (!isAuthenticated) {
      onLoginRequired();
      return;
    }
    const orderId = generateOrderId();
    setConfirmedOrderId(orderId);
    const msg = formatWhatsAppMessage(cart, businessName, city, cartTotal, orderId, paymentMethod, deliveryMethod);
    openSelectedWhatsApp(msg);
    onSendOrder(paymentMethod, deliveryMethod);
    setStep('confirmation');
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
    setStep('cart');
    setOtpVerified(false);
    setOtpSent(false);
    setOtpCode(['', '', '', '']);
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
                          <button onClick={() => onDecrement(item.id)} className="qty-btn-touch"><Minus size={14} /></button>
                          <b>{item.quantity}</b>
                          <button onClick={() => onIncrement(item.id)} className="qty-btn-touch"><Plus size={14} /></button>
                        </div>
                      </div>
                      <div className="drawer-item-end">
                        <strong>{money.format(item.price * item.quantity)}</strong>
                        <button onClick={() => onRemove(item.id)} aria-label="Remover item" className="qty-btn-touch">
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
                    <input value={businessName} onChange={(e) => onBusinessNameChange(e.target.value)} placeholder="Ex: Conserta Tudo" />
                  </label>
                  <label>
                    Cidade
                    <input value={city} onChange={(e) => onCityChange(e.target.value)} placeholder="Ex: São Paulo, SP" />
                  </label>
                </div>

                <div className="drawer-summary">
                  <div>
                    <span>Total geral</span>
                    <strong>{money.format(cartTotal)}</strong>
                  </div>
                  <small>Valores de atacado • Frete calculado no checkout</small>
                  <button className="whatsapp-button" onClick={handleCheckout} disabled={!canSubmit}>
                    Ir para checkout <ArrowRight size={17} />
                  </button>
                  <button
                    className="whatsapp-direct-button"
                    onClick={handleWhatsAppDirectOrder}
                    disabled={!canSubmit}
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

            {otpVerified && (
              <div className="sent-message" style={{ marginBottom: '12px' }}>
                <Check size={15} /> WhatsApp verificado! Você pode confirmar o pedido.
              </div>
            )}

            <div className="checkout-actions">
              <button className="rma-advance-btn" onClick={() => setStep('cart')}>Voltar</button>
              <button className="module-submit-btn" onClick={handleConfirmClick}>
                {needsOtp ? <><MessageCircle size={16} /> Verificar WhatsApp</> : <><Check size={16} /> Confirmar Pedido</>}
              </button>
            </div>

            {showOtp && (
              <div className="modal-backdrop" onClick={() => setShowOtp(false)}>
                <div className="modal-content otp-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3>Verificação por WhatsApp</h3>
                    <button onClick={() => setShowOtp(false)}><X size={18} /></button>
                  </div>
                  <p className="otp-description">
                    Para pagamentos com desconto de atacado ou crédito B2B, digite o código de 4 dígitos enviado para o WhatsApp cadastrado.
                  </p>
                  {otpSent && (
                    <p className="otp-sent-hint">
                      <MessageCircle size={14} /> Código de verificação enviado para o contato cadastrado.
                    </p>
                  )}
                  <div className="otp-input-row">
                    {otpCode.map((digit, idx) => (
                      <input
                        key={idx}
                        id={`otp-${idx}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(idx, e.target.value)}
                        className={`otp-digit ${otpError ? 'error' : ''}`}
                      />
                    ))}
                  </div>
                  {otpError && <p className="otp-error-msg">Código incorreto. Tente novamente.</p>}
                  <div className="otp-actions">
                    <button
                      className="rma-advance-btn"
                      onClick={sendOtp}
                      disabled={resendTimer > 0}
                    >
                      {resendTimer > 0 ? `Reenviar em ${resendTimer}s` : 'Reenviar código'}
                    </button>
                    <button className="module-submit-btn" onClick={verifyOtp}>
                      <Check size={16} /> Verificar
                    </button>
                  </div>
                </div>
              </div>
            )}
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
              <div><span>Total:</span><strong>{money.format(grandTotal)}</strong></div>
            </div>
            {paymentMethod === 'pix' && (
              <div className="confirmation-pix-area">
                <p>A chave PIX será informada pelo estabelecimento após a confirmação do pedido.</p>
              </div>
            )}
            {paymentMethod !== 'pix' && (
              <p className="confirmation-hint">
                <MessageCircle size={14} /> Os dados do pedido foram enviados via WhatsApp. Entraremos em contato para confirmar o pagamento.
              </p>
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
