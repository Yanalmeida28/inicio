import { useEffect, useMemo, useRef, useState } from 'react';
import { QrCode, X } from 'lucide-react';
import type { PartnerProduct } from '../../types';
import { printProductLabel, productLabelDocument, productLabelQr, validateProductLabelSize } from '../../lib/productLabelPrint';

export function ProductLabelModal({ product, onClose }: { product: PartnerProduct | undefined; onClose: () => void }) {
  const [preset,setPreset] = useState('58');
  const [width,setWidth] = useState('58');
  const [height,setHeight] = useState('40');
  const [qrUrl,setQrUrl] = useState('');
  const [error,setError] = useState('');
  const [printing,setPrinting] = useState(false);
  const lock = useRef(false);
  useEffect(()=>{
    let active=true;
    setQrUrl(''); setError('');
    if (product) void productLabelQr(product).then(url=>{if(active)setQrUrl(url);}).catch(()=>{if(active)setError('Não foi possível gerar o QR do produto. Feche e tente novamente.');});
    return ()=>{active=false;};
  },[product]);
  const preview = useMemo(()=>{
    try {
      const size={width:Number(width),height:Number(height)};
      validateProductLabelSize(size);
      return {html:product && qrUrl ? '<!doctype html>'+productLabelDocument(product,size,qrUrl).documentElement.outerHTML : '',error:''};
    } catch(cause) {return {html:'',error:cause instanceof Error ? cause.message : 'Medidas inválidas.'};}
  },[product,width,height,qrUrl]);
  if (!product) return null;
  function choose(value: string, w: string, h: string) {setPreset(value);setWidth(w);setHeight(h);}
  async function print() {
    if(lock.current || !product || !qrUrl || preview.error) return;
    lock.current=true;setPrinting(true);setError('');
    try {await printProductLabel(product,{width:Number(width),height:Number(height)},qrUrl);}
    catch(cause){setError(cause instanceof Error ? cause.message : 'Não foi possível imprimir a etiqueta.');}
    finally{lock.current=false;setPrinting(false);}
  }
  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal-content thermal-label-modal" role="dialog" aria-modal="true" aria-labelledby="product-label-title" onClick={event=>event.stopPropagation()}>
      <div className="modal-header"><h3 id="product-label-title">Imprimir etiqueta</h3><button type="button" aria-label="Fechar etiqueta" onClick={onClose}><X size={18}/></button></div>
      <div className="thermal-size-toggle" style={{flexWrap:'wrap'}}>
        <button type="button" className={preset==='58'?'active':''} onClick={()=>choose('58','58','40')}>58 × 40 mm</button>
        <button type="button" className={preset==='80'?'active':''} onClick={()=>choose('80','80','50')}>80 × 50 mm</button>
        <button type="button" className={preset==='custom'?'active':''} onClick={()=>choose('custom','50','30')}>Personalizada</button>
      </div>
      {preset==='custom' && <div className="form-row" style={{marginBottom:12}}>
        <label>Largura (mm)<input type="number" min="30" max="150" step="0.1" value={width} onChange={event=>setWidth(event.target.value)}/></label>
        <label>Altura (mm)<input type="number" min="20" max="150" step="0.1" value={height} onChange={event=>setHeight(event.target.value)}/></label>
      </div>}
      <p>Use as medidas da etiqueta colocada na impressora. Na impressão, escolha o mesmo papel, escala de 100% e desative cabeçalhos e rodapés.</p>
      {preview.html && <iframe title="Prévia da etiqueta do produto" srcDoc={preview.html} style={{display:'block',width:'100%',height:'auto',aspectRatio:`${width} / ${height}`,border:'1px solid #ccc',background:'#fff',marginBottom:16}}/>}
      {!qrUrl && !error && <p role="status">Gerando QR do produto…</p>}
      {(error || preview.error) && <p role="alert" className="form-error-msg">{error || preview.error}</p>}
      <button type="button" className="module-submit-btn" disabled={printing || !qrUrl || Boolean(preview.error)} onClick={()=>void print()}><QrCode size={16}/> {printing?'Preparando…':'Imprimir etiqueta'}</button>
    </div>
  </div>;
}
