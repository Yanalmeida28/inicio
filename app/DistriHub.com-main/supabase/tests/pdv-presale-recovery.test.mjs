// Regression tests: real checkout components and real persisted drafts, synthetic data.
import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import ts from '../../node_modules/typescript/lib/typescript.js';
const require=createRequire(new URL('./package.json',import.meta.url));
const TestRenderer=require('react-test-renderer');
const { act }=TestRenderer;
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
const storage=new Map();
const window={sessionStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key),get length(){return storage.size;},key:index=>[...storage.keys()][index]??null},setTimeout:()=>1,clearTimeout(){},open:()=>null};
const drafts={};
vm.runInNewContext(compile(await readFile(new URL('../../src/hooks/useSessionDraft.tsx',import.meta.url),'utf8')),{exports:drafts,window,console,Error,require});
const helpers={};
vm.runInNewContext(compile(await readFile(new URL('../../src/lib/pdv.ts',import.meta.url),'utf8')),{exports:helpers,Error});
const components={};
vm.runInNewContext(compile(await readFile(new URL('../../src/components/partner/PdvModule.tsx',import.meta.url),'utf8')+'\nexports.Checkout=PdvCheckout;exports.Presale=PreVendaTab;'),{exports:components,window,console,Error,setTimeout:()=>1,require(name){
 if(name==='../../hooks/useSessionDraft')return drafts;
 if(name==='../../lib/pdv')return helpers;
 if(name==='../../lib/salePrint')return {printSale(){},directReceiptEnabled:()=>false};
 if(name==='../../utils')return {money:new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})};
 if(name==='./PreSaleCheckout')return {};
 if(name==='./SplitPaymentFields')return {SplitPaymentFields:()=>null};
 if(name==='./SalePriceInput')return {SalePriceInput:()=>null};
 return require(name);
}});
let view;
afterEach(async()=>{if(view)await act(async()=>view.unmount());view=null;});
const product={id:'product',name:'Produto A',sku:'A',stock:10,branch_id:'branch',sale_price:100,wholesale_price:80};
const base={products:[product],customers:[],salespeople:[],credits:[],sales:[],selectedBranchId:'branch',segment:'assistencia',canCheckout:true,canEditPrice:false,onCreatePreSale:async()=>{},onFinalizePreSale:async()=>{},onCancelSale:async()=>{},onDeleteSale:async()=>{},onPullToPdv(){}};
const wrapped=(component,props,scope,key='before')=>React.createElement(drafts.SessionDraftProvider,{scope},React.createElement(component,{...props,key}));
const add=async()=>act(async()=>view.root.findAllByType('button').find(node=>node.props.className==='pdv-product-card').props.onClick());
test('operator switch preserves PDV tab and cart while updating price permission',async()=>{
 const scope='operator-switch:company:workspace:branch';
 const screen=(operator,role)=>wrapped(components.PdvModule,{...base,currentRole:role,activeSalespersonId:operator,canEditPrice:role==='gerente'},scope);
 await act(async()=>{view=TestRenderer.create(screen('manager','gerente'));});
 await act(async()=>view.root.findAllByType('button').find(node=>node.props.className==='pdv-subtab '&&node.children.some(child=>typeof child==='string'&&child.includes('Pré-vendas'))).props.onClick());
 const presale=()=>view.root.findAll(node=>typeof node.type==='function'&&node.type.name==='PreVendaTab')[0];
 await act(async()=>presale().findAllByType('button').find(node=>node.props.className==='pdv-product-card').props.onClick());
 assert.match(storage.get('distrihub:draft:'+scope+':pdv:branch:presale:cart'),/product/);
 await act(async()=>view.update(screen('cashier','caixa')));
 assert.equal(view.root.findAllByType('button').find(node=>node.props.className==='pdv-subtab active').children.some(child=>child===' Pré-vendas'),true);
 assert.match(storage.get('distrihub:draft:'+scope+':pdv:branch:presale:cart'),/product/);
 assert.equal(view.root.findAll(node=>typeof node.type==='function'&&node.type.name==='PreVendaTab')[0].props.canEditPrice,false);
 await act(async()=>view.update(screen('manager','gerente')));
 assert.match(storage.get('distrihub:draft:'+scope+':pdv:branch:presale:cart'),/product/);
});

