import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';

const require = createRequire(import.meta.url);
async function load(path, dependencies = {}, globals = {}, extra = '') {
  const exports = {};
  const source = await readFile(new URL('../../src/' + path, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, Error, JSON, Number, crypto: { randomUUID: () => 'request-id' },
    require: name => dependencies[name] ?? require(name), ...globals });
  return exports;
}
const safety = await load('lib/exportSafety.ts');
const b2b = await load('lib/b2bOrder.ts');
const { saveB2bOrder } = b2b;
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const shared = [];
const { CartDrawer } = await load('components/CartDrawer.tsx', {
  '../lib/b2bOrder': b2b,
  '../utils': { money, formatWhatsAppMessage: (...args) => JSON.stringify(args), openWhatsApp: message => shared.push(message) },
  '../data': { WHATSAPP_NUMBER: '5511999999999', paymentMethods: [{ value: 'pix', label: 'PIX' }, { value: 'faturado', label: 'Faturado' }], deliveryMethods: [{ value: 'balcao', label: 'Balcão' }, { value: 'motoboy', label: 'Motoboy' }] },
});
const item = { id: 1, name: 'Produto', sku: 'SKU', price: 12.34, quantity: 2 };
const baseProps = { open: true, cart: [item], cartCount: 2, cartTotal: 24.68, businessName: 'Loja', city: 'São Paulo',
  onClose() {}, onIncrement() {}, onDecrement() {}, onRemove() {}, onBusinessNameChange() {}, onCityChange() {}, onExplore() {},
  isAuthenticated: true, onLoginRequired() {} };
const text = node => node.toJSON() ? JSON.stringify(node.toJSON()) : '';
const button = (renderer, className) => renderer.root.findAllByType('button').find(node => node.props.className === className);

test('B2B waits for persistence, blocks duplicate clicks and shares the saved ID and full total', async () => {
  shared.length = 0;
  let resolve, calls = 0;
  const pending = new Promise(done => { resolve = done; });
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(CartDrawer, { ...baseProps, onSendOrder: async () => { calls++; return pending; } })); });
  await act(async () => button(renderer, 'whatsapp-button').props.onClick());
  await act(async () => { button(renderer, 'module-submit-btn').props.onClick(); button(renderer, 'module-submit-btn').props.onClick(); });
  assert.equal(calls, 1); assert.doesNotMatch(text(renderer), /Pedido Enviado/); assert.equal(shared.length, 0);
  await act(async () => resolve({ id: 'persisted-id', total: 39.68 }));
  assert.match(text(renderer), /persisted-id/); assert.match(shared[0], /persisted-id/); assert.match(shared[0], /39.68/);
  await act(async () => renderer.unmount());
});

test('B2B rejection stays editable without announcing success and retry uses the same ID', async () => {
  shared.length = 0; const ids = []; let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(CartDrawer, { ...baseProps, onSendOrder: async (...args) => { ids.push(args[2]); throw new Error('Falha de conexão'); } })); });
  await act(async () => button(renderer, 'whatsapp-button').props.onClick());
  await act(async () => button(renderer, 'module-submit-btn').props.onClick());
  assert.match(text(renderer), /Falha de conexão/); assert.doesNotMatch(text(renderer), /Pedido Enviado/); assert.equal(shared.length, 0);
  await act(async () => button(renderer, 'module-submit-btn').props.onClick());
  assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]);
  await act(async () => renderer.unmount());
});

test('B2B credit does not show a fake verification or accept a credit checkout', async () => {
  let calls = 0, renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(CartDrawer, { ...baseProps, onSendOrder: async () => { calls++; return { id: 'id', total: 24.68 }; } })); });
  await act(async () => button(renderer, 'whatsapp-button').props.onClick());
  await act(async () => renderer.root.findAllByType('button').find(node => node.children.includes('Faturado')).props.onClick());
  assert.equal(button(renderer, 'module-submit-btn').props.disabled, true);
  await act(async () => button(renderer, 'module-submit-btn').props.onClick());
  assert.equal(calls, 0); assert.doesNotMatch(text(renderer), /Código.*enviado|1234/);
  await act(async () => renderer.unmount());
});

