import { useCallback, useMemo, useState } from 'react';
import type { CartItem, Product } from '../types';

export function useCart() {
  const [cart, setCart] = useState<CartItem[]>([]);

  const addToCart = useCallback((product: Product) => {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);

      if (existing) {
        return current.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }

      return [...current, { ...product, quantity: 1 }];
    });
  }, []);

  const incrementQuantity = useCallback((id: number) => {
    setCart((current) =>
      current.map((item) =>
        item.id === id ? { ...item, quantity: item.quantity + 1 } : item,
      ),
    );
  }, []);

  const decrementQuantity = useCallback((id: number) => {
    setCart((current) =>
      current.flatMap((item) => {
        if (item.id !== id) return [item];

        const quantity = item.quantity - 1;
        return quantity > 0 ? [{ ...item, quantity }] : [];
      }),
    );
  }, []);

  const removeFromCart = useCallback((id: number) => {
    setCart((current) => current.filter((item) => item.id !== id));
  }, []);

  const cartCount = useMemo(
    () => cart.reduce((total, item) => total + item.quantity, 0),
    [cart],
  );

  const cartTotal = useMemo(
    () => cart.reduce((total, item) => total + item.price * item.quantity, 0),
    [cart],
  );

  const cartQuantities = useMemo(() => {
    const map: Record<number, number> = {};

    for (const item of cart) {
      map[item.id] = item.quantity;
    }

    return map;
  }, [cart]);

  return {
    cart,
    cartCount,
    cartTotal,
    cartQuantities,
    addToCart,
    incrementQuantity,
    decrementQuantity,
    removeFromCart,
    setCart,
  };
}
