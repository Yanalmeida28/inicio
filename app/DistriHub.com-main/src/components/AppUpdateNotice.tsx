import { useEffect, useState } from 'react';

export function AppUpdateNotice() {
  const [newBuild, setNewBuild] = useState('');
  useEffect(() => {
    let active = true, pending = false;
    let request: AbortController | null = null;
    async function check() {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true; request = new AbortController();
      const timeout = window.setTimeout(() => request?.abort(), 10_000);
      try {
        const response = await fetch(`/app-version.json?check=${Date.now()}`, { cache: 'no-store', signal: request.signal });
        if (!response.ok) return;
        const version: unknown = await response.json();
        if (active && version && typeof version === 'object' && 'buildId' in version && typeof version.buildId === 'string') {
          setNewBuild(version.buildId && version.buildId !== __APP_BUILD_ID__ ? version.buildId : '');
        }
      } catch { /* Offline or an in-progress deployment must not interrupt work. */ }
      finally { window.clearTimeout(timeout); pending = false; }
    }
    const onResume = () => { void check(); };
    onResume();
    const timer = window.setInterval(onResume, 120_000);
    window.addEventListener('pageshow', onResume);
    document.addEventListener('visibilitychange', onResume);
    return () => { active = false; request?.abort(); window.clearInterval(timer); window.removeEventListener('pageshow', onResume); document.removeEventListener('visibilitychange', onResume); };
  }, []);
  if (!newBuild) return null;
  return <aside role="status" style={{ position: 'fixed', top: 12, left: 12, right: 12, zIndex: 6000, maxWidth: 600, margin: '0 auto', padding: 14, borderRadius: 10, background: '#163c30', color: '#fff', boxShadow: '0 4px 20px #0004' }}>
    <p style={{ margin: '0 0 10px' }}>Nova versão do DistriHub disponível. Salve o formulário antes de atualizar.</p>
    <button type="button" className="rma-advance-btn" onClick={() => {
      const target = new URL(window.location.href); target.searchParams.set('_app_version', newBuild);
      window.location.replace(target.toString());
    }}>Atualizar aplicativo</button>
  </aside>;
}
