import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';
import {pdvHelpers} from './fixtures/pdv_helpers.mjs';
const require=createRequire(import.meta.url);
const source=await readFile(new URL('../../src/components/partner/DeliveryModule.tsx',import.meta.url),'utf8');
const attemptSource=await readFile(new URL('../../src/lib/operationAttempts.ts',import.meta.url),'utf8');
const transpile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
function harness(){
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const attemptExports={};vm.runInNewContext(transpile(attemptSource),{exports:attemptExports,crypto:{randomUUID}});
 const state={sales:[],drivers:[{id:'driver',name:'Motorista',role:'logistica',active:true}],loading:false,error:'',reload:async()=>{},accept:row=>{state.sales=state.sales.map(s=>s.id===row.id?row:s);}};
 const exports={};vm.runInNewContext(transpile(source),{exports,Error,window:{sessionStorage:storage},require:name=>name==='../../hooks/useDeliveries'?{useDeliveries:()=>state}:name==='../../lib/operationAttempts'?attemptExports:name==='../../lib/pdv'?pdvHelpers:name==='../../utils'?{money:new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})}:require(name)});
 const row={id:'sale',user_id:'company',branch_id:'branch',sale_number:42,customer_name:'Maria',items:[],total:100,delivery_type:'entrega',status:'concluida',delivery_status:'pendente',delivery_revision:3,delivery_address:'Rua A 123',delivery_driver_id:'driver'};
 state.sales=[row];const props={companyId:'company',operatorKey:'owner',selectedBranchId:'branch',currentRole:'administrador',sales:[],salespeople:[],onUpdateDelivery:async()=>({...row,delivery_revision:4,delivery_status:'em_rota'})};
 return {Component:exports.DeliveryModule,state,row,props,values};
}
const buttons=(r,text)=>r.root.findAllByType('button').filter(n=>n.children.join('')===text);
test('entregas mostram e buscam número comercial e excluem pré-venda',async()=>{
 const h=harness();h.state.sales.push({...h.row,id:'quote',sale_number:99,status:'pre_venda'});let r;
 await act(async()=>{r=TestRenderer.create(React.createElement(h.Component,h.props));});
 assert.match(JSON.stringify(r.toJSON()),/000042/);assert.doesNotMatch(JSON.stringify(r.toJSON()),/000099/);
 await act(async()=>r.root.findByProps({'aria-label':'Buscar entrega'}).props.onChange({target:{value:'000042'}}));assert.equal(buttons(r,'Detalhes').length,1);
 await act(async()=>r.unmount());
});
test('trocar filial ou operador fecha rascunho e resposta anterior não altera novo contexto',async()=>{
 const h=harness();let finish;h.props.onUpdateDelivery=()=>new Promise(resolve=>finish=resolve);let r;
 await act(async()=>{r=TestRenderer.create(React.createElement(h.Component,h.props));});
 await act(async()=>buttons(r,'Detalhes')[0].props.onClick());assert.equal(r.root.findAllByType('form').length,1);
 await act(async()=>r.update(React.createElement(h.Component,{...h.props,selectedBranchId:'other'})));assert.equal(r.root.findAllByType('form').length,0);
 await act(async()=>r.update(React.createElement(h.Component,h.props)));
 act(()=>{void r.root.findByProps({title:'Marcar Em Rota'}).props.onClick();});
 await act(async()=>r.update(React.createElement(h.Component,{...h.props,operatorKey:'manager'})));
 await act(async()=>finish({...h.row,delivery_revision:4}));assert.equal(r.root.findAllByType('form').length,0);assert.equal(h.state.sales[0].delivery_revision,3);
 await act(async()=>r.unmount());
});
test('rascunho envia somente campos alterados e revisão capturada ao abrir',async()=>{
 const h=harness();const calls=[];h.props.onUpdateDelivery=async(...args)=>{calls.push(args);return {...h.row,delivery_revision:5};};let r;
 await act(async()=>{r=TestRenderer.create(React.createElement(h.Component,h.props));});await act(async()=>buttons(r,'Detalhes')[0].props.onClick());
 h.state.sales=[{...h.row,delivery_revision:4,delivery_driver_id:'new-driver'}];await act(async()=>r.update(React.createElement(h.Component,{...h.props})));
 await act(async()=>r.root.findByType('textarea').props.onChange({target:{value:'Observação'}}));await act(async()=>r.root.findByType('form').props.onSubmit({preventDefault(){}}));
 assert.equal(calls[0][4].expectedRevision,3);assert.deepEqual(JSON.parse(JSON.stringify(calls[0][4].patch)),{notes:'Observação'});
 await act(async()=>r.unmount());
});
test('falha de conexão preserva UUID e dados exatos para repetir após remontar',async()=>{
 const h=harness(),calls=[];let fail=true;h.props.onUpdateDelivery=async(...args)=>{calls.push(args);if(fail)throw new Error('Conexão interrompida');return {...h.row,delivery_revision:4};};let r;
 await act(async()=>{r=TestRenderer.create(React.createElement(h.Component,h.props));});await act(async()=>r.root.findByProps({title:'Marcar Em Rota'}).props.onClick());
 assert.equal(h.values.size,1);assert.equal(r.root.findByProps({title:'Marcar Em Rota'}).props.disabled,true);await act(async()=>r.unmount());
 fail=false;await act(async()=>{r=TestRenderer.create(React.createElement(h.Component,h.props));});await act(async()=>buttons(r,'Repetir ação pendente')[0].props.onClick());
 assert.equal(calls[0][4].requestId,calls[1][4].requestId);assert.equal(JSON.stringify(calls[0][4]),JSON.stringify(calls[1][4]));assert.equal(h.values.size,0);await act(async()=>r.unmount());
});
test('logística não altera endereço/entregador e tela inativa fecha modal',async()=>{
 const h=harness();h.props.currentRole='logistica';let r;await act(async()=>{r=TestRenderer.create(React.createElement(h.Component,h.props));});
 assert.equal(r.root.findByProps({className:'inline-input'}).props.disabled,true);await act(async()=>buttons(r,'Detalhes')[0].props.onClick());assert.equal(r.root.findAllByType('input').filter(n=>n.props.readOnly).length,2);
 await act(async()=>r.update(React.createElement(h.Component,{...h.props,isActive:false})));assert.equal(r.root.findAllByType('form').length,0);await act(async()=>r.unmount());
});
test('endereço ou motorista ausente abre formulário antes de solicitar saída',async()=>{
 const h=harness();h.state.sales=[{...h.row,delivery_address:'',delivery_driver_id:null}];let called=0;h.props.onUpdateDelivery=async()=>{called++;};let r;
 await act(async()=>{r=TestRenderer.create(React.createElement(h.Component,h.props));});await act(async()=>r.root.findByProps({title:'Marcar Em Rota'}).props.onClick());assert.equal(called,0);assert.equal(r.root.findAllByType('form').length,1);await act(async()=>r.unmount());
});
