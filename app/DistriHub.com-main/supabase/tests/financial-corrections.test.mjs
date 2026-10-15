import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';
const require=createRequire(import.meta.url);
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
function environment(client={}){
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),key:i=>[...values.keys()][i]??null,get length(){return values.size;}};
 const cache=new Map();
 const load=name=>{
  if(cache.has(name))return cache.get(name);
  const exports={};cache.set(name,exports);
  const url=new URL('../../src/'+name,import.meta.url);
  vm.runInNewContext(compile(readFileSync(url,'utf8')),{exports,Error,Date,Intl,console,crypto:{randomUUID},window:{localStorage:storage},require:dep=>{
   if(dep==='react'||dep==='react/jsx-runtime'||dep==='lucide-react')return require(dep);
   if(dep.endsWith('/supabase'))return {supabase:client};
   if(dep.endsWith('/utils'))return {money:new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})};
   if(dep==='./InvoiceReceipts')return {InvoiceReceipts:()=>null};
   const target=new URL(dep,url),ext=dep.includes('Module')||dep.includes('Panel')?'.tsx':'.ts';
   const path=target.pathname.split('/src/')[1]+ext;return load(path);
  }});return exports;
 };
 return {load,values,storage};
}
const invoice={id:'invoice',user_id:'owner',branch_id:'A',customer_id:'customer',customer_name:'Cliente',number:'001',amount:100,paid_amount:0,status:'aberta',due_date:'2026-10-20'};
const payable={id:'payable',user_id:'owner',branch_id:'A',description:'Aluguel',creditor_name:'Credor',amount:100,paid_amount:0,status:'aberta',due_date:'2026-10-20'};
const button=(r,label)=>r.root.findAllByType('button').find(node=>node.children.join('')===label);

test('Financeiro uses civil due date, excludes cancelled balances and resets another branch draft',async()=>{
 const oldTZ=process.env.TZ;process.env.TZ='America/Sao_Paulo';
 const e=environment(),Component=e.load('components/partner/FinancialModule.tsx').FinancialModule;let r;
 const props={invoices:[invoice],creditLimit:1000,creditUsed:100,onPayInvoice:async()=>{}};
 try{
  await act(async()=>{r=Renderer.create(React.createElement(Component,props));});assert.match(JSON.stringify(r.toJSON()),/20\/10\/2026/);
  await act(async()=>button(r,'Amortizar').props.onClick());assert.equal(r.root.findAllByType('form').length,1);
  await act(async()=>r.update(React.createElement(Component,{...props,invoices:[{...invoice,id:'B',branch_id:'B'}]})));assert.equal(r.root.findAllByType('form').length,0);
  await act(async()=>r.update(React.createElement(Component,{...props,invoices:[{...invoice,status:'cancelada'}]})));
  const cells=r.root.findAllByType('tr')[1].findAllByType('td');assert.match(cells[4].children.join(''),/0,00/);assert.doesNotMatch(cells[4].children.join(''),/100,00/);
 }finally{if(r)await act(async()=>r.unmount());if(oldTZ===undefined)delete process.env.TZ;else process.env.TZ=oldTZ;}
});

test('financial persistence isolates actors, discovers legacy receipts and rejects changed requests',()=>{
 const e=environment(),{InvoicePaymentAttempts,FinancialOperationAttempts}=e.load('lib/invoicePayments.ts');
 e.storage.setItem('distrihub-invoice-payment:owner:owner:legacy',JSON.stringify({token:'legacy-token',amount:100}));
 const receipts=new InvoicePaymentAttempts(e.storage);assert.equal(receipts.list('owner:owner')[0].invoiceId,'legacy');assert.equal(receipts.list('employee:owner').length,0);
 const store=new FinancialOperationAttempts(e.storage),payload={kind:'rma-credit',rmaId:'rma',invoiceId:'invoice',amount:20};
 assert.equal(store.get('owner:owner',payload,'first').token,'first');assert.equal(store.get('owner:owner',payload,'second').token,'first');assert.throws(()=>store.get('owner:owner',{...payload,amount:30},'second'),/sem confirmação/);assert.equal(store.pending('other:other','rma-credit'),null);
 store.confirm('owner:owner','rma-credit');assert.equal(store.pending('owner:owner','rma-credit'),null);
});

