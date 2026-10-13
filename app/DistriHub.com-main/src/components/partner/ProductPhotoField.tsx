import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

export function ProductPhotoField({ value, onChange, disabled, onBusyChange }: { value: string | null; onChange: (value: string | null) => void; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const lock = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function upload(file: File) {
    if (disabled || lock.current) return;
    setError('');
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || !file.size || file.size>2*1024*1024) { setError('Use foto JPG, PNG ou WebP de até 2 MB.'); return; }
    lock.current=true;setBusy(true);onBusyChange(true);
    try {
      if (!supabase) throw new Error('Conecte-se para enviar a foto.');
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) throw new Error('Sessão indisponível. Entre novamente para enviar a foto.');
      const extension = file.type==='image/jpeg'?'jpg':file.type==='image/png'?'png':'webp';
      const path = `${data.user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('product-photos').upload(path,file,{contentType:file.type,upsert:false});
      if (uploadError) throw uploadError;
      const { data: photo } = supabase.storage.from('product-photos').getPublicUrl(path);
      if (mounted.current) onChange(photo.publicUrl);
    } catch (failure) { if (mounted.current) setError(failure && typeof failure==='object' && 'message' in failure ? String(failure.message) : 'Não foi possível enviar a foto.'); }
    finally { lock.current=false;if (mounted.current) { setBusy(false);onBusyChange(false); } }
  }
  return <section className="product-form-section">
    <h4>Foto do produto</h4>
    {value && <img src={value} alt="Foto do produto" style={{width:120,height:120,objectFit:'contain',borderRadius:8}} />}
    <label className="upload-label">{busy?'Enviando foto...':value?'Trocar foto':'Adicionar foto'}<input aria-label="Foto do produto" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled||busy} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void upload(file);}} /></label>
    <p>JPG, PNG ou WebP, até 2 MB. A foto acompanha o produto no catálogo público quando habilitado. Salve o cadastro para confirmar.</p>
    {value && <button type="button" className="rma-advance-btn" disabled={disabled||busy} onClick={()=>onChange(null)}>Remover foto do cadastro</button>}
    {error && <p role="alert" className="form-error-msg">{error}</p>}
  </section>;
}
