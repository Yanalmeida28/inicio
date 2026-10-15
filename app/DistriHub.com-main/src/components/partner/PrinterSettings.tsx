import { useRef, useState } from 'react';
import { listReceiptPrinters, printerPreferences, savePrinter, sendReceipt } from '../../lib/directPrint';

export function PrinterSettings() {
  const [saved, setSaved] = useState(printerPreferences);
  const [printers, setPrinters] = useState<string[]>(() => saved ? [saved.name] : []);
  const [name, setName] = useState(saved?.name ?? '');
  const [width, setWidth] = useState<'58' | '80'>(saved?.width ?? '80');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [tested, setTested] = useState<{ name: string; width: '58' | '80' } | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true); setNotice(''); setError('');
    try { await action(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível conectar à impressora.'); }
    finally { running.current = false; setBusy(false); }
  }
  return <div className="module-card">
    <h3>Impressora de cupons</h3>
    <p>O modo personalizado preserva o logo, a fonte, a largura e a disposição configurados em Personalização. Escolha sua impressora na janela do navegador, use escala de 100% e desative os cabeçalhos e rodapés do navegador.</p>
    <p role="status">{saved?.mode === 'text' ? 'Modo atual: texto simples pelo conector. Logo, fonte e alinhamento personalizados não são preservados.' : 'Modo atual: cupom personalizado pelo navegador, mesmo com o conector instalado.'}</p>
    <h4>Conector para impressão em texto simples</h4>
    <p>O conector imprime sem a janela de confirmação. O teste abaixo verifica a conexão; ele não representa a personalização do cupom.</p>
    <p><a href="/downloads/Conector-DistriHub.zip" download>1. Baixar conector para Windows</a> · Extraia o arquivo e abra Instalar.cmd uma vez.</p>
    <button type="button" className="rma-advance-btn" disabled={busy} onClick={() => void run(async () => { const found = await listReceiptPrinters(); setPrinters(found); if (!found.includes(name)) setName(found[0] ?? ''); setNotice(found.length ? 'Conector conectado. Escolha sua impressora.' : 'Instale o driver da impressora no Windows e tente novamente.'); })}>2. Buscar impressoras</button>
    <div className="rma-form">
      <label>Impressora<select value={name} disabled={busy} onChange={event => { setName(event.target.value); setTested(null); }}><option value="">Selecione</option>{printers.map(printer => <option key={printer} value={printer}>{printer}</option>)}</select></label>
      <label>Papel<select value={width} disabled={busy} onChange={event => { setWidth(event.target.value as '58' | '80'); setTested(null); }}><option value="80">80 mm (Elgin i8)</option><option value="58">58 mm</option></select></label>
    </div>
    <button type="button" className="module-submit-btn" disabled={busy || !name} onClick={() => void run(async () => { setTested(null); await sendReceipt('DistriHub\nTESTE DE IMPRESSÃO\nImpressora: ' + name + '\nSe este cupom saiu corretamente, confirme no aplicativo para salvar.\n', { name, width }); setTested({ name, width }); setNotice('Teste enviado à fila do Windows. Confira se o cupom saiu corretamente antes de salvar.'); })}>3. Imprimir cupom de teste</button>
    {tested && tested.name === name && tested.width === width && <button type="button" className="module-submit-btn" disabled={busy} onClick={() => { const preferences = { ...tested, mode: 'personalized' as const }; savePrinter(preferences); setSaved(preferences); setTested(null); setNotice('Impressora salva. O cupom continua no modo personalizado pelo navegador.'); }}>4. O cupom saiu corretamente: salvar impressora</button>}
    {saved && <><p>Impressora do conector: {saved.name}. O corte depende do driver.</p>{saved.mode === 'text' ? <button type="button" disabled={busy} className="rma-advance-btn" onClick={() => { const preferences = { ...saved, mode: 'personalized' as const }; savePrinter(preferences); setSaved(preferences); setNotice('Cupom personalizado ativado. Selecione a impressora na janela do navegador.'); }}>Usar cupom personalizado pelo navegador</button> : <button type="button" disabled={busy} className="rma-advance-btn" onClick={() => { const preferences = { ...saved, mode: 'text' as const }; savePrinter(preferences); setSaved(preferences); setNotice('Texto simples ativado: o desenho da personalização não será preservado.'); }}>Usar texto simples sem logo e formatação</button>}</>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert" className="otp-error-msg">{error}</p>}
  </div>;
}
