import type { PartnerProduct } from '../types';

export function productBarcodeValue(product: Pick<PartnerProduct, 'sku' | 'barcode'>) {
  return product.barcode?.trim() || product.sku?.trim() || '';
}

export function generateInternalBarcode(products: Pick<PartnerProduct, 'sku' | 'barcode'>[], random = () => crypto.getRandomValues(new Uint32Array(2))) {
  const used = new Set(products.flatMap(product => [product.barcode?.trim(), product.sku?.trim()]).filter(Boolean));
  for (let attempt = 0; attempt < 100; attempt++) {
    const values = random();
    const code = '20' + String(values[0] % 100000).padStart(5, '0') + String(values[1] % 100000).padStart(5, '0');
    if (!used.has(code)) return code;
  }
  throw new Error('Não foi possível gerar um código livre. Tente novamente.');
}

export async function productBarcodeSvg(value: string) {
  if (!value || !/^[\x20-\x7e]+$/.test(value)) throw new Error('Informe um código com números ou letras sem acentos para gerar as barras.');
  const { default: JsBarcode } = await import('jsbarcode');
  const encoded: { encodings?: { data: string }[] } = {};
  JsBarcode(encoded, value, { format: 'CODE128', displayValue: false });
  const bits = encoded.encodings?.map(row => row.data).join('');
  if (!bits || !/^[01]+$/.test(bits)) throw new Error('Não foi possível gerar o código de barras.');
  const width = bits.length + 20;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('viewBox', '0 0 ' + width + ' 60');
  svg.setAttribute('data-bar-modules', String(width));
  svg.setAttribute('shape-rendering', 'crispEdges');
  const background = document.createElementNS(svg.namespaceURI!, 'rect');
  background.setAttribute('width', '100%'); background.setAttribute('height', '100%'); background.setAttribute('fill', '#fff'); svg.appendChild(background);
  for (let x = 0; x < bits.length; x++) {
    if (bits[x] !== '1') continue;
    const bar = document.createElementNS(svg.namespaceURI!, 'rect');
    bar.setAttribute('x', String(x + 10)); bar.setAttribute('y', '0'); bar.setAttribute('width', '1'); bar.setAttribute('height', '60'); bar.setAttribute('fill', '#000'); svg.appendChild(bar);
  }
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
}
