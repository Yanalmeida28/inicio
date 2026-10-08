import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from '../../node_modules/typescript/lib/typescript.js';

const require = createRequire(import.meta.url);
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
const helpers = {};
vm.runInNewContext(compile(await readFile(new URL('../../src/lib/pdv.ts', import.meta.url), 'utf8')), { exports: helpers, Error });
const source = compile(await readFile(new URL('../../src/components/partner/PdvModule.tsx', import.meta.url), 'utf8')) + '\nexports.Checkout = PdvCheckout;';
function loadCheckout(react) {
const module = { exports: {} };
vm.runInNewContext(source, {
  exports: module.exports, Date, Error,
  window: { setTimeout: () => 1, clearTimeout() {} },
  require(name) {
    if (name === 'react') return react;
    if (name === '../../lib/pdv') return helpers;
    if (name === '../../utils') return { money: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }) };
    if (name === './PreSaleCheckout') return {};
    if (name === './SalePriceInput') return { SalePriceInput: props => React.createElement('input', { value: props.value, readOnly: true }) };
    return require(name);
  },
});
return module.exports;
}
const module = { exports: loadCheckout(React) };
const props = {
  products: [{ id: 'product', name: 'Produto', sku: 'SKU', branch_id: 'branch', stock: 5, sale_price: 100 }],
  customers: [], salespeople: [], credits: [], selectedBranchId: 'branch', segment: 'assistencia',
  canCheckout: true, canEditPrice: false, onCreateSale: async () => {},
};
let renderer;
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); renderer = null; });
const controls = () => renderer.root.findByProps({ 'aria-label': 'Opções da venda' });
function assertVisibleControls() {
  assert.ok(controls().findByProps({ 'aria-label': 'Tabela de preços da venda' }));
  assert.ok(controls().findByProps({ id: 'pdv-customer-search' }));
  assert.ok(controls().findByProps({ 'aria-label': 'Tipo de atendimento da venda' }));
  assert.ok(controls().findByProps({ id: 'pdv-salesperson-search' }));
}
test('as opções aparecem abaixo da pesquisa mesmo antes de adicionar um produto', async () => {
  await act(async () => { renderer = TestRenderer.create(React.createElement(module.exports.Checkout, props)); });
  assertVisibleControls();
  const left = renderer.root.findByProps({ className: 'pdv-left' });
  assert.equal(left.children[0].props.className, 'pdv-search-bar');
  assert.equal(left.children[1].props['aria-label'], 'Opções da venda');
});
test('selecionar e remover o último produto mantém as opções da venda visíveis', async () => {
  await act(async () => { renderer = TestRenderer.create(React.createElement(module.exports.Checkout, props)); });
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Buscar produto por nome ou SKU' }).props.onChange({ target: { value: 'Produto' } }));
  await act(async () => renderer.root.findByProps({ className: 'pdv-product-card' }).props.onClick());
  assertVisibleControls();
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Remover Produto' }).props.onClick());
  assertVisibleControls();
});

// Optional isolated browser fixture, with synthetic data and no account credentials.
if (process.env.PDV_BROWSER_FIXTURE === '1') {
  const directory = new URL('../../.tmp/pdv-toolbar/', import.meta.url);
  await mkdir(directory, { recursive: true });
  const css = await readFile(new URL('../../src/index.css', import.meta.url), 'utf8');
  const browserReact = require('../../node_modules/react');
  const markup = renderToStaticMarkup(browserReact.createElement(loadCheckout(browserReact).Checkout, props));
  await writeFile(new URL('preview.html', directory), `<!doctype html><meta charset="utf-8"><style>${css}</style>
    <div class="partner-panel" style="width:1000px;margin:20px;background:white;--dh-surface:white;--dh-border:#ccc;--dh-blue:#2563eb;--dh-blue-soft:#eff6ff;--dh-accent-text:#172033">
      <div class="pdv-workspace pdv-workspace-checkout">${markup}</div></div>
    <pre id="audit"></pre><script>
      const fields=[...document.querySelectorAll('.pdv-form input,.pdv-form select')].filter(el=>!el.closest('details'));
      const rects=fields.map(el=>el.getBoundingClientRect());
      const search=document.querySelector('.pdv-search-bar').getBoundingClientRect();
      const bar=document.querySelector('[aria-label="Opções da venda"]').getBoundingClientRect();
      document.querySelector('#audit').textContent=JSON.stringify({visible:rects.every(r=>r.width>0&&r.height>0),fieldCount:fields.length,belowSearch:bar.top>=search.bottom,sameRow:Math.max(...rects.map(r=>r.bottom))-Math.min(...rects.map(r=>r.bottom))<5});
    </script>`);
}
