import {
  ArrowRight,
  BatteryCharging,
  Cable,
  ChevronRight,
  PackageCheck,
  Sparkles,
  BadgeCheck,
} from 'lucide-react';

export function Hero() {
  return (
    <section className="hero" id="inicio">
      <div className="page-container hero-content">
        <div className="hero-copy">
          <div className="eyebrow">
            <Sparkles size={14} /> O estoque que sua assistência precisa
          </div>
          <h1>
            Peças certas.
            <br />
            <em>Negócios em movimento.</em>
          </h1>
          <p>
            Distribuição inteligente de peças e acessórios para celulares. Compre no
            atacado, direto com quem entende do seu negócio.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#catalogo">
              Ver catálogo <ArrowRight size={17} />
            </a>
            <a className="text-button" href="#como-funciona">
              Como funciona <ChevronRight size={16} />
            </a>
          </div>
          <div className="hero-proof">
            <div className="avatar-stack">
              <span>R</span>
              <span>M</span>
              <span>J</span>
              <span>+</span>
            </div>
            <div>
              <strong>+2.500</strong>
              <small>assistências parceiras</small>
            </div>
            <div className="proof-line" />
            <div>
              <strong>4.9/5</strong>
              <small>avaliação média</small>
            </div>
          </div>
        </div>
        <div className="hero-visual">
          <div className="visual-orbit orbit-one" />
          <div className="visual-orbit orbit-two" />
          <div className="hero-card hero-card-main">
            <div className="hero-card-top">
              <span className="card-live">
                <span /> estoque atualizado
              </span>
              <PackageCheck size={18} />
            </div>
            <div className="phone-outline">
              <div className="phone-screen">
                <div className="phone-camera" />
                <div className="screen-line" />
                <div className="screen-line short" />
                <div className="screen-spark">✦</div>
              </div>
            </div>
            <div className="floating-part floating-part-one">
              <BatteryCharging size={19} />
              <span>
                Baterias
                <br />
                <b>em alta</b>
              </span>
            </div>
            <div className="floating-part floating-part-two">
              <Cable size={19} />
              <span>
                Cabos flex
                <br />
                <b>originais</b>
              </span>
            </div>
            <div className="hero-card-bottom">
              <span>Catálogo 2024</span>
              <span>DH / 001</span>
            </div>
          </div>
          <div className="hero-badge">
            <BadgeCheck size={20} />
            <span>
              Qualidade
              <br />
              <b>garantida</b>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
