import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../../src/hooks/usePartnerData.ts',import.meta.url),'utf8');
const helperSource = await readFile(new URL('../../src/lib/pdv.ts',import.meta.url),'utf8');
const syncSource = await readFile(new URL('../../src/lib/partnerSync.ts',import.meta.url),'utf8');
const compile = source => ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
let renderer;
afterEach(async()=>{if(renderer) await act(async()=>renderer.unmount());renderer=null;});
async function harness({initialSales=[],initialInvoices=[],initialCustomers=[],rpc,values=new Map(),readResult,branchId=null,identity: suppliedIdentity}={}) {
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const identity=suppliedIdentity??{authUserId:'owner',companyUserId:'owner',salespersonId:null,branchId:null,role:'administrador'};
  const initial={partner_sales:initialSales,partner_invoices:initialInvoices,partner_customers:initialCustomers};
  const channels=[];
  const intervals=[];
  const timeouts=new Map();
  let timerId=0;
  const client={rpc,auth:{getSession:async()=>({data:{session:{user:{id:identity.authUserId}}},error:null})},from(table){
    const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},range(){return q;},
      maybeSingle(){return Promise.resolve({data:null,error:null});},
      then(resolve,reject){const fallback={data:[...(initial[table]??[])],error:null};return Promise.resolve(readResult?.(table,fallback)??fallback).then(resolve,reject);}};
    return q;
  },channel(name){const channel={name,handlers:[],on(event,filter,handler){channel.handlers.push({filter,handler});return channel;},subscribe(callback){channel.status=callback;return channel;}};channels.push(channel);return channel;},removeChannel(channel){channel.removed=true;return Promise.resolve('ok');}};
  const helperModule={exports:{}};
  vm.runInNewContext(compile(helperSource),{exports:helperModule.exports,require});
  const syncModule={exports:{}};
  vm.runInNewContext(compile(syncSource),{exports:syncModule.exports});
  const hookModule={exports:{}};
  vm.runInNewContext(compile(source),{
    exports:hookModule.exports,sessionStorage:storage,crypto:{randomUUID},console,
    window:{addEventListener(){},removeEventListener(){},setInterval(callback){intervals.push(callback);return intervals.length;},clearInterval(){},setTimeout(callback){const id=++timerId;timeouts.set(id,callback);return id;},clearTimeout(id){timeouts.delete(id);}},
    navigator:{onLine:true},
    document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},
    require(name){
      if(name==='react')return React;
      if(name==='../lib/supabase')return {supabase:client,isSupabaseConfigured:true};
      if(name==='../lib/pdv')return helperModule.exports;
      if(name==='../lib/partnerSync')return syncModule.exports;
      throw new Error('Unexpected import '+name);
    },
  });
  let current;
  function Probe(){current=hookModule.exports.usePartnerData(identity,branchId);return null;}
  await act(async()=>{renderer=TestRenderer.create(React.createElement(Probe));});
  return {get current(){return current;},values,
    emit(table,eventType,record,old={}){for(const channel of channels.filter(channel=>!channel.removed))for(const {filter,handler} of channel.handlers)if(filter.table===table&&filter.event===eventType)handler({eventType,new:record,old});},
    status(status){channels.findLast(channel=>channel.name.startsWith('partner-sync-')&&!channel.removed)?.status?.(status);},
    tick(){for(const callback of intervals)callback();},
    flushTimers(){for(const [id,callback] of [...timeouts]){timeouts.delete(id);callback();}},
  };
}
const payload=()=>({customer_id:'customer',customer_name:'Cliente',items:[{product_id:'physical',name:'Produto',quantity:1,unit_price:100}],total:100,branch_id:'branch',salesperson_id:null,customer_type:'varejo',delivery_type:'balcao',payment_method:'pix'});
const snapshot=(overrides={})=>({credits:[{customer_id:'customer',allow_credit:true,credit_limit:1000,used:0,available:1000}],products:[],movements:[],sales:[],invoices:[],...overrides});

test('shared customer credit updates use the selected branch context without changing the shared customer',async()=>{
  let request;
  const h=await harness({branchId:'branch',initialCustomers:[{id:'customer',user_id:'owner',name:'Cliente',branch_id:null,credit_limit:0,allow_credit:false}],rpc:async(name,args)=>{request={name,...args};return {data:'customer',error:null};}});
  await act(async()=>{await h.current.updateCustomer('customer',{credit_limit:500,allow_credit:true});});
  assert.equal(request.p_branch_id,'branch');
  assert.equal(request.p_credit_limit,500);
  assert.equal(request.p_allow_credit,true);
  assert.equal(h.current.customers.find(c=>c.id==='customer').branch_id,null);
});

