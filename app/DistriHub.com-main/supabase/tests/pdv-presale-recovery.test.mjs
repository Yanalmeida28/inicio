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

test('confirmed recovery clears only the original checkout draft and cannot resubmit it',async()=>{
 let sale;
 const props={...base,isActive:true,hasPendingSale:false,onCreateSale:async value=>{sale=value;return {...value,id:'new-id'};}};
 await act(async()=>{view=TestRenderer.create(wrapped(components.Checkout,props,'audit-recovery'));});
 await act(async()=>view.root.findByProps({'aria-label':'Buscar produto por nome ou SKU'}).props.onChange({target:{value:'Produto'}}));await add();
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
 if(kind==='Checkout')await act(async()=>view.root.findByProps({'aria-label':'Buscar produto por nome ou SKU'}).props.onChange({target:{value:'Produto'}}));
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
