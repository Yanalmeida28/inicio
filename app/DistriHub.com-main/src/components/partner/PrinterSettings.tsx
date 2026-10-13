import { useState } from 'react';
import { listReceiptPrinters, printerPreferences, savePrinter, sendReceipt } from '../../lib/directPrint';

export function PrinterSettings() {
  const [saved, setSaved] = useState(printerPreferences);
  const [printers, setPrinters] = useState<string[]>(() => saved ? [saved.name] : []);
  const [name, setName] = useState(saved?.name ?? '');
  const [width, setWidth] = useState<'58' | '80'>(saved?.width ?? '80');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setNotice(''); setError('');
    try { await action(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível conectar à impressora.'); }
    finally { setBusy(false); }
  }
  return <div className="module-card">
    <h3>Impressora de cupons</h3>
    <p>Escolha a impressora deste computador para imprimir sem a janela de confirmação.</p>
    <p><a href="/downloads/Conector-DistriHub.zip" download>1. Baixar conector para Windows</a> · Extraia o arquivo e abra Instalar.cmd uma vez.</p>
    <button type="button" className="rma-advance-btn" disabled={busy} onClick={() => void run(async () => { const found = await listReceiptPrinters(); setPrinters(found); if (!found.includes(name)) setName(found[0] ?? ''); setNotice(found.length ? 'Conector conectado. Escolha sua impressora.' : 'Instale o driver da impressora no Windows e tente novamente.'); })}>2. Buscar impressoras</button>
    <div className="rma-form">
      <label>Impressora<select value={name} disabled={busy} onChange={event => setName(event.target.value)}><option value="">Selecione</option>{printers.map(printer => <option key={printer} value={printer}>{printer}</option>)}</select></label>
      <label>Papel<select value={width} disabled={busy} onChange={event => setWidth(event.target.value as '58' | '80')}><option value="80">80 mm (Elgin i8)</option><option value="58">58 mm</option></select></label>
    </div>
    <button type="button" className="module-submit-btn" disabled={busy || !name} onClick={() => void run(async () => { await sendReceipt('DistriHub\nTESTE DE IMPRESSÃO\nImpressora: ' + name + '\nSe este cupom saiu corretamente, a configuração está pronta.\n', { name, width }); savePrinter({ name, width }); setSaved({ name, width }); setNotice('Teste enviado à fila do Windows. Impressora salva neste computador. Confira o cupom.'); })}>3. Testar cupom e salvar</button>
    {saved && <><p>Impressão direta ativa: {saved.name}. Cupons em texto; o corte depende do driver. Etiquetas continuam com a janela de impressão.</p><button type="button" disabled={busy} className="rma-advance-btn" onClick={() => { savePrinter(null); setSaved(null); setNotice('Impressão pelo navegador ativada.'); }}>Usar impressão pelo navegador</button></>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert" className="otp-error-msg">{error}</p>}
  </div>;
}
