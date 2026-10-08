import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';

const source = ts.transpileModule(await readFile(new URL('../../src/hooks/useSaasSubscription.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
let renderer;
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); renderer = null; });
const allowed = { can_access: true, features: ['pdv'], company_id: 'owner', status: 'active' };
async function harness(rpc, company = 'owner') {
  const exports = {};
  vm.runInNewContext(source, {
    exports, Error,
    document: { visibilityState: 'visible' },
    window: { setInterval() { return 1; }, clearInterval() {}, addEventListener() {}, removeEventListener() {} },
    require: name => name === 'react' ? React : { supabase: { rpc } },
  });
  let current;
  function Probe({ id }) { current = exports.useSaasSubscription(id); return null; }
  await act(async () => { renderer = TestRenderer.create(React.createElement(Probe, { id: company })); });
  return { get current() { return current; }, async switchCompany(id) { await act(async () => renderer.update(React.createElement(Probe, { id }))); } };
}
test('uma atualização de assinatura fora de ordem não restaura acesso já suspenso', async () => {
  let release, calls = 0;
  const h = await harness(async () => {
    if (++calls === 2) return new Promise(resolve => { release = resolve; });
    return { data: calls === 1 ? allowed : { ...allowed, can_access: false, features: [], status: 'suspended' } };
  });
  let pending;
  await act(async () => { pending = h.current.refresh(); });
  await act(async () => h.current.refresh());
  assert.equal(h.current.subscription.can_access, false);
  await act(async () => { release({ data: allowed }); await pending; });
  assert.equal(h.current.subscription.can_access, false);
});
test('falha na conferência fecha acesso operacional até uma nova verificação bem-sucedida', async () => {
  let failed = false;
  const h = await harness(async () => failed ? { error: new Error('Conexão indisponível') } : { data: allowed });
  assert.equal(h.current.subscription.can_access, true);
  failed = true;
  await act(async () => h.current.refresh());
  assert.equal(h.current.subscription, null); assert.match(h.current.error, /indisponível/);
  failed = false;
  await act(async () => h.current.refresh());
  assert.equal(h.current.subscription.can_access, true); assert.equal(h.current.error, null);
});
test('troca de empresa ignora a resposta tardia da empresa anterior', async () => {
  let release;
  const h = await harness(async (_name, args) => args.p_company_id === 'owner'
    ? new Promise(resolve => { release = resolve; }) : { data: { ...allowed, company_id: 'other', can_access: false, features: [] } });
  await h.switchCompany('other');
  assert.equal(h.current.subscription.company_id, 'other');
  await act(async () => release({ data: allowed }));
  assert.equal(h.current.subscription.company_id, 'other'); assert.equal(h.current.subscription.can_access, false);
});
test('editar novamente uma liberação por data preserva o dia de São Paulo sem estender o acesso', async () => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(await readFile(new URL('../../src/lib/saas.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, Date, require: () => ({ mercadoPagoCheckoutUrl: () => null }) });
  assert.equal(exports.saasAccessDateForInput('2030-01-02T02:59:59Z'), '2030-01-01');
  assert.equal(exports.saasAccessDateForInput(null), '');
});
