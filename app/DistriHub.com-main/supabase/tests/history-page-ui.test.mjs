import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import TestRenderer, { act } from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';
const source=await readFile(new URL('../../src/components/partner/SalesHistoryModule.tsx',import.meta.url),'utf8');
async function harness(rpc,extra={}) {
 const timers=new Map();let timerId=0;const calls=[];const merged=[];
 const deps={react:React,'react/jsx-runtime':jsx,'lucide-react':new Proxy({},{get:()=>()=>null}),
  '../../lib/pdv':{saleChargeTotal:s=>s.total,salePaymentDescription:()=> 'PIX'},
  '../../lib/saleReturns':{saleReturnLabel:()=>'',saleItemDescription:()=>''},
  './SaleActionsMenu':{SaleActionsMenu:()=>null},'../../utils':{money:{format:v=>String(v)}},
  '../../lib/salePrint':{},'../../lib/saleShare':{},
  '../../lib/supabase':{supabase:{rpc:async(name,args)=>{calls.push({name,args});return rpc(args);}}}};
 const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>deps[name],setTimeout:callback=>{const id=++timerId;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id),Error});
 let props={companyId:'company',branchId:'branch',isActive:true,sales:[],customers:[],salespeople:[],segment:'distribuidor',onCancelSale:async()=>{},onDeleteSale:async()=>{},onPageLoaded:rows=>merged.push(...rows),...extra};
 let view;await act(async()=>{view=TestRenderer.create(React.createElement(exports.SalesHistoryModule,props));});
 return {view,calls,merged,async flush(){await act(async()=>{for(const [id,callback]of[...timers]){timers.delete(id);callback();}});},async update(change){props={...props,...change};await act(async()=>view.update(React.createElement(exports.SalesHistoryModule,props)));},async close(){await act(async()=>view.unmount());}};
}
const row=(index,branch='branch')=>({id:'sale-'+branch+'-'+index,user_id:'company',branch_id:branch,customer_name:branch,status:'concluida',created_at:new Date().toISOString(),total:10,items:[]});
const response=(sales,total,completed_total)=>({data:{sales,rmas:[],total,completed_total,page_size:25},error:null});
const text=view=>JSON.stringify(view.toJSON());
test('history displays full server totals across pages and resets pagination when filters change',async()=>{
 const h=await harness(args=>response(Array.from({length:args.p_page===2?5:25},(_,i)=>row(args.p_page*25+i)),55,550));try{
  await h.flush();assert.equal(h.calls[0].name,'read_partner_sales_history');assert.equal(h.calls[0].args.p_company_id,'company');assert.match(text(h.view),/550/);
  assert.equal(h.view.root.findAllByType('tbody')[0].findAllByType('tr').length,25);
  await act(async()=>h.view.root.findAllByType('button').find(b=>b.children.includes('Pr\u00f3xima')).props.onClick());await h.flush();assert.equal(h.calls.at(-1).args.p_page,1);assert.match(text(h.view),/550/);
  await act(async()=>h.view.root.findByProps({name:'sales-history-search'}).props.onChange({target:{value:'Joao'}}));await h.flush();assert.equal(h.calls.at(-1).args.p_page,0);assert.equal(h.calls.at(-1).args.p_search,'Joao');
 }finally{await h.close();}
});
test('hidden history performs no requests and a late response from the previous branch is ignored',async()=>{
 let resolveOld;const old=new Promise(resolve=>{resolveOld=resolve;});
 const h=await harness(args=>args.p_branch_id==='branch'?old:response([row(0,'new-branch')],1,200),{isActive:false});try{
  await h.flush();assert.equal(h.calls.length,0);
  await h.update({isActive:true});await h.flush();assert.equal(h.calls.length,1);
  await h.update({branchId:'new-branch'});await h.flush();assert.match(text(h.view),/200/);
  await act(async()=>resolveOld(response([row(0,'old-branch')],1,100)));
  assert.doesNotMatch(text(h.view),/old-branch/);assert.equal(h.merged.length,1);assert.equal(h.merged[0].branch_id,'new-branch');
 }finally{await h.close();}
});
test('history errors remain visible and do not announce an empty period as a confirmed result',async()=>{
 let failure=true;const h=await harness(()=>failure?{data:null,error:{message:'Unavailable'}}:response([row(0)],1,10));try{
  await h.flush();assert.match(text(h.view),/Unavailable/);assert.doesNotMatch(text(h.view),/vendas encontradas no per\u00edodo/);
  failure=false;await act(async()=>h.view.root.findAllByType('button').find(b=>b.children.includes('Tentar novamente')).props.onClick());await h.flush();assert.doesNotMatch(text(h.view),/Unavailable/);assert.equal(h.merged.length,1);
 }finally{await h.close();}
});
