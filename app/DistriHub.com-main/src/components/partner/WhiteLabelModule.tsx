import { useEffect, useState } from 'react';
import { Check, ImagePlus, Palette, Printer, Upload, Wand2 } from 'lucide-react';
import type { StoreSettings, StorePersonalization } from '../../types';
import { normalizeColor, storeTheme } from '../../lib/storeTheme';
import { receiptPreferences, panelPreferences, panelStyle, catalogPreferences, catalogWhatsappUrl } from '../../lib/personalization';

type WhiteLabelModuleProps = {
  settings: StoreSettings;
  onUpdate: (settings: Partial<StoreSettings>) => Promise<unknown>;
};

const presetColors = ['#3193e5', '#2563eb', '#199863', '#0f766e', '#7c3aed', '#a21caf', '#be185d', '#e3829b', '#c2410c', '#e6a06d', '#ca8a04', '#5fd0d1', '#475569', '#97aabc'];
const navigationColors = ['#0f2747', '#0f172a', '#1e293b', '#14532d', '#134e4a', '#3b0764', '#4c0519', '#ffffff'];

export function WhiteLabelModule({ settings: initialSettings, onUpdate: persist }: WhiteLabelModuleProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [activeTab, setActiveTab] = useState<'visual' | 'painel' | 'cupom' | 'catalogo'>('visual');
  const receipt = receiptPreferences(settings.personalization?.receipt);
  const panel = panelPreferences(settings.personalization?.panel);
  const catalog = catalogPreferences(settings.personalization?.catalog);
  function updatePreference<K extends keyof StorePersonalization>(group: K, value: StorePersonalization[K]) {
    onUpdate({ personalization: { ...settings.personalization, [group]: value } });
  }
  function restoreSection() {
    if (activeTab === 'visual') onUpdate({ primary_color: '#3193e5', nav_color: '#0f2747' });
    else updatePreference(activeTab === 'painel' ? 'panel' : activeTab === 'cupom' ? 'receipt' : 'catalog', {});
  }
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
    if (catalog.whatsapp_phone.trim() && !catalogWhatsappUrl(catalog.whatsapp_phone)) {
      setError('Informe um WhatsApp válido com DDD ou código do país.'); setActiveTab('catalogo'); return;
    }
    setSaving(true); setError(null); setSaved(false);
    try {
      const { logo_url, banner_url, primary_color, nav_color, receipt_footer_text, show_logo_on_receipt, show_cnpj_on_receipt, internal_notice, service_warranty_terms } = settings;
      await persist({ logo_url, banner_url, primary_color, nav_color, receipt_footer_text, show_logo_on_receipt, show_cnpj_on_receipt, internal_notice, service_warranty_terms: service_warranty_terms ?? '', personalization: settings.personalization ?? {} });
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

      <nav className="personalization-tabs" aria-label="Seções de personalização">
        {([{ id: 'visual', label: 'Identidade visual' }, { id: 'painel', label: 'Painel' }, { id: 'cupom', label: 'Cupom e termos' }, { id: 'catalogo', label: 'Catálogo' }] as const).map(tab => (
          <button key={tab.id} type="button" className={activeTab === tab.id ? 'active' : ''} aria-pressed={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>
        ))}
      </nav>
      <section hidden={activeTab !== 'visual'} aria-label="Identidade visual">
      <div className="module-card">
        <div className="module-card-title"><Palette size={16} /> Temas prontos</div>
        <p className="otp-description">Escolha uma combinação e ajuste as cores abaixo.</p>
        <div className="personalization-presets">
          {[{ name: 'Azul profissional', primary: '#2563eb', nav: '#0f2747' }, { name: 'Verde', primary: '#199863', nav: '#14532d' }, { name: 'Roxo', primary: '#7c3aed', nav: '#3b0764' }, { name: 'Rosa', primary: '#be185d', nav: '#4c0519' }, { name: 'Laranja', primary: '#c2410c', nav: '#431407' }, { name: 'Neutro', primary: '#475569', nav: '#0f172a' }].map(theme => (
            <button type="button" key={theme.name} aria-label={`Aplicar tema ${theme.name}`} aria-pressed={normalizeColor(settings.primary_color) === theme.primary && normalizeColor(settings.nav_color) === theme.nav} onClick={() => onUpdate({ primary_color: theme.primary, nav_color: theme.nav })}>
              <span style={{ background: theme.nav }} /><span style={{ background: theme.primary }} />{theme.name}
            </button>
          ))}
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
                <small>PNG, JPG ou WebP • até 2MB</small>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoChange} hidden />
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
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleBannerChange} hidden />
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
              <input aria-label="Cor primária" type="color" value={normalizeColor(settings.primary_color)} onChange={(e) => onUpdate({ primary_color: e.target.value })} />
              <span>{settings.primary_color}</span>
            </div>
          </div>
          <div className="color-field">
            <label>Cor da Barra de Navegação</label>
            <div className="color-input-wrap">
              <input aria-label="Cor da barra de navegação" type="color" value={normalizeColor(settings.nav_color, '#0f2747')} onChange={(e) => onUpdate({ nav_color: e.target.value })} />
              <span>{settings.nav_color}</span>
            </div>
          </div>
        </div>
        <div className="preset-colors">
          <span>Cor primária:</span>
          {presetColors.map((color) => (
            <button
              key={color}
              type="button"
              className="preset-swatch"
              aria-pressed={normalizeColor(settings.primary_color) === color}
              style={{ background: color }}
              onClick={() => onUpdate({ primary_color: color })}
              aria-label={`Aplicar cor ${color}`}
            />
          ))}
        </div>
        <div className="preset-colors">
          <span>Barra de navegação:</span>
          {navigationColors.map(color => (
            <button key={color} type="button" className="preset-swatch" style={{ background: color }}
              aria-label={`Aplicar cor de navegação ${color}`} aria-pressed={normalizeColor(settings.nav_color, '#0f2747') === color}
              onClick={() => onUpdate({ nav_color: color })} />
          ))}
        </div>
        <div className="store-theme-preview" style={storeTheme(settings.primary_color, settings.nav_color) as React.CSSProperties}>
          <div className="store-theme-preview-nav">Sua loja · Navegação</div>
          <div className="store-theme-preview-content">
            <span className="store-theme-preview-tab">Aba selecionada</span>
            <span className="store-theme-preview-action">Botão principal</span>
          </div>
        </div>
        <p className="store-theme-help">A cor primária personaliza botões, abas e destaques do painel. A cor de navegação altera o menu principal e o cabeçalho do catálogo. Confira a prévia e clique em Salvar para aplicar. As cores de sucesso, alerta e erro são preservadas.</p>
      </div>

      </section>
      <section hidden={activeTab !== 'painel'} aria-label="Aparência do painel">
        <div className="module-card">
          <div className="module-card-title"><Palette size={16} /> Aparência do painel</div>
          <div className="personalization-fields">
            <label>Tamanho dos textos<select aria-label="Tamanho dos textos do painel" value={panel.text_size} onChange={e => updatePreference('panel', { ...panel, text_size: e.target.value as typeof panel.text_size })}><option value="normal">Normal</option><option value="large">Grande</option><option value="extra-large">Extra grande</option></select></label>
            <label>Espaçamento<select aria-label="Espaçamento do painel" value={panel.density} onChange={e => updatePreference('panel', { ...panel, density: e.target.value as typeof panel.density })}><option value="comfortable">Confortável</option><option value="compact">Compacto</option></select></label>
            <label>Cantos dos cartões e botões<select aria-label="Cantos do painel" value={panel.corners} onChange={e => updatePreference('panel', { ...panel, corners: e.target.value as typeof panel.corners })}><option value="standard">Padrão</option><option value="rounded">Mais arredondados</option><option value="square">Mais retos</option></select></label>
          </div>
          <div className="personalization-panel-preview" style={{ ...storeTheme(settings.primary_color, settings.nav_color), ...panelStyle(panel) } as React.CSSProperties}>
            <strong>Prévia do painel</strong><div className="personalization-preview-card">Resumo de vendas <b>R$ 1.250,00</b></div>
            <div className="personalization-preview-row"><span>Produto de exemplo</span><strong>R$ 100,00</strong></div>
            <button type="button" disabled>Botão de exemplo</button>
          </div>
          <p className="otp-description">As opções ajustam textos de formulários e tabelas, espaçamento dos cartões e cantos do painel.</p>
        </div>
      </section>
      <section hidden={activeTab !== 'cupom'} aria-label="Personalização do cupom">
        <div className="personalization-receipt-grid">
          <div className="module-card">
            <div className="module-card-title"><Printer size={16} /> Formato do cupom</div>
            <div className="personalization-fields">
              <label>Largura do papel<select aria-label="Largura do papel do cupom" value={receipt.paper_width} onChange={e => updatePreference('receipt', { ...receipt, paper_width: e.target.value as typeof receipt.paper_width })}><option value="80">80 mm</option><option value="58">58 mm</option></select></label>
              <label>Tamanho da fonte<select aria-label="Fonte do cupom" value={receipt.font_size} onChange={e => updatePreference('receipt', { ...receipt, font_size: Number(e.target.value) as typeof receipt.font_size })}>{[10, 12, 14, 16].map(size => <option key={size} value={size}>{size} px</option>)}</select></label>
            </div>
            <label className="personalization-text-field">Mensagem no cabeçalho<input aria-label="Mensagem no cabeçalho do cupom" maxLength={120} value={receipt.header_text} onChange={e => updatePreference('receipt', { ...receipt, header_text: e.target.value })} placeholder="Ex.: Qualidade e confiança em cada compra" /></label>
            <div className="print-toggle-list">
              {([{ key: 'show_phone', label: 'Telefone do cliente' }, { key: 'show_address', label: 'Endereço do cliente' }, { key: 'show_document', label: 'CPF/CNPJ do cliente' }, { key: 'show_salesperson', label: 'Nome do colaborador' }] as const).map(option => <label className="print-toggle-item" key={option.key}><input type="checkbox" aria-label={option.label} checked={receipt[option.key]} onChange={e => updatePreference('receipt', { ...receipt, [option.key]: e.target.checked })} /><span>{option.label}</span></label>)}
            </div>
            <p className="otp-description">Use a mesma largura configurada na impressora.</p>
          </div>
          <div className="personalization-receipt-stage"><span>Prévia ilustrativa</span>
            <div className="personalization-receipt-preview" style={{ width: receipt.paper_width === '58' ? '50mm' : '72mm', fontSize: receipt.font_size }}>
              {settings.show_logo_on_receipt && logoPreview && <img src={logoPreview} alt="Logo no cupom" />}
              <h4>Sua loja</h4>{receipt.header_text && <p>{receipt.header_text}</p>}
              {settings.show_cnpj_on_receipt && <p>CNPJ/Endereço da loja</p>}<h4>CUPOM NÃO FISCAL</h4>
              <p><b>Cliente: Cliente de exemplo</b></p>{receipt.show_phone && <p><b>Telefone: (11) 99999-9999</b></p>}{receipt.show_document && <p><b>CPF/CNPJ do cliente</b></p>}{receipt.show_address && <p><b>Endereço: Rua de exemplo, 100</b></p>}
              <p><b>Produtos/Serviços</b></p><hr /><p>Produto de exemplo</p><p>1 × R$ 100,00 = R$ 100,00</p><hr /><p>Frete terceirizado: R$ 15,00</p><h4>TOTAL: R$ 115,00</h4><p>Pagamento: PIX</p>{receipt.show_salesperson && <p>Colaborador: Equipe</p>}{settings.receipt_footer_text && <p>{settings.receipt_footer_text}</p>}
            </div>
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

      </section>
      <section hidden={activeTab !== 'catalogo'} aria-label="Personalização do catálogo">
        <div className="module-card">
          <div className="module-card-title">Apresentação do catálogo público</div>
          <label className="personalization-text-field">Mensagem de boas-vindas<textarea className="notice-input" aria-label="Mensagem de boas-vindas do catálogo" maxLength={400} rows={3} value={catalog.welcome_message} onChange={e => updatePreference('catalog', { ...catalog, welcome_message: e.target.value })} placeholder="Apresente sua loja e convide o cliente a conhecer os produtos." /></label>
          <div className="personalization-fields">
            <label>Cartões dos produtos<select aria-label="Tamanho dos cartões do catálogo" value={catalog.card_size} onChange={e => updatePreference('catalog', { ...catalog, card_size: e.target.value as typeof catalog.card_size })}><option value="normal">Amplo</option><option value="compact">Compacto</option></select></label>
            <label>Altura do banner<select aria-label="Altura do banner do catálogo" value={catalog.banner_height} onChange={e => updatePreference('catalog', { ...catalog, banner_height: Number(e.target.value) as typeof catalog.banner_height })}><option value={160}>Baixo — 160 px</option><option value={220}>Padrão — 220 px</option><option value={300}>Alto — 300 px</option></select></label>
            <label>WhatsApp da loja<input type="tel" aria-label="WhatsApp do catálogo" maxLength={32} value={catalog.whatsapp_phone} placeholder="(11) 99999-9999" onChange={e => updatePreference('catalog', { ...catalog, whatsapp_phone: e.target.value })} /></label>
          </div>
          <div className="print-toggle-list">
            {([{ key: 'show_stock', label: 'Exibir quantidade em estoque' }, { key: 'show_sku', label: 'Exibir código SKU' }, { key: 'show_whatsapp', label: 'Exibir botão do WhatsApp' }] as const).map(option => <label className="print-toggle-item" key={option.key}><input type="checkbox" aria-label={option.label} checked={catalog[option.key]} onChange={e => updatePreference('catalog', { ...catalog, [option.key]: e.target.checked })} /><span>{option.label}</span></label>)}
          </div>
          <div className="personalization-catalog-preview" style={storeTheme(settings.primary_color, settings.nav_color) as React.CSSProperties}>
            <div className="personalization-catalog-header">Sua loja · Catálogo</div>
            {bannerPreview && <img src={bannerPreview} alt="Banner na prévia do catálogo" style={{ height: catalog.banner_height / 2 }} />}
            {catalog.welcome_message && <p>{catalog.welcome_message}</p>}
            <div className="personalization-catalog-card" style={{ maxWidth: catalog.card_size === 'compact' ? 220 : 320 }}><strong>Produto de exemplo</strong>{catalog.show_sku && <small>SKU 001</small>}<b>R$ 100,00</b>{catalog.show_stock && <small>10 em estoque</small>}</div>
            {catalog.show_whatsapp && catalogWhatsappUrl(catalog.whatsapp_phone) && <span className="personalization-whatsapp-preview">Falar com a loja no WhatsApp</span>}
          </div>
          <p className="otp-description">A prévia é reduzida. Salve para aplicar ao catálogo público da loja.</p>
        </div>
      </section>
      <div className="module-card" hidden={activeTab !== 'painel'}>
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
      <div className="personalization-savebar"><span role="status">{dirty ? 'Alterações ainda não salvas' : saved ? 'Personalização salva' : 'As alterações serão aplicadas ao salvar'}</span><button type="button" className="rma-advance-btn" onClick={restoreSection}>Restaurar padrões desta seção</button>
      <button className="module-save-btn" onClick={handleSave}>
        {saving ? 'Salvando...' : saved ? <><Check size={16} /> Salvo!</> : 'Salvar personalização'}
      </button>
      </div>
      </fieldset>
    </div>
  );
}
