import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';

const require = createRequire(import.meta.url);
const read = name => readFile(new URL(name, import.meta.url), 'utf8');
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
const saas = {};
vm.runInNewContext(compile(await read('../../src/lib/saas.ts')), { exports: saas, Date, require: () => ({}) });
const helpers = {};
vm.runInNewContext(compile(await read('../../src/lib/saasAdminControls.ts')), { exports: helpers, Date, require: () => saas });
const source = compile(await read('../../src/components/AdminSaasModule.tsx'));
let renderer;
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); renderer = null; });
const company = (changes = {}) => ({
  company_id: 'owner', company_name: 'Empresa A', plan_id: 'basico', effective_plan: 'basico', status: 'active',
  billing_mode: 'paid', full_access: false, can_access: true, auto_renew: false, monthly_amount: 49.90,
  paid_until: '2030-01-01T00:00:00Z', admin_access_until: null, trial_ends_at: '2020-01-01T00:00:00Z', features: ['pdv'], ...changes,
});
async function harness({ subscriptions = [company()], mutation, initialCompanyId } = {}) {
  const calls = []; let changed = 0;
  const client = { rpc: async (name, args) => {
    if (name === 'get_saas_admin_overview') return { data: { subscriptions, invoices: [], jobs: [] } };
    calls.push({ name, args });
    return mutation ? mutation(name, args) : { data: { can_access: args.p_status !== 'suspended' } };
  } };
  const exports = {};
  vm.runInNewContext(source, { exports, Date, Error, require: name => {
    if (name === '../lib/supabase') return { supabase: client };
    if (name === '../lib/saas') return saas;
    if (name === '../lib/saasAdminControls') return helpers;
    if (name === '../utils') return { money: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }) };
    return require(name);
  } });
  await act(async () => { renderer = TestRenderer.create(React.createElement(exports.AdminSaasModule, {
    view: 'subscriptions', initialCompanyId, onChanged: () => changed++,
  })); });
  return { calls, get changed() { return changed; } };
}
const button = label => renderer.root.findAllByType('button').find(node => node.children.join('') === label);
const field = (label, type) => renderer.root.findAllByType('label').find(node => node.children[0] === label).findByType(type);
const reason = async () => act(async () => renderer.root.findByType('textarea').props.onChange({ target: { value: 'Decisão do administrador' } }));
const submit = async () => act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));

test('Super Admin suspende uma empresa pela tela e envia empresa e motivo à RPC autorizada', async () => {
  const h = await harness();
  await act(async () => button('Suspender acesso').props.onClick());
  assert.equal(field('Situação do acesso', 'select').props.value, 'suspended');
  await reason(); await submit();
  assert.equal(h.calls[0].name, 'admin_update_saas_subscription');
  assert.equal(h.calls[0].args.p_company_id, 'owner'); assert.equal(h.calls[0].args.p_status, 'suspended');
  assert.equal(h.calls[0].args.p_reason, 'Decisão do administrador'); assert.equal(h.changed, 1);
  assert.match(JSON.stringify(renderer.toJSON()), /Acesso ao aplicativo bloqueado/);
});
test('isenção e acesso completo são escolhas independentes do administrador', async () => {
  const h = await harness();
  await act(async () => button('Isentar cobrança').props.onClick());
  assert.equal(field('Cobrança da empresa', 'select').props.value, 'exempt');
  const checkbox = renderer.root.findByProps({ type: 'checkbox' });
  assert.equal(checkbox.props.checked, false);
  await act(async () => checkbox.props.onChange({ target: { checked: true } }));
  await reason(); await submit();
  assert.equal(h.calls[0].args.p_billing_mode, 'exempt'); assert.equal(h.calls[0].args.p_full_access, true);
  const suspended = helpers.saasAdminDraft(company({ status: 'suspended', can_access: false }), 'exempt');
  assert.equal(suspended.status, 'suspended');
});
test('ativação de conta vencida prepara prazo visível e não inventa pagamento recebido', async () => {
  const h = await harness({ subscriptions: [company({ status: 'expired', can_access: false, paid_until: null })] });
  await act(async () => button('Ativar acesso').props.onClick());
  assert.ok(field('Liberar acesso até', 'input').props.value);
  await reason(); await submit();
  assert.equal(h.calls[0].args.p_status, 'active'); assert.equal(h.calls[0].args.p_billing_mode, 'paid');
  assert.ok(Date.parse(h.calls[0].args.p_admin_access_until) > Date.now());
  assert.equal('p_paid_until' in h.calls[0].args, false);
});
test('rejeição do servidor preserva o formulário e mostra o motivo sem anunciar sucesso', async () => {
  const h = await harness({ mutation: async () => ({ error: { message: 'Apenas o Super Admin pode alterar assinaturas.' } }) });
  await act(async () => button('Suspender acesso').props.onClick()); await reason(); await submit();
  assert.equal(h.changed, 0); assert.equal(renderer.root.findAllByType('form').length, 1);
  assert.match(renderer.root.findByProps({ role: 'alert' }).children.join(''), /Super Admin/);
});
test('atalho para a empresa abre o formulário uma vez e a atualização não o reabre após salvar', async () => {
  await harness({ initialCompanyId: 'owner' });
  assert.equal(renderer.root.findAllByType('form').length, 1);
  await reason(); await submit();
  assert.equal(renderer.root.findAllByType('form').length, 0);
});
test('busca e filtros localizam empresas isentas ou bloqueadas sem alterar o banco', async () => {
  const h = await harness({ subscriptions: [company(), company({ company_id: 'other', company_name: 'Empresa B', billing_mode: 'exempt', can_access: false, status: 'suspended' })] });
  await act(async () => field('Mostrar', 'select').props.onChange({ target: { value: 'blocked' } }));
  const rows = renderer.root.findByType('tbody').findAllByType('tr');
  assert.equal(rows.length, 1); assert.equal(rows[0].findAllByType('td')[0].children[0], 'Empresa B');
  assert.equal(h.calls.length, 0);
});
test('duas confirmações simultâneas enviam somente uma alteração administrativa', async () => {
  let release;
  const h = await harness({ mutation: () => new Promise(resolve => { release = resolve; }) });
  await act(async () => button('Suspender acesso').props.onClick()); await reason();
  const form = renderer.root.findByType('form'); let first;
  await act(async () => {
    first = form.props.onSubmit({ preventDefault() {} });
    await form.props.onSubmit({ preventDefault() {} });
  });
  assert.equal(h.calls.length, 1);
  await act(async () => { release({ data: { can_access: false } }); await first; });
});
