import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from '../../../node_modules/typescript/lib/typescript.js';

const require = createRequire(import.meta.url);
const root = new URL('../../../src/', import.meta.url);
export const fixedNow = new Date('2026-10-19T12:00:00Z');
export function intelligenceHarness({ client = null, payables = [], payableError = '', baseReady = true } = {}) {
  const cache = new Map();
  let reads = 0;
  const timers = new Set();
  const load = name => {
    if (cache.has(name)) return cache.get(name);
    const exports = {}; cache.set(name, exports);
    const file = new URL(name, root);
    const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
    vm.runInNewContext(source, { exports, Date, Intl, Error, console,
      window: { setInterval: fn => { timers.add(fn); return fn; }, clearInterval: fn => timers.delete(fn), addEventListener() {}, removeEventListener() {} },
      document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
      require(dep) {
        if (dep.endsWith('/supabase')) return { supabase: client, isSupabaseConfigured: !!client };
        if (dep.endsWith('/usePayables')) return { usePayables: () => ({ accounts: payables, loading: !baseReady, error: payableError }) };
        if (dep.endsWith('/utils')) return { money: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }) };
        if (dep.endsWith('/useStagnantStock')) return { useStagnantStock: () => ({ count: 0, items: [] }) };
        if (dep === 'xlsx') return {};
        if (name.endsWith('AdminModule.tsx') && dep.startsWith('./') && !dep.includes('BusinessIntelligence')) return new Proxy({}, { get: () => () => null });
        if (!dep.startsWith('.')) return require(dep);
        const relative = path.posix.normalize(path.posix.join(path.posix.dirname(name), dep));
        const extension = existsSync(new URL(relative + '.ts', root)) ? '.ts' : '.tsx';
        return load(relative + extension);
      },
    });
    return exports;
  };
  const countingClient = { auth: { getUser: async () => ({ data: { user: { id: 'company' } }, error: null }) }, from(table) {
    reads++;
    const query = { select: () => query, eq: () => query, order: () => query,
      range: async () => ({ data: [], error: null }) };
    return query;
  } };
  return { load, timers, countingClient, get reads() { return reads; } };
}
export const helpers = intelligenceHarness().load('lib/businessIntelligence.ts');
export const sale = (patch = {}) => ({ id: 's', user_id: 'company', branch_id: 'A', customer_id: 'customer', customer_name: 'Cliente', status: 'concluida',
  created_at: '2026-09-01T15:00:00Z', completed_at: '2026-10-10T15:00:00Z', total: 100, freight_fee: 20, payment_method: 'dinheiro',
  items: [{ product_id: 'p', quantity: 2, unit_price: 50 }], cost_snapshot: { p: 20 }, ...patch });
export const product = (patch = {}) => ({ id: 'p', user_id: 'company', branch_id: 'A', name: 'Produto de teste', cost_price: 30, sale_price: 50, stock: 5, is_service: false, created_at: '2026-01-01T12:00:00Z', ...patch });
export const invoice = (patch = {}) => ({ id: 'i', user_id: 'company', branch_id: 'A', number: '001', customer_name: 'Cliente', amount: 100, paid_amount: 25, status: 'parcial', due_date: '2026-10-19', ...patch });
export const payable = (patch = {}) => ({ id: 'bill', user_id: 'company', branch_id: 'A', description: 'Aluguel', creditor_name: 'Locador', category: 'aluguel', amount: 200, paid_amount: 50, status: 'parcial', due_date: '2026-10-25', ...patch });
export const input = (patch = {}) => ({ company: 'company', branch: 'A', now: fixedNow, days: 30, sales: [sale()], products: [product()], customers: [], movements: [], invoices: [], payables: [], receipts: [], payments: [], refunds: [], ...patch });
