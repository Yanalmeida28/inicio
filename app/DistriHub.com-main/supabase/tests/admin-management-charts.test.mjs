import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
const require = createRequire(import.meta.url);
const React = require('react');
const renderer = require('react-test-renderer');
const helpers = {};
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
vm.runInNewContext(compile(readFileSync(new URL('../../src/lib/adminOverview.ts', import.meta.url), 'utf8')), { exports: helpers, Date, require: () => ({}) });
const exports = {};
vm.runInNewContext(compile(readFileSync(new URL('../../src/components/AdminManagementCharts.tsx', import.meta.url), 'utf8')), {
  exports, Date, Intl, require: name => name.endsWith('/adminOverview') ? helpers : name.endsWith('/utils') ? { money: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }) } : require(name),
});
const render = data => { let result; renderer.act(() => { result = renderer.create(React.createElement(exports.AdminManagementCharts, { data })); }); return result; };

test('empty dashboard is explicit and period control updates the monthly table', () => {
  const result = render({ subscriptions: [], invoices: [] });
  assert.match(JSON.stringify(result.toJSON()), /Nenhuma empresa cadastrada/);
  assert.doesNotMatch(JSON.stringify(result.toJSON()), /NaN|Infinity/);
  assert.equal(result.root.findByType('tbody').findAllByType('tr').length, 6);
  renderer.act(() => result.root.findByType('select').props.onChange({ target: { value: '12' } }));
  assert.equal(result.root.findByType('tbody').findAllByType('tr').length, 12);
  renderer.act(() => result.unmount());
});

test('received chart excludes pending and refunded invoices and keeps access independent of plan status', () => {
  const result = render({ subscriptions: [{ effective_plan: 'enterprise', can_access: true }, { effective_plan: 'basico', can_access: false }], invoices: [
    { status: 'paid', paid_at: new Date().toISOString(), amount: 125 },
    { status: 'pending', paid_at: null, amount: 900 },
    { status: 'refunded', paid_at: new Date().toISOString(), amount: 500 },
  ] });
  assert.match(result.root.findByProps({ className: 'saas-revenue-svg' }).props['aria-label'], /125/);
  const donut = result.root.findAll(node => node.props.className === 'saas-donut')[0];
  assert.equal(donut.props['aria-label'], '1 empresas com acesso liberado de 2');
  assert.equal(donut.findByType('strong').children.join(''), '50%');
  renderer.act(() => result.unmount());
});
