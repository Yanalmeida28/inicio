import { useEffect, useRef, useState } from 'react';
import { Headphones, Send, Sparkles, MessageSquareText } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export type SupportMessage = {
  id: string;
  user_id: string;
  sender_role: 'cliente' | 'suporte';
  message: string;
  created_at: string;
};

export function SupportChatModule({ user, conversationUserId, admin = false }: { user: User | null; conversationUserId?: string; admin?: boolean }) {
  const userId = conversationUserId ?? user?.id;
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const quickMessages = [
    'Preciso de ajuda com o cadastro de clientes.',
    'Quero revisar meu limite de crédito.',
    'Estou com problema no pedido ou entrega.',
  ];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (!supabase || !user || !userId) return;
    const client = supabase;
    let active = true;
    setMessages([]);
    setLoading(true);
    setError(null);
    const loadMessages = () => client.from('support_messages').select('*').eq('user_id', userId).order('created_at').then(({ data, error: loadError }) => {
      if (active) {
        if (loadError) setError('Não foi possível carregar a conversa. Tente novamente.');
        else {
          setError(null);
          setMessages((current) => {
            const merged = new Map(current.map((item) => [item.id, item]));
            for (const item of (data ?? []) as SupportMessage[]) merged.set(item.id, item);
            return [...merged.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
          });
        }
        setLoading(false);
      }
    });
    const channel = client.channel(`support-${admin ? 'admin-' : ''}${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `user_id=eq.${userId}` }, () => { void loadMessages(); })
      .subscribe((status) => { if (status === 'SUBSCRIBED') void loadMessages(); });
    void loadMessages();
    const interval = window.setInterval(() => { void loadMessages(); }, 10000);
    return () => { active = false; window.clearInterval(interval); void client.removeChannel(channel); };
  }, [user, userId, admin]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text || !supabase || !user || !userId || sending) return;
    setSending(true);
    setError(null);
    try {
      const { data, error: sendError } = await supabase.from('support_messages').insert({ user_id: userId, sender_role: admin ? 'suporte' : 'cliente', message: text }).select('*').single();
      if (sendError) throw sendError;
      if (data) setMessages((current) => current.some((item) => item.id === data.id) ? current : [...current, data as SupportMessage]);
      setMessage('');
    } catch {
      setError('Não foi possível enviar. Sua mensagem foi mantida para tentar novamente.');
    } finally {
      setSending(false);
    }
  }

  const notConfigured = !supabase || !user;

  return (
    <div className="panel-module">
      <div className="module-header">
        <span className="module-icon"><Headphones size={20} /></span>
        <div><h3>Chat de Suporte</h3><p>{admin ? 'Responda ao cliente da plataforma' : 'Envie sua mensagem diretamente ao Super Admin'}</p></div>
      </div>

      {!notConfigured && !admin && (
        <div className="support-chat-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8bc7ff' }}>
            <MessageSquareText size={16} />
            <span>Canal direto com o Super Admin</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {quickMessages.map((text) => (
              <button key={text} type="button" className="rma-advance-btn" onClick={() => setMessage(text)} style={{ fontSize: '13px', minWidth: 'auto' }}>
                <Sparkles size={12} /> {text}
              </button>
            ))}
          </div>
        </div>
      )}

      {notConfigured ? (
        <div className="empty-row" style={{ padding: '24px 16px' }}>
          O chat ainda não está disponível para este usuário ou ambiente. Conecte a sessão do Supabase para ativar o suporte ao vivo.
        </div>
      ) : (
        <>
          {error && <p role="alert" className="admin-load-error">{error}</p>}
          <div className="support-chat-messages">
            {loading ? <p className="empty-row">Carregando conversa...</p> : messages.length === 0 ? <p className="empty-row">Envie uma mensagem para iniciar o atendimento.</p> : messages.map((item) => (
              <div key={item.id} className={`support-message ${item.sender_role}`}>
                <span>{item.sender_role === 'cliente' ? (admin ? 'Cliente' : 'Você') : 'Super Admin'}</span>
                <p>{item.message}</p>
                <small>{new Date(item.created_at).toLocaleString('pt-BR')}</small>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <form className="support-chat-form" onSubmit={sendMessage}>
            <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Digite sua mensagem..." maxLength={2000} />
            <button type="submit" className="module-submit-btn" disabled={!message.trim() || sending} aria-label="Enviar mensagem"><Send size={16} /></button>
          </form>
        </>
      )}
    </div>
  );
}
