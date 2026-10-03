import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Headphones } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { AdminCompany } from '../types';
import { SupportChatModule, type SupportMessage } from './partner/SupportChatModule';

export function AdminSupportModule({ companies }: { companies: AdminCompany[] }) {
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setError('Suporte indisponível: Supabase não configurado.');
      setLoading(false);
      return;
    }
    let active = true;
    let refresh: number | undefined;
    let channel: ReturnType<typeof client.channel> | undefined;
    async function loadInbox() {
      const { data, error: loadError } = await client!.from('support_messages').select('*').order('created_at', { ascending: false });
      if (!active) return;
      if (loadError) setError('Não foi possível carregar os atendimentos.');
      else {
        setMessages((data ?? []) as SupportMessage[]);
        setError(null);
      }
      setLoading(false);
    }
    async function start() {
      const [session, authorization] = await Promise.all([client!.auth.getUser(), client!.rpc('is_super_admin')]);
      if (!active) return;
      if (session.error || !session.data.user || authorization.error || authorization.data !== true) {
        setError('Acesso ao suporte permitido somente ao Super Admin.');
        setLoading(false);
        return;
      }
      setUser(session.data.user);
      channel = client!.channel('admin-support-inbox')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, () => { void loadInbox(); })
        .subscribe((status) => { if (status === 'SUBSCRIBED') void loadInbox(); });
      refresh = window.setInterval(() => { void loadInbox(); }, 10000);
      await loadInbox();
    }
    void start();
    return () => {
      active = false;
      if (refresh !== undefined) window.clearInterval(refresh);
      if (channel) void client.removeChannel(channel);
    };
  }, []);

  const conversations = [...new Map(messages.map((item) => [item.user_id, null])).keys()].map((userId) => {
    const latest = messages.find((item) => item.user_id === userId)!;
    const company = companies.find((item) => item.user_id === userId);
    return { userId, latest, name: company?.business_name ?? company?.email ?? `Cliente ${userId.slice(0, 8)}` };
  });

  return (
    <div>
      <div className="panel-module">
        <div className="module-header">
          <span className="module-icon"><Headphones size={20} /></span>
          <div><h3>Atendimento aos clientes</h3><p>Receba as mensagens da aba Suporte e responda diretamente pelo painel.</p></div>
        </div>
        {error && <p role="alert" className="admin-load-error">{error}</p>}
        {loading ? <p className="empty-row">Carregando atendimentos...</p> : conversations.length === 0 ? <p className="empty-row">Nenhuma mensagem recebida.</p> : (
          <div className="admin-support-conversations">
            {conversations.map(({ userId, latest, name }) => (
              <button type="button" key={userId} className={`admin-support-conversation ${selected === userId ? 'active' : ''}`} aria-pressed={selected === userId} onClick={() => setSelected(userId)}>
                <strong>{name}</strong>
                <span>{latest.sender_role === 'cliente' ? 'Cliente' : 'Super Admin'}: {latest.message}</span>
                <small>{new Date(latest.created_at).toLocaleString('pt-BR')} · {latest.sender_role === 'cliente' ? 'Aguardando resposta' : 'Respondido'}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      {selected && user && (
        <div style={{ marginTop: 16 }}>
          <h3>{conversations.find((item) => item.userId === selected)?.name}</h3>
          <SupportChatModule key={selected} user={user} conversationUserId={selected} admin />
        </div>
      )}
    </div>
  );
}
