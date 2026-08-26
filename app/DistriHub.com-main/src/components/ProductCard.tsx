import { Check, Minus, Plus } from 'lucide-react';
import type { Product } from '../types';
import { money } from '../utils';

type ProductCardProps = {
  product: Product;
  quantityInCart: number;
  onAdd: (product: Product) => void;
  onIncrement: (id: number) => void;
  onDecrement: (id: number) => void;
};

export function ProductCard({
  product,
  quantityInCart,
  onAdd,
  onIncrement,
  onDecrement,
}: ProductCardProps) {
  const inStock = product.stock > 0;
  const lowStock = inStock && product.stock <= 10;

  return (
    <article className="product-card">
      <div className="product-image">
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          decoding="async"
          width="300"
          height="200"
        />
        <div className="image-overlay" />
        {product.badge && (
          <span className={`product-badge ${product.badge === 'Oferta' ? 'sale' : ''}`}>
            {product.badge}
          </span>
        )}
        <span className={`stock-tag ${inStock ? (lowStock ? 'low' : 'in') : 'out'}`}>
          {inStock ? (lowStock ? `Restam ${product.stock}` : 'Em estoque') : 'Esgotado'}
        </span>
      </div>
      <div className="product-info">
        <div className="product-meta">
          <span>{product.brand}</span>
          <span>SKU {product.sku}</span>
        </div>
        <h3>{product.name}</h3>
        <p>{product.subtitle}</p>
        <div className="product-footer">
          <div>
            <small>Preço de atacado</small>
            <strong>{money.format(product.price)}</strong>
            {inStock && (
              <span className="stock">
                <span /> {product.stock} disponíveis
              </span>
            )}
          </div>
          {quantityInCart > 0 ? (
            <div className="card-quantity">
              <button
                onClick={() => onDecrement(product.id)}
                aria-label={`Diminuir ${product.name}`}
                className="qty-btn-touch"
              >
                <Minus size={18} />
              </button>
              <b>{quantityInCart}</b>
              <button
                onClick={() => onIncrement(product.id)}
                aria-label={`Aumentar ${product.name}`}
                className="qty-btn-touch"
              >
                <Plus size={18} />
              </button>
            </div>
          ) : (
            <button
              className="add-button add-button-touch"
              onClick={() => onAdd(product)}
              disabled={!inStock}
              aria-label={`Adicionar ${product.name}`}
            >
              {inStock ? <Plus size={20} /> : <Check size={18} />}
            </button>
          )}
        </div>
        {quantityInCart > 0 && (
          <div className="added-indicator">
            <Check size={13} /> {quantityInCart} no pedido
          </div>
        )}
      </div>
    </article>
  );
}