const input = { requestId: 'id', cart: [item], businessName: ' Loja ', city: 'São Paulo', paymentMethod: 'pix', deliveryMethod: 'motoboy' };
function database({ writeError = null, readError = null, mismatch = false } = {}) {
  let stored;
  return { client: { from() { return { async upsert(payload, options) { assert.equal(options.ignoreDuplicates, true); stored ??= JSON.parse(JSON.stringify(payload)); return { error: writeError }; },
    select() { return { eq() { return this; }, async single() { return { data: mismatch ? { ...stored, total: 0 } : stored, error: readError }; } }; } }; } }, get stored() { return stored; } };
}
test('B2B service rejects persistence errors and confirms freight with the persisted order', async () => {
  await assert.rejects(saveB2bOrder(database({ writeError: { message: 'RLS denied' } }).client, 'owner', input), /RLS denied/);
  await assert.rejects(saveB2bOrder(database({ readError: {} }).client, 'owner', input), /confirmar/);
  await assert.rejects(saveB2bOrder(database({ mismatch: true }).client, 'owner', input), /divergem/);
  const db = database(); const saved = await saveB2bOrder(db.client, 'owner', input);
  assert.equal(saved.id, 'id'); assert.equal(saved.total, 39.68); assert.equal(db.stored.status, 'pendente');
  await saveB2bOrder(db.client, 'owner', input); assert.equal(db.stored.total, 39.68);
  await assert.rejects(saveB2bOrder(db.client, 'owner', { ...input, paymentMethod: 'rma' }), /autorização/);
});

test('product/customer PDF and CSV exports treat malicious fields as text; Excel writes real string cells', async () => {
  const html = [], blobs = [], books = [];
  const XLSX = require('xlsx');
  const module = await load('components/partner/ImportExportModule.tsx', {
    '../../utils': { money }, '../../lib/exportSafety': safety,
    xlsx: { ...XLSX, writeFile: (...args) => books.push(args) },
  }, { Blob, URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:test'; }, revokeObjectURL() {} },
    document: { createElement() { return { click() {} }; } },
    window: { open: () => ({ document: { write: value => html.push(value), close() {} }, print() {} }) },
  }, '\nexports.productPdf=exportProductsPDF; exports.customerPdf=exportCustomersPDF; exports.productCsv=exportProductsCSV; exports.customerCsv=exportCustomersCSV; exports.excel=exportProductsExcel;');
  const marker = '<img src=x onerror="alert(1)">';
  module.productPdf([{ name: marker, sku: marker, category: marker, cost_price: 1, sale_price: 2, wholesale_price: 0, stock: 1 }]);
  module.customerPdf([{ name: marker, document: marker, phone: marker, email: marker, city: marker, customer_type: marker }]);
  for (const output of html) { assert.ok(!output.includes(marker)); assert.match(output, /&lt;img/); }
  module.productCsv([{ name: '=1+1', sku: 'a";b', category: 'a\nb', cost_price: 1, sale_price: 2, wholesale_price: 0, stock: 1 }]);
  module.customerCsv([{ name: '@SUM(1)', email: 'a"b' }]);
  assert.match(await blobs[0].text(), /"'=1\+1"/); assert.match(await blobs[0].text(), /a"";b/);
  assert.match(await blobs[1].text(), /"'@SUM/);
  module.excel([{ name: '=1+1', cost_price: 1, sale_price: 2, wholesale_price: 0, stock: 1 }]);
  assert.match(books[0][1], /\.xlsx$/); assert.equal(books[0][0].Sheets.Produtos.A2.t, 's'); assert.equal(books[0][0].Sheets.Produtos.A2.f, undefined);
});

test('signup with email confirmation makes no anonymous profile write; confirmation completes the profile idempotently', async () => {
  let listener, current, signupArgs, user, profile, writes = 0;
  const query = table => ({
    select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
    async maybeSingle() { return { data: table === 'partner_profiles' ? profile ?? null : null, error: null }; },
    async upsert(value, options) { writes++; assert.equal(options.ignoreDuplicates, true); profile ??= value; return { error: null }; },
  });
  const client = { from: query, auth: {
    async getSession() { return { data: { session: null } }; },
    onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    async getUser() { return { data: { user }, error: null }; },
    async signUp(args) { signupArgs = args; user = { id: 'owner', user_metadata: args.options.data }; return { data: { user, session: null }, error: null }; },
  } };
  const { useAuth } = await load('hooks/useAuth.ts', { '../lib/supabase': { supabase: client, isSupabaseConfigured: true } }, {
    window: { location: { origin: 'https://app.example' }, setTimeout: callback => callback() },
  });
  function Probe() { current = useAuth(); return null; }
  let renderer, result;
  await act(async () => { renderer = TestRenderer.create(React.createElement(Probe)); });
  await act(async () => { result = await current.signUp({ email: 'owner@example.com', password: 'secret', businessName: ' Loja ', whatsapp: '5511999999999' }); });
  assert.equal(result.error, null); assert.equal(result.needsEmailConfirmation, true); assert.equal(writes, 0);
  assert.equal(signupArgs.options.data.business_name, 'Loja'); assert.equal(signupArgs.options.data.role, undefined);
  await act(async () => { listener('SIGNED_IN', { user }); });
  assert.equal(writes, 1); assert.equal(current.profile.business_name, 'Loja'); assert.equal(current.identity.companyUserId, 'owner');
  await act(async () => { listener('SIGNED_IN', { user }); });
  assert.equal(writes, 1);
  await act(async () => renderer.unmount());
});

test('signup with immediate session completes a profile without choosing roles or subscription fields', async () => {
  let current, user, profile, writes = 0;
  const client = { from: table => ({
    select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
    async maybeSingle() { return { data: table === 'partner_profiles' ? profile ?? null : null, error: null }; },
    async upsert(value) { writes++; profile = value; return { error: null }; },
  }), auth: {
    async getSession() { return { data: { session: null } }; },
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    async getUser() { return { data: { user }, error: null }; },
    async signUp(args) { user = { id: 'owner', user_metadata: args.options.data }; return { data: { user, session: { user } }, error: null }; },
  } };
  const { useAuth } = await load('hooks/useAuth.ts', { '../lib/supabase': { supabase: client, isSupabaseConfigured: true } }, { window: { location: { origin: 'https://app.example' } } });
  function Probe() { current = useAuth(); return null; }
  let renderer, result;
  await act(async () => { renderer = TestRenderer.create(React.createElement(Probe)); });
  await act(async () => { result = await current.signUp({ email: 'owner@example.com', password: 'secret', businessName: 'Loja', whatsapp: '5511999999999' }); });
  assert.equal(result.error, null); assert.equal(result.needsEmailConfirmation, undefined); assert.equal(writes, 1);
  assert.equal(profile.subscription_plan, undefined); assert.equal(profile.role, undefined);
  assert.equal(current.identity.companyUserId, 'owner');
  await act(async () => renderer.unmount());
});

test('master recovery announces only a requested link, never a changed password', async () => {
  const { RecoveryFlow } = await load('App.tsx', {
    './hooks/useAuth': {}, './hooks/useSuperAdminAuth': {}, './hooks/useCart': {}, './components/CartDrawer': {},
    './components/HubHome': {}, './lib/supabase': {}, './lib/b2bOrder': b2b,
  }, {}, '\nexports.RecoveryFlow=RecoveryFlow;');
  let requests = 0, renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(RecoveryFlow, {
    auth: { requestRecovery: async () => { requests++; return { error: null }; } }, onBack() {}, onSuccess() {},
  })); });
  await act(async () => renderer.root.findByType('input').props.onChange({ target: { value: 'admin@example.com' } }));
  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(requests, 1); assert.match(text(renderer), /Confira seu e-mail/); assert.doesNotMatch(text(renderer), /Senha redefinida com sucesso/);
  await act(async () => renderer.unmount());
});

