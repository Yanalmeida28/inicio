import { useState } from 'react';
import {
  Globe, Share2, QrCode, ExternalLink, Clock, TicketPercent, Instagram,
  Facebook, MessageCircle, Copy, Check, Eye, EyeOff, Power,
} from 'lucide-react';
import type { StoreSettings } from '../../types';

type Props = {
  settings: StoreSettings;
  onUpdate: (settings: Partial<StoreSettings>) => void;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function OnlineCatalogModule({ settings, onUpdate }: Props) {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [saved, setSaved] = useState(false);

  const slug = settings.catalog_slug ?? '';
  const catalogUrl = slug ? `${window.location.origin}/catalogo/${slug}` : '';

  function handleSlugChange(value: string) {
    onUpdate({ catalog_slug: slugify(value) || null });
  }

  function handleShare() {
    if (!catalogUrl) return;
    navigator.clipboard?.writeText(catalogUrl).then(() => {
      setCopied(true);
      setShowQR(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      setShowQR(true);
    });
  }

  function handleAccess() {
    if (catalogUrl) window.open(catalogUrl, '_blank', 'noopener,noreferrer');
  }

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="panel-module">
      <div className="module-header">
        <span className="module-icon"><Globe size={20} /></span>
        <div>
          <h3>Catálogo Online</h3>
          <p>Configure sua vitrine pública e compartilhe com clientes</p>
        </div>
      </div>

      {/* Master Toggle */}
      <div className="module-card catalog-toggle-card">
        <div className="catalog-toggle-info">
          <div className="catalog-toggle-icon">
            <Power size={20} />
          </div>
          <div>
            <strong>Catálogo Público Ativo</strong>
            <small>Quando ativado, seus produtos ficam visíveis no link público</small>
          </div>
        </div>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={settings.catalog_enabled}
            onChange={(e) => onUpdate({ catalog_enabled: e.target.checked })}
          />
          <span className="toggle-slider"></span>
        </label>
      </div>

      {/* Store URL Slug */}
      <div className="module-card">
        <div className="module-card-title"><Globe size={16} /> Link do Catálogo</div>
        <label className="catalog-slug-label">Identificador da Loja (URL)</label>
        <div className="catalog-slug-row">
          <span className="catalog-slug-prefix">{window.location.origin}/catalogo/</span>
          <input
            className="catalog-slug-input"
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="minha-loja"
          />
        </div>
        {catalogUrl && (
          <div className="catalog-url-preview">
            <ExternalLink size={14} />
            <span>{catalogUrl}</span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="catalog-action-row">
        <button className="module-action-btn" onClick={handleAccess} disabled={!catalogUrl || !settings.catalog_enabled}>
          <ExternalLink size={16} /> Acessar Catálogo
        </button>
        <button className="module-action-btn" onClick={handleShare} disabled={!catalogUrl}>
          {copied ? <><Check size={16} /> Link Copiado!</> : <><Share2 size={16} /> Compartilhar</>}
        </button>
      </div>

      {showQR && catalogUrl && (
        <div className="catalog-qr-card">
          <div className="catalog-qr-preview">
            <QrCode size={120} />
          </div>
          <div className="catalog-qr-info">
            <strong>QR Code do Catálogo</strong>
            <small>Escaneie para acessar a vitrine pública</small>
            <small className="catalog-qr-url">{catalogUrl}</small>
          </div>
        </div>
      )}

      {/* Out-of-Stock Behavior */}
      <div className="module-card">
        <div className="module-card-title"><Eye size={16} /> Comportamento de Produtos Sem Estoque</div>
        <div className="catalog-oos-options">
          <button
            className={`catalog-oos-option ${settings.catalog_oos_behavior === 'indisponivel' ? 'active' : ''}`}
            onClick={() => onUpdate({ catalog_oos_behavior: 'indisponivel' })}
          >
            <Eye size={18} />
            <div>
              <strong>Exibir como indisponível</strong>
              <small>O produto aparece, mas sem opção de compra</small>
            </div>
          </button>
          <button
            className={`catalog-oos-option ${settings.catalog_oos_behavior === 'ocultar' ? 'active' : ''}`}
            onClick={() => onUpdate({ catalog_oos_behavior: 'ocultar' })}
          >
            <EyeOff size={18} />
            <div>
              <strong>Ocultar produto</strong>
              <small>Produto não aparece no catálogo público</small>
            </div>
          </button>
        </div>
      </div>

      {/* Social Links */}
      <div className="module-card">
        <div className="module-card-title"><Share2 size={16} /> Redes Sociais & Contato</div>
        <div className="rma-form">
          <label>
            <span className="social-label"><Facebook size={14} /> Facebook</span>
            <input
              value={settings.social_facebook ?? ''}
              onChange={(e) => onUpdate({ social_facebook: e.target.value || null })}
              placeholder="https://facebook.com/sualoja"
            />
          </label>
          <label>
            <span className="social-label"><Instagram size={14} /> Instagram</span>
            <input
              value={settings.social_instagram ?? ''}
              onChange={(e) => onUpdate({ social_instagram: e.target.value || null })}
              placeholder="@sualoja ou https://instagram.com/sualoja"
            />
          </label>
          <label>
            <span className="social-label"><MessageCircle size={14} /> WhatsApp</span>
            <input
              value={settings.social_whatsapp ?? ''}
              onChange={(e) => onUpdate({ social_whatsapp: e.target.value || null })}
              placeholder="(11) 99999-9999"
            />
          </label>
        </div>
      </div>

      {/* Sub-modules Menu */}
      <div className="section-divider">
        <span className="section-divider-label">Sub-módulos do Catálogo</span>
      </div>

      <div className="catalog-submodule-grid">
        <div className="catalog-submodule-card">
          <div className="catalog-submodule-icon"><Clock size={22} /></div>
          <strong>Horário de Funcionamento</strong>
          <small>Configure os horários de atendimento</small>
          <textarea
            className="notice-input"
            value={settings.business_hours ?? ''}
            onChange={(e) => onUpdate({ business_hours: e.target.value || null })}
            placeholder="Ex: Seg-Sex 8h-18h, Sáb 8h-12h, Dom fechado"
            rows={2}
          />
        </div>
        <div className="catalog-submodule-card">
          <div className="catalog-submodule-icon"><TicketPercent size={22} /></div>
          <strong>Cupons de Desconto</strong>
          <small>Crie cupons promocionais para o catálogo</small>
          <button className="rma-advance-btn" disabled>
            <TicketPercent size={14} /> Em breve
          </button>
        </div>
        <div className="catalog-submodule-card">
          <div className="catalog-submodule-icon"><Instagram size={22} /></div>
          <strong>Integração Instagram</strong>
          <small>Conecte seu Instagram à vitrine</small>
          <button className="rma-advance-btn" disabled>
            <Instagram size={14} /> Em breve
          </button>
        </div>
      </div>

      <button className="module-save-btn" onClick={handleSave}>
        {saved ? <><Check size={16} /> Salvo!</> : 'Salvar Configurações do Catálogo'}
      </button>
    </div>
  );
}
