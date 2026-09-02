import {
  ArrowRight,
  Building2,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Wrench,
  Layers,
  Zap,
  Cpu,
  LogIn,
} from 'lucide-react';

type HubHomeProps = {
  onAccessPanel: () => void;
  onAccessSuperAdmin: () => void;
  superAdminActive?: boolean;
};

export function HubHome({ onAccessPanel, onAccessSuperAdmin, superAdminActive }: HubHomeProps) {
  return (
    <main className="hub-home">
      <header className="hub-header">
        <div className="page-container hub-header-inner">
          <a className="brand-logo" href="#inicio" aria-label="DistriHub início">
            <span className="brand-mark">
              <span /> <span />
            </span>
            <span>
              Distri<span>Hub</span>
            </span>
          </a>
          <div className="hub-header-actions">
            <button className="hub-login-btn" onClick={onAccessPanel}>
              <LogIn size={16} /> Entrar
            </button>
            <button
              className={`hub-super-admin-btn ${superAdminActive ? 'active' : ''}`}
              onClick={onAccessSuperAdmin}
              title="Acesso restrito ao administrador master do sistema"
            >
              <ShieldCheck size={16} /> {superAdminActive ? 'Painel Master' : 'Super Admin'}
            </button>
          </div>
        </div>
      </header>

      <section className="hub-hero">
        <div className="page-container hub-hero-inner">
          <div className="hub-hero-copy">
            <div className="eyebrow">
              <Sparkles size={14} /> Plataforma de Gestão ERP, Vendas e Distribuição B2B Multissegmento
            </div>
            <h1>
              O ecossistema completo para
              <br />
              <em>distribuir, vender e gerenciar.</em>
            </h1>
            <p>
              DistriHub conecta distribuidoras, lojistas e assistências técnicas em uma única
              plataforma. Catálogo B2B, ERP multi-loja, PDV ultrarrápido, gestão financeira e
              logística de entrega — tudo integrado.
            </p>
            <div className="hub-hero-actions" />
          </div>
          <div className="hub-hero-visual">
            <div className="hub-orb hub-orb-1" />
            <div className="hub-orb hub-orb-2" />
            <div className="hub-card-float hub-card-1">
              <PackageCheck size={22} />
              <div>
                <strong>Catálogo B2B</strong>
                <small>Atacado direto</small>
              </div>
            </div>
            <div className="hub-card-float hub-card-2">
              <Building2 size={22} />
              <div>
                <strong>ERP Multi-Loja</strong>
                <small>Gestão completa</small>
              </div>
            </div>
            <div className="hub-card-float hub-card-3">
              <ShieldCheck size={22} />
              <div>
                <strong>Garantia & RMA</strong>
                <small>Rastreabilidade total</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="hub-features">
        <div className="page-container">
          <div className="hub-section-head">
            <h2>Um sistema para cada etapa</h2>
            <p>Do catálogo ao PDV, do estoque ao financeiro — tudo conectado</p>
          </div>
          <div className="hub-feature-grid">
            <div className="hub-feature">
              <Layers size={24} />
              <h4>Multi-segmento</h4>
              <p>Adapta rótulos e fluxos para assistência técnica, varejo ou serviços</p>
            </div>
            <div className="hub-feature">
              <Zap size={24} />
              <h4>PDV Ultrarrápido</h4>
              <p>Venda no balcão com busca instantânea e cupom térmico com IMEI/Selo</p>
            </div>
            <div className="hub-feature">
              <Building2 size={24} />
              <h4>Gestão Multi-Empresa & Filiais</h4>
              <p>Gerencie múltiplas unidades com visão consolidada e controle de estoque centralizado</p>
            </div>
            <div className="hub-feature">
              <ShieldCheck size={24} />
              <h4>Garantia Anti-Fraude</h4>
              <p>Rastreabilidade por IMEI, número de série ou selo de garantia</p>
            </div>
            <div className="hub-feature">
              <Wrench size={24} />
              <h4>Entrada via XML NF-e</h4>
              <p>Importe notas fiscais e dê entrada automática no estoque em lote</p>
            </div>
            <div className="hub-feature">
              <PackageCheck size={24} />
              <h4>Checkout B2B</h4>
              <p>PIX, cartão, faturado no limite B2B ou crédito de RMA com logística local</p>
            </div>
          </div>
        </div>
      </section>

      <section className="hub-about">
        <div className="page-container">
          <div className="hub-about-grid">
            <div className="hub-about-copy">
              <div className="eyebrow"><Cpu size={14} /> TECNOLOGIA DE ALTO NÍVEL</div>
              <h2>Engenharia de Software criada para destravar o crescimento do seu negócio.</h2>
              <p>
                A DistriHub nasceu com o propósito de transformar a gestão B2B e o varejo através de
                soluções tecnológicas ágeis, robustas e intuitivas. Unimos a complexidade da
                distribuição em larga escala com a simplicidade que o operador de balcão precisa no
                dia a dia. Conectamos distribuidores, assistências técnicas e lojistas em uma única
                plataforma integrada.
              </p>
              <div className="hub-about-metrics">
                <div className="hub-metric">
                  <strong>99.9%</strong>
                  <small>Disponibilidade do Sistema</small>
                </div>
                <div className="hub-metric">
                  <strong>&lt; 1s</strong>
                  <small>Tempo Médio de Resposta</small>
                </div>
                <div className="hub-metric">
                  <strong>100%</strong>
                  <small>Conformidade Fiscal SEFAZ</small>
                </div>
              </div>
            </div>
            <div className="hub-about-cards">
              <div className="hub-agile-card">
                <span className="hub-agile-icon"><Zap size={22} /></span>
                <h4>Agilidade &amp; Performance Absoluta</h4>
                <p>PDV e catálogo B2B otimizados para resposta em milissegundos. Venda mais rápido no balcão e elimine filas sem travamentos.</p>
              </div>
              <div className="hub-agile-card">
                <span className="hub-agile-icon"><ShieldCheck size={22} /></span>
                <h4>Rastreabilidade &amp; Segurança Anti-Fraude</h4>
                <p>Controle rigoroso de IMEI, números de série, selos de garantia e auditoria fiscal completa para proteger a margem do seu negócio.</p>
              </div>
              <div className="hub-agile-card">
                <span className="hub-agile-icon"><Layers size={22} /></span>
                <h4>Ecosistema Integrado &amp; Escalável</h4>
                <p>Multi-lojas, gestão financeira, emissão fiscal automatizada e logística B2B conectadas em tempo real.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="hub-footer">
        <div className="page-container hub-footer-inner">
          <p>&copy; {new Date().getFullYear()} DistriHub — Plataforma de Gestão ERP, Vendas e Distribuição B2B</p>
          <button className="hub-super-admin-link" onClick={onAccessSuperAdmin} title="Acesso restrito ao proprietário do sistema">
            <ShieldCheck size={12} /> Super Admin
          </button>
        </div>
      </footer>
    </main>
  );
}
