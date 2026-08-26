import { ChevronDown } from 'lucide-react';
import { brands } from '../data';

type FilterSidebarProps = {
  selectedBrand: string;
  onBrandSelect: (brand: string) => void;
  productCountByBrand: Record<string, number>;
  onClear: () => void;
};

export function FilterSidebar({
  selectedBrand,
  onBrandSelect,
  productCountByBrand,
  onClear,
}: FilterSidebarProps) {
  return (
    <aside className="filters">
      <div className="filter-title">
        <span>Filtre por marca</span>
        <button onClick={onClear}>Limpar</button>
      </div>
      <div className="brand-filter">
        {brands.map((brand) => (
          <button
            key={brand}
            className={selectedBrand === brand ? 'active' : ''}
            onClick={() => onBrandSelect(brand)}
          >
            <span className="radio-dot" />
            {brand}
            {brand !== 'Todos' && (
              <small>{productCountByBrand[brand] ?? 0}</small>
            )}
          </button>
        ))}
      </div>
      <div className="filter-divider" />
      <div className="why-box">
        <div className="why-icon">
          <ChevronDown size={17} />
        </div>
        <strong>Preço de atacado</strong>
        <p>Condições especiais para lojistas e assistências.</p>
        <a href="#como-funciona">Saiba mais</a>
      </div>
    </aside>
  );
}