test('customer credit updates retain the customer branch when another branch is selected',async()=>{
  let request;
  const h=await harness({branchId:'selected-branch',initialCustomers:[{id:'customer',user_id:'owner',name:'Cliente',branch_id:'customer-branch',credit_limit:0,allow_credit:false}],rpc:async(name,args)=>{request=args;return {data:'customer',error:null};}});
  await act(async()=>{await h.current.updateCustomer('customer',{credit_limit:200});});
  assert.equal(request.p_branch_id,'customer-branch');
});

test('a delayed full refresh cannot reopen a sale after a newer PDV snapshot',async()=>{
  const pre={...payload(),id:'pre',user_id:'owner',status:'pre_venda'};
  let delayed=false,release,reached;
  const waiting=new Promise(resolve=>{reached=resolve;});
  const h=await harness({initialSales:[pre],readResult(table,fallback){
    if(delayed&&table==='partner_suppliers')return new Promise(resolve=>{release=()=>resolve(fallback);reached();});
  },rpc:async()=>({data:snapshot({sales:[{...pre,status:'concluida'}]}),error:null})});
  delayed=true;
  await act(async()=>{
    const refresh=h.current.synchronize();await waiting;
    await h.current.refreshPdv('branch');
    release();await refresh;
  });
  assert.equal(h.current.sales[0].status,'concluida');
});

test('a failed secondary query preserves its collection while still updating sales',async()=>{
  const pre={...payload(),id:'pre',user_id:'owner',status:'pre_venda'};
  const rows=[pre];let fail=false;
  const h=await harness({initialSales:rows,initialInvoices:[{id:'invoice',branch_id:'branch',amount:100}],readResult(table){
    if(fail&&table==='partner_invoices')return {data:null,error:{message:'Invoice read failed'}};
  }});
  rows[0]={...pre,status:'concluida'};fail=true;
  await act(async()=>h.current.synchronize());
  assert.equal(h.current.sales[0].status,'concluida');
  assert.equal(h.current.invoices[0].id,'invoice');
  assert.equal(h.current.error,null);
  assert.match(h.current.syncError,/preservados/);
});

test('a local checkout supersedes an older pending PDV read',async()=>{
  const pre={...payload(),id:'pre',user_id:'owner',status:'pre_venda'};
  let calls=0,release;
  const h=await harness({initialSales:[pre],rpc:async(name,args)=>{
    if(name==='execute_partner_sale_mutation')return {data:args.p_sale_id,error:null};
    if(++calls===1)return new Promise(resolve=>{release=()=>resolve({data:snapshot({sales:[pre]}),error:null});});
    return {data:snapshot({sales:[{...pre,status:'concluida'}]}),error:null};
  }});
  await act(async()=>{
    const old=h.current.refreshPdv('branch');
    await h.current.finalizePreSale('pre','pix');
    release();await old;
  });
  assert.equal(h.current.sales[0].status,'concluida');
});

test('Realtime updates one authorized row and healthy subscriptions avoid historical polling',async()=>{
  const pre={...payload(),id:'pre',user_id:'owner',status:'pre_venda'};let calls=0;
  const h=await harness({initialSales:[pre],branchId:'branch',rpc:async()=>{calls++;return {data:snapshot({sales:[pre]}),error:null};}});
  await act(async()=>{h.status('SUBSCRIBED');h.flushTimers();});
  assert.equal(calls,1);
  await act(async()=>{h.tick();h.flushTimers();});
  assert.equal(calls,1);
  act(()=>h.emit('partner_sales','UPDATE',{...pre,status:'concluida'}));
  assert.equal(h.current.sales[0].status,'concluida');
  act(()=>h.emit('partner_sales','UPDATE',pre));
  assert.equal(h.current.sales[0].status,'concluida');
  act(()=>h.emit('partner_sales','UPDATE',{...pre,user_id:'foreign',status:'cancelada'}));
  assert.equal(h.current.sales[0].status,'concluida');
  act(()=>h.emit('partner_sales','UPDATE',{...pre,branch_id:'other',status:'cancelada'}));
  assert.equal(h.current.sales[0].status,'concluida');
  await act(async()=>{h.status('CHANNEL_ERROR');h.tick();h.flushTimers();});
  assert.equal(calls,2);
});

