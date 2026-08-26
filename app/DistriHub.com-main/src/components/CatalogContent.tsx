import { ChevronDown, Search } from 'lucide-react';
import type { Product } from '../types';
import { ProductCard } from './ProductCard';

type CatalogContentProps = {
  products: Product[];
  loading: boolean;
  cartQuantities: Record<number, number>;
  onAdd: (product: Product) => void;
  onIncrement: (id: number) => void;
  onDecrement: (id: number) => void;
  selectedBrand: string;
  onClearFilters: () => void;
};

export function CatalogContent({
  products,
  loading,
  cartQuantities,
  onAdd,
  onIncrement,
  onDecrement,
  selectedBrand,
  onClearFilters,
}: CatalogContentProps) {
  return (
    <div className="catalog-content">
      <div className="catalog-heading">
        <div>
          <span className="section-kicker">Catálogo completo</span>
          <h2>
            Peças em destaque{' '}
            <span className="product-count">{products.length} produtos</span>
          </h2>
        </div>
        <button className="sort-button">
          Mais relevantes <ChevronDown size={15} />
        </button>
      </div>
      <div className="mobile-filter-row">
        <button>
          Marca: <b>{selectedBrand}</b>
        </button>
        <button>
          Ordenar <ChevronDown size={14} />
        </button>
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="spinner" />
          <p>Carregando produtos...</p>
        </div>
      ) : products.length > 0 ? (
        <div className="product-grid">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              quantityInCart={cartQuantities[product.id] ?? 0}
              onAdd={onAdd}
              onIncrement={onIncrement}
              onDecrement={onDecrement}
            />
          ))}
        </div>
      ) : (
        <div className="empty-results">
          <Search size={32} />
          <h3>Nenhum produto encontrado</h3>
          <p>Tente buscar por outro modelo ou limpe os filtros.</p>
          <button onClick={onClearFilters}>Limpar filtros</button>
        </div>
      )}
    </div>
  );
}
