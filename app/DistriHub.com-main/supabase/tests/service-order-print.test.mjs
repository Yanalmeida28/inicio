import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';

const source = await readFile(new URL('../../src/lib/serviceOrderPrint.ts', import.meta.url), 'utf8');
function harness(blocked = false) {
  const calls = [];
  const createElement = tag => ({ tag, children: [], append(...children) { this.children.push(...children); }, replaceChildren() { this.children = []; } });
  const doc = { documentElement: {}, createElement, head: createElement('head'), body: createElement('body') };
  const popup = { document: doc, focus() {}, print() { calls.push('print'); }, requestAnimationFrame(callback) { callback(); } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, window: { open: () => blocked ? null : popup },
    require: () => ({ money: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }) }),
  });
  return { ...exports, doc, calls };
}
const order = { id: '12345678-abcd', branch_id: 'b', customer_id: null, customer_name: '<img src=x onerror=alert(1)>', customer_phone: '11999999999', os_number: 'OS-42', status: 'aberta', created_at: '2026-10-20T15:00:00Z', forecast_delivery: '2026-10-21', parts_total: 30, labor_total: 50, discount_total: 5, total: 75, warranty_snapshot: 'Garantia\nCondições' };
test('OS prints saved customer, correct branch, totals, literal text and service warranty without exposing costs', () => {
  const api = harness();
  api.printServiceOrder({ ...order, entry_notes: '[Checklist de entrada]\nTouch: Com defeito\n[/Checklist de entrada]', approval_notes: '[Checklist de saída]\nTouch: Funcionando\n[/Checklist de saída]' }, [{ product_name: 'Peça', quantity: 2, unit_price: 15, unit_cost: 999 }], { companyName: 'Empresa', branches: [{ id: 'other', name: 'Errada' }, { id: 'b', name: 'Filial correta', address: 'Rua A' }] }, 'Garantia\nCondições');
  const nodes = [];
  const visit = node => { nodes.push(node); node.children.forEach(visit); }; visit(api.doc.body);
  const text = nodes.map(node => node.textContent || '').join('\n');
  assert.match(text, /OS-42/); assert.match(text, /Filial correta/); assert.doesNotMatch(text, /Errada|999,00/);
  assert.match(text, /75,00/); assert.match(text, /Garantia\nCondições/); assert.match(text, /21\/10\/2026/);
  assert.match(text, /Assinatura do cliente/); assert.match(text, /11999999999/);
  assert.match(text, /Touch: Com defeito/); assert.match(text, /Touch: Funcionando/);
  const customer = nodes.find(node => node.textContent?.includes('<img'));
  assert.equal(customer.children.length, 0);
  assert.equal(api.calls.length, 1);
  assert.match(api.doc.head.children[0].textContent, /size: A4/);
});
test('blocked popup gives a recoverable error', () => {
  assert.throws(() => harness(true).printServiceOrder(order, []), /Permita a abertura/);
});

test('reprints use the saved warranty, including empty terms; legacy orders do not invent terms', () => {
  for (const [snapshot,expected] of [['Termo original',/Termo original/],['',/Nenhum termo de garantia adicional/],[null,/Termo histórico não registrado/]]) {
    const api=harness();
    api.printServiceOrder({ ...order,warranty_snapshot:snapshot },[],{},'Configuração nova');
    const text=api.doc.body.children.map(node=>node.textContent || '').join('\n');
    assert.match(text,expected);assert.doesNotMatch(text,/Configuração nova/);
  }
});

 test('printed field labels are bold while user values remain literal normal text', () => {
  const api = harness();
  api.printServiceOrder({ ...order, equipment_brand: 'Marca teste' }, []);
  const nodes = [];
  const visit = node => { nodes.push(node); node.children.forEach(visit); }; visit(api.doc.body);
  const labels = nodes.filter(node => node.tag === 'strong').map(node => node.textContent);
  for (const label of ['Nome:', 'Telefone:', 'E-mail:', 'Endereço:', 'Entrada:', 'Situação:', 'Técnico:', 'Marca:', 'Peças:', 'Desconto:', 'Data:']) assert.ok(labels.includes(label), label);
  assert.ok(!labels.some(value => value.includes(order.customer_name)));
  const name = nodes.find(node => node.tag === 'strong' && node.textContent === 'Nome:');
  const paragraph = nodes.find(node => node.children.includes(name));
  assert.equal(paragraph.children[1].tag, 'span');
  assert.equal(paragraph.children[1].textContent, ' ' + order.customer_name);
  assert.equal(paragraph.children[1].children.length, 0);
});
