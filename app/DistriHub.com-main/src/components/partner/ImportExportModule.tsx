import { useState, useRef } from 'react';
import {
  Upload, FileText, Download, Table, FileSpreadsheet, File, Check, X, ArrowRight,
  Users,
} from 'lucide-react';
import type { PartnerProduct, PartnerCustomer } from '../../types';
import { money } from '../../utils';

type ImportTarget = 'produtos' | 'clientes';

type Props = {
  products: PartnerProduct[];
  customers: PartnerCustomer[];
  selectedBranchId?: string | null;
  onAddProduct: (p: Omit<PartnerProduct, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>;
  onAddCustomer: (c: Omit<PartnerCustomer, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
};

const productFields = ['name', 'sku', 'cost_price', 'sale_price', 'wholesale_price', 'stock', 'category'];
const customerFields = ['name', 'document', 'phone', 'email', 'address', 'neighborhood', 'city'];

const fieldLabels: Record<string, string> = {
  name: 'Nome',
  sku: 'SKU / Código',
  cost_price: 'Preço de Custo',
  sale_price: 'Preço Varejo',
  wholesale_price: 'Preço Atacado',
  stock: 'Estoque',
  category: 'Categoria',
  document: 'CPF / CNPJ',
  phone: 'WhatsApp / Telefone',
  email: 'E-mail',
  address: 'Endereço',
  neighborhood: 'Bairro',
  city: 'Cidade',
};

type ParsedRow = string[];
type ParsedData = { headers: string[]; rows: ParsedRow[] };

function parseCSV(text: string): ParsedData {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(/[;,\t]/).map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map((line) => line.split(/[;,\t]/).map((c) => c.trim().replace(/^"|"$/g, '')));
  return { headers, rows };
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportProductsCSV(products: PartnerProduct[]) {
  const headers = ['Nome', 'SKU', 'Custo', 'Varejo', 'Atacado', 'Estoque', 'Categoria'];
  const rows = products.map((p) => [
    p.name, p.sku ?? '', String(p.cost_price), String(p.sale_price),
    String(p.wholesale_price), String(p.stock), p.category ?? '',
  ]);
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(';')).join('\n');
  downloadFile('\uFEFF' + csv, 'produtos.csv', 'text/csv;charset=utf-8');
}

function exportProductsExcel(products: PartnerProduct[]) {
  const headers = ['Nome', 'SKU', 'Custo', 'Varejo', 'Atacado', 'Estoque', 'Categoria'];
  const rows = products.map((p) => [
    p.name, p.sku ?? '', p.cost_price, p.sale_price,
    p.wholesale_price, p.stock, p.category ?? '',
  ]);
  const html = `<table xmlns:x="urn:schemas-microsoft-com:office:excel"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  downloadFile(html, 'produtos.xls', 'application/vnd.ms-excel');
}

function exportProductsPDF(products: PartnerProduct[]) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<html><head><title>Relatório de Produtos</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px;text-align:left;font-size:12px}th{background:#f0f0f0}h1{font-size:16px}</style></head><body><h1>Relatório de Produtos</h1><table><thead><tr><th>Nome</th><th>SKU</th><th>Custo</th><th>Varejo</th><th>Atacado</th><th>Estoque</th><th>Categoria</th></tr></thead><tbody>${products.map((p) => `<tr><td>${p.name}</td><td>${p.sku ?? '—'}</td><td>${money.format(p.cost_price)}</td><td>${money.format(p.sale_price)}</td><td>${p.wholesale_price > 0 ? money.format(p.wholesale_price) : '—'}</td><td>${p.stock}</td><td>${p.category ?? '—'}</td></tr>`).join('')}</tbody></table></body></html>`);
  win.document.close();
  win.print();
}

function exportCustomersCSV(customers: PartnerCustomer[]) {
  const headers = ['Nome', 'CPF/CNPJ', 'WhatsApp', 'E-mail', 'Endereço', 'Bairro', 'Cidade', 'Tipo'];
  const rows = customers.map((c) => [
    c.name, c.document ?? '', c.phone ?? '', c.email ?? '',
    c.address ?? '', c.neighborhood ?? '', c.city ?? '', c.customer_type ?? 'varejo',
  ]);
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(';')).join('\n');
  downloadFile('\uFEFF' + csv, 'clientes.csv', 'text/csv;charset=utf-8');
}

