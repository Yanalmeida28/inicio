import { useEffect, useMemo, useRef, useState } from 'react';
import { QrCode, X } from 'lucide-react';
import type { PartnerProduct } from '../../types';
import { printProductLabel, productLabelDocument, productLabelQr, validateProductLabelSize } from '../../lib/productLabelPrint';

export function ProductLabelModal({ product, onClose }: { product: PartnerProduct | undefined; onClose: () => void }) {
  const [preset,setPreset] = useState('58');
  const [width,setWidth] = useState('40');
  const [height,setHeight] = useState('58');
  const [showPrice,setShowPrice] = useState(true);
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
      const size={width:Number(width),height:Number(height),showPrice};
      validateProductLabelSize(size);
      return {html:product && qrUrl ? '<!doctype html>'+productLabelDocument(product,size,qrUrl).documentElement.outerHTML : '',error:''};
    } catch(cause) {return {html:'',error:cause instanceof Error ? cause.message : 'Medidas inválidas.'};}
  },[product,width,height,qrUrl,showPrice]);
  if (!product) return null;
  const vertical = Number(height) >= Number(width);
  function choose(value: string, w: string, h: string) {setPreset(value);setWidth(vertical ? h : w);setHeight(vertical ? w : h);}
  function orient(portrait: boolean) {
    if (portrait !== vertical) {setWidth(height);setHeight(width);}
  }
  async function print() {
    if(lock.current || !product || !qrUrl || preview.error) return;
    lock.current=true;setPrinting(true);setError('');
    try {await printProductLabel(product,{width:Number(width),height:Number(height),showPrice},qrUrl);}
    catch(cause){setError(cause instanceof Error ? cause.message : 'Não foi possível imprimir a etiqueta.');}
    finally{lock.current=false;setPrinting(false);}
  }
  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal-content thermal-label-modal" role="dialog" aria-modal="true" aria-labelledby="product-label-title" onClick={event=>event.stopPropagation()}>
      <div className="modal-header"><h3 id="product-label-title">Imprimir etiqueta</h3><button type="button" aria-label="Fechar etiqueta" onClick={onClose}><X size={18}/></button></div>
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
      <p>Use as medidas da etiqueta colocada na impressora. Na impressão, escolha o mesmo papel, escala de 100% e desative cabeçalhos e rodapés.</p>
      {preview.html && <iframe title="Prévia da etiqueta do produto" srcDoc={preview.html} style={{display:'block',width:'100%',height:'auto',aspectRatio:`${width} / ${height}`,border:'1px solid #ccc',background:'#fff',marginBottom:16}}/>}
      {!qrUrl && !error && <p role="status">Gerando QR do produto…</p>}
      {(error || preview.error) && <p role="alert" className="form-error-msg">{error || preview.error}</p>}
      <button type="button" className="module-submit-btn" disabled={printing || !qrUrl || Boolean(preview.error)} onClick={()=>void print()}><QrCode size={16}/> {printing?'Preparando…':'Imprimir etiqueta'}</button>
    </div>
  </div>;
}
