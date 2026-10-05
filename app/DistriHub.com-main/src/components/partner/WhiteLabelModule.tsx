import { useEffect, useState } from 'react';
import { Check, ImagePlus, Palette, Printer, Upload, Wand2 } from 'lucide-react';
import type { StoreSettings } from '../../types';

type WhiteLabelModuleProps = {
  settings: StoreSettings;
  onUpdate: (settings: Partial<StoreSettings>) => Promise<unknown>;
};

const presetColors = ['#3193e5', '#199863', '#e6a06d', '#e3829b', '#5fd0d1', '#97aabc'];

export function WhiteLabelModule({ settings: initialSettings, onUpdate: persist }: WhiteLabelModuleProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setSettings(initialSettings);
  }, [initialSettings, dirty]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoPreview = settings.logo_url;
  const bannerPreview = settings.banner_url;
  function onUpdate(change: Partial<StoreSettings>) {
    setDirty(true);
    setSettings((current) => ({ ...current, ...change }));
    setSaved(false);
    setError(null);
  }
  function readImage(e: React.ChangeEvent<HTMLInputElement>, key: 'logo_url' | 'banner_url') {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError('Use uma imagem PNG, JPG ou WebP de até 2 MB.');
      return;
    }
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => { onUpdate({ [key]: reader.result as string }); setReading(false); };
      image.onerror = () => { setError('Imagem inválida. Escolha outro arquivo.'); setReading(false); };
      image.src = reader.result as string;
    };
    reader.onerror = () => { setError('Não foi possível ler a imagem.'); setReading(false); };
    reader.readAsDataURL(file);
  }
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => readImage(e, 'logo_url');
  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => readImage(e, 'banner_url');
  async function handleSave() {
    setSaving(true); setError(null); setSaved(false);
    try {
      const { logo_url, banner_url, primary_color, nav_color, receipt_footer_text, show_logo_on_receipt, show_cnpj_on_receipt, internal_notice, service_warranty_terms } = settings;
      await persist({ logo_url, banner_url, primary_color, nav_color, receipt_footer_text, show_logo_on_receipt, show_cnpj_on_receipt, internal_notice, service_warranty_terms: service_warranty_terms ?? '' });
      setDirty(false);
      setSaved(true);
    } catch (cause) {
      setError(cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'Não foi possível salvar. Tente novamente.');
    } finally { setSaving(false); }
  }

  return (
    <div className="panel-module">
      <fieldset disabled={saving || reading} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div className="module-header">
        <span className="module-icon"><Wand2 size={20} /></span>
        <div>
          <h3>Personalização da Loja</h3>
          <p>Configure a identidade visual e as opções de impressão</p>
        </div>
      </div>

      {/* Section 1: Identidade Visual & Tema */}
      <div className="section-divider">
        <span className="section-divider-label">Identidade Visual & Tema</span>
      </div>

      <div className="module-grid two-col">
        <div className="module-card">
          <div className="module-card-title"><ImagePlus size={16} /> Logotipo da Loja</div>
          <div className="upload-area">
            {logoPreview ? (
              <div className="upload-preview">
                <img src={logoPreview} alt="Logo" />
                <button onClick={() => { onUpdate({ logo_url: null }); }}>Remover</button>
              </div>
            ) : (
              <label className="upload-placeholder">
                <Upload size={28} />
                <span>Clique para enviar o logotipo</span>
                <small>PNG ou JPG • até 2MB</small>
                <input type="file" accept="image/*" onChange={handleLogoChange} hidden />
              </label>
            )}
          </div>
        </div>

        <div className="module-card">
          <div className="module-card-title"><ImagePlus size={16} /> Banner do Catálogo Público</div>
          <div className="upload-area">
            {bannerPreview ? (
              <div className="upload-preview banner">
                <img src={bannerPreview} alt="Banner" />
                <button onClick={() => { onUpdate({ banner_url: null }); }}>Remover</button>
              </div>
            ) : (
              <label className="upload-placeholder">
                <Upload size={28} />
                <span>Enviar banner promocional</span>
                <small>Recomendado: 1200x300px · PNG, JPG ou WebP até 2 MB</small>
                <input type="file" accept="image/*" onChange={handleBannerChange} hidden />
              </label>
            )}
          </div>
        </div>
      </div>

      <div className="module-card">
        <div className="module-card-title"><Palette size={16} /> Cores do Tema</div>
        <div className="color-picker-row">
          <div className="color-field">
            <label>Cor Primária</label>
            <div className="color-input-wrap">
              <input type="color" value={settings.primary_color} onChange={(e) => onUpdate({ primary_color: e.target.value })} />
              <span>{settings.primary_color}</span>
            </div>
          </div>
          <div className="color-field">
            <label>Cor da Barra de Navegação</label>
            <div className="color-input-wrap">
              <input type="color" value={settings.nav_color} onChange={(e) => onUpdate({ nav_color: e.target.value })} />
              <span>{settings.nav_color}</span>
            </div>
          </div>
        </div>
        <div className="preset-colors">
          <span>Predefinições:</span>
          {presetColors.map((color) => (
            <button
              key={color}
              className="preset-swatch"
              style={{ background: color }}
              onClick={() => onUpdate({ primary_color: color })}
              aria-label={`Aplicar cor ${color}`}
            />
          ))}
        </div>
      </div>

      {/* Section 2: Impressão & Cupom Não Fiscal */}
      <div className="section-divider">
        <span className="section-divider-label">Impressão & Cupom Não Fiscal</span>
      </div>

      <div className="module-card">
        <div className="module-card-title"><Printer size={16} /> Texto do Rodapé do Cupom</div>
        <textarea
          className="notice-input"
          value={settings.receipt_footer_text ?? ''}
          onChange={(e) => onUpdate({ receipt_footer_text: e.target.value })}
          placeholder="Ex: Obrigado pela preferência! Volte sempre. / Garantia de 90 dias conforme termo."
          rows={3}
        />
      </div>

      <div className="module-card">
        <label className="module-card-title" htmlFor="service-warranty-terms">Termo de Garantia de Serviços</label>
        <p className="otp-description">Informe os prazos, a cobertura e as condições de garantia dos serviços prestados. Este termo será exibido nas Ordens de Serviço.</p>
        <textarea
          id="service-warranty-terms"
          className="notice-input"
          value={settings.service_warranty_terms ?? ''}
          onChange={(e) => onUpdate({ service_warranty_terms: e.target.value })}
          placeholder="Digite o termo de garantia dos serviços da sua loja..."
          rows={6}
        />
      </div>

      <div className="module-card">
        <div className="module-card-title">Opções de Impressão</div>
        <div className="print-toggle-list">
          <label className="print-toggle-item">
            <input
              type="checkbox"
              checked={settings.show_logo_on_receipt}
              onChange={(e) => onUpdate({ show_logo_on_receipt: e.target.checked })}
            />
            <span>Exibir Logo no Cupom</span>
          </label>
          <label className="print-toggle-item">
            <input
              type="checkbox"
              checked={settings.show_cnpj_on_receipt}
              onChange={(e) => onUpdate({ show_cnpj_on_receipt: e.target.checked })}
            />
            <span>Exibir CNPJ/Endereço na Impressão</span>
          </label>
        </div>
      </div>

      <div className="module-card">
        <div className="module-card-title">Aviso Interno</div>
        <textarea
          className="notice-input"
          value={settings.internal_notice ?? ''}
          onChange={(e) => onUpdate({ internal_notice: e.target.value })}
          placeholder="Ex: Promoção de baterias até sexta — peça com antecedência!"
          rows={3}
        />
      </div>

      {error && <p role="alert" className="otp-error-msg">{error}</p>}
      {reading && <p role="status">Preparando imagem...</p>}
      <button className="module-save-btn" onClick={handleSave}>
        {saving ? 'Salvando...' : saved ? <><Check size={16} /> Salvo!</> : 'Salvar personalização'}
      </button>
      </fieldset>
    </div>
  );
}
