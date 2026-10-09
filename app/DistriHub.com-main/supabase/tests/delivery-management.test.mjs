import assert from 'node:assert/strict';
import { pdvHelpers } from './fixtures/pdv_helpers.mjs';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';
const require = createRequire(import.meta.url);
const exports = {};
vm.runInNewContext(ts.transpileModule(await readFile(new URL('../../src/components/partner/DeliveryModule.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports, Error, require: name => name === '../../lib/pdv' ? pdvHelpers : name === '../../utils' ? { money: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }) } : require(name) });
const sales = ['one', 'two'].map(id => ({ id, customer_name: id, items: [], total: 100, delivery_type: 'entrega', status: 'concluida', branch_id: 'branch' }));

test('cliques repetidos não duplicam gravação; entregas diferentes mantêm bloqueios independentes', async () => {
  const calls = [];
  const resolve = [];
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(exports.DeliveryModule, {
    sales, salespeople: [], selectedBranchId: 'branch', onUpdateDelivery: (...args) => { calls.push(args); return new Promise(done => resolve.push(done)); },
  })); });
  const buttons = () => renderer.root.findAllByProps({ title: 'Marcar Em Rota' });
  act(() => { buttons()[0].props.onClick(); buttons()[0].props.onClick(); buttons()[1].props.onClick(); });
  assert.equal(calls.length, 2);
  assert.equal(buttons()[0].props.disabled, true);
  assert.equal(buttons()[1].props.disabled, true);
  await act(async () => resolve[0]());
  assert.equal(buttons()[0].props.disabled, false);
  assert.equal(buttons()[1].props.disabled, true);
  await act(async () => resolve[1]());
  assert.equal(buttons()[1].props.disabled, false);
  await act(async () => renderer.unmount());
});

test('erro do banco aparece na tela sem mudar o status e libera nova tentativa', async () => {
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(exports.DeliveryModule, {
    sales: [sales[0]], salespeople: [], selectedBranchId: 'branch', onUpdateDelivery: async () => { throw new Error('Acesso negado'); },
  })); });
  await act(async () => renderer.root.findByProps({ title: 'Marcar Em Rota' }).props.onClick());
  assert.equal(renderer.root.findByProps({ role: 'alert' }).children.join(''), 'Acesso negado');
  assert.equal(renderer.root.findByProps({ title: 'Marcar Em Rota' }).props.disabled, false);
  await act(async () => renderer.unmount());
});
