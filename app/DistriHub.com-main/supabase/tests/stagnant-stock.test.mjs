import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';

const lib = { exports: {} };
vm.runInNewContext(ts.transpileModule(await readFile(new URL('../../src/lib/stagnantStock.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: lib.exports });
const { computeStagnantStock, isCommercialEntry } = lib.exports;

const NOW = new Date('2026-10-07T12:00:00Z');
const ago = days => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const A = 'branch-a';
const B = 'branch-b';
let seq = 0;
const product = (extra = {}) => ({ id: `p${++seq}`, name: `Produto ${seq}`, sku: null, stock: 10, cost_price: 5, is_service: false, branch_id: A, created_at: ago(400), ...extra });
const sale = (p, days, extra = {}) => ({ id: `s${++seq}`, status: 'concluida', branch_id: p.branch_id, created_at: ago(days), items: [{ product_id: p.id, quantity: 1 }], ...extra });
const entry = (p, days, reason = 'Reposição de estoque', extra = {}) => ({ id: `m${++seq}`, product_id: p.id, branch_id: p.branch_id, type: 'entrada', quantity: 5, reason, created_at: ago(days), ...extra });
const run = (products, sales = [], movements = []) => computeStagnantStock(products, sales, movements, NOW);

test('A: venda há 45 dias, sem reposição → 45 dias', () => {
  const p = product();
  const { items } = run([p], [sale(p, 45)]);
  assert.equal(items.length, 1);
  assert.equal(items[0].daysWithoutTurnover, 45);
  assert.equal(items[0].level, 'atencao');
});

test('B: venda há 100 dias, reposição real há 5 dias → fora da lista', () => {
  const p = product();
  assert.equal(run([p], [sale(p, 100)], [entry(p, 5)]).count, 0);
});

test('C: estorno/devolução/ajuste recentes não reiniciam a contagem', () => {
  const p = product();
  const movements = [
    entry(p, 5, 'Estorno por cancelamento da venda 123'),
    entry(p, 4, 'Devolucao RMA #9'),
    entry(p, 3, 'Ajuste de estoque por edição do produto'),
  ];
  const { items } = run([p], [sale(p, 100)], movements);
  assert.equal(items[0].daysWithoutTurnover, 100);
  assert.equal(items[0].level, 'critico');
  assert.equal(items[0].lastEntryAt, null);
});

test('D: nunca vendeu, reposição real há 40 dias → 40 dias', () => {
  const p = product();
  const { items } = run([p], [], [entry(p, 40, 'Compra do fornecedor')]);
  assert.equal(items[0].daysWithoutTurnover, 40);
  assert.equal(items[0].lastSaleAt, null);
});

test('E: sem venda nem movimentação → created_at', () => {
  const p = product({ created_at: ago(75) });
  const { items } = run([p]);
  assert.equal(items[0].daysWithoutTurnover, 75);
  assert.equal(items[0].level, 'alerta');
});

test('F: venda e reposição na filial B não alteram a filial A', () => {
  const a = product({ branch_id: A });
  const b = product({ branch_id: B });
  const sales = [sale(a, 70), sale(b, 1), sale(b, 1, { items: [{ product_id: a.id, quantity: 1 }] })];
  const movements = [entry(b, 1), entry(a, 2, 'Reposição de estoque', { branch_id: B })];
  const { items } = run([a, b], sales, movements);
  assert.equal(items.length, 1);
  assert.equal(items[0].product.id, a.id);
  assert.equal(items[0].daysWithoutTurnover, 70);
});

test('G: serviço nunca entra', () => {
  assert.equal(run([product({ is_service: true, created_at: ago(200) })]).count, 0);
});

test('H: estoque zero ou negativo nunca entra', () => {
  assert.equal(run([product({ stock: 0 }), product({ stock: -2 })]).count, 0);
});

test('vendas não concluídas não contam e menos de 30 dias não entra', () => {
  const p = product();
  const q = product({ created_at: ago(29) });
  const { items } = run([p, q], ['aberta', 'cancelada', 'pre_venda', 'devolucao'].map(status => sale(p, 2, { status })));
  assert.deepEqual(Array.from(items, item => item.product.id), [p.id]);
  assert.equal(items[0].daysWithoutTurnover, 400);
});

test('limites 30/60/90 e classificação', () => {
  const ps = [29, 30, 59, 60, 89, 90].map(days => product({ created_at: ago(days) }));
  const levels = Object.fromEntries(run(ps).items.map(item => [item.daysWithoutTurnover, item.level]));
  assert.deepEqual(levels, { 30: 'atencao', 59: 'atencao', 60: 'alerta', 89: 'alerta', 90: 'critico' });
});

test('capital parado usa custo e resumo soma corretamente', () => {
  const p1 = product({ stock: 4, cost_price: 10, created_at: ago(100) });
  const p2 = product({ stock: 3, cost_price: 20, created_at: ago(40) });
  const summary = run([p1, p2]);
  assert.equal(summary.items.find(i => i.product.id === p1.id).tiedUpCapital, 40);
  assert.equal(summary.count, 2);
  assert.equal(summary.totalUnits, 7);
  assert.equal(summary.totalValue, 100);
  assert.equal(summary.criticalCount, 1);
});

test('ordenação: crítico > alerta > atenção, depois maior capital, depois mais dias', () => {
  const low = product({ stock: 1, cost_price: 1, created_at: ago(95) });
  const high = product({ stock: 10, cost_price: 10, created_at: ago(91) });
  const tieOld = product({ stock: 1, cost_price: 1, created_at: ago(120) });
  const alert = product({ stock: 100, cost_price: 100, created_at: ago(65) });
  const warn = product({ stock: 100, cost_price: 100, created_at: ago(35) });
  const ids = Array.from(run([warn, alert, low, tieOld, high]).items, i => i.product.id);
  assert.deepEqual(ids, [high.id, tieOld.id, low.id, alert.id, warn.id]);
});

test('classificação de entradas comerciais', () => {
  const base = { product_id: 'x', type: 'entrada', quantity: 1, created_at: ago(1) };
  assert.equal(isCommercialEntry({ ...base, reason: 'Cadastro inicial' }), true);
  assert.equal(isCommercialEntry({ ...base, reason: 'Reposição de estoque' }), true);
  assert.equal(isCommercialEntry({ ...base, reason: 'Compra - ajuste de nota e devolução ao fornecedor' }), true);
  assert.equal(isCommercialEntry({ ...base, reason: null }), true);
  assert.equal(isCommercialEntry({ ...base, reason: 'Estorno por cancelamento da venda 1' }), false);
  assert.equal(isCommercialEntry({ ...base, reason: 'Devolucao RMA #1' }), false);
  assert.equal(isCommercialEntry({ ...base, reason: 'Ajuste de estoque por edição do produto' }), false);
  assert.equal(isCommercialEntry({ ...base, type: 'saida', reason: 'Reposição de estoque' }), false);
});
