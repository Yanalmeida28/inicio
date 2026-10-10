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

test('mudar o escopo sem desmontar não copia dados entre usuários; rascunho inválido não derruba a tela', async () => {
  const storage = new Map([
    ['distrihub:draft:a:cart',JSON.stringify([{product_id:'a'}])],
    ['distrihub:draft:b:cart',JSON.stringify([{product_id:'b'}])],
    ['distrihub:draft:broken:cart',JSON.stringify('valor inválido')],
  ]);
  const exports = {};
  vm.runInNewContext(ts.transpileModule(await readFile(new URL('../../src/hooks/useSessionDraft.tsx',import.meta.url),'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},
  }).outputText, {exports,require:createRequire(import.meta.url),console,window:{sessionStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}}});
  function Cart() {
    const [value,setValue] = exports.useSessionDraftState('cart',[]);
    return React.createElement('button',{'aria-label':'Carrinho de teste',onClick:()=>setValue(previous=>[...previous,{product_id:'new'}])},JSON.stringify(value));
  }
  const screen=scope=>React.createElement(exports.SessionDraftProvider,{scope},React.createElement(Cart));
  let renderer;
  await act(async()=>{renderer=TestRenderer.create(screen('a'));});
  await act(async()=>renderer.update(screen('b')));
  assert.equal(renderer.root.findByProps({'aria-label':'Carrinho de teste'}).children[0],JSON.stringify([{product_id:'b'}]));
  assert.equal(storage.get('distrihub:draft:a:cart'),JSON.stringify([{product_id:'a'}]));
  await act(async()=>renderer.root.findByProps({'aria-label':'Carrinho de teste'}).props.onClick());
  assert.equal(JSON.parse(storage.get('distrihub:draft:b:cart')).length,2);
  await act(async()=>renderer.update(screen('broken')));
  assert.equal(renderer.root.findByProps({'aria-label':'Carrinho de teste'}).children[0],'[]');
  assert.equal(storage.get('distrihub:draft:broken:cart'),'[]');
  await act(async()=>renderer.unmount());
});

test('IDs de edição e frete textual são restaurados sem aviso de rascunho incompatível', async () => {
  const storage = new Map([
    ['distrihub:draft:user:customers:editing-id',JSON.stringify('customer-id')],
    ['distrihub:draft:user:checkout:freight-fee',JSON.stringify('12.50')],
  ]);
  const exports = {};
  vm.runInNewContext(ts.transpileModule(await readFile(new URL('../../src/hooks/useSessionDraft.tsx',import.meta.url),'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},
  }).outputText,{exports,require:createRequire(import.meta.url),console,window:{sessionStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}}});
  function Fields() {
    const [id,setId] = exports.useSessionDraftState('customers:editing-id',null,undefined,value=>value===null||typeof value==='string');
    const [freight] = exports.useSessionDraftState('checkout:freight-fee',0,undefined,value=>typeof value==='number'||typeof value==='string');
    return React.createElement('input',{value: `${id}:${freight}`,onChange:()=>setId('updated-id')});
  }
  const screen=()=>React.createElement(exports.SessionDraftProvider,{scope:'user'},React.createElement(Fields));
  let renderer;
  await act(async()=>{renderer=TestRenderer.create(screen());});
  assert.equal(renderer.root.findByType('input').props.value,'customer-id:12.50');
  assert.equal(renderer.root.findAllByProps({role:'alert'}).length,0);
  await act(async()=>renderer.root.findByType('input').props.onChange());
  await act(async()=>renderer.unmount());
  await act(async()=>{renderer=TestRenderer.create(screen());});
  assert.equal(renderer.root.findByType('input').props.value,'updated-id:12.50');
  assert.equal(renderer.root.findAllByProps({role:'alert'}).length,0);
  await act(async()=>renderer.unmount());
});

test('armazenamento bloqueado mantém o formulário na sessão sem misturar usuários', async () => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(await readFile(new URL('../../src/hooks/useSessionDraft.tsx',import.meta.url),'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},
  }).outputText,{exports,require:createRequire(import.meta.url),console,window:{sessionStorage:{getItem(){throw new Error('Armazenamento bloqueado');},setItem(){throw new Error('Armazenamento bloqueado');}}}});
  function Field() {
    const [value,setValue] = exports.useSessionDraftState('customer:name','');
    return React.createElement('input',{value,onChange:e=>setValue(e.target.value)});
  }
  const screen=scope=>React.createElement(exports.SessionDraftProvider,{key:scope,scope},React.createElement(Field));
  let renderer;
  await act(async()=>{renderer=TestRenderer.create(screen('a'));});
  await act(async()=>renderer.root.findByType('input').props.onChange({target:{value:'Cliente preenchido'}}));
  await act(async()=>renderer.update(screen('b')));
  assert.equal(renderer.root.findByType('input').props.value,'');
  await act(async()=>renderer.update(screen('a')));
  assert.equal(renderer.root.findByType('input').props.value,'Cliente preenchido');
  assert.match(JSON.stringify(renderer.toJSON()),/use Salvar para gravar o cadastro/);
  await act(async()=>renderer.root.findByProps({'aria-label':'Fechar aviso de rascunho'}).props.onClick());
  assert.equal(renderer.root.findAllByProps({role:'alert'}).length,0);
  await act(async()=>renderer.unmount());
});
