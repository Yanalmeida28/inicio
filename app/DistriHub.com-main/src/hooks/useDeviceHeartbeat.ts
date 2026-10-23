import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function deviceIdentity(userId: string) {
  const key = `distrihub-device:${userId}`;
  let id = localStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
  return { id, name: localStorage.getItem(`${key}:name`) ?? 'Terminal deste navegador', nameKey: `${key}:name` };
}

export function useDeviceHeartbeat(userId?: string, branchId?: string | null) {
  const scope = `${userId ?? ''}:${branchId ?? ''}`;
  const [result, setResult] = useState<{ scope: string; error: string | null } | null>(null);
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!userId || !supabase) return;
    let active = true;
    let pending = false;
    const touch = async () => {
      if (!active || pending) return;
      pending = true;
      try {
        const device = deviceIdentity(userId);
        const { error } = await supabase!.rpc('touch_partner_device', { p_device_key: device.id, p_name: device.name, p_branch_id: branchId || null });
        if (error) throw error;
        if (active) setResult({ scope, error: null });
      } catch (failure) {
        if (active) setResult({ scope, error: failure instanceof Error ? failure.message : (failure as { message?: string })?.message ?? 'Não foi possível verificar este dispositivo.' });
      }
      finally { pending = false; }
    };
    void touch();
    const timer = window.setInterval(() => void touch(), 30_000);
    window.addEventListener('focus', touch);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', touch); };
  }, [userId, branchId, scope, revision]);
  const current = result?.scope === scope ? result : null;
  return { ready: Boolean(current && !current.error), error: current?.error ?? null, retry };
}
