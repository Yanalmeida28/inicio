import { useEffect, useRef, useState } from 'react';
import type { PartnerCustomer, ServiceOrder, ServiceOrderItem, ServiceOrderPhoto, ServiceOrderStatus, ServiceOrderApprovalStatus } from '../../types';
import { supabase } from '../../lib/supabase';
import { compressServicePhoto, uploadServicePhotos } from '../../lib/serviceOrders';
import { pendingPhotos, type PendingPhoto } from '../../lib/operationAttempts';
import { money } from '../../utils';

const statuses: { value: ServiceOrderStatus; label: string }[] = [
  { value: 'aberta', label: 'Aberta' }, { value: 'em_andamento', label: 'Em andamento' },
  { value: 'aguardando_peca', label: 'Aguardando peça' }, { value: 'aguardando_cliente', label: 'Aguardando cliente' },
  { value: 'pronta', label: 'Pronta' }, { value: 'finalizada', label: 'Finalizada / entregue' }, { value: 'cancelada', label: 'Cancelada' },
];
export function ServiceOrderDetails({ order, customers, onClose, onChanged }: { order: ServiceOrder; customers: PartnerCustomer[]; onClose: () => void; onChanged: (order: ServiceOrder) => void }) {
  const [status, setStatus] = useState(order.status);
  const [approval, setApproval] = useState<ServiceOrderApprovalStatus>(order.approval_status ?? 'aguardando_aprovacao');
  const [technician, setTechnician] = useState(order.technician_name ?? '');
  const [reason, setReason] = useState(order.approval_notes ?? '');
  const [customerId, setCustomerId] = useState(order.customer_id ?? '');
  const [parts, setParts] = useState<ServiceOrderItem[]>([]);
  const [photos, setPhotos] = useState<(ServiceOrderPhoto & { url?: string })[]>([]);
  const [queuedPhotos, setQueuedPhotos] = useState<PendingPhoto[]>([]);
  const [photoType, setPhotoType] = useState<'entry' | 'exit'>('exit');
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState(() => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const terminal = ['cancelada', 'finalizada'].includes(order.status);
  const fileKey = 'service-order-details:' + order.user_id + ':' + order.id;
  useEffect(() => {
    let active = true;
    if (!supabase) return;
    const client = supabase;
    void (async () => {
      try {
        const [items, media, invoice] = await Promise.all([
          client.from('service_order_items').select('*').eq('service_order_id', order.id).order('created_at'),
          client.from('service_order_photos').select('*').eq('service_order_id', order.id).order('created_at'),
          client.from('partner_invoices').select('id').eq('service_order_id', order.id).maybeSingle(),
        ]);
        if (items.error || media.error || invoice.error) throw items.error ?? media.error ?? invoice.error;
        const images = await Promise.all(((media.data ?? []) as ServiceOrderPhoto[]).map(async photo => {
          const { data, error } = await client.storage.from('service-order-photos').createSignedUrl(photo.storage_path, 3600);
          if (error) throw error;
          return { ...photo, url: data?.signedUrl };
        }));
        if (active) { setParts((items.data ?? []) as ServiceOrderItem[]); setPhotos(images); setInvoiceId(invoice.data?.id ?? null); }
        const pending = await pendingPhotos(fileKey);
        if (active) setQueuedPhotos(pending);
      } catch (cause) { if (active) setError(cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'Não foi possível carregar os detalhes e fotos.'); }
    })();
    return () => { active = false; };
  }, [order.id, fileKey]);
  async function action(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { await work(); } catch (cause) { setError(cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'Não foi possível confirmar a operação. Tente novamente.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    await action(async () => {
      if (!supabase) throw new Error('Conexão indisponível.');
      const { data, error } = await supabase.rpc('update_service_order_workflow', { p_order_id: order.id, p_status: status, p_technician: technician, p_approval: approval, p_reason: reason, p_customer_id: customerId || null });
      if (error || !data) throw error ?? new Error('Situação não confirmada.');
      onChanged(data as ServiceOrder); setMessage('Situação da OS salva.');
    });
  }
  return <section className="module-card service-order-details">
    <div className="module-header"><div><h3>OS #{order.id.slice(0, 8)}</h3><p>{order.equipment_type} · {order.equipment_identification || order.serial_number}</p></div><button type="button" className="rma-advance-btn" disabled={busy} onClick={onClose}>Fechar detalhes</button></div>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <p>Cliente: {order.customer_name || 'Não informado'} · Total: {money.format(Number(order.total))}</p>
    <p style={{ whiteSpace: 'pre-wrap' }}>{order.entry_notes}</p>
    <form className="rma-form" onSubmit={save}><fieldset disabled={busy || terminal}>
      <label>Cliente<select value={customerId} onChange={e => setCustomerId(e.target.value)}><option value="">Não informado</option>{customers.filter(c => !c.branch_id || c.branch_id === order.branch_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Responsável técnico<input maxLength={200} value={technician} onChange={e => setTechnician(e.target.value)} /></label>
      <label>Aprovação do orçamento<select value={approval} onChange={e => setApproval(e.target.value as ServiceOrderApprovalStatus)}><option value="aguardando_aprovacao">Aguardando aprovação</option><option value="aprovado">Aprovado</option><option value="reprovado">Reprovado</option></select></label>
      <label>Situação<select value={status} onChange={e => setStatus(e.target.value as ServiceOrderStatus)}>{statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
      <label>Observação / motivo<textarea required={status === 'cancelada'} minLength={status === 'cancelada' ? 5 : undefined} maxLength={4000} value={reason} onChange={e => setReason(e.target.value)} /></label>
      {status === 'cancelada' && <p>O cancelamento devolve as peças baixadas ao estoque e cancela a fatura sem recebimentos. OS com valores recebidos exige conciliação financeira.</p>}
      <button type="submit" className="module-submit-btn">{busy ? 'Salvando...' : 'Salvar situação'}</button>
    </fieldset></form>
    <h4>Peças e serviços</h4>{parts.map(p => <p key={p.id}>{p.product_name} · {p.quantity} × {money.format(Number(p.unit_price))}</p>)}
    <h4>Fotos de entrada e saída</h4><div className="service-order-photos">{photos.map(photo => <a key={photo.id} href={photo.url} target="_blank" rel="noopener noreferrer"><img src={photo.url} alt={photo.label} loading="lazy" /><span>{photo.photo_type === 'entry' ? 'Entrada' : 'Saída'} · {photo.label}</span></a>)}</div>
    <div className="rma-form inline"><label>Tipo de foto<select disabled={busy} value={photoType} onChange={e => setPhotoType(e.target.value as 'entry' | 'exit')}><option value="entry">Entrada</option><option value="exit">Saída</option></select></label><label>Adicionar fotos<input type="file" accept="image/*" multiple disabled={busy || order.status === 'cancelada'} onChange={e => {
      const files = Array.from(e.target.files ?? []); e.target.value = '';
      void action(async () => { const prepared = await Promise.all(files.slice(0, 8).map(async file => ({ id: crypto.randomUUID(), file: await compressServicePhoto(file), type: photoType, label: file.name }))); const queued = [...queuedPhotos, ...prepared]; await pendingPhotos(fileKey, queued); setQueuedPhotos(queued); });
    }} /></label></div>
    {!!queuedPhotos.length && <button type="button" className="module-submit-btn" disabled={busy} onClick={() => void action(async () => {
      if (!supabase) throw new Error('Conexão indisponível.');
      await uploadServicePhotos(supabase, order.user_id, order.id, queuedPhotos);
      await pendingPhotos(fileKey, null); setQueuedPhotos([]); setMessage('Fotos enviadas e vinculadas. Reabra os detalhes para visualizá-las.');
    })}>{busy ? 'Enviando...' : `Enviar / recuperar ${queuedPhotos.length} foto(s)`}</button>}
    <h4>Cobrança da OS</h4>{invoiceId ? <p>Fatura #{invoiceId.slice(0, 8)} registrada. Os recebimentos são feitos no Financeiro.</p> : <div className="rma-form inline"><label>Vencimento<input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} disabled={busy} /></label><button type="button" className="module-submit-btn" disabled={busy || !['pronta', 'finalizada'].includes(order.status)} onClick={() => void action(async () => { if (!supabase) throw new Error('Conexão indisponível.'); const { data, error } = await supabase.rpc('bill_service_order_once', { p_order_id: order.id, p_due_date: dueDate }); if (error || !data) throw error ?? new Error('Fatura não confirmada.'); setInvoiceId(data as string); setMessage('Fatura registrada uma única vez. Abra o Financeiro para receber.'); onChanged(order); })}>Gerar fatura da OS</button></div>}
    <h4>Histórico</h4>{order.status_history?.map((entry, index) => <p key={index}>{new Date(entry.at).toLocaleString('pt-BR')} · {entry.status} · {entry.reason || 'Sem observação'}</p>)}
  </section>;
}
