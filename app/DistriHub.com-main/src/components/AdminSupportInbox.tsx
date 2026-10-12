import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { AdminCompany } from '../types';
import { supabase } from '../lib/supabase';
import { SupportChatModule, type SupportMessage } from './partner/SupportChatModule';
import { saasAdminError } from '../lib/saasAdminControls';
type Conversation = SupportMessage & { priority: 'normal' | 'high'; closed_at: string | null; closed: boolean; company_name: string };
export function AdminSupportInbox({ companies }: { companies: AdminCompany[] }) {
  const [user, setUser] = useState<User | null>(null); const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null); const [search, setSearch] = useState(''); const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0); const [total, setTotal] = useState(0); const [pending, setPending] = useState(0);
  const [version, setVersion] = useState(0); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [error, setError] = useState(''); const lock = useRef(false);
  useEffect(() => {
    let active = true;
    if (!supabase) { setError('Suporte indisponível.'); setLoading(false); return; }
    void supabase.auth.getUser().then(({ data, error }) => { if (active) { if (error || !data.user) { setError('Entre na conta do Super Admin.'); setLoading(false); } else setUser(data.user); } });
    return () => { active = false; };
  }, []);
  useEffect(() => { setPage(0); }, [search, filter]);
  useEffect(() => {
    let active = true; if (!supabase || !user) return;
    setLoading(true); setError('');
    void supabase.rpc('get_admin_support_inbox', { p_search: search.trim(), p_filter: filter, p_page: page }).then(({ data, error }) => {
      if (!active) return;
      if (error || !data) setError(error?.message ?? 'Resumo do suporte indisponivel.'); else { setConversations(data.conversations ?? []); setTotal(Number(data.total ?? 0)); setPending(Number(data.pending ?? 0)); }
      setLoading(false);
    });
    return () => { active = false; };
  }, [user, search, filter, page, version]);
  useEffect(() => {
    if (!supabase || !user) return;
    const client = supabase;
    const channel = client.channel('admin-support-inbox-v2').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, () => setVersion(v => v + 1)).subscribe();
    const timer = window.setInterval(() => setVersion(v => v + 1), 10000);
    return () => { window.clearInterval(timer); void client.removeChannel(channel); };
  }, [user]);
  async function update(changes: Partial<Pick<Conversation, 'priority' | 'closed_at'>>) {
    if (!supabase || !selected || lock.current) return;
    lock.current = true; setSaving(true); setError('');
    try {
      const row = { user_id: selected.user_id, priority: selected.priority, closed_at: selected.closed ? selected.closed_at : null, ...changes, updated_at: new Date().toISOString() };
      const { data, error } = await supabase.from('admin_support_states').upsert(row).select('user_id,priority,closed_at').single();
      if (error || !data) throw error ?? new Error('Situação do atendimento não confirmada.');
      setSelected(current => current ? { ...current, ...row, closed: !!row.closed_at && Date.parse(row.closed_at) >= Date.parse(current.created_at) } : null); setVersion(v => v + 1);
    } catch (cause) { setError(saasAdminError(cause)); } finally { lock.current = false; setSaving(false); }
  }
  return <section className="panel-module"><div className="module-header"><div><h3>Atendimento aos clientes</h3><p>{pending} atendimento(s) aguardando resposta.</p></div><button className="rma-advance-btn" disabled={loading || saving} onClick={() => setVersion(v => v + 1)}>Atualizar atendimentos</button></div>
    {error && <p role="alert" className="admin-feedback admin-feedback-error">{error}</p>}
    <div className="rma-form inline admin-filters"><label>Buscar atendimento<input type="search" maxLength={200} value={search} onChange={e => setSearch(e.target.value)} placeholder="Empresa ou última mensagem" /></label><label>Mostrar<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todos</option><option value="pending">Aguardando resposta</option><option value="closed">Encerrados</option><option value="high">Prioridade alta</option></select></label></div>
    {loading && <p role="status">Carregando atendimentos...</p>}
    <div className="admin-support-conversations">{conversations.map(conversation => <button type="button" className={'admin-support-conversation ' + (selected?.user_id === conversation.user_id ? 'active' : '')} key={conversation.user_id} onClick={() => setSelected(conversation)}><strong>{conversation.company_name}</strong><span>{conversation.message}</span><small>{new Date(conversation.created_at).toLocaleString('pt-BR')} · {conversation.closed ? 'Encerrado' : conversation.sender_role === 'cliente' ? 'Aguardando resposta' : 'Respondido'}{conversation.priority === 'high' ? ' · Prioridade alta' : ''}</small></button>)}</div>
    {!loading && !conversations.length && <p>Nenhum atendimento encontrado.</p>}
    <div className="subscription-actions"><button type="button" disabled={loading || page === 0} onClick={() => setPage(p => p - 1)}>Anterior</button><span>Página {page + 1} · {total} atendimento(s)</span><button type="button" disabled={loading || (page + 1) * 25 >= total} onClick={() => setPage(p => p + 1)}>Próxima</button></div>
    {selected && user && <div className="module-card"><h4>{companies.find(c => c.user_id === selected.user_id)?.business_name ?? selected.company_name}</h4><div className="subscription-actions"><button type="button" className="rma-advance-btn" disabled={saving} onClick={() => void update({ priority: selected.priority === 'high' ? 'normal' : 'high' })}>{selected.priority === 'high' ? 'Remover prioridade alta' : 'Marcar prioridade alta'}</button><button type="button" className="rma-advance-btn" disabled={saving} onClick={() => void update({ closed_at: selected.closed ? null : new Date().toISOString() })}>{selected.closed ? 'Reabrir atendimento' : 'Encerrar atendimento'}</button></div><SupportChatModule key={selected.user_id} user={user} conversationUserId={selected.user_id} admin /></div>}
  </section>;
}
