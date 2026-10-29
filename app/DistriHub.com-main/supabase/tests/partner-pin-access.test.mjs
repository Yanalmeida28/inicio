import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';

const require = createRequire(import.meta.url);
const read = path => readFile(new URL('../../src/' + path, import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
}).outputText;
const helperSource = compile(await read('lib/partnerAccess.ts'));
const gateSource = compile(await read('components/partner/PartnerAccessGate.tsx'));
const cashExports = {};
vm.runInNewContext(compile(await read('lib/checkoutCash.ts')), { exports: cashExports });
const identity = { authUserId: 'company', companyUserId: 'company', salespersonId: null, branchId: null, role: 'administrador' };
const user = { id: 'company', email: 'owner@example.test' };
const employee = { company_id: 'company', salesperson_id: 'employee', branch_id: 'north', role: 'caixa' };

function harness({ reply = { data: [employee], error: null }, passwordUser = 'company', saved = null, device = { ready: true, error: null, retry() {} } } = {}) {
  const calls = [], storage = new Map();
  if (saved) storage.set('distrihub:operator-selection:company:company', JSON.stringify(saved));
  const sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const client = {
    from(table) {
      calls.push({ table });
      const q = { select(columns) { calls.push({ columns }); return q; }, eq() { return q; }, order() { return q; },
        then(resolve) { return Promise.resolve({ data: [{ id: 'employee', name: 'Ana' }], error: null }).then(resolve); } };
      return q;
    },
    async rpc(name, args) { calls.push({ name, args }); return typeof reply === 'function' ? reply() : reply; },
  };
  const deps = { supabase: client, createOwnerVerificationClient() {
    calls.push({ verifier: true });
    return { auth: {
      async signInWithPassword(args) { calls.push({ passwordEmail: args.email }); return {
        data: { user: args.password === 'owner-secret' ? { id: passwordUser } : null }, error: args.password === 'owner-secret' ? null : new Error('Invalid password'),
      }; },
      async signOut(args) { calls.push({ verifierSignOut: args.scope }); return { error: null }; },
    } };
  } };
  const api = {};
  vm.runInNewContext(helperSource, { exports: api, Error, require: name => name === './supabase' ? deps : require(name) });
  const components = {};
  vm.runInNewContext(gateSource, { exports: components, Error, sessionStorage,
    require: name => name === '../../lib/supabase' ? deps : name === '../../lib/partnerAccess' ? api
      : name === '../../lib/checkoutCash' ? cashExports
      : name === '../../hooks/useDeviceHeartbeat' ? { useDeviceHeartbeat: () => device } : require(name),
  });
  return { ...api, ...components, calls, storage };
}

test('PIN authorizes the server-assigned branch directly without choosing a branch or logging out', async () => {
  const h = harness();
  const access = await h.authorizePin(identity, 'employee', 'Ana', '1234');
  assert.equal(access.kind, 'employee'); assert.equal(access.operator.branchId, 'north'); assert.equal(access.operator.role, 'caixa');
  const rpc = h.calls.find(call => call.name);
  assert.equal(rpc.name, 'resolve_partner_pdv_operator');
  assert.equal(rpc.args.p_requested_branch_id, null);
  assert.equal(rpc.args.p_pin, '1234');
  assert.equal(h.calls.some(call => call.verifier), false);
});

test('wrong PIN, missing branch, foreign company and ambiguous RPC replies never grant owner or employee access', async () => {
  for (const reply of [{ data: null, error: new Error('Bad PIN') },
    { data: [{ ...employee, branch_id: null }], error: null },
    { data: [{ ...employee, company_id: 'foreign' }], error: null },
    { data: [employee, employee], error: null },
    { data: [{ ...employee, salesperson_id: 'other' }], error: null }]) {
    await assert.rejects(harness({ reply }).authorizePin(identity, 'employee', 'Ana', '1234'));
  }
  await assert.rejects(harness().authorizePin(identity, 'employee', 'Ana', ''));
});

test('owner access requires the correct account password on an isolated temporary client', async () => {
  const h = harness();
  await assert.rejects(h.authorizeOwner(identity, user, 'bad-password'));
  assert.equal((await h.authorizeOwner(identity, user, 'owner-secret')).kind, 'owner');
  assert.ok(h.calls.some(call => call.verifierSignOut === 'local'));
  assert.ok(h.calls.filter(call => call.passwordEmail).every(call => call.passwordEmail === user.email));
  await assert.rejects(harness({ passwordUser: 'someone-else' }).authorizeOwner(identity, user, 'owner-secret'));
  await assert.rejects(h.authorizeOwner({ ...identity, salespersonId: 'employee' }, user, 'owner-secret'));
});

