import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';
const require = createRequire(import.meta.url);
const exports = {};
vm.runInNewContext(ts.transpileModule(await readFile(new URL('../../src/components/partner/CadastrosModule.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports, Error, require: name => name === '../../utils' || name === '../../lib/saleReturns' || name === './ImportExportModule' ? {} : require(name) });

test('estoque no Administrativo não duplica menus; valida e salva o saldo contado, incluindo zero', async () => {
  const calls = [];
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(exports.CadastrosModule, {
    adminTarget: 'estoque', initialTab: 'produtos', selectedBranchId: 'branch',
    products: [{ id: 'p', branch_id: 'branch', name: 'Produto', stock: 10, min_stock: 2, is_service: false },
      { id: 'svc', branch_id: 'branch', name: 'Serviço', stock: 0, is_service: true }],
    onUpdateProduct: async (...args) => calls.push(args),
  })); });
  assert.equal(renderer.root.findAllByProps({ className: 'subtab-bar cadastros-subtab-bar' }).length, 0);
  assert.equal(renderer.root.findAllByType('button').length, 1);
  await act(async () => renderer.root.findByType('button').props.onClick());
  const amount = () => renderer.root.findByProps({ 'aria-label': 'Novo saldo de Produto' });
  await act(async () => amount().props.onChange({ target: { value: '-1' } }));
  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(calls.length, 0);
  assert.equal(renderer.root.findAllByProps({ role: 'alert' }).length, 1);
  await act(async () => amount().props.onChange({ target: { value: '0' } }));
  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(calls[0][0], 'p');
  assert.equal(calls[0][1].stock, 0);
  await act(async () => renderer.unmount());
});

test('editar colaborador conserva bloqueios, permite escolher módulos e respeita a função', async () => {
  const calls = [];
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(exports.CadastrosModule, {
    adminTarget: 'vendedores', initialTab: 'vendedores', branches: [],
    salespeople: [{id:'employee',name:'Funcionário',email:'employee@example.test',role:'vendedor',commission_rate:0,active:true,blocked_modules:['pdv']}],
    onUpdateSalesperson: async (...args) => calls.push(args),
  })); });
  await act(async () => renderer.root.findByProps({title:'Editar'}).props.onClick());
  const pdv = () => renderer.root.findByProps({'aria-label':'Acesso a PDV'});
  assert.equal(pdv().props.checked, false);
  assert.equal(renderer.root.findByProps({'aria-label':'Acesso a Financeiro'}).props.disabled, true);
  await act(async () => pdv().props.onChange({target:{checked:true}}));
  await act(async () => renderer.root.findByProps({'aria-label':'Acesso a Caixa'}).props.onChange({target:{checked:false}}));
  const save = renderer.root.findByProps({title:'Salvar alterações'});
  assert.ok(save);
  await act(async () => save.props.onClick());
  assert.equal(calls[0][0], 'employee');
  assert.deepEqual([...calls[0][1].blocked_modules], ['caixa']);
  await act(async () => renderer.unmount());
});