function exportCustomersExcel(customers: PartnerCustomer[]) {
  const headers = ['Nome', 'CPF/CNPJ', 'WhatsApp', 'E-mail', 'Endereço', 'Bairro', 'Cidade', 'Tipo'];
  const rows = customers.map((c) => [
    c.name, c.document ?? '', c.phone ?? '', c.email ?? '',
    c.address ?? '', c.neighborhood ?? '', c.city ?? '', c.customer_type ?? 'varejo',
  ]);
  const html = `<table xmlns:x="urn:schemas-microsoft-com:office:excel"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  downloadFile(html, 'clientes.xls', 'application/vnd.ms-excel');
}

function exportCustomersPDF(customers: PartnerCustomer[]) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<html><head><title>Relatório de Clientes</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px;text-align:left;font-size:12px}th{background:#f0f0f0}h1{font-size:16px}</style></head><body><h1>Relatório de Clientes</h1><table><thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>WhatsApp</th><th>E-mail</th><th>Cidade</th><th>Tipo</th></tr></thead><tbody>${customers.map((c) => `<tr><td>${c.name}</td><td>${c.document ?? '—'}</td><td>${c.phone ?? '—'}</td><td>${c.email ?? '—'}</td><td>${c.city ?? '—'}</td><td>${c.customer_type ?? 'varejo'}</td></tr>`).join('')}</tbody></table></body></html>`);
  win.document.close();
  win.print();
}

export function ExportButtons({ target, products, customers }: { target: ImportTarget; products: PartnerProduct[]; customers: PartnerCustomer[] }) {
  if (target === 'produtos') {
    return (
      <div className="export-btn-group">
        <button className="rma-advance-btn" onClick={() => exportProductsExcel(products)} title="Exportar para Excel">
          <FileSpreadsheet size={14} /> Excel
        </button>
        <button className="rma-advance-btn" onClick={() => exportProductsCSV(products)} title="Exportar CSV">
          <Table size={14} /> CSV
        </button>
        <button className="rma-advance-btn" onClick={() => exportProductsPDF(products)} title="Exportar PDF">
          <FileText size={14} /> PDF
        </button>
      </div>
    );
  }
  return (
    <div className="export-btn-group">
      <button className="rma-advance-btn" onClick={() => exportCustomersExcel(customers)} title="Exportar para Excel">
        <FileSpreadsheet size={14} /> Excel
      </button>
      <button className="rma-advance-btn" onClick={() => exportCustomersCSV(customers)} title="Exportar CSV">
        <Table size={14} /> CSV
      </button>
      <button className="rma-advance-btn" onClick={() => exportCustomersPDF(customers)} title="Exportar PDF">
        <FileText size={14} /> PDF
      </button>
    </div>
  );
}

