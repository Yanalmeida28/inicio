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
const moduleSource=compile(await readFile(new URL('../../src/components/partner/ServiceOrdersModule.tsx',import.meta.url),'utf8'));
const detailSource=compile(await readFile(new URL('../../src/components/partner/ServiceOrderDetails.tsx',import.meta.url),'utf8'));
const service={};vm.runInNewContext(compile(await readFile(new URL('../../src/lib/serviceOrders.ts',import.meta.url),'utf8')),{exports:service,Error});
const attempt={};vm.runInNewContext(compile(await readFile(new URL('../../src/lib/operationAttempts.ts',import.meta.url),'utf8')),{exports:attempt,crypto:{randomUUID}});
const orderA={id:'order-a',user_id:'owner',branch_id:'branch-a',customer_id:'client-a',customer_name:'Cliente A',equipment_type:'Equipamento A',equipment_identification:'A',status:'em_andamento',approval_status:'aprovado',technician_name:'Técnico A',total:100};
const orderB={...orderA,id:'order-b',customer_id:'client-b',customer_name:'Cliente B',equipment_type:'Equipamento B',status:'aberta',approval_status:'aguardando_aprovacao',technician_name:''};
const props={userId:'owner',authUserId:'owner',segment:'assistencia',branches:[{id:'branch-a',name:'Filial A'},{id:'branch-b',name:'Filial B'}],selectedBranchId:'branch-a',customers:[],products:[]};
let view;afterEach(async()=>{if(view)await act(async()=>view.unmount());view=null;});
const rendered=()=>JSON.stringify(view.toJSON());
const button=text=>view.root.findAllByType('button').find(n=>n.children.some(child=>typeof child==='string'&&child.trim()===text));
const save=()=>view.root.findAllByType('button').find(n=>n.props.onClick?.name==='saveOrder');
async function harness({orders=[],read,rpc,invoice=null,blocked=false,values=new Map(),detail=null}={}){
 const calls=[],queries=[];let lastCreate;let storageBlocked=blocked;
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const win={};Object.defineProperty(win,'localStorage',{get(){if(storageBlocked)throw new Error('Armazenamento bloqueado');return storage;}});
 const client={rpc:async(name,args)=>{
  calls.push({name,args});if(name==='create_service_order_once')lastCreate=args;
  const result=rpc?.(name,args);if(result!==undefined)return result;
  return {data:name==='create_service_order_once'?args.p_request_id:{...orderA,id:args.p_order_id,user_id:'owner',customer_id:args.p_clear_customer?null:args.p_customer_id},error:null};
 },from(table){const args={table};const q={select(){return q;},eq(k,v){args[k]=v;return q;},order(){return q;},
  single(){return Promise.resolve({data:{...orderA,id:args.id,branch_id:lastCreate?.p_payload.branch_id??'branch-a'},error:null});},
  maybeSingle(){return Promise.resolve({data:invoice?{id:invoice}:null,error:null});},
  then(done,fail){queries.push({...args});const result=read?.(args)??{data:table==='service_orders'?orders:[],error:null};return Promise.resolve(result).then(done,fail);}};return q;
 },storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'photo'},error:null})})}};
 const drafts={'service-order:open':true,'service-order:equipment-type':'Celular','service-order:identification':'Inicial','service-order:checklist':{screen:true,touch:true,camera:true},'service-order:customer-acknowledged':true};
 const details={},module={};
 const load=name=>{
  if(name==='../../lib/supabase')return {supabase:client};
  if(name==='../../hooks/useSessionDraft')return {useSessionDraftState:(key,initial)=>React.useState(drafts[key]??initial)};
  if(name==='../../lib/serviceOrders')return service;
  if(name==='../../lib/operationAttempts')return {...attempt,pendingPhotos:async()=>[]};
  if(name==='./ServiceOrderDetails')return details;
  if(name==='../../utils')return {money:{format:String}};
  return require(name);
 };
 const globals={require:load,Date,Error,console,crypto:{randomUUID},window:win,URL:{createObjectURL:()=>'',revokeObjectURL(){}}};
 vm.runInNewContext(detailSource,{...globals,exports:details});vm.runInNewContext(moduleSource,{...globals,exports:module});
 let currentProps=detail?{order:detail,customers:[],onClose(){},onChanged(){}}:props;
 const Component=detail?details.ServiceOrderDetails:module.ServiceOrdersModule;
 await act(async()=>{view=TestRenderer.create(React.createElement(Component,currentProps));});
 return {calls,queries,values,unblock(){storageBlocked=false;},update:async changes=>{currentProps={...currentProps,...changes};await act(async()=>view.update(React.createElement(Component,currentProps)));}};
}