test('rescue uses the full checkout, preserves the other cart and finalizes the original sale', async () => {
 const scope = 'editable-rescue';
 const sale = { id: 'pre-original', status: 'pre_venda', sale_number: 7, branch_id: 'branch',
   customer_id: null, customer_name: 'Cliente', customer_type: 'varejo', delivery_type: 'balcao',
   items: [{ product_id: 'product', name: 'Produto A', quantity: 2, unit_price: 100 }], total: 200 };
 let created = 0, consumed = 0, finalized;
 const props = { ...base, currentRole: 'gerente', onCreateSale: async () => { created++; },
   onConsumePreSale: () => { consumed++; }, onFinalizePreSale: async (...args) => { finalized = args; } };
 await act(async () => { view = TestRenderer.create(wrapped(components.PdvModule, props, scope)); });
 await add();
 await act(async () => view.update(wrapped(components.PdvModule, { ...props, preSaleToCheckout: sale }, scope)));
 const checkout = view.root.findAll(node => typeof node.type === 'function' && node.type.name === 'PdvCheckout').find(node => node.props.rescuedSale);
 assert.ok(checkout);
 assert.ok(checkout.findByProps({ 'aria-label': 'Buscar produto por nome, SKU ou código de barras' }));
 assert.ok(checkout.findByProps({ 'aria-label': 'Tipo de atendimento da venda' }));
 await act(async () => checkout.findByProps({ 'aria-label': 'Aumentar quantidade de Produto A' }).props.onClick());
 await act(async () => checkout.findByProps({ className: 'module-cancel-btn pdv-checkout-btn' }).props.onClick());
 assert.equal(finalized[0], sale.id);
 assert.equal(finalized[3].items[0].quantity, 3);
 assert.equal(created, 0);
 assert.equal(consumed, 1);
 const normal = view.root.findAll(node => typeof node.type === 'function' && node.type.name === 'PdvCheckout');
 assert.equal(normal.length, 1);
 assert.equal(JSON.parse(storage.get('distrihub:draft:' + scope + ':pdv:branch:checkout:cart'))[0].quantity, 1);
});

test('rescued pre-sale saves corrections on its original ID without finalization and preserves the normal cart',async()=>{
 const scope='save-rescued-quote';let finalized=0,created=0,consumed=0,saves=0,saved,release;
 const sale={id:'save-original',status:'pre_venda',sale_number:8,branch_id:'branch',customer_id:null,customer_name:'Cliente',customer_type:'varejo',delivery_type:'balcao',items:[{product_id:'product',name:'Produto A',quantity:2,unit_price:100}],total:200};
 const props={...base,currentRole:'gerente',onCreateSale:async()=>{created++;},onFinalizePreSale:async()=>{finalized++;},onConsumePreSale:()=>{consumed++;},onUpdatePreSale:async(id,edits)=>{saves++;saved={id,edits};await new Promise(resolve=>{release=resolve;});}};
 await act(async()=>{view=TestRenderer.create(wrapped(components.PdvModule,props,scope));});await add();
 await act(async()=>view.update(wrapped(components.PdvModule,{...props,preSaleToCheckout:sale},scope)));
 const checkout=()=>view.root.findAll(node=>typeof node.type==='function'&&node.type.name==='PdvCheckout').find(node=>node.props.rescuedSale);
 await act(async()=>checkout().findByProps({'aria-label':'Aumentar quantidade de Produto A'}).props.onClick());
 const save=checkout().findByProps({className:'module-submit-btn pdv-save-presale-btn'}).props.onClick;
 await act(async()=>{save();save();});assert.equal(saves,1);assert.equal(saved.id,sale.id);assert.equal(saved.edits.items[0].quantity,3);assert.equal(saved.edits.total,300);
 assert.equal(checkout().findByType('fieldset').props.disabled,true);
 assert.equal(checkout().findByProps({className:'module-submit-btn pdv-save-presale-btn'}).props.disabled,true);
 await act(async()=>release());
 assert.equal(finalized,0);assert.equal(created,0);assert.equal(consumed,1);
 assert.match(JSON.stringify(view.toJSON()),/Pré-venda atualizada/);
 assert.equal(JSON.parse(storage.get('distrihub:draft:'+scope+':pdv:branch:checkout:cart'))[0].quantity,1);
 assert.equal([...storage.keys()].some(key=>key.includes(':rescued:save-original:checkout:cart')),false);
});

