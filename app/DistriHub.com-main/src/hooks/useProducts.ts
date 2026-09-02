import { useEffect, useState } from 'react';
import type { Product } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

type UseProductsResult = {
  products: Product[];
  loading: boolean;
  error: string | null;
};

export function useProducts(): UseProductsResult {
  const [result, setResult] = useState<UseProductsResult>({
    products: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setResult({ products: [], loading: false, error: 'Supabase não configurado.' });
      return;
    }

    let cancelled = false;
    setResult((prev) => ({ ...prev, loading: true }));

    supabase
      .from('products')
      .select('id, name, subtitle, sku, brand, category, price, stock, image, badge')
      .order('id')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setResult({ products: [], loading: false, error: error.message });
        } else if (data) {
          setResult({ products: data as Product[], loading: false, error: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return result;
}
