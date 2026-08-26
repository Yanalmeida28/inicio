import { Menu, Search, ShoppingBag } from 'lucide-react';

type HeaderProps = {
  search: string;
  onSearchChange: (value: string) => void;
  cartCount: number;
  onCartOpen: () => void;
  onMenuToggle: () => void;
};

export function Header({
  search,
  onSearchChange,
  cartCount,
  onCartOpen,
  onMenuToggle,
}: HeaderProps) {
  return (
    <header className="main-header">
      <div className="page-container header-inner">
        <button
          className="mobile-menu-button"
          onClick={onMenuToggle}
          aria-label="Abrir menu"
        >
          <Menu size={22} />
        </button>
        <a className="brand-logo" href="#inicio" aria-label="DistriHub início">
          <span className="brand-mark">
            <span /> <span />
          </span>
          <span>
            Distri<span>Hub</span>
          </span>
        </a>
        <div className="header-search">
          <Search size={19} />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Busque por modelo, peça ou SKU..."
            aria-label="Buscar produtos"
          />
          <kbd>⌘ K</kbd>
        </div>
        <div className="header-actions">
          <button className="cart-button" onClick={onCartOpen}>
            <ShoppingBag size={20} />
            <span>Meu pedido</span>
            {cartCount > 0 && <b>{cartCount}</b>}
          </button>
        </div>
      </div>
    </header>
  );
}