test('failed rescued pre-sale save retains corrections and never consumes or finalizes the order',async()=>{
 const sale={id:'save-rejected',status:'pre_venda',branch_id:'branch',customer_id:null,customer_name:'Cliente',customer_type:'varejo',delivery_type:'balcao',items:[{product_id:'product',name:'Produto A',quantity:2,unit_price:100}],total:200};
 let consumed=0,finalized=0;
 const props={...base,currentRole:'gerente',preSaleToCheckout:sale,onConsumePreSale:()=>{consumed++;},onFinalizePreSale:async()=>{finalized++;},onUpdatePreSale:async()=>{throw new Error('Sem permissão para alterar o preço');}};
 await act(async()=>{view=TestRenderer.create(wrapped(components.PdvModule,props,'save-rejected'));});
 const checkout=()=>view.root.findAll(node=>typeof node.type==='function'&&node.type.name==='PdvCheckout').find(node=>node.props.rescuedSale);
 await act(async()=>checkout().findByProps({'aria-label':'Aumentar quantidade de Produto A'}).props.onClick());
 await act(async()=>checkout().findByProps({className:'module-submit-btn pdv-save-presale-btn'}).props.onClick());
 assert.match(JSON.stringify(view.toJSON()),/Sem permissão/);assert.doesNotMatch(JSON.stringify(view.toJSON()),/Pré-venda atualizada/);
 assert.equal(consumed,0);assert.equal(finalized,0);assert.equal(checkout().findByType('fieldset').props.disabled,false);
 assert.ok([...storage.entries()].some(([key,value])=>key.includes(':rescued:save-rejected:checkout:cart')&&JSON.parse(value)[0].quantity===3));
});

test('confirmed recovery clears only the original checkout draft and cannot resubmit it',async()=>{
 let sale;
 const props={...base,isActive:true,hasPendingSale:false,onCreateSale:async value=>{sale=value;return {...value,id:'new-id'};}};
 await act(async()=>{view=TestRenderer.create(wrapped(components.Checkout,props,'audit-recovery'));});
 await act(async()=>view.root.findByProps({'aria-label':'Buscar produto por nome, SKU ou código de barras'}).props.onChange({target:{value:'Produto'}}));await add();
 storage.set('distrihub:draft:audit-recovery:presale:cart',JSON.stringify([{product_id:'unrelated'}]));
 drafts.clearConfirmedPdvDraft('audit-recovery','checkout');
 await act(async()=>view.update(wrapped(components.Checkout,props,'audit-recovery','after-confirmed-recovery')));
 assert.equal(view.root.findAllByProps({'aria-label':'Aumentar quantidade de Produto A'}).length,0);
 assert.match(storage.get('distrihub:draft:audit-recovery:presale:cart'),/unrelated/);
 await act(async()=>view.root.findByProps({className:'module-cancel-btn pdv-checkout-btn'}).props.onClick());
 assert.equal(sale,undefined);

});

test('confirmed recovery clears the original presale draft',async()=>{
 let saved;
 const props={...base,onCreatePreSale:async value=>{saved=value;}};
 await act(async()=>{view=TestRenderer.create(wrapped(components.Presale,props,'audit-presale-recovery'));});await add();
 drafts.clearConfirmedPdvDraft('audit-presale-recovery','presale');
 await act(async()=>view.update(wrapped(components.Presale,props,'audit-presale-recovery','after-recovery')));
 assert.equal(view.root.findAllByProps({className:'module-submit-btn pdv-checkout-btn'}).length,0);
 assert.equal(saved,undefined);
});

