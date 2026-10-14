import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';
const require=createRequire(import.meta.url);
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
const cash={};vm.runInNewContext(compile(await readFile(new URL('../../src/lib/cashRegister.ts',import.meta.url),'utf8')),{exports:cash,Intl,Date});
const pdv={};vm.runInNewContext(compile(await readFile(new URL('../../src/lib/pdv.ts',import.meta.url),'utf8')),{exports:pdv,Error});
const source=compile(await readFile(new URL('../../src/components/partner/CashRegisterModule.tsx',import.meta.url),'utf8'));
let renderer;
afterEach(async()=>{if(renderer)await act(async()=>renderer.unmount());renderer=null;});
const ownerSession={id:randomUUID(),branch_id:'branch',actor_key:'owner',operator_name:'Proprietário',opened_at:new Date().toISOString(),closed_at:null,opening_amount:100};
const employeeSession={...ownerSession,id:randomUUID(),actor_key:'employee',operator_name:'Funcionário'};
const base={branchId:'branch',branchName:'Filial A',scopeKey:'owner:branch',sales:[],operatorId:null,operatorPin:null,salespeople:[]};
async function harness({snapshot={actor_key:'owner',sessions:[],movements:[],sales:[],can_manage:true},rpc,storage:providedStorage,props={}}={}){
 const values=new Map();const storage=providedStorage??{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const calls=[],listeners=new Map();
 const events={addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeEventListener(name,fn){listeners.get(name)?.delete(fn);},dispatchEvent(event){listeners.get(event.type)?.forEach(fn=>fn());}};
 const exports={};
 vm.runInNewContext(source,{exports,Error,Event,Date,crypto:{randomUUID},sessionStorage:storage,window:events,document:{...events,visibilityState:'visible'},require(name){
  if(name==='../../lib/supabase')return {supabase:{rpc:async(name,args)=>{calls.push({name,args});return rpc?.(name,args)??{data:snapshot,error:null};}}};
  if(name==='../../lib/cashRegister')return cash;
  if(name==='../../lib/pdv')return pdv;
  if(name==='../../utils')return {money:new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})};
  return require(name);
 }});
 let currentProps={...base,...props};
 function Consumer(){const [session,setSession]=React.useState(null);return React.createElement(exports.CashRegisterModule,{...currentProps,managedSessionId:session?.id??null,onManageSession:setSession});}
 await act(async()=>{renderer=TestRenderer.create(React.createElement(Consumer));});
 return {values,calls,events,update:async changes=>{currentProps={...currentProps,...changes};await act(async()=>renderer.update(React.createElement(Consumer)));}};
}
const rendered=()=>JSON.stringify(renderer.toJSON());
const button=text=>renderer.root.findAllByType('button').find(n=>n.children.includes(text));
const submit=form=>form.props.onSubmit({preventDefault(){}});

test('uncertain cash attempt is released only after definitive rejection and locked server reconciliation says absent',async()=>{
 let retry=false;
 const h=await harness({rpc:(name)=>name==='read_partner_cash_register'?undefined:name==='resolve_partner_cash_request'?{data:false,error:null}:{data:null,error:retry?{code:'P0001',message:'Já existe um caixa'}:{code:'08006',message:'Conexão perdida'}}});
 await act(async()=>submit(renderer.root.findByType('form')));assert.equal(h.values.size,1);
 assert.equal(button('Abrir caixa').props.disabled,true);
 retry=true;await act(async()=>button('Confirmar operação pendente').props.onClick());
 assert.equal(h.values.size,0);assert.match(rendered(),/pendência foi liberada/);
 assert.ok(h.calls.some(call=>call.name==='resolve_partner_cash_request'));
});

test('confirmed reconciliation clears pending without repeating the cash mutation with a new UUID',async()=>{
 let retry=false;
 const h=await harness({rpc:name=>name==='read_partner_cash_register'?undefined:name==='resolve_partner_cash_request'?{data:true,error:null}:{error:retry?{code:'P0001',message:'Rejeição'}:{code:'08006',message:'Conexão perdida'}}});
 await act(async()=>submit(renderer.root.findByType('form')));retry=true;
 await act(async()=>button('Confirmar operação pendente').props.onClick());
 assert.equal(h.values.size,0);assert.match(rendered(),/Caixa aberto/);
 const mutations=h.calls.filter(call=>call.name==='mutate_partner_cash_register');assert.equal(mutations.length,2);assert.equal(mutations[0].args.p_request_id,mutations[1].args.p_request_id);
});

