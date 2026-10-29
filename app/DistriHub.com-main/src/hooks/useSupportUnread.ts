import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useSupportUnread(actorId: string | undefined, admin = false) {
  const [snapshot, setSnapshot] = useState<{actorId: string; total: number; conversations: Record<string, number>}>({actorId: '', total: 0, conversations: {}});
  useEffect(() => {
    if (!supabase || !actorId) return;
    const client = supabase;
    let live = true, busy = false, queued = false;
    async function refresh() {
      if (busy) { queued = true; return; }
      busy = true;
      try {
        const {data, error} = await client.rpc('get_support_unread_counts', {p_admin: admin});
        if (!error && live && data && Number.isSafeInteger(Number(data.total))) {
          const conversations: Record<string, number> = {};
          for (const row of data.conversations ?? []) conversations[row.user_id] = Number(row.unread_count);
          setSnapshot({actorId: actorId!, total: Number(data.total), conversations});
        }
      } catch { /* Keep the last confirmed counter during a connection failure. */ }
      finally { busy = false; if (queued && live) { queued = false; void refresh(); } }
    }
    const update = () => { void refresh(); };
    const channel = client.channel('support-unread-' + actorId + '-' + admin).on('postgres_changes', {event: 'INSERT', schema: 'public', table: 'support_messages', ...(admin ? {} : {filter: 'user_id=eq.' + actorId})}, update).subscribe(status => { if (status === 'SUBSCRIBED') update(); });
    update();
    // Realtime handles immediate updates; periodic polling reconciles missed events.
    // Avoid background-tab requests, but refresh immediately when the tab returns.
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') update();
    }, 20_000);
    window.addEventListener('distrihub:support-read', update);
    window.addEventListener('focus', update);
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') update(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => { live = false; window.clearInterval(interval); window.removeEventListener('distrihub:support-read', update); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', onVisibilityChange); void client.removeChannel(channel); };
  }, [actorId, admin]);
  return snapshot.actorId === actorId ? snapshot : {total: 0, conversations: {}};
}