test('presale blocks product changes while saving and displays success after emptying the cart',async()=>{
 let resolve,submitted;
 const pending=new Promise(done=>{resolve=done;});
 const props={...base,onCreatePreSale:async value=>{submitted=value;await pending;}};
 await act(async()=>{view=TestRenderer.create(wrapped(components.Presale,props,'audit-presale-edit'));});await add();
 let operation;await act(async()=>{operation=view.root.findByProps({className:'module-submit-btn pdv-checkout-btn'}).props.onClick();});
 assert.equal(submitted.items[0].quantity,1);await add();
 assert.doesNotMatch(JSON.stringify(view.toJSON()),/200,00/);
 assert.equal(view.root.findByType('fieldset').props.disabled,true);
 await act(async()=>{resolve();await operation;});
 assert.match(JSON.stringify(view.toJSON()),/Pré-venda salva com sucesso/);
 assert.equal(submitted.items[0].quantity,1);
 assert.match(JSON.stringify(view.toJSON()),/Selecione produtos para gerar uma pré-venda/);

});

for (const kind of ['Checkout','Presale']) test(`${kind} applies the registered Premium table to the whole cart and blocks inactive customers`,async()=>{
 let submitted;
 const customers=[{id:'premium',name:'Cliente Premium',customer_type:'varejo',price_table:'premium',is_active:true},{id:'inactive',name:'Cliente Inativo',customer_type:'varejo',is_active:false}];
 const props={...base,products:[{...product,premium_price:140}],customers,isActive:true,onCreateSale:async value=>{submitted=value;return {...value,id:'sale'};},onCreatePreSale:async value=>{submitted=value;return {...value,id:'pre'};}};
 await act(async()=>{view=TestRenderer.create(wrapped(components[kind],props,'premium-'+kind));});
 if(kind==='Checkout')await act(async()=>view.root.findByProps({'aria-label':'Buscar produto por nome, SKU ou código de barras'}).props.onChange({target:{value:'Produto'}}));
 await add();
 const picker=()=>view.root.findAll(node=>typeof node.type==='function'&&node.type.name==='CustomerSearchPicker')[0];
 await act(async()=>picker().props.onSelect('premium'));
 assert.match(JSON.stringify(view.toJSON()),/140,00/);
 assert.match(JSON.stringify(view.toJSON()),/Tabela aplicada/);
 const input=()=>view.root.findAllByType('input').find(node=>node.props.id===(kind==='Checkout'?'pdv-customer-search':'presale-customer-search'));
 await act(async()=>input().props.onChange({target:{value:'Inativo'}}));
 assert.equal(view.root.findAllByProps({role:'option'}).length,0);
 await act(async()=>picker().props.onSelect('premium'));
 await act(async()=>view.root.findByProps({className:kind==='Checkout'?'module-cancel-btn pdv-checkout-btn':'module-submit-btn pdv-checkout-btn'}).props.onClick());
 assert.equal(submitted.items[0].unit_price,140);assert.equal(submitted.customer_type,'varejo');assert.equal(submitted.customer_id,'premium');assert.equal(submitted.draft_scope,'premium-'+kind);
});

test('pending presale cannot be changed or submitted until recovery',async()=>{
 let calls=0;const props={...base,onCreatePreSale:async()=>{calls++;}};
 await act(async()=>{view=TestRenderer.create(wrapped(components.Presale,props,'pending-presale'));});await add();
 await act(async()=>view.update(wrapped(components.Presale,{...props,hasPendingSale:true},'pending-presale')));
 assert.equal(view.root.findByType('fieldset').props.disabled,true);
 await add();await act(async()=>view.root.findByProps({className:'module-submit-btn pdv-checkout-btn'}).props.onClick());
 assert.equal(calls,0);assert.doesNotMatch(JSON.stringify(view.toJSON()),/200,00/);
});

test('Premium without a configured product price is blocked with a visible explanation',async()=>{
 const customers=[{id:'premium',name:'Premium',customer_type:'varejo',price_table:'premium'}];
 await act(async()=>{view=TestRenderer.create(wrapped(components.Presale,{...base,customers},'missing-premium'));});
 await add();
 await act(async()=>view.root.findAll(node=>typeof node.type==='function'&&node.type.name==='CustomerSearchPicker')[0].props.onSelect('premium'));
 assert.match(JSON.stringify(view.toJSON()),/Defina um preço Premium/);
 assert.doesNotMatch(JSON.stringify(view.toJSON()),/Tabela aplicada/);
});