test('Realtime supersedes a delayed full snapshot and deletes only known scoped rows',async()=>{
  const pre={...payload(),id:'pre',user_id:'owner',status:'pre_venda'};
  let delayed=false,release,reached;
  const waiting=new Promise(resolve=>{reached=resolve;});
  const h=await harness({initialSales:[pre],branchId:'branch',readResult(table,fallback){
    if(delayed&&table==='service_order_photos')return new Promise(resolve=>{release=()=>resolve(fallback);reached();});
  }});
  delayed=true;
  await act(async()=>{
    const refresh=h.current.synchronize();await waiting;
    h.emit('partner_sales','UPDATE',{...pre,status:'concluida'});
    release();await refresh;
  });
  assert.equal(h.current.sales[0].status,'concluida');
  act(()=>h.emit('partner_sales','DELETE',{}, {id:'unknown'}));
  assert.equal(h.current.sales.length,1);
  act(()=>h.emit('partner_sales','DELETE',{}, {id:'pre'}));
  assert.equal(h.current.sales.length,0);
});

test('employee sessions retain authorized branch reconciliation when RLS filters Realtime records',async()=>{
  let calls=0;
  const h=await harness({branchId:'branch',identity:{authUserId:'worker',companyUserId:'owner',salespersonId:'worker-id',branchId:'branch',role:'caixa'},rpc:async(name,args)=>{
    assert.equal(name,'get_partner_pdv_snapshot');assert.equal(args.p_branch_id,'branch');calls++;
    return {data:snapshot(),error:null};
  }});
  await act(async()=>{h.status('SUBSCRIBED');h.flushTimers();});
  assert.equal(calls,1);
  await act(async()=>{h.tick();h.flushTimers();});
  assert.equal(calls,2);
  await act(async()=>h.current.synchronize());
  assert.equal(calls,3);
});

test('background synchronization updates a sale completed on another device without loading the panel', async()=>{
  const sales=[{id:'sale',branch_id:'branch',status:'pre_venda',items:[],total:100}];
  const h=await harness({initialSales:sales});
  assert.equal(h.current.sales[0].status,'pre_venda');
  sales[0]={...sales[0],status:'concluida'};
  let syncing;
  await act(async()=>{
    syncing=h.current.synchronize();
    assert.equal(h.current.loading,false);
    await syncing;
  });
  assert.equal(h.current.sales[0].status,'concluida');
  assert.equal(h.current.syncing,false);
  assert.equal(h.current.syncError,null);
  assert.ok(h.current.lastSyncedAt);
});

test('editing pre-sale retains its ID and metadata while replacing items and total',async()=>{
  const original={...payload(),id:'existing-order',user_id:'owner',status:'pre_venda',origin:'pdv',payment_method:null,imei:'trace',serial_number:null};
  const items=[{...original.items[0],quantity:3}];
  let mutation;
  const h=await harness({initialSales:[original],rpc:async(name,args)=>{
    if(name==='execute_partner_sale_mutation') {mutation=args; return {data:args.p_sale_id,error:null};}
    return {data:snapshot({sales:[{...original,items,total:300}]}),error:null};
  }});
  await act(async()=>{await h.current.updatePreSaleItems(original.id,items);});
  assert.equal(mutation.p_sale_id,original.id);
  assert.equal(mutation.p_total,300);
  assert.equal(mutation.p_status,'pre_venda');
  assert.equal(mutation.p_imei,'trace');
  assert.deepEqual(mutation.p_items,items);
  assert.equal(h.current.sales.length,1);
  assert.equal(h.current.sales[0].total,300);
  await act(async()=>{await assert.rejects(h.current.updatePreSaleItems(original.id,[]),/pelo menos um/);});
});

test('receipt frontend declares exact remaining cents for full payment',async()=>{
  let received;
  const h=await harness({initialInvoices:[{id:'invoice',user_id:'owner',amount:0.3,paid_amount:0.1,status:'parcial'}],rpc:async(name,args)=>{
    assert.equal(name,'record_partner_invoice_payment');received=args.p_amount;
    return {data:args.p_invoice_id,error:null};
  }});
  await act(async()=>{await h.current.payInvoice('invoice');});
  assert.equal(received,0.2);
});

