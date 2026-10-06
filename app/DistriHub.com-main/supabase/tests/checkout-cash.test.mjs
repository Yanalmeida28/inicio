import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import TestRenderer, { act } from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';

async function compile(file, requires={}) {
  const mod={exports:{}};
  vm.runInNewContext(ts.transpileModule(await readFile(new URL(file,import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020},
  }).outputText,{exports:mod.exports,require:name=>requires[name] ?? {},window:{addEventListener(){},removeEventListener(){}},document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},Error});
  return mod.exports;
}
const helpers=await compile('../../src/lib/checkoutCash.ts');
const managerSession={id:'manager-session',branch_id:'branch',actor_key:'manager',operator_id:'manager',operator_name:'Gerente',closed_at:null};
const ownerSession={...managerSession,id:'owner-session',actor_key:'owner',operator_id:null,operator_name:'Proprietário'};

test('cash belongs to the resolved operator and branch, even when owner can read the manager report',()=>{
  const result=helpers.checkoutCash({actor_key:'owner',sessions:[managerSession,{...ownerSession,branch_id:'other'}, {...ownerSession,closed_at:'yesterday'}]},'branch');
  assert.equal(result.current,null);
  assert.equal(result.others[0].id,'manager-session');
  assert.match(helpers.closedCashMessage('Proprietário',result.others.map(s=>s.operator_name)),/Gerente/);
  assert.equal(helpers.checkoutCash({actor_key:'manager',sessions:[managerSession,ownerSession]},'branch').current.id,'manager-session');
});

test('operator selection survives a reload, is isolated by account and never stores a PIN',()=>{
  const values=new Map();
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  new helpers.OperatorSelectionStore(storage,'account').save({branchId:'branch',operatorId:'manager',operatorPin:'9876'});
  const restored=new helpers.OperatorSelectionStore(storage,'account').read();
  assert.equal(restored.branchId,'branch');assert.equal(restored.operatorId,'manager');
  assert.equal(new helpers.OperatorSelectionStore(storage,'other').read(),null);
  assert.ok(![...values.values()].join('').includes('9876'));
  new helpers.OperatorSelectionStore(storage,'account').save({branchId:'branch',operatorId:null});
  assert.equal(new helpers.OperatorSelectionStore(storage,'account').read().operatorId,null);
});

test('checkout rechecks the real open session and cannot use another operator cash',async()=>{
  let data={actor_key:'owner',sessions:[managerSession]};
  const calls=[];
  const hook=await compile('../../src/hooks/useCheckoutCash.ts',{
    react:React,'../lib/supabase':{supabase:{rpc:async(name,args)=>{calls.push({name,args});return {data,error:null};}}},
    '../lib/checkoutCash':helpers,'../lib/pdv':{pdvErrorMessage:error=>error.message},
  });
  let api;
  function Consumer(){api=hook.useCheckoutCash('branch',null,null,'Proprietário','owner');return React.createElement('div',null,api.message);}
  let view;
  await act(async()=>{view=TestRenderer.create(React.createElement(Consumer));});
  try {
    assert.equal(api.status,'closed');
    await act(async()=>{await assert.rejects(api.assertOpen(),/caixa de Proprietário.*Gerente/);});
    data={actor_key:'owner',sessions:[managerSession,ownerSession]};
    await act(async()=>api.assertOpen());assert.equal(api.status,'open');
    data={actor_key:'owner',sessions:[{...ownerSession,closed_at:'now'}]};
    await act(async()=>{await assert.rejects(api.assertOpen(),/não está aberto/);});
    assert.ok(calls.every(call=>call.args.p_salesperson_id===null && call.args.p_branch_id==='branch'));
  } finally {act(()=>view.unmount());}
});

test('a restored owner-selected operator requires a fresh PIN before reading or selling',async()=>{
  let calls=0;
  const hook=await compile('../../src/hooks/useCheckoutCash.ts',{
    react:React,'../lib/supabase':{supabase:{rpc:async()=>{calls++;return {data:null,error:null};}}},
    '../lib/checkoutCash':helpers,'../lib/pdv':{pdvErrorMessage:error=>error.message},
  });
  let api;
  function Consumer(){api=hook.useCheckoutCash('branch','manager',null,'Gerente','owner');return React.createElement('div',null,api.message);}
  let view;
  await act(async()=>{view=TestRenderer.create(React.createElement(Consumer));});
  try {assert.equal(api.status,'authorize');await act(async()=>{await assert.rejects(api.assertOpen(),/Confirme o PIN/);});assert.equal(calls,0);}
  finally {act(()=>view.unmount());}
});
