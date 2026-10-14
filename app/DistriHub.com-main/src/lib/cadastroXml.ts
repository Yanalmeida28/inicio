export type XmlStockItem = { name: string; sku: string; qty: number; cost: number; ncm: string | null };
export type XmlStockImport = {
  invoiceKey: string;
  supplier: { name: string; document: string; phone: string | null };
  items: XmlStockItem[];
};

export function parseXmlDecimal(value: string): number {
  if (!/^\d+(?:\.\d+)?$/.test(value.trim())) throw new Error('Valor numérico inválido na NF-e.');
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error('Valor numérico inválido na NF-e.');
  return result;
}

export function parseStockXml(text: string): XmlStockImport {
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) throw new Error('O arquivo não contém um XML válido.');
  const find = (parent: Element | Document, name: string) => Array.from(parent.getElementsByTagName('*')).find(element => element.localName === name);
  const read = (parent: Element | Document, name: string) => find(parent, name)?.textContent?.trim() ?? '';
  const invoice = find(document, 'infNFe');
  const invoiceKey = invoice?.getAttribute('Id')?.replace(/^NFe/, '') ?? '';
  if (!invoice || !/^\d{44}$/.test(invoiceKey)) throw new Error('A NF-e deve conter uma chave de acesso de 44 dígitos.');
  const issuer = find(invoice, 'emit');
  if (!issuer) throw new Error('Emitente não encontrado na NF-e.');
  const supplier = { name: read(issuer, 'xNome'), document: read(issuer, 'CNPJ') || read(issuer, 'CPF'), phone: read(issuer, 'fone') || null };
  if (!supplier.name || !/^\d{11}$|^\d{14}$/.test(supplier.document)) throw new Error('Nome e documento do fornecedor são obrigatórios na NF-e.');
  const items = Array.from(invoice.getElementsByTagName('*')).filter(element => element.localName === 'det').map(det => {
    const product = Array.from(det.children).find(element => element.localName === 'prod');
    if (!product) throw new Error('Item da NF-e sem produto.');
    const qty = parseXmlDecimal(read(product, 'qCom'));
    const cost = parseXmlDecimal(read(product, 'vUnCom'));
    const name = read(product, 'xProd');
    const sku = read(product, 'cProd');
    if (!name || !sku || !Number.isSafeInteger(qty) || qty <= 0) throw new Error('Cada item deve ter nome, código e quantidade inteira maior que zero.');
    return { name, sku, qty, cost: Math.round(cost * 100) / 100, ncm: read(product, 'NCM') || null };
  });
  if (!items.length) throw new Error('Nenhum item encontrado na NF-e.');
  return { invoiceKey, supplier, items };
}
