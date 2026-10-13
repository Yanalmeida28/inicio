import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';
const require=createRequire(import.meta.url);
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
const componentSource=await readFile(new URL('../../src/components/partner/RmaRefundForm.tsx',import.meta.url),'utf8');
const operationSource=await readFile(new URL('../../src/lib/operationAttempts.ts',import.meta.url),'utf8');
function setup(entries) {
 const exports={}; const operations={}; let id=0;
 const context={Error,crypto:{randomUUID:()=>`request-${++id}`},localStorage:{getItem:key=>entries.get(key),setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)}};
 vm.runInNewContext(compile(operationSource),{...context,exports:operations});
 vm.runInNewContext(compile(componentSource),{...context,exports,require:name=>{
  if(name==='../../lib/operationAttempts') return operations;
  if(name==='../../lib/cashRegister') return {cashAmount:value=>Number(value.replace(',','.'))};
  if(name==='../../lib/pdv') return {pdvErrorMessage:error=>error.message,isDefinitiveSaleRejection:code=>code==='P0001'};
  return require(name);
 }});
 return exports.RmaRefundForm;
}
const rma={id:'rma',user_id:'owner',branch_id:'branch',product_name:'Peca',quantity:1};
test('refund survives reload, preserves the request and never persists PINs',async()=>{
 const entries=new Map(); const calls=[]; let closed=0; let view;
 let fail=true;
 const handler=async(...args)=>{calls.push(args);if(fail)throw new Error('Resposta perdida');};
 const mount=()=>act(()=>{view=TestRenderer.create(React.createElement(setup(entries),{rma,onConfirm:handler,onClose:()=>closed++}));});
 mount();
 try {
  act(()=>view.root.findByProps({'aria-label':'Valor do reembolso'}).props.onChange({target:{value:'20,00'}}));
  act(()=>view.root.findByProps({'aria-label':'Forma do reembolso'}).props.onChange({target:{value:'pix'}}));
  act(()=>view.root.findByProps({'aria-label':'Motivo do reembolso'}).props.onChange({target:{value:'Defeito de fabrica'}}));
  await act(async()=>{const submit=view.root.findByType('form').props.onSubmit; await Promise.all([submit({preventDefault(){}}),submit({preventDefault(){}})]);});
  assert.equal(calls.length,1);assert.equal(closed,0);
  assert.equal(view.root.findByType('fieldset').props.disabled,true);
  const stored=Array.from(entries.values()).join('');assert.ok(!stored.includes('pin'));assert.ok(!stored.includes('token'));
  act(()=>view.unmount());mount();fail=false;
  assert.equal(view.root.findByProps({'aria-label':'Valor do reembolso'}).props.value,'20');
  await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
  assert.deepEqual(calls[0],calls[1]);assert.equal(closed,1);assert.equal(entries.size,0);
 } finally {act(()=>view.unmount());}
});
test('definitive rejection unlocks the form for correction',async()=>{
 const entries=new Map();let view;
 act(()=>{view=TestRenderer.create(React.createElement(setup(entries),{rma,onClose(){},onConfirm:async()=>{throw {code:'P0001',message:'Abra o caixa'};}}));});
 try {
  act(()=>view.root.findByProps({'aria-label':'Valor do reembolso'}).props.onChange({target:{value:'20'}}));
  act(()=>view.root.findByProps({'aria-label':'Motivo do reembolso'}).props.onChange({target:{value:'Defeito'}}));
  await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
  assert.equal(entries.size,0);assert.equal(view.root.findByType('fieldset').props.disabled,false);
  assert.equal(view.root.findByProps({role:'alert'}).children.join(''),'Abra o caixa');
 } finally {act(()=>view.unmount());}
});
