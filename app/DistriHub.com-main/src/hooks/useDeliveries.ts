import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { PartnerSale, PartnerSalesperson } from '../types';

export function useDeliveries(companyId: string | undefined, branchId: string | null, operatorId: string | null | undefined, pin: string | null | undefined, active: boolean) {
  const [sales, setSales] = useState<PartnerSale[]>([]);
  const [drivers, setDrivers] = useState<PartnerSalesperson[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(companyId));
  const generation = useRef(0);
  const invalidate = useCallback(() => { ++generation.current; }, []);
  const alive = useRef(active);
  alive.current = active;
  const read = useCallback(async () => {
    if (!companyId || !active) return;
    const token = ++generation.current;
    setLoading(true); setError('');
    try {
      if (!supabase) throw new Error('Conexão indisponível.');
      const rows: PartnerSale[] = []; let cursor: string | null = null;
      const cursors = new Set<string>(); let available: PartnerSalesperson[] = [];
      do {
        const response = await supabase.rpc('read_partner_deliveries', {
          p_branch_id: branchId, p_salesperson_id: operatorId ?? null, p_pin: pin ?? null, p_after: cursor,
        });
        const data: { company_id: string; sales: PartnerSale[]; drivers: PartnerSalesperson[]; next_cursor: string | null } = response.data;
        const failure = response.error;
        if (token !== generation.current || !alive.current) return;
        if (failure) throw new Error(failure.message);
        if (!data || data.company_id !== companyId || !Array.isArray(data.sales) || !Array.isArray(data.drivers) || data.sales.some((row: PartnerSale) => row.user_id !== companyId || !Number.isSafeInteger(row.delivery_revision))) throw new Error('Resposta de entregas inválida.');
        rows.push(...data.sales); available = data.drivers;
        cursor = data.next_cursor;
        if (cursor && cursors.has(cursor)) throw new Error('Paginação de entregas inválida.');
        if (cursor) cursors.add(cursor);
      } while (cursor);
      setSales(previous => rows.map(row => {
        const newer = previous.find(item => item.id === row.id && (item.delivery_revision ?? 0) > (row.delivery_revision ?? 0));
        return newer ?? row;
      }));
      setDrivers(available);
    } catch (failure) {
      if (token === generation.current && alive.current) setError(failure instanceof Error ? failure.message : 'Não foi possível carregar as entregas.');
    } finally { if (token === generation.current && alive.current) setLoading(false); }
  }, [companyId, branchId, operatorId, pin, active]);
  useEffect(() => {
    alive.current = active;
    if (!companyId || !active) return;
    void read(); const timer = window.setInterval(() => { void read(); }, 15000);
    return () => { alive.current = false; invalidate(); window.clearInterval(timer); };
  }, [companyId, active, read, invalidate]);
  const accept = (row: PartnerSale) => {
    ++generation.current;
    if (!alive.current) return;
    setLoading(false);
    setSales(previous => previous.map(item => item.id === row.id && (item.delivery_revision ?? 0) <= (row.delivery_revision ?? 0) ? row : item));
  };
  return { sales, drivers, loading, error, reload: read, accept };
}
