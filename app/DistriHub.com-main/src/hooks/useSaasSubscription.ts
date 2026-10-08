import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { SaasSubscription } from '../lib/saas';

export function useSaasSubscription(companyId: string | null | undefined) {
  const [result, setResult] = useState<{ companyId: string; subscription: SaasSubscription } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    if (!companyId || !supabase) { setLoading(false); return; }
    try {
      const { data, error: rpcError } = await supabase.rpc('get_partner_subscription', { p_company_id: companyId });
      if (rpcError) throw rpcError;
      if (!data || typeof data.can_access !== 'boolean' || !Array.isArray(data.features)) throw new Error('Resposta de assinatura inválida.');
      if (request !== sequence.current) return;
      setResult({ companyId, subscription: data as SaasSubscription });
      setError(null);
    } catch (failure) {
      if (request !== sequence.current) return;
      // A failed entitlement refresh closes operational access until checked again.
      setResult(null);
      setError(failure instanceof Error ? failure.message : 'Não foi possível verificar a assinatura.');
    } finally { if (request === sequence.current) setLoading(false); }
  }, [companyId]);
  useEffect(() => {
    const requests = sequence;
    setLoading(true);
    setResult(null);
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60000);
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => { requests.current++; window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [refresh]);
  return { subscription: result && result.companyId === companyId ? result.subscription : null, error, loading, refresh };
}