test('pre-sale uncertain response survives remount and reuses UUID and payload without credentials',async()=>{
  const requests=[];let fail=true;
  const rpc=async(name,args)=>{
    if(name!=='execute_partner_sale_mutation') return {data:snapshot(),error:null};
    requests.push(args);
    return fail ? {data:null,error:{message:'Lost response'}} : {data:args.p_sale_id,error:null};
  };
  let h=await harness({rpc});
  await act(async()=>{await assert.rejects(h.current.createPreSale({...payload(),jwt:'synthetic-secret'},null,'synthetic-pin'),/mesmo ID/);});
  const values=h.values;
  assert.ok(![...values.values()].join('').includes('synthetic-'));
  await act(async()=>renderer.unmount());renderer=null;
  h=await harness({rpc,values});
  await act(async()=>{await assert.rejects(h.current.createPreSale({...payload(),total:101}),/resultado pendente/);});
  assert.equal(requests.length,1);
  fail=false;
  await act(async()=>{await h.current.createPreSale(payload());});
  assert.equal(requests[1].p_sale_id,requests[0].p_sale_id);
  assert.equal(JSON.stringify(requests[1].p_items),JSON.stringify(requests[0].p_items));
  assert.equal(requests[1].p_status,'pre_venda');
  assert.equal(h.values.size,0);
  await act(async()=>{await h.current.createPreSale(payload());});
  assert.notEqual(requests[2].p_sale_id,requests[0].p_sale_id);
});

test('pre-sale definitive first rejection releases attempt; uncertain retry rejection retains it',async()=>{
  let error={code:'P0001',message:'Invalid price'};
  const h=await harness({rpc:async()=>({data:null,error})});
  await act(async()=>{await assert.rejects(h.current.createPreSale(payload()),/Invalid price/);});
  assert.equal(h.values.size,0);
  error={code:'08006',message:'Connection lost'};
  await act(async()=>{await assert.rejects(h.current.createPreSale(payload()),/mesmo ID/);});
  const saved=[...h.values.values()][0];
  error={code:'P0001',message:'Invalid price'};
  await act(async()=>{await assert.rejects(h.current.createPreSale(payload()),/mesmo ID/);});
  assert.equal([...h.values.values()][0],saved);
});

test('pre-sale double submission is blocked and recovery retains pre-sale status',async()=>{
  let release;const requests=[];
  const h=await harness({rpc:async(name,args)=>{
    if(name!=='execute_partner_sale_mutation')return {data:snapshot(),error:null};
    requests.push(args);
    if(requests.length===1) {await new Promise(resolve=>{release=resolve;});return {data:null,error:{message:'Lost response'}};}
    return {data:args.p_sale_id,error:null};
  }});
  await act(async()=>{
    const first=assert.rejects(h.current.createPreSale(payload()),/mesmo ID/);
    await assert.rejects(h.current.createPreSale(payload()),/Aguarde/);
    release();await first;
  });
  await act(async()=>{await h.current.retryPendingSale();});
  assert.equal(requests.length,2);
  assert.equal(requests[0].p_sale_id,requests[1].p_sale_id);
  assert.equal(requests[1].p_status,'pre_venda');
  assert.equal(requests[1].p_payment_method,'pix');
  assert.equal(h.values.size,0);
});

test('confirmed RPC + failed reconciliation resolves success and does not retain a retry',async()=>{
  let writes=0;
  const h=await harness({rpc:async(name,args)=>{
    if(name==='execute_partner_sale_mutation'){writes++;return {data:args.p_sale_id,error:null};}
    return {data:null,error:{message:'Network unavailable'}};
  }});
  let saved;
  await act(async()=>{saved=await h.current.createSale(payload());});
  assert.equal(writes,1);assert.equal(h.current.sales[0].id,saved.id);
  assert.equal(h.current.pendingSale,null);assert.equal(h.values.size,0);
  assert.match(h.current.pdvSyncWarning,/Operação confirmada/);
});
test('lost mutation response keeps ID; changed cart is blocked; recovery reuses ID',async()=>{
  const ids=[];let fail=true;
  const h=await harness({rpc:async(name,args)=>{
    if(name==='execute_partner_sale_mutation'){
      ids.push(args.p_sale_id);
      return fail?{data:null,error:{message:'Failed to fetch',code:''}}:{data:args.p_sale_id,error:null};
    }
    return {data:snapshot(),error:null};
  }});
  await act(async()=>{await assert.rejects(h.current.createSale(payload()),/mesmo ID/);});
  const pending=h.current.pendingSale.id;
  await act(async()=>{await assert.rejects(h.current.createSale({...payload(),total:200}),/resultado pendente/);});
  assert.equal(ids.length,1);
  fail=false;
  await act(async()=>{await h.current.retryPendingSale();});
  assert.deepEqual(ids,[pending,pending]);assert.equal(h.current.pendingSale,null);
});
test('recovery with another authorizer retains a null commercial seller and the original ID',async()=>{
  const requests=[];
  const h=await harness({rpc:async(name,args)=>{
    if(name==='execute_partner_sale_mutation'){
      requests.push(args);
      return requests.length===1?{data:null,error:{message:'Failed to fetch'}}:{data:args.p_sale_id,error:null};
    }
    return {data:snapshot(),error:null};
  }});
  await act(async()=>{await assert.rejects(h.current.createSale(payload()),/mesmo ID/);});
  await act(async()=>{await h.current.retryPendingSale('manager','synthetic-test-pin');});
  assert.equal(requests[1].p_sale_id,requests[0].p_sale_id);
  assert.equal(requests[1].p_commercial_salesperson_id,null);
  assert.equal(requests[1].p_salesperson_id,'manager');
  assert.equal(h.current.pendingSale,null);
});