test('late branch list response is discarded and inactive module performs no new reads',async()=>{
 const pending=[];const h=await harness({read:args=>args.table==='service_orders'?new Promise(resolve=>pending.push({args,resolve})):undefined});
 await h.update({selectedBranchId:'branch-b'});assert.equal(pending.length,2);
 await act(async()=>pending[1].resolve({data:[{...orderB,branch_id:'branch-b'}],error:null}));
 await act(async()=>pending[0].resolve({data:[orderA],error:null}));assert.match(rendered(),/Cliente B/);assert.doesNotMatch(rendered(),/Cliente A/);
 await h.update({isActive:false});assert.equal(pending.length,2);
});
test('no branch selection shows no service orders and does not query across branches',async()=>{
 const h=await harness({orders:[orderA]});
 assert.match(rendered(),/Cliente A/);
 await h.update({selectedBranchId:null});
 assert.doesNotMatch(rendered(),/Cliente A/);
 assert.deepEqual(h.queries.filter(query=>query.table==='service_orders').map(query=>query.branch_id),['branch-a']);
});
test('list failure is visible, never announces confirmed empty data, and retry loads the orders',async()=>{
 let failed=true;const h=await harness({read:args=>args.table==='service_orders'?{data:failed?null:[orderA],error:failed?{message:'Falha de rede'}:null}:undefined});
 assert.match(rendered(),/Falha de rede/);assert.doesNotMatch(rendered(),/Nenhuma OS encontrada/);failed=false;
 await act(async()=>button('Tentar carregar OS novamente').props.onClick());assert.match(rendered(),/Cliente A/);assert.doesNotMatch(rendered(),/Falha de rede/);assert.equal(h.queries.length,2);
});
test('opening another OS resets every workflow field and sends only the new identity and values',async()=>{
 const h=await harness({detail:orderA});await h.update({order:orderB});
 await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
 const call=h.calls[0];assert.equal(call.name,'update_service_order_workflow_checked');assert.equal(call.args.p_order_id,'order-b');assert.equal(call.args.p_status,'aberta');assert.equal(call.args.p_approval,'aguardando_aprovacao');assert.equal(call.args.p_technician,'');assert.equal(call.args.p_customer_id,'client-b');
});
test('late workflow result does not change a newly opened OS or invoke its callback',async()=>{
 let complete;let changed=0;const h=await harness({detail:orderA,rpc:()=>new Promise(resolve=>{complete=resolve;})});await h.update({onChanged(){changed++;}});
 let request;await act(async()=>{request=view.root.findByType('form').props.onSubmit({preventDefault(){}});});await h.update({order:orderB});
 await act(async()=>{complete({data:orderA,error:null});await request;});assert.equal(changed,0);assert.doesNotMatch(rendered(),/Situação da OS salva/);assert.match(rendered(),/Equipamento B/);
});
test('billed OS locks customer selection; unfactored clearing sends the explicit flag',async()=>{
 const h=await harness({detail:orderA,invoice:'invoice-a'});assert.equal(view.root.findAllByType('select')[0].props.disabled,true);assert.match(rendered(),/OS faturada/);
 await h.update({order:orderB}); // Same invoice result remains billed; use a new instance for a genuinely unbilled order.
 await act(async()=>view.unmount());view=null;
 const clean=await harness({detail:orderA});await act(async()=>view.root.findAllByType('select')[0].props.onChange({target:{value:''}}));await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
 assert.equal(clean.calls[0].args.p_clear_customer,true);assert.equal(clean.calls[0].args.p_customer_id,null);
});
test('blocked browser storage releases the submission lock, preserves the form, and permits a safe retry',async()=>{
 const h=await harness({blocked:true});await act(async()=>save().props.onClick());assert.equal(save().props.disabled,false);assert.match(rendered(),/Armazenamento bloqueado/);assert.equal(h.calls.length,0);
 h.unblock();await act(async()=>save().props.onClick());assert.equal(h.calls.filter(c=>c.name==='create_service_order_once').length,1);assert.equal(h.values.size,0);
});

test('manual parts accept Brazilian prices, remain independent and reach the saved OS without a stock product',async()=>{
 const h=await harness();
 const change=async(label,value)=>act(async()=>view.root.findByProps({'aria-label':label}).props.onChange({target:{value}}));
 await change('Descrição da peça manual','Tela de terceiros');await change('Quantidade da peça manual','2');await change('Preço da peça manual','R$ 125,50');
 await act(async()=>button('Adicionar peça manual').props.onClick());
 await change('Descrição da peça manual','Conector externo');await change('Preço da peça manual','10,00');
 await act(async()=>button('Adicionar peça manual').props.onClick());
 assert.equal(view.root.findByProps({'aria-label':'Quantidade de Tela de terceiros'}).props.max,999);
 await change('Preço unitário de Tela de terceiros','130.50');
 assert.equal(view.root.findByProps({'aria-label':'Preço unitário de Conector externo'}).props.value,10);
 await act(async()=>save().props.onClick());
 const items=h.calls[0].args.p_payload.items;
 assert.equal(items.length,2);assert.equal(items[0].product_id,null);assert.equal(items[0].name,'Tela de terceiros');assert.equal(items[0].quantity,2);assert.equal(items[0].unit_price,130.5);
 assert.notEqual(items[0].manual_id,items[1].manual_id);
});

