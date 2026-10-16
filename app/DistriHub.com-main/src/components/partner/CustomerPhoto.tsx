import { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { supabase } from '../../lib/supabase';
export { CustomerPhotoViewer } from './CustomerPhotoViewer';

export function CustomerPhoto({ path, file, removed }: { path?: string | null; file: File | null; removed: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setUrl(null);
    if (removed) return;
    if (file) {
      const preview = URL.createObjectURL(file);
      setUrl(preview);
      return () => URL.revokeObjectURL(preview);
    }
    if (path && supabase) {
      void supabase.storage.from('customer-photos').createSignedUrl(path, 3600).then(({ data, error }) => {
        if (active && !error) setUrl(data?.signedUrl ?? null);
      });
    }
    return () => { active = false; };
  }, [path, file, removed]);
  return url ? <img src={url} alt="Foto do cliente" onError={() => setUrl(null)} /> : <Camera size={32} aria-hidden="true" />;
}