test('first PostgreSQL rejection releases the failed attempt and does not claim success',async()=>{
  const h=await harness({rpc:async()=>({data:null,error:{code:'P0001',message:'Estoque insuficiente'}})});
  await act(async()=>{await assert.rejects(h.current.createSale(payload()),/Estoque insuficiente/);});
  assert.equal(h.values.size,0);assert.equal(h.current.sales.length,0);assert.equal(h.current.pendingSale,null);
});
test('database connection error is an uncertain outcome and retains the pending ID',async()=>{
  const h=await harness({rpc:async()=>({data:null,error:{code:'08006',message:'Connection failure'}})});
  await act(async()=>{await assert.rejects(h.current.createSale(payload()),/mesmo ID/);});
  assert.ok(h.current.pendingSale?.id);assert.equal(h.values.size,1);
});
test('double click is blocked synchronously while the first mutation is awaiting its response',async()=>{
  let release;let writes=0;
  const h=await harness({rpc:async(name,args)=>{
    if(name==='execute_partner_sale_mutation'){
      writes++;
      await new Promise(resolve=>{release=resolve;});
      return {data:args.p_sale_id,error:null};
    }
    return {data:snapshot(),error:null};
  }});
  await act(async()=>{
    const first=h.current.createSale(payload());
    await assert.rejects(h.current.createSale(payload()),/Aguarde/);
    release();await first;
  });
  assert.equal(writes,1);
});
test('billed pre-sale reconciles invoice/credit/stock; never creates a local service movement',async()=>{
  const pre={...payload(),id:'pre',user_id:'owner',status:'pre_venda',payment_method:null,origin:'pdv',created_at:new Date().toISOString(),items:[{product_id:'service',name:'Servico',quantity:1,unit_price:100}]};
  let finished=false;let writes=0;
  const h=await harness({initialSales:[pre],rpc:async(name)=>{
    if(name==='execute_partner_sale_mutation'){finished=true;writes++;return {data:pre.id,error:null};}
    return {error:null,data:snapshot({
      products:[{id:'service',branch_id:'branch',stock:0,is_service:true}],
      sales:[{...pre,status:finished?'concluida':'pre_venda',payment_method:finished?'faturado':null}],
      invoices:finished?[{id:'invoice',sale_id:pre.id,branch_id:'branch',amount:100,status:'aberta'}]:[],
      credits:[{customer_id:'customer',allow_credit:true,credit_limit:1000,used:finished?100:0,available:finished?900:1000}],
    })};
  }});
  await act(async()=>{await h.current.finalizePreSale(pre.id,'faturado');});
  assert.equal(writes,1);assert.equal(h.current.invoices[0].id,'invoice');
  assert.equal(h.current.pdvCredits[0].available,900);assert.equal(h.current.products[0].stock,0);
  assert.equal(h.current.movements.length,0);
});
test('billed pre-sale UX rejects absent customer',async()=>{
  let writes=0;
  const pre={...payload(),id:'pre',status:'pre_venda',customer_id:null};
  const h=await harness({initialSales:[pre],rpc:async(name)=>{
    if(name==='execute_partner_sale_mutation'){writes++;return {data:'pre',error:null};}
    return {data:snapshot(),error:null};
  }});
  await act(async()=>{await assert.rejects(h.current.finalizePreSale('pre','faturado'),/Selecione um cliente/);});
  assert.equal(writes,0);
});
test('billed pre-sale UX rejects insufficient authorized credit before mutation',async()=>{
  let writes=0;
  const pre={...payload(),id:'pre',status:'pre_venda'};
  const h=await harness({initialSales:[pre],rpc:async(name)=>{
    if(name==='execute_partner_sale_mutation'){writes++;return {data:'pre',error:null};}
    return {data:snapshot({credits:[{customer_id:'customer',allow_credit:true,available:50}]}),error:null};
  }});
  await act(async()=>{await assert.rejects(h.current.finalizePreSale('pre','faturado'),/insuficiente/);});
  assert.equal(writes,0);
});
