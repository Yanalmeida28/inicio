import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export function CustomerPhotoViewer({ name, path, imageUrl, entityLabel = 'cliente', onClose }: { name: string; path?: string | null; imageUrl?: string | null; entityLabel?: 'cliente' | 'produto'; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    closeButton.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') { event.preventDefault(); closeButton.current?.focus(); }
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [onClose]);
  useEffect(() => {
    let active = true;
    setUrl(null); setError(''); setLoading(Boolean(path));
    if (imageUrl !== undefined) { setUrl(imageUrl); setLoading(false); return; }
    if (!path) return;
    async function load() {
      try {
        if (!supabase) throw new Error('Loja não conectada.');
        const { data, error: failure } = await supabase.storage.from('customer-photos').createSignedUrl(path!, 3600);
        if (failure || !data?.signedUrl) throw new Error('Não foi possível carregar a foto. Feche e tente novamente.');
        if (active) setUrl(data.signedUrl);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a foto.'); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [path, imageUrl]);
  return <div className="modal-backdrop customer-photo-viewer-backdrop" onClick={onClose}>
    <div className="modal-content customer-photo-viewer" role="dialog" aria-modal="true" aria-labelledby="customer-photo-viewer-title" onClick={event => event.stopPropagation()}>
      <div className="modal-header"><h3 id="customer-photo-viewer-title">Foto de {name}</h3><button ref={closeButton} type="button" aria-label="Fechar foto ampliada" onClick={onClose}><X size={22} /></button></div>
      <div className="customer-photo-viewer-content">
        {loading && <p role="status">Carregando foto...</p>}
        {!path && !imageUrl && <p>Este {entityLabel} ainda não possui foto.</p>}
        {error && <p role="alert">{error}</p>}
        {url && !error && <img src={url} alt={`Foto ampliada de ${name}`} onError={() => { setUrl(null); setError('Não foi possível exibir a foto. Feche e tente novamente.'); }} />}
      </div>
    </div>
  </div>;
}
