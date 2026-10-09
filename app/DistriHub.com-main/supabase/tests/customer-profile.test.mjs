import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';
const require=createRequire(import.meta.url);
const exports={};
const source=await readFile(new URL('../../src/components/partner/CadastrosModule.tsx',import.meta.url),'utf8');
vm.runInNewContext(ts.transpileModule(source+'\nexports.CustomerProfile=CustomerProfileModal;',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020},
}).outputText,{exports,Error,require(name){
  if(name==='../../utils')return {money:new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}),formatCpf:v=>v??'',formatCnpj:v=>v??'',normalizeDocument:v=>v??''};
  if(name==='../../hooks/useSessionDraft')return {};
  if(name==='./ImportExportModule'||name==='../../lib/saleReturns')return {};
  return require(name);
}});
let renderer;
afterEach(async()=>{if(renderer)await act(async()=>renderer.unmount());renderer=null;});
const customer={id:'customer',name:'Cliente',user_id:'owner',branch_id:null,person_type:'PF',customer_type:'varejo',credit_limit:0,allow_credit:false};
async function open(onUpdate,onClose=()=>{}){
  await act(async()=>{renderer=TestRenderer.create(React.createElement(exports.CustomerProfile,{customer,sales:[],salespeople:[],rmaRequests:[],onUpdate,onClose}));});
  await act(async()=>renderer.root.findAllByType('button').find(b=>b.children.includes('Dados Financeiros')).props.onClick());
}
test('customer credit input can be cleared and saves a numeric limit with billed sales enabled',async()=>{
  let saved,closed=false;
  await open(async(id,updates)=>{saved={id,...updates};},()=>{closed=true;});
  const input=()=>renderer.root.findByProps({'aria-label':'Limite de crédito (R$)'});
  await act(async()=>input().props.onChange({target:{value:''}}));
  assert.equal(input().props.value,'');
  await act(async()=>input().props.onChange({target:{value:'1500.25'}}));
  await act(async()=>renderer.root.findByProps({'aria-label':'Permitir venda faturada'}).props.onChange({target:{value:'sim'}}));
  await act(async()=>renderer.root.findByType('form').props.onSubmit({preventDefault(){}}));
  assert.equal(saved.credit_limit,1500.25);
  assert.equal(saved.allow_credit,true);
  assert.equal(saved.branch_id,null);
  assert.equal(closed,true);
});
test('a failed customer credit save keeps the limit visible for retry and does not close the dialog',async()=>{
  let closed=false;
  await open(async()=>{throw new Error('Falha temporária');},()=>{closed=true;});
  await act(async()=>renderer.root.findByProps({'aria-label':'Limite de crédito (R$)'}).props.onChange({target:{value:'500'}}));
  await act(async()=>renderer.root.findByType('form').props.onSubmit({preventDefault(){}}));
  assert.equal(renderer.root.findByProps({'aria-label':'Limite de crédito (R$)'}).props.value,'500');
  assert.equal(closed,false);
  assert.ok(renderer.root.findAllByType('p').some(p=>p.children.includes('Falha temporária')));
});
