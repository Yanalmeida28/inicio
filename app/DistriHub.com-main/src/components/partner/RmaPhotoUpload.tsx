import { useEffect, useRef, useState } from 'react';
import type { RmaAttachment, RmaRequest } from '../../types';
export type RmaPhotoFile = { id: string; file: File; kind: RmaAttachment['kind'] };
export type RmaPhotoHandler = (id: string, files: RmaPhotoFile[]) => Promise<void>;
export function RmaPhotoUpload({ rma, onSave, onClose }: { rma: RmaRequest; onSave: RmaPhotoHandler; onClose: () => void }) {
  const [files, setFiles] = useState<RmaPhotoFile[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [kind, setKind] = useState<RmaAttachment['kind']>('defect');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  useEffect(() => { const urls=files.map(item=>URL.createObjectURL(item.file));setPreviews(urls);return ()=>urls.forEach(url=>URL.revokeObjectURL(url)); }, [files]);
  function select(selected: File[]) {
    if (pending || busy) return;
    setError('');
    if (selected.some(file=>!['image/jpeg','image/png','image/webp','image/heic'].includes(file.type) || !file.size || file.size>20*1024*1024)) { setError('Use fotos JPG, PNG, WebP ou HEIC de até 20 MB cada.');return; }
    if ((rma.attachments?.length??0)+selected.length>20) { setError('Cada devolução aceita até 20 anexos.');return; }
    setFiles(selected.map(file=>({ id:crypto.randomUUID(),file,kind })));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (lock.current || !files.length) return;
    lock.current=true;setBusy(true);setPending(true);setError('');
    try { await onSave(rma.id,files);setPending(false);onClose(); }
    catch (failure) { setError(failure && typeof failure==='object' && 'message' in failure ? String(failure.message) : 'Não foi possível anexar as fotos.'); }
    finally { lock.current=false;setBusy(false); }
  }
  return <div className="modal-overlay"><form className="modal-card rma-form" onSubmit={submit}>
    <h4>Fotos da peça devolvida</h4><p>{rma.product_name} · {rma.attachments?.length??0} anexo(s) salvo(s)</p>
    <fieldset disabled={busy||pending}>
      <label>Tipo de foto<select aria-label="Tipo de foto RMA" value={kind} onChange={event=>{const value=event.target.value as RmaAttachment['kind'];setKind(value);setFiles(previous=>previous.map(item=>({...item,kind:value})));}}><option value="defect">Produto / defeito</option><option value="before">Entrada / antes</option><option value="after">Saída / depois</option></select></label>
      <label>Selecionar fotos<input aria-label="Fotos da peça RMA" type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic" onChange={event=>{select(Array.from(event.target.files??[]));event.target.value='';}} /></label>
      <div style={{display:'flex',flexWrap:'wrap',gap:8}}>{files.map((item,index)=><figure key={item.id} style={{margin:0,width:120}}><img src={previews[index]} alt={item.file.name} style={{width:120,height:100,objectFit:'contain'}} /><figcaption style={{overflowWrap:'anywhere'}}>{item.file.name}</figcaption></figure>)}</div>
    </fieldset>
    <p>As fotos ficam privadas e vinculadas à devolução. Limite de 20 anexos no total. HEIC pode precisar ser aberto no aparelho que suporta esse formato.</p>
    {pending && <p role="status">Tentar novamente reaproveita os mesmos arquivos. Fotos já confirmadas permanecem na devolução; confira a lista antes de iniciar outro envio.</p>}
    {error && <p role="alert" className="form-error-msg">{error}</p>}
    <div className="pix-actions"><button type="submit" className="module-submit-btn" disabled={busy||!files.length}>{busy?'Enviando...':pending?'Recuperar envio de fotos':'Salvar fotos na devolução'}</button><button type="button" className="rma-advance-btn" disabled={busy} onClick={onClose}>{pending?'Fechar':'Cancelar'}</button></div>
  </form></div>;
}
