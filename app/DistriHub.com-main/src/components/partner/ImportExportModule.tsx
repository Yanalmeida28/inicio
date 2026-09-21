import { useState, useRef } from 'react';
import {
  Upload, FileText, Download, Table, FileSpreadsheet, File, Check, X, ArrowRight,
  Users,
} from 'lucide-react';
import * as XLSX from 'xlsx';
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
type ImportError = { line: number; message: string };
type ImportResult = { total: number; ok: number; fail: number; errors: ImportError[] };

// Parser CSV robusto: respeita campos entre aspas (com "", obras de linha
// dentro do campo), separadores ; , e TAB fora de aspas, CRLF/LF e BOM UTF-8.
function parseCSV(text: string): ParsedData {
  const src = text.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let fieldStarted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
      continue;
    }
    if (ch === ';' || ch === ',' || ch === '\t') {
      record.push(field);
      field = '';
      fieldStarted = false;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      record.push(field);
      field = '';
      fieldStarted = false;
      if (record.some((c) => c.trim() !== '')) records.push(record);
      record = [];
      continue;
    }
    field += ch;
    fieldStarted = true;
  }
  record.push(field);
  if (record.some((c) => c.trim() !== '')) records.push(record);

  if (records.length === 0) return { headers: [], rows: [] };
  const headers = records[0].map((h) => h.trim());
  const rows = records.slice(1).map((r) => r.map((c) => c.trim()));
  return { headers, rows };
}

// Lê a primeira planilha de um arquivo .xlsx/.xls e converte para a mesma
// estrutura interna do CSV. Células são convertidas para texto bruto
// (raw: true) para que a normalização de números brasileiros decida o valor.
function parseXLS(data: ArrayBuffer): ParsedData {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = workbook.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: false,
  });
  const rows = aoa
    .map((r) => (Array.isArray(r) ? r : []).map((c) => (c === null || c === undefined ? '' : String(c).trim())))
    .filter((r) => r.some((c) => c !== ''));
  if (rows.length === 0) return { headers: [], rows: [] };
  return { headers: rows[0], rows: rows.slice(1) };
}

// Normaliza números no formato brasileiro para preços:
// "1.299,90" → 1299.90 | "1299,90" → 1299.90 | "1299.90" → 1299.90
// Lança erro quando o valor é inválido — nunca converte silenciosamente em 0.
function parseBrazilianNumber(value: string): number {
  const v = value.trim().replace(/R\$\s*/g, '').replace(/\s/g, '');
  if (v === '') throw new Error('vazio');
  if (!/^[+-]?[0-9.,]+$/.test(v)) throw new Error('formato inválido');
  const lastComma = v.lastIndexOf(',');
  const lastDot = v.lastIndexOf('.');
  let normalized: string;
  if (lastComma === -1 && lastDot === -1) {
    normalized = v;
  } else if (lastComma > lastDot) {
    // Vírgula é o separador decimal; pontos são milhar.
    normalized = v.replace(/\./g, '').replace(',', '.');
  } else {
    // Ponto é o separador decimal; vírgulas são milhar.
    normalized = v.replace(/,/g, '');
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) throw new Error('formato inválido');
  return n;
}

