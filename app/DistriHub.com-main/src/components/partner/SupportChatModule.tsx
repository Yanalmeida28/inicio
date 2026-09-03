import { useEffect, useRef, useState } from 'react';
import { Headphones, Send, Sparkles, MessageSquareText } from 'lucide-react';
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

  const notConfigured = !supabase || !user;

  return (
    <div className="panel-module">
      <div className="module-header">
        <span className="module-icon"><Headphones size={20} /></span>
        <div><h3>Chat de Suporte</h3><p>Fale com a equipe da plataforma</p></div>
      </div>

      {!notConfigured && (
        <div className="support-chat-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8bc7ff' }}>
            <MessageSquareText size={16} />
            <span>Atendimento ativo</span>
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
          <div className="support-chat-messages">
            {loading ? <p className="empty-row">Carregando conversa...</p> : messages.length === 0 ? <p className="empty-row">Envie uma mensagem para iniciar o atendimento.</p> : messages.map((item) => (
              <div key={item.id} className={`support-message ${item.sender_role}`}>
                <span>{item.sender_role === 'cliente' ? 'Você' : 'Suporte'}</span>
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
