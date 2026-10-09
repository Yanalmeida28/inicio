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
const sessionDraftMocks = {
  SessionDraftProvider: ({ children }) => children,
  useSessionDraftScope: () => 'test',
  useSessionDraftState: (_draftId, initialValue) => React.useState(initialValue),
};
vm.runInNewContext(compile(await readFile(new URL('../../src/lib/pdv.ts', import.meta.url), 'utf8')), { exports: helpers, Error });
const source = compile(await readFile(new URL('../../src/components/partner/PdvModule.tsx', import.meta.url), 'utf8')) + '\nexports.Checkout = PdvCheckout; exports.Presale = PreVendaTab;';
function loadCheckout(react) {
const module = { exports: {} };
vm.runInNewContext(source, {
  exports: module.exports, Date, Error, setTimeout: () => 1,
  window: { setTimeout: () => 1, clearTimeout() {} },
  require(name) {
    if (name === 'react') return react;
    if (name === '../../lib/pdv') return helpers;
    if (name === '../../hooks/useSessionDraft') return { ...sessionDraftMocks, useSessionDraftState: (_draftId, initialValue) => react.useState(initialValue) };
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
test('carrinho aparece acima das opções, mantendo a pesquisa no topo', async () => {
  await act(async () => { renderer = TestRenderer.create(React.createElement(module.exports.Checkout, props)); });
  assertVisibleControls();
  const left = renderer.root.findByProps({ className: 'pdv-left' });
  assert.equal(left.children[0].props.className, 'pdv-search-bar');
  assert.equal(left.children[1].props['aria-label'], 'Carrinho');
  const layout = renderer.root.findByProps({ className: 'pdv-layout pdv-checkout-layout' });
  assert.equal(layout.children[0], left);
  assert.equal(layout.children[1].props['aria-label'], 'Opções da venda');
});
test('selecionar e remover o último produto mantém as opções da venda visíveis', async () => {
  await act(async () => { renderer = TestRenderer.create(React.createElement(module.exports.Checkout, props)); });
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Buscar produto por nome ou SKU' }).props.onChange({ target: { value: 'Produto' } }));
  await act(async () => renderer.root.findByProps({ className: 'pdv-product-card' }).props.onClick());
  assertVisibleControls();
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Remover Produto' }).props.onClick());
  assertVisibleControls();
});

test('checkout collects freight separately and resets it after the confirmed sale', async () => {
  let submitted;
  await act(async () => { renderer = TestRenderer.create(React.createElement(module.exports.Checkout, {...props,onCreateSale:async sale=>{submitted=sale;}})); });
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Buscar produto por nome ou SKU' }).props.onChange({ target: { value: 'Produto' } }));
  await act(async () => renderer.root.findByProps({ className: 'pdv-product-card' }).props.onClick());
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Frete terceirizado' }).props.onChange({ target: { value:'15.25' } }));
  assert.equal(renderer.root.findByProps({className:'pdv-total-bar'}).findByType('strong').children.join(''),new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(115.25));
  await act(async()=>renderer.root.findByProps({className:'module-submit-btn pdv-checkout-btn'}).props.onClick());
  assert.equal(submitted.total,100);
  assert.equal(submitted.freight_fee,15.25);
  assert.equal(renderer.root.findByProps({'aria-label':'Frete terceirizado'}).props.value,0);
});

test('freight zero can be cleared and an empty field is submitted as zero', async () => {
  let submitted;
  await act(async () => { renderer = TestRenderer.create(React.createElement(module.exports.Checkout, {...props,onCreateSale:async sale=>{submitted=sale;}})); });
  await act(async()=>renderer.root.findByProps({'aria-label':'Frete terceirizado'}).props.onChange({target:{value:''}}));
  assert.equal(renderer.root.findByProps({'aria-label':'Frete terceirizado'}).props.value,'');
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Buscar produto por nome ou SKU' }).props.onChange({ target: { value: 'Produto' } }));
  await act(async () => renderer.root.findByProps({ className: 'pdv-product-card' }).props.onClick());
  await act(async()=>renderer.root.findByProps({className:'module-submit-btn pdv-checkout-btn'}).props.onClick());
  assert.equal(submitted.freight_fee,0);
  assert.equal(submitted.total,100);
});

test('pre-sale freight zero can be cleared before entering another amount',async()=>{
  let submitted;
  await act(async()=>{renderer=TestRenderer.create(React.createElement(module.exports.Presale,{...props,sales:[],onCreatePreSale:async sale=>{submitted=sale;}}));});
  await act(async()=>renderer.root.findByProps({className:'pdv-product-card'}).props.onClick());
  await act(async()=>renderer.root.findByProps({'aria-label':'Frete terceirizado'}).props.onChange({target:{value:''}}));
  assert.equal(renderer.root.findByProps({'aria-label':'Frete terceirizado'}).props.value,'');
  await act(async()=>renderer.root.findByProps({'aria-label':'Frete terceirizado'}).props.onChange({target:{value:'12.50'}}));
  await act(async()=>renderer.root.findByProps({className:'module-submit-btn pdv-checkout-btn'}).props.onClick());
  assert.equal(submitted.freight_fee,12.5);
  assert.equal(submitted.total,100);
});

// Optional isolated browser fixture, with synthetic data and no account credentials.
if (process.env.PDV_BROWSER_FIXTURE === '1') {
  const directory = new URL('../../.tmp/pdv-toolbar/', import.meta.url);
  await mkdir(directory, { recursive: true });
  const css = await readFile(new URL('../../src/index.css', import.meta.url), 'utf8');
  const browserReact = require('../../node_modules/react');
  const markup = renderToStaticMarkup(browserReact.createElement(loadCheckout(browserReact).Checkout, props));
  await writeFile(new URL('preview.html', directory), `<!doctype html><meta charset="utf-8"><style>${css}</style>
    <div class="partner-panel sidebar-layout partner-pdv-mode" style="width:100%;background:white;--dh-surface:white;--dh-border:#ccc;--dh-blue:#2563eb;--dh-blue-soft:#eff6ff;--dh-accent-text:#172033">
      <aside class="partner-sidebar"><div class="sidebar-header">DistriHub</div></aside>
      <div class="sidebar-main"><div class="sidebar-main-inner"><div class="partner-content"><div class="panel-module pdv-workspace pdv-workspace-checkout"><div class="pdv-checkout-slot">${markup}</div></div></div></div></div></div>
    <pre id="audit"></pre><script>
      const workspace=document.querySelector('.pdv-workspace');
      workspace.style.setProperty('--pdv-height',(innerHeight-workspace.getBoundingClientRect().top)+'px');
      if(location.search.includes('filled=1')) {
        document.querySelector('.pdv-cart-table tbody').innerHTML=Array.from({length:18},(_,i)=>'<tr><td>Produto '+(i+1)+'</td><td>1</td><td>R$ 100,00</td><td>R$ 100,00</td><td>Remover</td></tr>').join('');
        document.querySelector('.pdv-cart-table-wrap').classList.add('pdv-cart-table-scrollable');
        document.querySelector('.pdv-cart-table-wrap').scrollTop=10000;
        document.querySelector('.pdv-left').scrollTop=10000;
      }
      const fields=[...document.querySelectorAll('.pdv-form input,.pdv-form select')].filter(el=>!el.closest('details'));
      const rects=fields.map(el=>el.getBoundingClientRect());
      const search=document.querySelector('.pdv-search-bar').getBoundingClientRect();
      const bar=document.querySelector('[aria-label="Opções da venda"]').getBoundingClientRect();
      const cart=document.querySelector('[aria-label="Carrinho"]').getBoundingClientRect();
      const content=document.querySelector('.pdv-left').getBoundingClientRect();
      const lastItem=document.querySelector('.pdv-cart-table tbody tr:last-child').getBoundingClientRect();
      const total=document.querySelector('.pdv-total-bar').getBoundingClientRect();
      document.querySelector('#audit').textContent=JSON.stringify({visible:rects.every(r=>r.width>0&&r.height>0),fieldCount:fields.length,belowSearch:bar.top>=search.bottom,belowCart:bar.top>=Math.min(cart.bottom,content.bottom),sameRow:Math.max(...rects.map(r=>r.bottom))-Math.min(...rects.map(r=>r.bottom))<5,inputFontPx:parseFloat(getComputedStyle(fields[0]).fontSize),inputHeight:rects[0].height,controlsFit:rects.every(r=>r.left>=bar.left&&r.right<=total.left),workspaceWidth:search.width,dockedAtBottom:Math.abs(bar.bottom-innerHeight)<3,noCartOverlap:content.bottom<=bar.top,lastItemVisible:lastItem.bottom<=content.bottom+1&&lastItem.top>=content.top});
    </script>`);
}
