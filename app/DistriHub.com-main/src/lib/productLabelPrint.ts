import type { PartnerProduct } from '../types';
import { money } from '../utils';

export type ProductLabelSize = { width: number; height: number; showPrice?: boolean };
type LabelProduct = Pick<PartnerProduct, 'id' | 'name' | 'sku' | 'sale_price'>;

export function validateProductLabelSize(size: ProductLabelSize) {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width < 30 || size.width > 150 || size.height < 20 || size.height > 150) {
    throw new Error('Informe largura entre 30 e 150 mm e altura entre 20 e 150 mm.');
  }
}

export async function productLabelQr(product: LabelProduct) {
  const { BrowserQRCodeSvgWriter } = await import('@zxing/browser');
  const svg = new BrowserQRCodeSvgWriter().write(product.sku?.trim() || product.id, 256, 256);
  svg.setAttribute('shape-rendering', 'crispEdges');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
}

// A separate document keeps navigation, modal styles and mobile breakpoints off the paper.
export function productLabelDocument(product: LabelProduct, size: ProductLabelSize, qrUrl: string, doc = document.implementation.createHTMLDocument('Etiqueta do produto')) {
  validateProductLabelSize(size);
  const vertical = size.height >= size.width;
  doc.head.replaceChildren(); doc.body.replaceChildren();
  doc.title = 'Etiqueta do produto'; doc.documentElement.lang = 'pt-BR';
  const charset = doc.createElement('meta'); charset.setAttribute('charset','utf-8'); doc.head.append(charset);
  const style = doc.createElement('style');
  style.textContent = `
    @page { size: ${size.width}mm ${size.height}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: ${size.width}mm; height: ${size.height}mm; margin: 0; padding: 0; background: #fff; color: #000; }
    .product-label { width: 100%; height: 100%; display: grid; grid-template-columns: ${vertical ? 'minmax(0,1fr)' : '38% minmax(0,1fr)'}; ${vertical ? 'grid-template-rows: minmax(0,1fr) auto; text-align: center;' : ''} gap: 2mm; align-items: center; padding: 2mm; font-family: Arial,sans-serif; break-inside: avoid; overflow: hidden; }
    .label-qr { display: flex; align-items: center; justify-content: center; min-width: 0; min-height: 0; height: 100%; overflow: hidden; }
    .label-qr img { display: block; width: 100%; max-height: 100%; object-fit: contain; }
    .label-info { display: flex; flex-direction: column; justify-content: center; gap: 1mm; min-width: 0; overflow: hidden; }
    .label-name { font-size: ${size.width < 45 ? 10 : 12}px; line-height: 1.15; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: ${size.height < 30 ? 2 : 3}; overflow: hidden; }
    .label-sku { font-size: 9px; line-height: 1.15; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
    .label-price { font-size: ${size.width < 45 ? 12 : 16}px; font-weight: 700; line-height: 1.1; }
    @media screen { html, body { width: 100%; height: 100%; } }
  `;
  doc.head.append(style);
  const label = doc.createElement('main'); label.className = 'product-label';
  const qr = doc.createElement('div'); qr.className = 'label-qr';
  const image = doc.createElement('img'); image.src = qrUrl; image.alt = 'QR do produto'; qr.append(image);
  const info = doc.createElement('div'); info.className = 'label-info';
  for (const [tag, className, text] of [
    ['strong','label-name',product.name],
    ['span','label-sku',`SKU: ${product.sku?.trim() || '—'}`],
    ['span','label-price',money.format(product.sale_price)],
  ]) {
    if (className === 'label-price' && size.showPrice === false) continue;
    const node = doc.createElement(tag); node.className = className; node.textContent = text; info.append(node);
  }
  label.append(qr,info); doc.body.append(label);
  return doc;
}

export async function printProductLabel(product: LabelProduct, size: ProductLabelSize, qrUrl: string) {
  validateProductLabelSize(size);
  const popup = window.open('', '_blank', 'width=480,height=360');
  if (!popup) throw new Error('Permita pop-ups neste navegador para imprimir a etiqueta.');
  try {
    const doc = productLabelDocument(product,size,qrUrl,popup.document);
    await Promise.all(Array.from(doc.images).map(img=>img.decode()));
    if (popup.closed) return;
    await new Promise<void>(resolve=>popup.requestAnimationFrame(()=>resolve()));
    popup.focus(); popup.print();
  } catch (cause) { popup.close(); throw cause; }
}