test('payables refuse unconfirmed replies, preserve the exact request and never call server if storage fails',async()=>{
 let calls=0,confirmed=false;const client={auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},rpc:async()=>{calls++;return {data:confirmed?'payable':null,error:null};},from:()=>{const q={select:()=>q,eq:()=>q,order:()=>q,range:async()=>({data:[payable],error:null})};return q;}};
 const e=environment(client),usePayables=e.load('hooks/usePayables.ts').usePayables;let current,r;
 function Probe(){current=usePayables('owner');return null;}
 await act(async()=>{r=Renderer.create(React.createElement(Probe));});await act(async()=>assert.rejects(current.pay('payable',20,'first'),/não confirmou/));assert.equal(current.recoveries.length,1);
 confirmed=true;await act(async()=>current.recoveries[0].run());assert.equal(current.recoveries.length,0);
 const originalSet=e.storage.setItem;e.storage.setItem=()=>{throw new Error('Storage indisponível');};await act(async()=>assert.rejects(current.pay('payable',20,'second'),/Storage indisponível/));assert.equal(calls,2);e.storage.setItem=originalSet;await act(async()=>r.unmount());
});

test('Accounts closes branch drafts, ignores late failure and blocks duplicate recovery clicks',async()=>{
 const e=environment(),Component=e.load('components/partner/AccountsModule.tsx').AccountsModule;let r,finish,calls=0;
 const props={kind:'pagar',invoices:[],payables:{accounts:[payable],loading:false,error:'',reload:async()=>{},create:async()=>{},pay:()=>new Promise((_resolve,reject)=>finish=reject)},branches:[{id:'A',name:'A'},{id:'B',name:'B'}],suppliers:[],branchId:'A'};
 await act(async()=>{r=Renderer.create(React.createElement(Component,props));});await act(async()=>button(r,'Nova conta a pagar').props.onClick());
 await act(async()=>r.update(React.createElement(Component,{...props,branchId:'B'})));assert.equal(r.root.findAllByType('form').length,0);
 await act(async()=>r.update(React.createElement(Component,props)));await act(async()=>button(r,'Registrar pagamento').props.onClick());let pending;
 act(()=>{pending=r.root.findByType('form').props.onSubmit({preventDefault(){}});});await act(async()=>r.update(React.createElement(Component,{...props,branchId:'B'})));await act(async()=>{finish(new Error('Late failure'));await pending;});assert.equal(r.root.findAllByProps({role:'alert'}).length,0);
 const action={id:'recover',label:'Recuperar operação',run:()=>{calls++;return new Promise(resolve=>finish=resolve);}};
 await act(async()=>r.update(React.createElement(Component,{...props,recoveries:[action]})));const recover=button(r,'Recuperar operação');act(()=>{recover.props.onClick();recover.props.onClick();});assert.equal(calls,1);await act(async()=>finish());await act(async()=>r.unmount());
});