test('executive PDF escapes names, SKU and category; executive CSV protects formulas and separators', async () => {
  const output = [], blobs = [];
  const { ExecutiveDashboard } = await load('components/partner/AdminModule.tsx', {
    '../../lib/pdv': { saleRevenuePayments: sale => [{ method: 'pix', amount: sale.total }], salePaymentDescription: () => 'PIX' },
    '../../lib/exportSafety': safety, '../../utils': { money }, './ReportsModule': {},
    '../../hooks/useStagnantStock': { useStagnantStock: () => ({}) }, '../../hooks/usePayables': {}, './AccountsModule': {},
    './CustomerAccountsModule': {}, './FinancialFlowModule': {}, './AdminFiscalModule': {}, './AdminSettingsTools': {}, '../../lib/accounts': {},
  }, { Blob, window: { open: () => ({ document: { write: html => output.push(html), close() {} }, print() {} }) },
    URL: { createObjectURL: blob => { blobs.push(blob); return 'blob:test'; }, revokeObjectURL() {} }, document: { createElement: () => ({ click() {} }) },
  }, '\nexports.ExecutiveDashboard=ExecutiveDashboard;');
  const marker = '<img src=x onerror="alert(1)">'; let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(ExecutiveDashboard, {
    sales: [{ id: 'sale', status: 'concluida', created_at: new Date().toISOString(), total: 20, customer_name: '=1+1;Cliente',
      items: [{ product_id: 'product', name: marker, quantity: 1, unit_price: 20 }] }],
    products: [{ id: 'product', name: marker, sku: marker, category: marker, cost_price: 10, stock: 1 }],
    salespeople: [], customers: [], branches: [], branchFilter: '', onBranchChange() {},
  })); });
  const exports = renderer.root.findAllByProps({ className: 'admin-export-btn' });
  await act(async () => exports[0].props.onClick());
  await act(async () => exports[1].props.onClick());
  assert.ok(!output[0].includes(marker)); assert.match(output[0], /&lt;img/);
  assert.match(await blobs[0].text(), /"'=1\+1;Cliente"/);
  await act(async () => renderer.unmount());
});
