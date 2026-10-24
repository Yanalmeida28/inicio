import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Headphones } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { AdminCompany } from '../types';
import { SupportChatModule, type SupportMessage } from './partner/SupportChatModule';
import { saasAdminError } from '../lib/saasAdminControls';
type SupportState = { user_id: string; priority: 'normal' | 'high'; closed_at: string | null };

export function AdminSupportModule({ companies }: { companies: AdminCompany[] }) {
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [states, setStates] = useState<SupportState[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [saving, setSaving] = useState(false);

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
      const [inbox, settings] = await Promise.all([
        client!.from('support_messages').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }),
        client!.from('admin_support_states').select('user_id,priority,closed_at'),
      ]);
      const { data, error: loadError } = inbox;
      if (!active) return;
      if (loadError || settings.error) setError('Não foi possível carregar os atendimentos e suas prioridades.');
      else {
        setMessages((data ?? []) as SupportMessage[]);
        setStates((settings.data ?? []) as SupportState[]);
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
    const state = states.find(s => s.user_id === userId);
    const closed = !!state?.closed_at && Date.parse(state.closed_at) >= Date.parse(latest.created_at);
    return { userId, latest, closed, priority: state?.priority ?? 'normal', name: company?.business_name ?? company?.email ?? `Cliente ${userId.slice(0, 8)}` };
  }).sort((a, b) => Number(b.priority === 'high') - Number(a.priority === 'high') || b.latest.created_at.localeCompare(a.latest.created_at));
  const filtered = conversations.filter(c => `${c.name} ${c.latest.message}`.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))
    && (filter === 'all' || (filter === 'pending' && !c.closed && c.latest.sender_role === 'cliente') || (filter === 'closed' && c.closed) || (filter === 'high' && c.priority === 'high')));
  const current = conversations.find(c => c.userId === selected);
  async function updateState(changes: Partial<SupportState>) {
    if (!supabase || !current || saving) return;
    setSaving(true); setError(null);
    try {
      const row = { user_id: selected, priority: current.priority, closed_at: current.closed ? states.find(s => s.user_id === selected)?.closed_at ?? null : null, ...changes, updated_at: new Date().toISOString() };
      const { data, error: failure } = await supabase.from('admin_support_states').upsert(row).select('user_id,priority,closed_at').single();
      if (failure) throw failure;
      setStates(previous => [...previous.filter(s => s.user_id !== selected), data as SupportState]);
    } catch (failure) { setError(saasAdminError(failure)); } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="panel-module">
        <div className="module-header">
          <span className="module-icon"><Headphones size={20} /></span>
          <div><h3>Atendimento aos clientes</h3><p>Receba as mensagens da aba Suporte e responda diretamente pelo painel.</p></div>
        </div>
        {error && <p role="alert" className="admin-load-error">{error}</p>}
        <p>{conversations.filter(c => !c.closed && c.latest.sender_role === 'cliente').length} atendimento(s) aguardando resposta</p>
        <div className="rma-form inline admin-filters"><label>Buscar atendimento<input type="search" placeholder="Empresa ou última mensagem" value={search} onChange={e => setSearch(e.target.value)} /></label><label>Mostrar<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todos</option><option value="pending">Aguardando resposta</option><option value="high">Prioridade alta</option><option value="closed">Encerrados</option></select></label></div>
        {loading ? <p className="empty-row">Carregando atendimentos...</p> : filtered.length === 0 ? <p className="empty-row">Nenhum atendimento encontrado.</p> : (
          <div className="admin-support-conversations">
            {filtered.map(({ userId, latest, name, closed, priority }) => (
              <button type="button" key={userId} className={`admin-support-conversation ${selected === userId ? 'active' : ''}`} aria-pressed={selected === userId} onClick={() => setSelected(userId)}>
                <strong>{name}</strong>
                <span>{latest.sender_role === 'cliente' ? 'Cliente' : 'Super Admin'}: {latest.message}</span>
                <small>{new Date(latest.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · {closed ? 'Encerrado' : latest.sender_role === 'cliente' ? 'Aguardando resposta' : 'Respondido'}{priority === 'high' ? ' · Prioridade alta' : ''}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      {selected && user && (
        <div style={{ marginTop: 16 }}>
          <h3>{conversations.find((item) => item.userId === selected)?.name}</h3>
          {current && <div className="subscription-actions admin-overview-actions"><button className="rma-advance-btn" disabled={saving} onClick={() => void updateState({ priority: current.priority === 'high' ? 'normal' : 'high' })}>{current.priority === 'high' ? 'Remover prioridade alta' : 'Marcar prioridade alta'}</button><button className="rma-advance-btn" disabled={saving} onClick={() => void updateState({ closed_at: current.closed ? null : new Date().toISOString() })}>{saving ? 'Salvando...' : current.closed ? 'Reabrir atendimento' : 'Encerrar atendimento'}</button><span>Uma nova mensagem reabre automaticamente o atendimento.</span></div>}
          <SupportChatModule key={selected} user={user} conversationUserId={selected} admin />
        </div>
      )}
    </div>
  );
}