test('manual part removal does not remove other manual rows and unfinished or invalid values block saving',async()=>{
 const h=await harness();
 const change=async(label,value)=>act(async()=>view.root.findByProps({'aria-label':label}).props.onChange({target:{value}}));
 await change('Descrição da peça manual','Primeira');await change('Preço da peça manual','10,00');
 await act(async()=>save().props.onClick());assert.equal(h.calls.length,0);
 await act(async()=>button('Adicionar peça manual').props.onClick());
 await change('Descrição da peça manual','Segunda');await change('Preço da peça manual','-1');
 await act(async()=>button('Adicionar peça manual').props.onClick());assert.equal(view.root.findAllByProps({'aria-label':'Quantidade de Segunda'}).length,0);
 await change('Preço da peça manual','20');await act(async()=>button('Adicionar peça manual').props.onClick());
 await act(async()=>view.root.findByProps({'aria-label':'Remover Primeira'}).props.onClick());
 assert.equal(view.root.findAllByProps({'aria-label':'Quantidade de Primeira'}).length,0);assert.equal(view.root.findAllByProps({'aria-label':'Quantidade de Segunda'}).length,1);
 await act(async()=>save().props.onClick());assert.equal(h.calls[0].args.p_payload.items.length,1);assert.equal(h.calls[0].args.p_payload.items[0].name,'Segunda');
});

test('manual piece description and request identity survive a lost creation reply and remount',async()=>{
 const values=new Map();const h=await harness({values,rpc:(name)=>name==='create_service_order_once'?{error:{code:'08006',message:'Resposta perdida'}}:undefined});
 for(const [label,value] of [['Descrição da peça manual','Peça comprada'],['Preço da peça manual','1.234,56']])await act(async()=>view.root.findByProps({'aria-label':label}).props.onChange({target:{value}}));
 await act(async()=>button('Adicionar peça manual').props.onClick());await act(async()=>save().props.onClick());
 const original=h.calls[0].args;
 await act(async()=>view.unmount());view=null;
 const recovered=await harness({values});
 assert.equal(view.root.findByProps({'aria-label':'Preço unitário de Peça comprada'}).props.value,1234.56);
 await act(async()=>save().props.onClick());
 assert.equal(recovered.calls[0].args.p_request_id,original.p_request_id);assert.equal(JSON.stringify(recovered.calls[0].args.p_payload),JSON.stringify(original.p_payload));
});
test('creation locks the whole form synchronously, sends once, and uses the original immutable payload',async()=>{
 let complete;const h=await harness({rpc:(name,args)=>name==='create_service_order_once'?new Promise(resolve=>{complete=()=>resolve({data:args.p_request_id,error:null});}):undefined});
 const start=save().props.onClick;let request;await act(async()=>{request=start();start();});
 assert.equal(view.root.findByType('fieldset').props.disabled,true);assert.equal(h.calls.length,1);assert.equal(h.calls[0].args.p_payload.identification,'Inicial');
 await act(async()=>{complete();await request;});assert.equal(h.values.size,0);assert.match(rendered(),/Cliente A/);
});
test('uncertain creation retains the same ID and retries once without changing its payload',async()=>{
 let fail=true;const h=await harness({rpc:(name,args)=>name==='create_service_order_once'?(fail?{error:{code:'08006',message:'Conexão perdida'}}:{data:args.p_request_id,error:null}):undefined});
 await act(async()=>save().props.onClick());assert.equal(h.values.size,1);assert.match(rendered(),/Conexão perdida/);
 fail=false;await act(async()=>save().props.onClick());assert.equal(h.calls.length,2);assert.equal(h.calls[0].args.p_request_id,h.calls[1].args.p_request_id);assert.equal(JSON.stringify(h.calls[0].args.p_payload),JSON.stringify(h.calls[1].args.p_payload));assert.equal(h.values.size,0);
});
test('malformed pending storage is preserved for reconciliation and never creates an untracked OS',async()=>{
 const values=new Map([['distrihub-operation:owner:owner:branch-a:service-order','{invalid']]);const h=await harness({values});await act(async()=>save().props.onClick());assert.equal(h.calls.length,0);assert.equal(values.size,1);assert.equal(save().props.disabled,false);
});
