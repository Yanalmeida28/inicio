import { useMemo, useState } from 'react';
import type { Product } from '../types';

export function useCatalogFilters(products: Product[]) {
  const [selectedBrand, setSelectedBrand] = useState('Todos');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [search, setSearch] = useState('');

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const term = search.toLowerCase();
        const matchesSearch =
          !term ||
          `${product.name} ${product.subtitle} ${product.sku}`.toLowerCase().includes(term);
        const matchesBrand = selectedBrand === 'Todos' || product.brand === selectedBrand;
        const matchesCategory = !selectedCategory || product.category === selectedCategory;

        return matchesSearch && matchesBrand && matchesCategory;
      }),
    [products, search, selectedBrand, selectedCategory],
  );

  const productCountByBrand = useMemo(() => {
    const map: Record<string, number> = {};

    for (const product of products) {
      map[product.brand] = (map[product.brand] ?? 0) + 1;
    }

    return map;
  }, [products]);

  function clearFilters() {
    setSelectedBrand('Todos');
    setSelectedCategory('');
    setSearch('');
  }

  return {
    selectedBrand,
    setSelectedBrand,
    selectedCategory,
    setSelectedCategory,
    search,
    setSearch,
    filteredProducts,
    productCountByBrand,
    clearFilters,
  };
}
