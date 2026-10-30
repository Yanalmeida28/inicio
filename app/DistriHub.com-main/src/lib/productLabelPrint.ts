import type { PartnerProduct } from '../types';
import { money } from '../utils';

export type ProductLabelSize = { width: number; height: number; showPrice?: boolean; codeType?: 'qr' | 'barcode'; marginMm?: number };
export type LabelProduct = Pick<PartnerProduct, 'id' | 'name' | 'sku' | 'sale_price' | 'barcode'>;

export function validateProductLabelSize(size: ProductLabelSize) {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width < 30 || size.width > 150 || size.height < 20 || size.height > 150) {
    throw new Error('Informe largura entre 30 e 150 mm e altura entre 20 e 150 mm.');
  }
  const margin = size.marginMm ?? 3;
  if (!Number.isFinite(margin) || margin < 2 || margin > 6) throw new Error('Informe margem de segurança entre 2 e 6 mm.');
}

export function productLabelArea(size: ProductLabelSize) {
  validateProductLabelSize(size);
  const margin = size.marginMm ?? 3;
  return {margin,width:size.width-2*margin,height:size.height-2*margin};
}

export async function productLabelQr(product: LabelProduct) {
  const [{ BrowserQRCodeSvgWriter }, { EncodeHintType }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
  const hints = new Map();
  hints.set(EncodeHintType.ERROR_CORRECTION, 'M');
  hints.set(EncodeHintType.MARGIN, 4);
  hints.set(EncodeHintType.CHARACTER_SET, 'UTF-8');
  // One SVG unit per module avoids fractional padding before physical sizing.
  const svg = new BrowserQRCodeSvgWriter().write(product.barcode?.trim() || product.sku?.trim() || product.id, 0, 0, hints);
  svg.setAttribute('data-modules', svg.getAttribute('width') ?? '');
  svg.setAttribute('shape-rendering', 'crispEdges');
  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  background.setAttribute('width', '100%'); background.setAttribute('height', '100%'); background.setAttribute('fill', '#fff');
  svg.insertBefore(background, svg.firstChild);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
}

export function productLabelQrSide(size: ProductLabelSize, qrUrl: string) {
  validateProductLabelSize(size);
  let modules = 37;
  if (qrUrl.startsWith('data:image/svg+xml;charset=utf-8,')) {
    const svg = decodeURIComponent(qrUrl.slice(qrUrl.indexOf(',') + 1));
    const encoded = Number(svg.match(/data-modules="(\d+)"/)?.[1]);
    if (!Number.isInteger(encoded) || encoded < 29 || encoded > 185) throw new Error('QR inválido. Gere a etiqueta novamente.');
    modules = encoded;
  }
  // 0.5 mm per module gives roughly four printer dots at 203 dpi, including the quiet zone.
  const minimum = Math.ceil(modules * 0.5 * 10) / 10;
  const vertical = size.height >= size.width;
  const textHeight = size.showPrice === false ? 17 : 23;
  const area = productLabelArea(size);
  const available = vertical
    ? Math.min(area.width, area.height - 2 - textHeight)
    : Math.min(area.height, area.width - 2 - 10);
  if (available < minimum) throw new Error('Etiqueta pequena para este QR. Escolha um tamanho maior ou retire o preço.');
  return Math.max(minimum, Math.min(available, vertical ? area.width : area.width * 0.38));
}

export function productLabelLayout(size: ProductLabelSize, qrUrl: string) {
  validateProductLabelSize(size);
  const vertical = size.height >= size.width;
  const barcode = size.codeType === 'barcode';
  const qrSide = barcode ? 0 : productLabelQrSide(size, qrUrl);
  const area = productLabelArea(size);
  const barHeight = Math.min(15, area.height - 2 - (size.showPrice === false ? 17 : 22));
  if (barcode) {
    const svg = decodeURIComponent(qrUrl.slice(qrUrl.indexOf(',') + 1));
    const modules = Number(svg.match(/data-bar-modules="(\d+)"/)?.[1]);
    if (!modules || modules * 0.25 > area.width || barHeight < 10) throw new Error('Etiqueta pequena para este código de barras. Escolha papel maior, retire o preço ou revise a margem.');
  }
  const stacked = barcode || vertical;
  const imageWidth = barcode ? area.width : qrSide;
  const imageHeight = barcode ? barHeight : qrSide;
  return {vertical,barcode,qrSide,area,barHeight,stacked,imageWidth,imageHeight,
    imageX:area.margin+(stacked?(area.width-imageWidth)/2:0),
    imageY:area.margin+(stacked?0:(area.height-imageHeight)/2),
    textX:stacked?area.margin:area.margin+imageWidth+2,
    textY:stacked?area.margin+imageHeight+2:area.margin,
    textWidth:stacked?area.width:area.width-imageWidth-2,
    textHeight:stacked?area.height-imageHeight-2:area.height};
}

// The HTML document is the preview only; actual printing uses a one-page PDF.
export function productLabelDocument(product: LabelProduct, size: ProductLabelSize, qrUrl: string, doc = document.implementation.createHTMLDocument('Etiqueta do produto')) {
  const {vertical,barcode,qrSide,area,barHeight} = productLabelLayout(size,qrUrl);
  doc.head.replaceChildren(); doc.body.replaceChildren();
  doc.title = 'Etiqueta do produto'; doc.documentElement.lang = 'pt-BR';
  const charset = doc.createElement('meta'); charset.setAttribute('charset','utf-8'); doc.head.append(charset);
  const style = doc.createElement('style');
  style.textContent = `
    @page { size: ${size.width}mm ${size.height}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: ${size.width}mm; height: ${size.height}mm; margin: 0; padding: 0; background: #fff; color: #000; }
    .product-label { width: 100%; height: 100%; display: grid; grid-template-columns: ${vertical ? 'minmax(0,1fr)' : qrSide + 'mm minmax(0,1fr)'}; ${vertical ? 'grid-template-rows: ' + qrSide + 'mm minmax(0,1fr); text-align: center;' : ''} gap: 2mm; align-items: center; padding: ${area.margin}mm; font-family: Arial,sans-serif; break-inside: avoid; overflow: hidden; }
    .label-qr { display: flex; align-items: center; justify-content: center; min-width: 0; min-height: 0; height: 100%; overflow: hidden; }
    .label-qr img { display: block; width: ${qrSide}mm; height: ${qrSide}mm; flex: none; object-fit: contain; background: #fff; }
    .label-info { display: flex; flex-direction: column; justify-content: center; gap: 1mm; min-width: 0; min-height: 0; max-width: 100%; max-height: 100%; overflow: hidden; }
    .label-name { font-size: ${size.width < 45 ? 10 : 12}px; line-height: 1.15; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: ${size.height < 30 ? 2 : 3}; overflow: hidden; }
    .label-sku { font-size: 9px; line-height: 1.15; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
    .label-price { font-size: ${size.width < 45 ? 12 : 16}px; font-weight: 700; line-height: 1.1; max-width: 100%; overflow-wrap: anywhere; }
  `;
  doc.head.append(style);
  if (barcode) {
    const barStyle = doc.createElement('style');
    barStyle.textContent = '.product-label { grid-template-columns: minmax(0,1fr); grid-template-rows: ' + barHeight + 'mm minmax(0,1fr); text-align: center; } .label-qr img { width: ' + area.width + 'mm; height: ' + barHeight + 'mm; object-fit: fill; }';
    doc.head.append(barStyle);
  }
  const label = doc.createElement('main'); label.className = 'product-label';
  const qr = doc.createElement('div'); qr.className = 'label-qr';
  const image = doc.createElement('img'); image.src = qrUrl; image.alt = barcode ? 'Código de barras do produto' : 'QR do produto'; qr.append(image);
  const info = doc.createElement('div'); info.className = 'label-info';
  for (const [tag, className, text] of [
    ['strong','label-name',product.name],
    ['span','label-sku',barcode || product.barcode?.trim() ? 'Código: ' + (product.barcode?.trim() || product.sku?.trim() || '') : `SKU: ${product.sku?.trim() || '—'}`],
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
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) throw new Error('Permita pop-ups neste navegador para imprimir a etiqueta.');
  try {
    const {createProductLabelPdf} = await import('./productLabelPdf');
    const pdf = await createProductLabelPdf(product,size,qrUrl);
    if (popup.closed) return;
    const url = URL.createObjectURL(pdf.output('blob'));
    try { popup.location.replace(url); }
    catch (cause) { URL.revokeObjectURL(url); throw cause; }
    window.setTimeout(()=>URL.revokeObjectURL(url),15*60*1000);
  } catch (cause) { popup.close(); throw cause; }
}
