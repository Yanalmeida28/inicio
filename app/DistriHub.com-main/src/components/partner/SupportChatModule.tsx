import { useEffect, useState } from 'react';
import { Headphones, Send } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

type SupportMessage = {
  id: string;
  user_id: string;
  sender_role: 'cliente' | 'suporte';
  message: string;
  created_at: string;
};

export function SupportChatModule({ user }: { user: User | null }) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!supabase || !user) return;
    let active = true;
    supabase.from('support_messages').select('*').eq('user_id', user.id).order('created_at').then(({ data }) => {
      if (active) {
        setMessages((data as SupportMessage[]) ?? []);
        setLoading(false);
      }
    });
    const channel = supabase.channel(`support-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `user_id=eq.${user.id}` }, (payload) => {
        setMessages((current) => current.some((item) => item.id === payload.new.id) ? current : [...current, payload.new as SupportMessage]);
      }).subscribe();
    return () => { active = false; void supabase?.removeChannel(channel); };
  }, [user]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text || !supabase || !user || sending) return;
    setSending(true);
    const { data, error } = await supabase.from('support_messages').insert({ user_id: user.id, sender_role: 'cliente', message: text }).select('*').single();
    if (!error && data) setMessages((current) => [...current, data as SupportMessage]);
    if (!error) setMessage('');
    setSending(false);
  }

  return (
    <div className="panel-module">
      <div className="module-header">
        <span className="module-icon"><Headphones size={20} /></span>
        <div><h3>Chat de Suporte</h3><p>Fale com a equipe da plataforma</p></div>
      </div>
      <div className="support-chat-messages">
        {loading ? <p className="empty-row">Carregando conversa...</p> : messages.length === 0 ? <p className="empty-row">Envie uma mensagem para iniciar o atendimento.</p> : messages.map((item) => (
          <div key={item.id} className={`support-message ${item.sender_role}`}>
            <span>{item.sender_role === 'cliente' ? 'Você' : 'Suporte'}</span>
            <p>{item.message}</p>
            <small>{new Date(item.created_at).toLocaleString('pt-BR')}</small>
          </div>
        ))}
      </div>
      <form className="support-chat-form" onSubmit={sendMessage}>
        <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Digite sua mensagem..." maxLength={2000} />
        <button type="submit" className="module-submit-btn" disabled={!message.trim() || sending} aria-label="Enviar mensagem"><Send size={16} /></button>
      </form>
    </div>
  );
}
