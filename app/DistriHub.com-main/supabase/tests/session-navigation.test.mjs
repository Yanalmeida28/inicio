import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../../src/App.tsx', import.meta.url), 'utf8');
async function harness({ user = { id: 'owner' }, master = false, permissionError = null, loading = false, recovery = false } = {}) {
  let auth, renderer, signouts = 0, checks = 0;
  function partner({ onBack }) { return React.createElement('button', { onClick: onBack, 'data-panel': 'partner' }, 'Sair do app'); }
  function admin({ onBack }) { return React.createElement('button', { onClick: onBack, 'data-panel': 'master' }, 'Sair do app'); }
  function login(props) { return React.createElement('div', { 'data-panel': 'login', 'data-recovery': props.recoveryMode }); }
  const dependencies = {
    './hooks/useAuth': { useAuth: () => auth },
    './hooks/useSuperAdminAuth': { useSuperAdminAuth: () => ({}) },
    './hooks/useCart': { useCart: () => ({ cart: [], cartCount: 0, cartTotal: 0 }) },
    './components/CartDrawer': { CartDrawer: () => null },
    './components/HubHome': { HubHome: props => React.createElement('button', { 'data-panel': 'hub', onClick: props.onAccessPanel }) },
    './components/PartnerPanel': { PartnerPanel: partner },
    './components/AdminPanel': { AdminPanel: admin },
    './components/AuthScreen': { AuthScreen: login },
    './lib/supabase': { supabase: { async rpc() { checks++; return { data: master, error: permissionError }; } } },
    './lib/b2bOrder': {},
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, Error, require: name => dependencies[name] ?? require(name) });
  auth = { user, loading, passwordRecovery: recovery, profile: null, identity: null,
    async signOut() { signouts++; auth = { ...auth, user: null }; renderer.update(React.createElement(exports.default)); } };
  await act(async () => { renderer = TestRenderer.create(React.createElement(exports.default)); });
  return { renderer, get signouts() { return signouts; }, get checks() { return checks; },
    async update(changes) { auth = { ...auth, ...changes }; await act(async () => renderer.update(React.createElement(exports.default))); },
    async close() { await act(async () => renderer.unmount()); } };
}

test('reload restores the partner panel from an existing session without logging out', async () => {
  const h = await harness();
  assert.equal(h.renderer.root.findByProps({ 'data-panel': 'partner' }).children[0], 'Sair do app');
  assert.equal(h.signouts, 0);
  await h.update({ user: { id: 'owner' }, session: { access_token: 'renewed' } });
  assert.equal(h.checks, 1); assert.equal(h.signouts, 0);
  assert.ok(h.renderer.root.findByProps({ 'data-panel': 'partner' }));
  await h.close();
  const reloaded = await harness();
  assert.ok(reloaded.renderer.root.findByProps({ 'data-panel': 'partner' })); assert.equal(reloaded.signouts, 0);
  await reloaded.close();
});

test('master session is restored only after server permission validation and explicit exit ends it', async () => {
  const h = await harness({ master: true });
  assert.ok(h.renderer.root.findByProps({ 'data-panel': 'master' })); assert.equal(h.checks, 1);
  await act(async () => h.renderer.root.findByProps({ 'data-panel': 'master' }).props.onClick());
  assert.equal(h.signouts, 1); assert.ok(h.renderer.root.findByProps({ 'data-panel': 'login' }));
  await h.close();
});

test('partner explicit exit shows login and a new page without session does not restore protected panels', async () => {
  const h = await harness();
  await act(async () => h.renderer.root.findByProps({ 'data-panel': 'partner' }).props.onClick());
  assert.equal(h.signouts, 1); assert.ok(h.renderer.root.findByProps({ 'data-panel': 'login' })); await h.close();
  const loggedOut = await harness({ user: null });
  assert.equal(loggedOut.checks, 0); assert.ok(loggedOut.renderer.root.findByProps({ 'data-panel': 'hub' }));
  await loggedOut.close();
});

test('loading and permission errors do not show login or silently terminate a saved session', async () => {
  const loading = await harness({ loading: true });
  assert.match(JSON.stringify(loading.renderer.toJSON()), /Recuperando sua sessão/); assert.equal(loading.checks, 0);
  await loading.update({ loading: false }); assert.ok(loading.renderer.root.findByProps({ 'data-panel': 'partner' })); await loading.close();
  const failed = await harness({ permissionError: { message: 'Network unavailable' } });
  assert.match(JSON.stringify(failed.renderer.toJSON()), /Tentar novamente/); assert.equal(failed.signouts, 0);
  assert.equal(failed.renderer.root.findAllByProps({ 'data-panel': 'login' }).length, 0); await failed.close();
});

test('password recovery remains on its reset screen and session removal closes a protected panel', async () => {
  const recovery = await harness({ recovery: true });
  assert.ok(recovery.renderer.root.findByProps({ 'data-panel': 'login', 'data-recovery': true })); assert.equal(recovery.checks, 0); await recovery.close();
  const h = await harness(); await h.update({ user: null });
  assert.ok(h.renderer.root.findByProps({ 'data-panel': 'login' })); await h.close();
});

test('a delayed initial session cannot overwrite login, token refresh preserves identity, and failed exit retains the session', async () => {
  let current, listener, finishInitial, profileReads = 0;
  const initial = new Promise(resolve => { finishInitial = resolve; });
  const user = { id: 'owner' };
  const client = { from: table => ({
    select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
    async maybeSingle() { if (table === 'partner_profiles') profileReads++; return { data: table === 'partner_profiles' ? { id: 'owner', business_name: 'Loja' } : null, error: null }; },
  }), auth: {
    getSession: () => initial,
    onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    async signOut() { return { error: { message: 'Não foi possível sair' } }; },
  } };
  const exports = {};
  const authSource = await readFile(new URL('../../src/hooks/useAuth.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(authSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, Error, window: { setTimeout: callback => callback() },
    require: name => name === '../utils' ? {} : name === '../lib/supabase' ? { supabase: client, isSupabaseConfigured: true } : require(name),
  });
  function Probe() { current = exports.useAuth(); return null; }
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(Probe)); });
  await act(async () => { listener('SIGNED_IN', { user, access_token: 'first' }); });
  assert.equal(current.user.id, 'owner'); const reads = profileReads;
  await act(async () => finishInitial({ data: { session: null } }));
  assert.equal(current.user.id, 'owner'); assert.equal(current.identity.companyUserId, 'owner');
  await act(async () => listener('TOKEN_REFRESHED', { user, access_token: 'renewed' }));
  assert.equal(profileReads, reads); assert.equal(current.session.access_token, 'renewed');
  await act(async () => { await assert.rejects(current.signOut(), /Não foi possível sair/); });
  assert.equal(current.user.id, 'owner'); assert.equal(current.identity.companyUserId, 'owner');
  await act(async () => renderer.unmount());
});
