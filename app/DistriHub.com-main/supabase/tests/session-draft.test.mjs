import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';

test('rascunhos sobrevivem à remontagem e permanecem separados por usuário e filial', async () => {
  const storage = new Map();
  const exports = {};
  vm.runInNewContext(ts.transpileModule(await readFile(new URL('../../src/hooks/useSessionDraft.tsx', import.meta.url),'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},
  }).outputText, {exports,require:createRequire(import.meta.url),console,window:{sessionStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}}});
  function Field() {
    const [value,setValue] = exports.useSessionDraftState('field','');
    return React.createElement('input',{value,onChange:event=>setValue(event.target.value)});
  }
  const screen = scope => React.createElement(exports.SessionDraftProvider,{key:scope,scope},React.createElement(Field));
  let renderer;
  await act(async () => { renderer=TestRenderer.create(screen('user-a:branch-a')); });
  await act(async () => renderer.root.findByType('input').props.onChange({target:{value:'rascunho'}}));
  await act(async () => renderer.unmount());
  await act(async () => { renderer=TestRenderer.create(screen('user-a:branch-a')); });
  assert.equal(renderer.root.findByType('input').props.value,'rascunho');
  await act(async () => renderer.update(screen('user-b:branch-b')));
  assert.equal(renderer.root.findByType('input').props.value,'');
  await act(async () => renderer.update(screen('user-a:branch-a')));
  assert.equal(renderer.root.findByType('input').props.value,'rascunho');
  await act(async () => renderer.unmount());
});