test('reconciliation failure retains the UUID and blocks new operations',async()=>{
 const h=await harness({rpc:name=>name==='read_partner_cash_register'?undefined:name==='resolve_partner_cash_request'?{error:{message:'Conciliação indisponível'}}:{error:{code:'08006',message:'Conexão perdida'}}});
 await act(async()=>submit(renderer.root.findByType('form')));const stored=[...h.values.values()][0];
 await act(async()=>button('Confirmar operação pendente').props.onClick());
 assert.equal([...h.values.values()][0],stored);assert.equal(button('Abrir caixa').props.disabled,true);
});

test('all operation fields reset on branch change and a late old-context failure is ignored',async()=>{
 let complete;
 const h=await harness({snapshot:{actor_key:'owner',sessions:[ownerSession],movements:[],can_manage:true},rpc:name=>name==='mutate_partner_cash_register'?new Promise(resolve=>{complete=resolve;}):undefined});
 const movement=()=>renderer.root.findAllByType('form')[0];
 await act(async()=>{movement().findAllByType('input')[0].props.onChange({target:{value:'80'}});movement().findAllByType('input')[1].props.onChange({target:{value:'Retirada da filial A'}});});
 let pending;await act(async()=>{pending=submit(movement());});
 await h.update({branchId:'branch-b',scopeKey:'owner:branch-b',branchName:'Filial B'});
 assert.equal(movement().findAllByType('input')[0].props.value,'');assert.equal(movement().findAllByType('input')[1].props.value,'');
 await act(async()=>{complete({error:{code:'P0001',message:'Erro antigo da filial A'}});await pending;});
 assert.doesNotMatch(rendered(),/Erro antigo da filial A/);assert.equal(h.values.size,0);
});

test('cash refreshes after new sales and on activation, and inactive screen skips event reads',async()=>{
 const h=await harness({props:{isActive:false}});assert.equal(h.calls.length,0);
 await h.update({isActive:true});const first=h.calls.length;assert.ok(first>0);
 await h.update({sales:[{id:'new-sale'}]});assert.ok(h.calls.length>first);
 const beforeEvent=h.calls.length;await act(async()=>h.events.dispatchEvent(new Event('distrihub:cash-changed')));assert.ok(h.calls.length>beforeEvent);
 await h.update({isActive:false});const hidden=h.calls.length;await act(async()=>h.events.dispatchEvent(new Event('distrihub:cash-changed')));assert.equal(h.calls.length,hidden);
 await h.update({isActive:true});assert.ok(h.calls.length>hidden);
});

test('owner selects employee cash and closes using the supervised endpoint with the actual logged-in identity',async()=>{
 const h=await harness({snapshot:{actor_key:'owner',sessions:[employeeSession],movements:[],can_manage:true},rpc:name=>name==='supervised_mutate_partner_cash_register'?{data:employeeSession.id,error:null}:undefined});
 await act(async()=>renderer.root.findAllByType('select')[0].props.onChange({target:{value:employeeSession.id}}));
 const closing=renderer.root.findAllByType('form')[2];
 await act(async()=>closing.findAllByType('input')[0].props.onChange({target:{value:'100'}}));
 await act(async()=>submit(closing));
 const call=h.calls.find(call=>call.name==='supervised_mutate_partner_cash_register');
 assert.equal(call.args.p_session_id,employeeSession.id);assert.equal(call.args.p_salesperson_id,null);assert.equal(call.args.p_pin,null);
 assert.match(rendered(),/Caixa fechado/);
});

test('cash report shows employee sales returned by the cash RPC even if panel sales are empty',async()=>{
 const id=randomUUID();
 await harness({snapshot:{actor_key:'owner',sessions:[employeeSession],movements:[{id:randomUUID(),session_id:employeeSession.id,kind:'venda',payment_method:'pix',amount:50,sale_id:id,created_at:new Date().toISOString(),reason:'Venda'}],sales:[{id,sale_number:123,customer_name:'Cliente do funcionário',status:'concluida',total:50}],can_manage:true}});
 assert.match(rendered(),/Cliente do funcionário/);assert.match(rendered(),/123/);
});

test('storage access failure cannot leave cash locked in flight or send a financial request',async()=>{
 const h=await harness({storage:{getItem(){throw new Error('Armazenamento bloqueado');},setItem(){},removeItem(){}}});
 await act(async()=>submit(renderer.root.findByType('form')));
 assert.match(rendered(),/Armazenamento bloqueado/);assert.equal(h.calls.filter(call=>call.name==='mutate_partner_cash_register').length,0);
 assert.equal(button('Abrir caixa').props.disabled,false);
});
