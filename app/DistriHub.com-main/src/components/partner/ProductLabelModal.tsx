import { useEffect, useMemo, useRef, useState } from 'react';
import { QrCode, X } from 'lucide-react';
import type { PartnerProduct } from '../../types';
import { printProductLabel, productLabelDocument, productLabelQr, validateProductLabelSize } from '../../lib/productLabelPrint';
import { generateInternalBarcode, productBarcodeSvg, productBarcodeValue } from '../../lib/productBarcodes';

export function ProductLabelModal({ product, products = [], onSaveBarcode, onClose }: { product: PartnerProduct | undefined; products?: PartnerProduct[]; onSaveBarcode?: (code: string) => Promise<void>; onClose: () => void }) {
  const [codeType,setCodeType] = useState<'qr'|'barcode'>('qr');
  const [codeDraft,setCodeDraft] = useState(product ? productBarcodeValue(product) : '');
  const [confirmedCode,setConfirmedCode] = useState<string | null>(null);
  const [savingCode,setSavingCode] = useState(false);
  const codeLock = useRef(false);
  const effectiveProduct = useMemo(()=>product && confirmedCode ? {...product,barcode:confirmedCode} : product,[product,confirmedCode]);
  const [preset,setPreset] = useState('58');
  const [width,setWidth] = useState('40');
  const [height,setHeight] = useState('58');
  const [showPrice,setShowPrice] = useState(true);
  const [marginMm,setMarginMm] = useState('3');
  const [qrUrl,setQrUrl] = useState('');
  const [error,setError] = useState('');
  const [printing,setPrinting] = useState(false);
  const lock = useRef(false);
  useEffect(()=>{
    let active=true;
    setQrUrl(''); setError('');
    if (effectiveProduct) {
      const request = codeType === 'barcode' ? productBarcodeSvg(productBarcodeValue(effectiveProduct)) : productLabelQr(effectiveProduct);
      void request.then(url=>{if(active)setQrUrl(url);}).catch(cause=>{if(active)setError(cause instanceof Error ? cause.message : 'Não foi possível gerar o código.');});
    }
    return ()=>{active=false;};
  },[effectiveProduct,codeType]);
  const preview = useMemo(()=>{
    try {
      const size={width:Number(width),height:Number(height),showPrice,codeType,marginMm:Number(marginMm)};
      validateProductLabelSize(size);
      return {html:effectiveProduct && qrUrl ? '<!doctype html>'+productLabelDocument(effectiveProduct,size,qrUrl).documentElement.outerHTML : '',error:''};
    } catch(cause) {return {html:'',error:cause instanceof Error ? cause.message : 'Medidas inválidas.'};}
  },[effectiveProduct,width,height,qrUrl,showPrice,codeType,marginMm]);
  if (!product) return null;
  const vertical = Number(height) >= Number(width);
  function choose(value: string, w: string, h: string) {setPreset(value);setWidth(vertical ? h : w);setHeight(vertical ? w : h);}
  function orient(portrait: boolean) {
    if (portrait !== vertical) {setWidth(height);setHeight(width);}
  }
  async function print() {
    if(lock.current || codeLock.current || !product || !qrUrl || preview.error) return;
    lock.current=true;setPrinting(true);setError('');
    try {await printProductLabel(effectiveProduct ?? product,{width:Number(width),height:Number(height),showPrice,codeType,marginMm:Number(marginMm)},qrUrl);}
    catch(cause){setError(cause instanceof Error ? cause.message : 'Não foi possível imprimir a etiqueta.');}
    finally{lock.current=false;setPrinting(false);}
  }
  async function saveCode(generate = false) {
    if (!onSaveBarcode || codeLock.current || lock.current) return;
    codeLock.current = true;
    setSavingCode(true); setError('');
    try {
      const code = generate ? generateInternalBarcode(products) : codeDraft.trim();
      if (!code || !/^[\x20-\x7e]+$/.test(code)) throw new Error('Informe um código com números ou letras sem acentos.');
      if (products.some(p=>p.id!==product!.id && p.branch_id===product!.branch_id && [p.barcode?.trim(),p.sku?.trim()].some(value=>value?.toLowerCase()===code.toLowerCase()))) throw new Error('Este código já pertence a outro produto nesta filial.');
      await onSaveBarcode(code);
      setConfirmedCode(code); setCodeDraft(code); setCodeType('barcode');
    } catch(cause) {setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o código.');}
    finally {codeLock.current=false;setSavingCode(false);}
  }
  function close() {if (!savingCode && !printing) onClose();}
  return <div className="modal-backdrop" onClick={close}>
    <div className="modal-content thermal-label-modal" role="dialog" aria-modal="true" aria-labelledby="product-label-title" onClick={event=>event.stopPropagation()}>
      <div className="modal-header"><h3 id="product-label-title">Imprimir etiqueta</h3><button type="button" aria-label="Fechar etiqueta" disabled={savingCode || printing} onClick={close}><X size={18}/></button></div>
      <label>Tipo de código<select aria-label="Tipo de código da etiqueta" value={codeType} disabled={savingCode || printing} onChange={event=>{setQrUrl('');setCodeType(event.target.value as 'qr'|'barcode');}}>
        <option value="qr">QR code</option><option value="barcode">Código de barras</option>
      </select></label>
      {codeType==='barcode' && <div className="module-card">
        <p>Use o número ou código da fábrica, mesmo que a embalagem não tenha barras. Sem código? Gere um código interno e salve no produto.</p>
        <label>Código do produto<input aria-label="Código para a etiqueta" value={codeDraft} disabled={savingCode || printing} onChange={event=>setCodeDraft(event.target.value)} /></label>
        {onSaveBarcode && <div className="otp-actions">
          <button type="button" className="rma-advance-btn" disabled={savingCode || printing || !codeDraft.trim()} onClick={()=>void saveCode()}>Salvar código no produto</button>
          {!effectiveProduct?.barcode?.trim() && <button type="button" className="rma-advance-btn" disabled={savingCode || printing} onClick={()=>void saveCode(true)}>Gerar código interno</button>}
        </div>}
        <small>O código interno é para uso na loja. Não substitui um código oficial de fábrica. Imprima após salvar.</small>
        {savingCode && <p role="status">Salvando código do produto…</p>}
      </div>}
      <div className="thermal-size-toggle" style={{flexWrap:'wrap'}}>
        <button type="button" className={preset==='58'?'active':''} onClick={()=>choose('58','58','40')}>{vertical ? '40 × 58' : '58 × 40'} mm</button>
        <button type="button" className={preset==='80'?'active':''} onClick={()=>choose('80','80','50')}>{vertical ? '50 × 80' : '80 × 50'} mm</button>
        <button type="button" className={preset==='custom'?'active':''} onClick={()=>choose('custom','50','30')}>Personalizada</button>
      </div>
      <div className="thermal-size-toggle" role="group" aria-label="Orientação da etiqueta">
        <button type="button" aria-pressed={vertical} className={vertical ? 'active' : ''} onClick={()=>orient(true)}>Vertical</button>
        <button type="button" aria-pressed={!vertical} className={!vertical ? 'active' : ''} onClick={()=>orient(false)}>Horizontal</button>
      </div>
      {preset==='custom' && <div className="form-row" style={{marginBottom:12}}>
        <label>Largura (mm)<input type="number" min="30" max="150" step="0.1" value={width} onChange={event=>setWidth(event.target.value)}/></label>
        <label>Altura (mm)<input type="number" min="20" max="150" step="0.1" value={height} onChange={event=>setHeight(event.target.value)}/></label>
      </div>}
      <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
        <input type="checkbox" checked={showPrice} onChange={event=>setShowPrice(event.target.checked)} disabled={printing} /> Mostrar preço na etiqueta
      </label>
      <label>Margem de segurança (mm)<input aria-label="Margem de segurança da etiqueta" type="number" min="2" max="6" step="0.5" value={marginMm} disabled={printing} onChange={event=>setMarginMm(event.target.value)}/></label>
      <small>A margem afasta o conteúdo das quatro bordas. Se o código não couber com essa margem, use uma etiqueta maior.</small>
      <p>A etiqueta abre em PDF de uma página, sem data, endereço ou numeração do navegador. No PDF, use o botão de imprimir, selecione o mesmo tamanho de papel e escala de 100% ou Tamanho real.</p>
      {preview.html && <div style={{overflowX:'auto',padding:'4px 2px',marginBottom:16}}>
        <iframe title="Prévia da etiqueta do produto" srcDoc={preview.html} style={{display:'block',width:`${width}mm`,height:`${height}mm`,boxSizing:'content-box',maxWidth:'none',border:'1px solid #ccc',background:'#fff',margin:'0 auto'}}/>
      </div>}
      {!qrUrl && !error && <p role="status">Gerando código do produto…</p>}
      {(error || preview.error) && <p role="alert" className="form-error-msg">{error || preview.error}</p>}
      <button type="button" className="module-submit-btn" disabled={printing || savingCode || !qrUrl || Boolean(preview.error) || (codeType==='barcode' && codeDraft.trim()!==productBarcodeValue(effectiveProduct ?? product))} onClick={()=>void print()}><QrCode size={16}/> {printing?'Preparando PDF…':'Abrir PDF para imprimir'}</button>
    </div>
  </div>;
}
