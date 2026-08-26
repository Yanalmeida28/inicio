import { useState } from 'react';
import { Check, ImagePlus, Palette, Printer, Upload, Wand2, Globe } from 'lucide-react';
import type { StoreSettings } from '../../types';
import { OnlineCatalogModule } from './OnlineCatalogModule';

type WhiteLabelModuleProps = {
  settings: StoreSettings;
  onUpdate: (settings: Partial<StoreSettings>) => void;
};

const presetColors = ['#3193e5', '#199863', '#e6a06d', '#e3829b', '#5fd0d1', '#97aabc'];

export function WhiteLabelModule({ settings, onUpdate }: WhiteLabelModuleProps) {
  const [saved, setSaved] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(settings.logo_url);
  const [bannerPreview, setBannerPreview] = useState<string | null>(settings.banner_url);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setLogoPreview(result);
      onUpdate({ logo_url: result });
    };
    reader.readAsDataURL(file);
  }

  function handleBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setBannerPreview(result);
      onUpdate({ banner_url: result });
    };
    reader.readAsDataURL(file);
  }

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="panel-module">
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
                <button onClick={() => { setLogoPreview(null); onUpdate({ logo_url: null }); }}>Remover</button>
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
          <div className="module-card-title"><ImagePlus size={16} /> Banner Promocional</div>
          <div className="upload-area">
            {bannerPreview ? (
              <div className="upload-preview banner">
                <img src={bannerPreview} alt="Banner" />
                <button onClick={() => { setBannerPreview(null); onUpdate({ banner_url: null }); }}>Remover</button>
              </div>
            ) : (
              <label className="upload-placeholder">
                <Upload size={28} />
                <span>Enviar banner promocional</span>
                <small>Recomendado: 1200x300px</small>
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
        <div className="module-card-title"><Printer size={16} /> Texto do Rodapé do Cupom / O.S.</div>
        <textarea
          className="notice-input"
          value={settings.receipt_footer_text ?? ''}
          onChange={(e) => onUpdate({ receipt_footer_text: e.target.value })}
          placeholder="Ex: Obrigado pela preferência! Volte sempre. / Garantia de 90 dias conforme termo."
          rows={3}
        />
      </div>

      <div className="module-card">
        <div className="module-card-title"><Printer size={16} /> Termos de Garantia (impresso em O.S.)</div>
        <textarea
          className="notice-input"
          value={settings.warranty_terms ?? ''}
          onChange={(e) => onUpdate({ warranty_terms: e.target.value })}
          placeholder="Ex: A garantia cobre defeitos de fabricação por 90 dias. Não cobre danos por líquidos, quedas, violação de selo de garantia, ou mau uso."
          rows={4}
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

      {/* Section 3: Catálogo Online */}
      <div className="section-divider">
        <span className="section-divider-label"><Globe size={14} /> Catálogo Online</span>
      </div>

      <OnlineCatalogModule settings={settings} onUpdate={onUpdate} />

      <button className="module-save-btn" onClick={handleSave}>
        {saved ? <><Check size={16} /> Salvo!</> : 'Salvar personalização'}
      </button>
    </div>
  );
}
