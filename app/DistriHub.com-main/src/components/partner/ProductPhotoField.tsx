import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export function ProductPhotoField({ value, onChange, disabled, onBusyChange }: { value: string | null; onChange: (value: string | null) => void; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [pasting, setPasting] = useState(false);
  const clipboardLock = useRef(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
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
      if (mounted.current) { onChange(photo.publicUrl); setMenuOpen(false); }
    } catch (failure) { if (mounted.current) setError(failure && typeof failure==='object' && 'message' in failure ? String(failure.message) : 'Não foi possível enviar a foto.'); }
    finally { lock.current=false;if (mounted.current) { setBusy(false);onBusyChange(false); } }
  }
  async function pasteClipboard() {
    if (disabled || lock.current || clipboardLock.current) return;
    clipboardLock.current=true;setPasting(true);setError('');onBusyChange(true);
    try {
      if (!navigator.clipboard?.read) throw new Error('Copie uma imagem e use Ctrl+V sobre a câmera.');
      const items=await navigator.clipboard.read();
      if (!mounted.current) return;
      for (const item of items) {
        const type=item.types.find(value=>['image/png','image/jpeg','image/webp'].includes(value));
        if (!type) continue;
        const blob=await item.getType(type);
        if (!mounted.current) return;
        await upload(new File([blob],'foto-colada.'+(type==='image/jpeg'?'jpg':type.split('/')[1]),{type}));
        return;
      }
      setError('Nenhuma imagem encontrada. Copie a foto e tente novamente.');
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error && cause.name!=='NotAllowedError' ? cause.message : 'Não foi possível acessar a imagem copiada. Use Ctrl+V sobre a câmera.');
    } finally { clipboardLock.current=false;if(mounted.current){setPasting(false);onBusyChange(false);} }
  }
  return <section className="product-form-section">
    <h4>Foto do produto</h4>
    <div className="product-photo-control" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setMenuOpen(false);}} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setMenuOpen(false);}}} onPaste={event=>{
      if(disabled||lock.current||clipboardLock.current)return;
      event.preventDefault();
      const file=Array.from(event.clipboardData.files).find(item=>item.type.startsWith('image/'));
      if(file)void upload(file);else setError('Copie uma imagem para colar a foto do produto.');
    }}>
      <input ref={cameraInput} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="Tirar foto do produto" disabled={disabled||busy||pasting} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(file)void upload(file);}}/>
      <input ref={galleryInput} hidden type="file" accept="image/jpeg,image/png,image/webp" aria-label="Escolher foto nos arquivos ou galeria" disabled={disabled||busy||pasting} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(file)void upload(file);}}/>
      <button type="button" className="product-photo-camera" aria-label="Opções da foto do produto" title="Foto do produto: tirar, escolher, colar ou remover" aria-haspopup="menu" aria-expanded={menuOpen} disabled={disabled||busy||pasting} onClick={()=>setMenuOpen(open=>!open)}>{value ? <img src={value} alt="Foto do produto" /> : <Camera size={64} aria-hidden="true" />}</button>
      {menuOpen && <div className="product-photo-menu" role="menu" aria-label="Ações da foto do produto">
        <button type="button" role="menuitem" disabled={disabled||busy||pasting} onClick={()=>cameraInput.current?.click()}>Tirar foto</button>
        <button type="button" role="menuitem" disabled={disabled||busy||pasting} onClick={()=>galleryInput.current?.click()}>Arquivos / Galeria</button>
        <button type="button" role="menuitem" disabled={disabled||busy||pasting} onClick={()=>void pasteClipboard()}>Colar foto</button>
        <button type="button" role="menuitem" disabled={disabled||busy||pasting||!value} onClick={()=>{onChange(null);setMenuOpen(false);setError('');}}>Remover foto</button>
      </div>}
    </div>
    {(busy||pasting) && <p role="status">Enviando foto...</p>}
    {error && <p role="alert" className="form-error-msg">{error}</p>}
  </section>;
}
