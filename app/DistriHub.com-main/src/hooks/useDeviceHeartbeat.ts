import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function deviceIdentity(userId: string) {
  const key = `distrihub-device:${userId}`;
  let id = localStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
  return { id, name: localStorage.getItem(`${key}:name`) ?? 'Terminal deste navegador', nameKey: `${key}:name` };
}

export function useDeviceHeartbeat(userId?: string, branchId?: string | null) {
  useEffect(() => {
    if (!userId || !supabase) return;
    let active = true;
    let pending = false;
    const touch = async () => {
      if (!active || pending) return;
      pending = true;
      try {
        const device = deviceIdentity(userId);
        await supabase!.rpc('touch_partner_device', { p_device_key: device.id, p_name: device.name, p_branch_id: branchId || null });
      } catch { /* A tela de terminais permite consultar e repetir o registro. */ }
      finally { pending = false; }
    };
    void touch();
    const timer = window.setInterval(() => void touch(), 60_000);
    window.addEventListener('focus', touch);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', touch); };
  }, [userId, branchId]);
}