export function ImportExportModule({ products, customers, selectedBranchId, onAddProduct, onAddCustomer }: Props) {
  const [target, setTarget] = useState<ImportTarget>('produtos');
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [fileName, setFileName] = useState('');
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: number; fail: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fields = target === 'produtos' ? productFields : customerFields;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result ?? '');
      const data = parseCSV(text);
      setParsed(data);
      const autoMap: Record<string, string> = {};
      data.headers.forEach((h, i) => {
        const lower = h.toLowerCase();
        const match = fields.find((f) => f.toLowerCase().includes(lower) || lower.includes(f.toLowerCase()) ||
          (f === 'name' && (lower.includes('nome') || lower.includes('razao') || lower.includes('descri'))) ||
          (f === 'sku' && (lower.includes('sku') || lower.includes('codigo') || lower.includes('cod'))) ||
          (f === 'cost_price' && (lower.includes('custo') || lower.includes('cust'))) ||
          (f === 'sale_price' && (lower.includes('varejo') || lower.includes('preco') || lower.includes('valor'))) ||
          (f === 'wholesale_price' && (lower.includes('atacado') || lower.includes('atac'))) ||
          (f === 'stock' && (lower.includes('estoque') || lower.includes('qtde') || lower.includes('qtd'))) ||
          (f === 'category' && (lower.includes('categ'))) ||
          (f === 'document' && (lower.includes('cpf') || lower.includes('cnpj') || lower.includes('doc'))) ||
          (f === 'phone' && (lower.includes('telefone') || lower.includes('whats') || lower.includes('fone') || lower.includes('cel'))) ||
          (f === 'email' && lower.includes('email')) ||
          (f === 'address' && (lower.includes('endereco') || lower.includes('end'))) ||
          (f === 'neighborhood' && (lower.includes('bairro'))) ||
          (f === 'city' && (lower.includes('cidade')))
        );
        if (match) autoMap[String(i)] = match;
      });
      setColumnMap(autoMap);
    };
    reader.readAsText(file);
  }

  function handleImport() {
    if (!parsed) return;
    setImporting(true);
    setImportResult(null);
    let ok = 0;
    let fail = 0;

    (async () => {
      for (const row of parsed.rows) {
        try {
          const getVal = (field: string) => {
            const idx = Object.entries(columnMap).find(([, f]) => f === field)?.[0];
            if (idx === undefined) return '';
            return row[Number(idx)] ?? '';
          };
          if (target === 'produtos') {
            const name = getVal('name');
            if (!name) { fail++; continue; }
            if (!selectedBranchId) {
              window.alert('Selecione uma filial antes de importar estoque para manter a separação entre filiais.');
              fail++; continue;
            }
            await onAddProduct({
              name,
              sku: getVal('sku') || null,
              cost_price: Number(getVal('cost_price')) || 0,
              sale_price: Number(getVal('sale_price')) || 0,
              wholesale_price: Number(getVal('wholesale_price')) || 0,
              stock: Number(getVal('stock')) || 0,
              min_stock: 0,
              image_url: null,
              category: getVal('category') || null,
              is_service: false,
              branch_id: selectedBranchId,
            });
            ok++;
          } else {
            const name = getVal('name');
            if (!name) { fail++; continue; }
            if (!selectedBranchId) {
              window.alert('Selecione uma filial antes de importar clientes para manter a separação entre filiais.');
              fail++; continue;
            }
            await onAddCustomer({
              name,
              document: getVal('document') || null,
              phone: getVal('phone') || null,
              email: getVal('email') || null,
              birthday: null,
              address: getVal('address') || null,
              neighborhood: getVal('neighborhood') || null,
              city: getVal('city') || null,
              device_model: null,
              notes: null,
              customer_type: 'varejo',
              branch_id: selectedBranchId,
            });
            ok++;
          }
        } catch {
          fail++;
        }
      }
      setImporting(false);
      setImportResult({ ok, fail });
    })();
  }

  function reset() {
    setParsed(null);
    setFileName('');
    setColumnMap({});
    setImportResult(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div>
      <div className="subtab-bar">
        <button className={`subtab ${target === 'produtos' ? 'active' : ''}`} onClick={() => { setTarget('produtos'); reset(); }}>
          <FileSpreadsheet size={15} /> Importar Estoque
        </button>
        <button className={`subtab ${target === 'clientes' ? 'active' : ''}`} onClick={() => { setTarget('clientes'); reset(); }}>
          <Users size={15} /> Importar Clientes
        </button>
      </div>

      <div className="rma-form">
        <label>
          Arquivo para Importação (CSV, Excel, XML NF-e ou PDF)
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,.xml,.pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/xml,application/pdf"
            onChange={handleFile}
            style={{ padding: '8px' }}
          />
        </label>
        {fileName && (
          <div className="otp-sent-hint">
            <File size={14} /> Arquivo carregado: <strong>{fileName}</strong> ({parsed?.rows.length ?? 0} linhas detectadas)
          </div>
        )}
      </div>

      {parsed && parsed.headers.length > 0 && (
        <div className="rma-form" style={{ marginTop: '14px' }}>
          <div className="module-card-title">
            <ArrowRight size={16} /> Mapeamento de Colunas
          </div>
          <p style={{ color: '#7f97a9', fontSize: '13px', marginBottom: '12px' }}>
            Associe cada coluna do arquivo ao campo correspondente no sistema:
          </p>
          {parsed.headers.map((h, i) => (
            <div key={i} className="import-map-row">
              <span className="import-map-source">{h}</span>
              <ArrowRight size={14} />
              <select
                value={columnMap[String(i)] ?? ''}
                onChange={(e) => setColumnMap((prev) => ({ ...prev, [String(i)]: e.target.value }))}
              >
                <option value="">— Ignorar —</option>
                {fields.map((f) => (
                  <option key={f} value={f}>{fieldLabels[f]}</option>
                ))}
              </select>
            </div>
          ))}

          <div className="import-preview">
            <div className="module-card-title"><Table size={16} /> Pré-visualização (5 primeiras linhas)</div>
            <div className="stock-table-wrap">
              <table className="rma-table">
                <thead><tr>{parsed.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                <tbody>
                  {parsed.rows.slice(0, 5).map((row, ri) => (
                    <tr key={ri}>{row.map((c, ci) => <td key={ci}>{c || '—'}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="otp-actions">
            <button className="rma-advance-btn" onClick={reset}>
              <X size={16} /> Cancelar
            </button>
            <button className="module-submit-btn" onClick={handleImport} disabled={importing}>
              <Upload size={16} /> {importing ? 'Importando...' : `Importar ${parsed.rows.length} registros`}
            </button>
          </div>

          {importResult && (
            <div className="otp-sent-hint" style={{ color: importResult.fail > 0 ? '#e6a06d' : '#5bbc87' }}>
              <Check size={14} /> Importação concluída: {importResult.ok} registros importados{importResult.fail > 0 && `, ${importResult.fail} falhas`}
            </div>
          )}
        </div>
      )}

      <div className="section-divider"><span className="section-divider-label">Exportar Dados</span></div>

      <div className="rma-form">
        <div className="module-card-title"><Download size={16} /> Exportar {target === 'produtos' ? 'Produtos' : 'Clientes'}</div>
        <p style={{ color: '#7f97a9', fontSize: '13px', marginBottom: '12px' }}>
          Baixe os dados cadastrados em formato Excel, CSV ou PDF:
        </p>
        <ExportButtons target={target} products={products} customers={customers} />
      </div>
    </div>
  );
}
