import { useEffect, useMemo, useState } from 'react';
import type { PartnerProduct, PartnerSale, StockMovement } from '../types';
import { computeStagnantStock } from '../lib/stagnantStock';

export function useStagnantStock(products: PartnerProduct[], sales: PartnerSale[], movements: StockMovement[], isActive = true) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!isActive) return;
    const refresh = () => { if (document.visibilityState === 'visible') setNow(new Date()); };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [isActive]);

  return useMemo(() => computeStagnantStock(products, sales, movements, now), [products, sales, movements, now]);
}
