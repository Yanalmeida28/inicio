import { ShieldCheck, LogIn } from 'lucide-react';

type NavBarProps = {
  menuOpen: boolean;
  onPartnerClick: () => void;
};

export function NavBar({ menuOpen, onPartnerClick }: NavBarProps) {
  return (
    <nav className={`nav-bar ${menuOpen ? 'open' : ''}`}>
      <div className="page-container nav-inner">
        <a className="nav-active" href="#catalogo">
          Catálogo
        </a>
        <a href="#catalogo">
          Ofertas da semana <span className="hot-tag">OFERTA</span>
        </a>
        <a href="#como-funciona">Como comprar</a>
        <a href="#sobre">Sobre a DistriHub</a>
        <a href="#ajuda">Central de ajuda</a>
        <span className="nav-spacer" />
        <span className="secure-note">
          <ShieldCheck size={15} /> Compra segura
        </span>
        <button className="nav-login-btn" onClick={onPartnerClick}>
          <LogIn size={15} /> Entrar
        </button>
      </div>
    </nav>
  );
}