async function render(h, openOperator = true) {
  let renderer, logouts = 0;
  const props = { user, identity, onSwitchAccount: async () => { logouts++; }, children: (operator, requestAccess) =>
    React.createElement('main', { 'data-workspace': true, 'data-operator': operator?.id ?? 'owner', 'data-branch': operator?.branchId ?? 'all' },
      React.createElement('button', { 'data-switch': true, onClick: () => requestAccess('employee') }, 'Trocar operador'),
      React.createElement('button', { 'data-owner': true, onClick: () => requestAccess('owner') }, 'Proprietário')) };
  await act(async () => { renderer = TestRenderer.create(React.createElement(h.PartnerAccessGate, props)); });
  if (openOperator) await act(async () => renderer.root.findByProps({ 'aria-label': 'Trocar operador por PIN' }).props.onClick());
  return { renderer, props, get logouts() { return logouts; }, async close() { await act(async () => renderer.unmount()); } };
}
const submit = view => view.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} });
test('login opens the app menus without a PIN screen or any operational data query', async () => {
  const h = harness(), view = await render(h, false);
  try {
    assert.equal(view.renderer.root.findAllByProps({ 'data-locked-workspace': 'true' }).length, 1);
    assert.equal(view.renderer.root.findAllByProps({ 'data-workspace': true }).length, 0);
    assert.equal(view.renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
    assert.equal(view.renderer.root.findAllByProps({ 'aria-label': 'Colaborador' }).length, 0);
    assert.equal(view.renderer.root.findAllByProps({ 'aria-label': 'PIN de acesso' }).length, 0);
    const nav = view.renderer.root.findByProps({ 'aria-label': 'Menu do aplicativo' });
    for (const label of ['Financeiro', 'Cadastros', 'PDV & Vendas']) {
      await act(async () => nav.findAllByType('button').find(button => button.children.includes(label)).props.onClick());
      assert.equal(view.renderer.root.findByType('h3').children.join(''), label);
      assert.equal(view.renderer.root.findAllByType('form').length, 0);
      assert.equal(view.renderer.root.findAllByProps({ 'data-workspace': true }).length, 0);
      assert.equal(h.calls.length, 0);
    }
    assert.equal(view.renderer.root.findAllByType('button').some(button => button.children.includes('Entrar com PIN')), false);
    assert.equal(view.renderer.root.findAllByProps({ 'aria-label': 'Senha do proprietário' }).length, 0);
    const ownerButton = view.renderer.root.findAllByType('button').find(button => button.children.some(child => typeof child === 'string' && child.trim() === 'Área do proprietário'));
    await act(async () => ownerButton.props.onClick());
    assert.equal(view.renderer.root.findAllByProps({ 'aria-label': 'Senha do proprietário' }).length, 1);
    assert.equal(h.calls.filter(call => call.table).length, 0);
    await act(async () => view.renderer.root.findByProps({ 'aria-label': 'Fechar' }).props.onClick());
    assert.equal(view.renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
    assert.equal(view.renderer.root.findAllByProps({ 'aria-label': 'PIN de acesso' }).length, 0);
    await act(async () => view.renderer.root.findByProps({ 'aria-label': 'Trocar operador por PIN' }).props.onClick());
    assert.equal(view.renderer.root.findAllByProps({ 'aria-label': 'PIN de acesso' }).length, 1);
    assert.equal(h.calls.filter(call => call.table).length, 1);
    await act(async () => view.renderer.root.findByProps({ 'aria-label': 'Fechar' }).props.onClick());
    assert.equal(view.renderer.root.findAllByProps({ 'data-workspace': true }).length, 0);
  } finally { await view.close(); }
});

test('operator entry only offers collaborators and waits for the device heartbeat before loading names', async () => {
  const device = { ready: false, error: 'Dispositivo não validado', retry() {} };
  const h = harness({ device }), view = await render(h);
  try {
    assert.equal(h.calls.filter(call => call.table).length, 0);
    const dialog = view.renderer.root.findByType('form');
    assert.equal(dialog.findAllByProps({ 'aria-label': 'Senha do proprietário' }).length, 0);
    assert.equal(dialog.findAllByType('button').some(button => button.children.includes('Proprietário')), false);
    assert.equal(dialog.findByProps({ className: 'module-submit-btn' }).props.disabled, true);
    device.ready = true; device.error = null;
    await act(async () => view.renderer.update(React.createElement(h.PartnerAccessGate, { ...view.props })));
    assert.equal(h.calls.filter(call => call.table).length, 1);
    assert.equal(view.renderer.root.findByProps({ 'aria-label': 'Colaborador' }).props.disabled, false);
    await enterPin(view);
    assert.equal(view.renderer.root.findByProps({ 'data-workspace': true }).props['data-branch'], 'north');
  } finally { await view.close(); }
});

async function enterPin(view, pin = '1234') {
  await act(async () => view.renderer.root.findByProps({ 'aria-label': 'Colaborador' }).props.onChange({ target: { value: 'employee' } }));
  await act(async () => view.renderer.root.findByProps({ 'aria-label': 'PIN de acesso' }).props.onChange({ target: { value: pin } }));
  await act(async () => submit(view));
}

test('workspace stays unmounted until PIN confirmation; PIN staff open their branch without email or password fields', async () => {
  const h = harness(), view = await render(h);
  try {
    assert.equal(view.renderer.root.findAllByProps({ 'data-workspace': true }).length, 0);
    assert.deepEqual(h.calls.filter(call => call.columns).map(call => call.columns), ['id,name']);
    assert.equal(view.renderer.root.findAllByProps({ 'aria-label': 'Senha do proprietário' }).length, 0);
    await enterPin(view);
    const workspace = view.renderer.root.findByProps({ 'data-workspace': true });
    assert.equal(workspace.props['data-operator'], 'employee'); assert.equal(workspace.props['data-branch'], 'north');
    assert.equal(view.logouts, 0);
    assert.doesNotMatch([...h.storage.values()].join(''), /1234|owner-secret/);
  } finally { await view.close(); }
});

test('the existing operator switch opens a collaborator-only dialog after initial PIN entry', async () => {
  const view = await render(harness());
  try {
    await enterPin(view);
    await act(async () => view.renderer.root.findByProps({ 'data-switch': true }).props.onClick());
    const dialog = view.renderer.root.findByProps({ role: 'dialog' });
    assert.equal(dialog.findAllByProps({ 'aria-label': 'PIN de acesso' }).length, 1);
    assert.equal(dialog.findAllByProps({ 'aria-label': 'Senha do proprietário' }).length, 0);
    await act(async () => dialog.findByProps({ 'aria-label': 'Fechar' }).props.onClick());
    assert.equal(view.renderer.root.findByProps({ 'data-workspace': true }).props['data-operator'], 'employee');
    assert.equal(view.renderer.root.findAllByProps({ 'data-locked-workspace': 'true' }).length, 0);
  } finally { await view.close(); }
});

test('returning from PIN staff to owner requires the password; bad password preserves the employee branch', async () => {
  const h = harness(), view = await render(h);
  try {
    await enterPin(view);
    await act(async () => view.renderer.root.findByProps({ 'data-owner': true }).props.onClick());
    assert.equal(view.renderer.root.findByProps({ 'data-workspace': true }).props['data-operator'], 'employee');
    const password = () => view.renderer.root.findByProps({ 'aria-label': 'Senha do proprietário' });
    await act(async () => password().props.onChange({ target: { value: 'wrong' } }));
    await act(async () => submit(view));
    assert.ok(view.renderer.root.findByProps({ role: 'alert' }));
    assert.equal(view.renderer.root.findByProps({ 'data-workspace': true }).props['data-branch'], 'north');
    await act(async () => password().props.onChange({ target: { value: 'owner-secret' } }));
    await act(async () => submit(view));
    assert.equal(view.renderer.root.findByProps({ 'data-workspace': true }).props['data-operator'], 'owner');
    assert.equal(view.logouts, 0);
  } finally { await view.close(); }
});

test('reload restores only the name, never the PIN or owner access', async () => {
  for (const operatorId of ['employee', null]) {
    const h = harness({ saved: { operatorId, branchId: 'south' } }), view = await render(h);
    try {
      assert.equal(view.renderer.root.findAllByProps({ 'data-workspace': true }).length, 0);
      assert.equal(view.renderer.root.findByProps({ 'aria-label': 'PIN de acesso' }).props.value, '');
      if (operatorId) assert.equal(view.renderer.root.findByProps({ 'aria-label': 'Colaborador' }).props.value, 'employee');
    } finally { await view.close(); }
  }
});

test('wrong PIN cannot mount any workspace or fall back to free access', async () => {
  const view = await render(harness({ reply: { data: null, error: new Error('Wrong PIN') } }));
  try { await enterPin(view); assert.equal(view.renderer.root.findAllByProps({ 'data-workspace': true }).length, 0);
    assert.ok(view.renderer.root.findByProps({ role: 'alert' }));
  } finally { await view.close(); }
});

test('pending PIN validation blocks duplicate submission and its late reply is ignored after unmount', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = harness({ reply: () => pending }), view = await render(h);
  await act(async () => view.renderer.root.findByProps({ 'aria-label': 'Colaborador' }).props.onChange({ target: { value: 'employee' } }));
  await act(async () => view.renderer.root.findByProps({ 'aria-label': 'PIN de acesso' }).props.onChange({ target: { value: '1234' } }));
  await act(async () => { void submit(view); void submit(view); });
  assert.equal(h.calls.filter(call => call.name).length, 1);
  await view.close();
  await act(async () => finish({ data: [employee], error: null }));
  assert.equal(h.storage.size, 0);
});