test('payables recover exact persisted creation/payment after remount and refresh failure cannot invent failure',async()=>{
 let first=true,readFails=false;const requests=[];
 const client={auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},rpc:async(name,args)=>{requests.push([name,args]);if(first){first=false;return {error:{message:'Resposta perdida'}};}return {data:name==='create_partner_payable'?args.p_id:args.p_payable_id,error:null};},from:()=>{
  const q={select:()=>q,eq:()=>q,order:()=>q,range:async()=>readFails?{data:null,error:{message:'Consulta indisponível'}}:{data:[payable],error:null}};return q;
 }};
 const e=environment(client),usePayables=e.load('hooks/usePayables.ts').usePayables;let current,r;
 function Probe(){current=usePayables('owner');return null;}
 await act(async()=>{r=Renderer.create(React.createElement(Probe));});await act(async()=>assert.rejects(current.pay('payable',20,'original-token'),/Resposta perdida/));await act(async()=>r.unmount());
 await act(async()=>{r=Renderer.create(React.createElement(Probe));});assert.equal(current.recoveries.length,1);
 await act(async()=>assert.rejects(current.pay('payable',30,'new-token'),/sem confirmação/));assert.equal(requests.length,1);
 readFails=true;await act(async()=>current.recoveries[0].run());assert.equal(requests[1][1].p_payment_id,'original-token');assert.equal(current.recoveries.length,0);assert.match(current.error,/Consulta indisponível/);
 readFails=false;first=true;const account={branch_id:'A',supplier_id:null,description:'Conta',creditor_name:'Credor',category:'outros',amount:50,due_date:'2026-10-20'};
 await act(async()=>assert.rejects(current.create(account,'create-token'),/Resposta perdida/));await act(async()=>r.unmount());await act(async()=>{r=Renderer.create(React.createElement(Probe));});
 await act(async()=>current.recoveries[0].run());assert.equal(requests.at(-1)[1].p_id,'create-token');assert.equal(current.recoveries.length,0);await act(async()=>r.unmount());
});

test('refunds enter actual flow once at their server date and never enter projected flow',()=>{
 const e=environment(),flow=e.load('lib/financialFlow.ts');
 const sale={id:'sale',branch_id:'A',status:'concluida',total:100,payment_method:'dinheiro',created_at:'2026-10-15',customer_name:'Cliente'};
 const refund={id:'rma',user_id:'owner',branch_id:'A',refund_request_id:'refund',refund_amount:40,refunded_at:'2026-10-15T01:00:00Z'};
 const rows=flow.actualFinancialFlow([sale],[],[],[],[],[],[refund,{...refund}]);assert.equal(rows.length,2);assert.equal(rows.reduce((sum,row)=>sum+row.amount,0),60);assert.equal(rows[1].date,refund.refunded_at);assert.equal(flow.localDate(refund.refunded_at),'2026-10-14');assert.equal(flow.projectedFinancialFlow([],[]).length,0);
});

test('flow loads every refund page, respects company/branch and reports missing refund data as unavailable',async()=>{
 let fail=false,currentRows=Array.from({length:500},(_,i)=>({id:'zero-'+i,user_id:'owner',branch_id:'A',refund_amount:0}));currentRows.push({id:'refund',user_id:'owner',branch_id:'A',refund_request_id:'request',refund_amount:40,refunded_at:'2026-10-15T12:00:00Z'});currentRows.push({id:'other',user_id:'owner',branch_id:'B',refund_amount:90,refunded_at:'2026-10-15T12:00:00Z'});
 const client={auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},from:table=>{const q={select:()=>q,eq:()=>q,order:()=>q,range:async(first,last)=>table==='rma_requests_v2'?(fail?{data:null,error:{message:'Refund read failed'}}:{data:currentRows.slice(first,last+1),error:null}):{data:[],error:null}};return q;}};
 const e=environment(client),Component=e.load('components/partner/FinancialFlowModule.tsx').FinancialFlowModule;let r;
 const props={userId:'owner',branchId:'A',invoices:[],payables:[],movements:[],sales:[{id:'sale',branch_id:'A',status:'concluida',total:100,payment_method:'dinheiro',created_at:'2026-10-15',customer_name:'Cliente'}],payablesUnavailable:false};
 await act(async()=>{r=Renderer.create(React.createElement(Component,props));});const dates=r.root.findAllByType('input');await act(async()=>dates[0].props.onChange({target:{value:'2026-10-01'}}));await act(async()=>dates[1].props.onChange({target:{value:'2026-10-31'}}));
 assert.match(JSON.stringify(r.toJSON()),/60,00/);assert.doesNotMatch(JSON.stringify(r.toJSON()),/90,00/);
 fail=true;await act(async()=>button(r,'Atualizar').props.onClick());assert.match(JSON.stringify(r.toJSON()),/Refund read failed/);assert.match(JSON.stringify(r.toJSON()),/Indisponível/);await act(async()=>r.unmount());
});
