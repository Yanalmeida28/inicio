import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';
const source=ts.transpileModule(await readFile(new URL('../../src/hooks/useDeliveries.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
test('delivery reader consumes all pages, retains confirmed revision, stops hidden and rejects foreign company',async()=>{
 const calls=[],timers=new Set();let foreign=false,current,finish;
 const client={rpc:async(name,args)=>{calls.push([name,args]);if(finish==='wait')return new Promise(resolve=>finish=resolve);return {data:{company_id:foreign?'other':'company',sales:[{id:args.p_after?'two':'one',user_id:'company',delivery_revision:0}],drivers:[],next_cursor:args.p_after?null:'one'},error:null};}};
 const exports={};vm.runInNewContext(source,{exports,Error,window:{setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>timers.delete(fn)},require:name=>name==='react'?React:{supabase:client}});
 function Probe({active=true}){current=exports.useDeliveries('company','branch','operator','1234',active);return null;}
 let r;await act(async()=>{r=TestRenderer.create(React.createElement(Probe));});assert.equal(current.sales.length,2);assert.equal(calls[1][1].p_after,'one');
 await act(async()=>{current.accept({id:'one',user_id:'company',delivery_revision:5});await current.reload();});assert.equal(current.sales[0].delivery_revision,5);
 finish='wait';let pending;act(()=>{pending=current.reload();});await act(async()=>r.update(React.createElement(Probe,{active:false})));assert.equal(timers.size,0);
 await act(async()=>{finish({data:{company_id:'company',sales:[{id:'late',user_id:'company',delivery_revision:0}],drivers:[],next_cursor:null},error:null});await pending;});assert.equal(current.sales[0].id,'one');
 finish=null;foreign=true;await act(async()=>r.update(React.createElement(Probe,{active:true})));assert.match(current.error,/inválida/);assert.equal(current.sales[0].id,'one');await act(async()=>r.unmount());
});
