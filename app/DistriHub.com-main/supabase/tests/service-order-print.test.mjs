import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';

const source = await readFile(new URL('../../src/lib/serviceOrderPrint.ts', import.meta.url), 'utf8');
function harness(blocked = false, brokenLogo = false) {
  const calls = [];
  const elements = [];
  const createElement = tag => {
    const element = {
      tag,
      children: [],
      append(...children) { this.children.push(...children); },
      replaceChildren() { this.children = []; },
      decode() { calls.push('decode'); return brokenLogo ? Promise.reject(new Error('Logo unavailable')) : Promise.resolve(); },
      remove() { this.removed = true; calls.push('remove'); },
    };
    elements.push(element);
    return element;
  };
  const doc = {
    documentElement: {},
    createElement,
    head: createElement('head'),
    body: createElement('body'),
    get images() { return elements.filter(element => element.tag === 'img'); },
  };
  const popup = { document: doc, focus() {}, print() { calls.push('print'); }, close() { calls.push('close'); } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, window: { open: () => blocked ? null : popup },
    require: () => ({ money: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }) }),
  });
  return { ...exports, doc, calls };
}
const order = { id: '12345678-abcd', branch_id: 'b', customer_id: null, customer_name: '<img src=x onerror=alert(1)>', customer_phone: '11999999999', os_number: 'OS-42', status: 'aberta', created_at: '2026-10-20T15:00:00Z', forecast_delivery: '2026-10-21', parts_total: 30, labor_total: 50, discount_total: 5, total: 75, warranty_snapshot: 'Garantia\nCondições' };

test('a broken logo is omitted without closing or blocking OS printing', async () => {
  const api = harness(false, true);
  await api.printServiceOrder(order, [], { settings: { logo_url: 'https://example.test/missing.png' } });
  assert.deepEqual(api.calls, ['decode', 'remove', 'print']);
  assert.equal(api.doc.images[0].removed, true);
});
test('OS prints saved customer, correct branch, totals, literal text and service warranty without exposing costs', async () => {
  const api = harness();
  await api.printServiceOrder({ ...order, entry_notes: '[Checklist de entrada]\nTouch: Com defeito\n[/Checklist de entrada]', approval_notes: '[Checklist de saída]\nTouch: Funcionando\n[/Checklist de saída]' }, [{ product_name: 'Peça', quantity: 2, unit_price: 15, unit_cost: 999 }], { companyName: 'Empresa', branches: [{ id: 'other', name: 'Errada' }, { id: 'b', name: 'Filial correta', address: 'Rua A' }] }, 'Garantia\nCondições');
  const nodes = [];
  const visit = node => { nodes.push(node); node.children.forEach(visit); }; visit(api.doc.body);
  const text = nodes.map(node => node.textContent || '').join('\n');
  assert.match(text, /OS-42/); assert.match(text, /Filial correta/); assert.doesNotMatch(text, /Errada|999,00/);
  assert.match(text, /75,00/); assert.match(text, /Garantia\nCondições/); assert.match(text, /21\/10\/2026/);
  assert.match(text, /Assinatura do cliente/); assert.match(text, /11999999999/);
  assert.match(text, /Touch:\s+Com defeito/); assert.match(text, /Touch:\s+Funcionando/);
  const customer = nodes.find(node => node.textContent?.includes('<img'));
  assert.equal(customer.children.length, 0);
  assert.equal(api.calls.length, 1);
  assert.match(api.doc.head.children[0].textContent, /size: A4/);
});
test('blocked popup gives a recoverable error', async () => {
  await assert.rejects(harness(true).printServiceOrder(order, []), /Permita a abertura/);
});

test('logo prints on the OS independently from the cupom option and loads before printing', async () => {
  const api = harness();
  await api.printServiceOrder(order, [], {
    companyName: 'Empresa',
    settings: { logo_url: 'data:image/png;base64,logo', show_logo_on_receipt: false },
  });
  const logo = api.doc.body.children.find(node => node.tag === 'img');
  assert.equal(logo.src, 'data:image/png;base64,logo');
  assert.equal(logo.alt, 'Empresa');
  assert.deepEqual(api.calls, ['decode', 'print']);
});

test('entry and exit checklists print in separate equal columns with a central divider and preserve notes', async () => {
  const api = harness();
  await api.printServiceOrder({ ...order,
    entry_notes: 'Observação inicial\n[Checklist de entrada]\nTouch: Com defeito\n[/Checklist de entrada]',
    approval_notes: 'Cliente autorizou\n[Checklist de saída]\nTouch: Funcionando\n[/Checklist de saída]',
  }, []);
  const table = api.doc.body.children.find(node => node.className === 'checklists');
  const columns = table.children[0].children[0].children;
  assert.equal(columns.length, 2);
  assert.equal(columns[0].children[0].textContent, 'Entrada');
  assert.equal(columns[1].children[0].textContent, 'Saída');
  assert.equal(columns[0].children[1].children[0].tag, 'strong');
  assert.equal(columns[0].children[1].children[0].textContent, 'Touch:');
  assert.equal(columns[0].children[1].children[1].tag, 'span');
  assert.equal(columns[0].children[1].children[1].textContent, ' Com defeito');
  assert.equal(columns[1].children[1].children[0].textContent, 'Touch:');
  assert.equal(columns[1].children[1].children[1].textContent, ' Funcionando');
  const nodes = []; const visit = node => { nodes.push(node); node.children.forEach(visit); }; visit(api.doc.body);
  const text = nodes.map(node => node.textContent || '').join('\n');
  assert.match(text, /Observação inicial/); assert.match(text, /Cliente autorizou/);
  assert.doesNotMatch(text, /\[Checklist de/);
  assert.match(api.doc.head.children[0].textContent, /\.checklists td \+ td \{ border-left: 1px solid #000/);
  assert.match(api.doc.head.children[0].textContent, /width: 50%/);
  assert.match(api.doc.head.children[0].textContent, /h2 .*break-after: avoid-page/);
  assert.match(api.doc.head.children[0].textContent, /\.checklist-row \{ break-inside: auto; page-break-inside: auto; \}/);
});

test('missing checklists keep their own placeholder and legacy entry notes', async () => {
  const api = harness(); await api.printServiceOrder({ ...order, entry_notes: 'Anotação antiga' }, []);
  const table = api.doc.body.children.find(node => node.className === 'checklists');
  const columns = table.children[0].children[0].children;
  assert.equal(columns[0].children[1].textContent, 'Checklist de entrada não registrado.');
  assert.equal(columns[1].children[1].textContent, 'Checklist de saída não registrado.');
  assert.ok(api.doc.body.children.some(node => node.children.some(child => child.textContent === ' Anotação antiga')));
});

test('reprints use the saved warranty, including empty terms; legacy orders do not invent terms', async () => {
  for (const [snapshot,expected] of [['Termo original',/Termo original/],['',/Nenhum termo de garantia adicional/],[null,/Termo histórico não registrado/]]) {
    const api=harness();
    await api.printServiceOrder({ ...order,warranty_snapshot:snapshot },[],{},'Configuração nova');
    const text=api.doc.body.children.map(node=>node.textContent || '').join('\n');
    assert.match(text,expected);assert.doesNotMatch(text,/Configuração nova/);
  }
});

 test('printed field labels are bold while user values remain literal normal text', async () => {
  const api = harness();
  await api.printServiceOrder({ ...order, equipment_brand: 'Marca teste' }, []);
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