// Estoque: aceita somente inteiro (inclui "10,0" / "10.0" com decimal zero).
function parseBrazilianInteger(value: string): number {
  const n = parseBrazilianNumber(value);
  if (!Number.isInteger(n)) throw new Error('não é um número inteiro');
  return n;
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
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mapWarning, setMapWarning] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fields = target === 'produtos' ? productFields : customerFields;

  // Mapeamento duplicado: duas colunas do arquivo apontando para o mesmo
  // campo tornam a importação ambígua — o usuário deve corrigir antes.
  const duplicateFields: string[] = (() => {
    const used = Object.values(columnMap).filter((f) => f !== '');
    return [...new Set(used.filter((f, i) => used.indexOf(f) !== i))];
  })();

  function handleMapChange(colIndex: string, field: string) {
    setColumnMap((prev) => ({ ...prev, [colIndex]: field }));
    if (field !== '' && Object.entries(columnMap).some(([idx, f]) => idx !== colIndex && f === field)) {
      setMapWarning(`O campo "${fieldLabels[field] ?? field}" foi associado a mais de uma coluna. Corrija o mapeamento para evitar dados ambíguos.`);
    } else {
      setMapWarning(null);
    }
  }

  function applyAutoMap(data: ParsedData) {
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
      // Auto-mapeamento nunca associa duas colunas ao mesmo campo.
      if (match && !Object.values(autoMap).includes(match)) autoMap[String(i)] = match;
    });
    setColumnMap(autoMap);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImportResult(null);
    setParsed(null);
    setFileError(null);
    setMapWarning(null);

    const ext = (file.name.split('.').pop() ?? '').toLowerCase();

    // XML NF-e e PDF: formatos reconhecidos, porém não implementados nesta
    // etapa — nunca interpretar como CSV.
    if (ext === 'xml') {
      setFileError('Importação de XML NF-e será disponibilizada em etapa posterior.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (ext === 'pdf') {
      setFileError('Importação de PDF será disponibilizada em etapa posterior.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = parseXLS(ev.target?.result as ArrayBuffer);
          if (data.headers.length === 0) {
            setFileError('Não foi possível ler a planilha: arquivo vazio ou sem dados.');
            return;
          }
          setParsed(data);
          applyAutoMap(data);
        } catch {
          setFileError('Não foi possível ler o arquivo Excel. Verifique se ele não está corrompido.');
        }
      };
      reader.onerror = () => setFileError('Falha ao ler o arquivo selecionado.');
      reader.readAsArrayBuffer(file);
      return;
    }

    if (ext === 'csv') {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = parseCSV(String(ev.target?.result ?? ''));
        if (data.headers.length === 0) {
          setFileError('Não foi possível ler o CSV: arquivo vazio ou sem dados.');
          return;
        }
        setParsed(data);
        applyAutoMap(data);
      };
      reader.onerror = () => setFileError('Falha ao ler o arquivo selecionado.');
      reader.readAsText(file, 'UTF-8');
      return;
    }

    setFileError(`Formato ".${ext}" não suportado. Use CSV, XLS ou XLSX.`);
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleImport() {
    if (!parsed) return;
    if (duplicateFields.length > 0) {
      setMapWarning(`Mapeamento ambíguo: os campos ${duplicateFields.map((f) => `"${fieldLabels[f] ?? f}"`).join(', ')} foram associados a mais de uma coluna. Corrija antes de importar.`);
      return;
    }
    if (!selectedBranchId) {
      window.alert('Selecione uma filial antes de importar para manter a separação entre filiais.');
      return;
    }
    setImporting(true);
    setImportResult(null);

    (async () => {
      const errors: ImportError[] = [];
      let ok = 0;
      let fail = 0;

      for (let ri = 0; ri < parsed.rows.length; ri++) {
        const row = parsed.rows[ri];
        const line = ri + 2; // linha 1 = cabeçalho
        const getVal = (field: string) => {
          const idx = Object.entries(columnMap).find(([, f]) => f === field)?.[0];
          if (idx === undefined) return '';
          return row[Number(idx)] ?? '';
        };
        try {
          if (target === 'produtos') {
            const name = getVal('name').trim();
            if (!name) throw new Error('Nome do produto obrigatório.');
            const readPrice = (field: string, label: string, fallback: number) => {
              const raw = getVal(field).trim();
              if (raw === '') return fallback;
              try {
                return parseBrazilianNumber(raw);
              } catch {
                throw new Error(`${label} inválido: "${raw}".`);
              }
            };
            const readStock = () => {
              const raw = getVal('stock').trim();
              if (raw === '') return 0;
              try {
                return parseBrazilianInteger(raw);
              } catch {
                throw new Error(`Estoque inválido: "${raw}".`);
              }
            };
            await onAddProduct({
              // Campos residuais obrigatórios do tipo (não persistidos pela RPC):
              // satisfeitos com valores neutros apenas para conformidade de tipo.
              brand: null,
              price: 0,
              image: null,
              active: true,
              description: null,
              name,
              sku: getVal('sku') || null,
              cost_price: readPrice('cost_price', 'Preço de custo', 0),
              sale_price: readPrice('sale_price', 'Preço de venda', 0),
              wholesale_price: readPrice('wholesale_price', 'Preço de atacado', 0),
              stock: readStock(),
              min_stock: 0,
              image_url: null,
              category: getVal('category') || null,
              is_service: false,
              branch_id: selectedBranchId,
            });
            ok++;
          } else {
            const name = getVal('name').trim();
            if (!name) throw new Error('Nome do cliente obrigatório.');
            await onAddCustomer({
              // Campo residual obrigatório do tipo (não persistido pela RPC):
              // satisfeito com valor neutro apenas para conformidade de tipo.
              status: null,
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
        } catch (err) {
          fail++;
          errors.push({ line, message: err instanceof Error ? err.message : 'Erro desconhecido ao importar a linha.' });
        }
      }
      setImporting(false);
      setImportResult({ total: parsed.rows.length, ok, fail, errors });
    })();
  }

  function reset() {
    setParsed(null);
    setFileName('');
    setColumnMap({});
    setImportResult(null);
    setFileError(null);
    setMapWarning(null);
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
          Arquivo para Importação (CSV, XLS ou XLSX)
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,.xml,.pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/xml,application/pdf"
            onChange={handleFile}
            style={{ padding: '8px' }}
          />
        </label>
        {fileError && (
          <p className="otp-error-msg" style={{ marginTop: '8px' }}>{fileError}</p>
        )}
        {fileName && parsed && (
          <div className="otp-sent-hint">
            <File size={14} /> Arquivo carregado: <strong>{fileName}</strong> ({parsed.rows.length} linhas detectadas)
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
          {mapWarning && (
            <p className="otp-error-msg" style={{ marginBottom: '12px' }}>{mapWarning}</p>
          )}
          {parsed.headers.map((h, i) => (
            <div key={i} className="import-map-row">
              <span className="import-map-source">{h}</span>
              <ArrowRight size={14} />
              <select
                value={columnMap[String(i)] ?? ''}
                onChange={(e) => handleMapChange(String(i), e.target.value)}
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
            <button
              className="module-submit-btn"
              onClick={handleImport}
              disabled={importing || duplicateFields.length > 0}
              title={duplicateFields.length > 0 ? 'Corrija o mapeamento de colunas duplicado antes de importar.' : undefined}
            >
              <Upload size={16} /> {importing ? 'Importando...' : `Importar ${parsed.rows.length} registros`}
            </button>
          </div>

          {importResult && (
            <div className="otp-sent-hint" style={{ display: 'block', color: importResult.fail > 0 ? '#e6a06d' : '#5bbc87' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Check size={14} /> <strong>Importação concluída</strong>
              </div>
              <p style={{ margin: '6px 0 0 20px' }}>
                {importResult.total} registros processados · {importResult.ok} importados{importResult.fail > 0 && ` · ${importResult.fail} com erro`}
              </p>
              {importResult.errors.length > 0 && (
                <div style={{ margin: '8px 0 0 20px' }}>
                  <strong>Erros:</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: '18px' }}>
                    {importResult.errors.map((err, i) => (
                      <li key={i}>Linha {err.line} — {err.message}</li>
                    ))}
                  </ul>
                </div>
              )}
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
