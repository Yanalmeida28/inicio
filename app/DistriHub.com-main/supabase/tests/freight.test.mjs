import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
import { pdvHelpers } from './fixtures/pdv_helpers.mjs';

const sale = { id:'sale', customer_name:'Cliente', customer_id:'customer', branch_id:'branch', salesperson_id:null,
  items:[{product_id:'product',name:'Peça',quantity:1,unit_price:100}], total:100, freight_fee:15,
  payment_method:'pix', status:'concluida', created_at:new Date().toISOString() };
const currency = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
async function load(name, window) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(await readFile(new URL(`../../src/lib/${name}.ts`,import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
  }).outputText,{exports,window,require(name){
    if(name==='./pdv')return pdvHelpers;
    if(name==='../utils')return {money:currency};
    throw Error(name);
  }});
  return exports;
}
test('freight is charged in exact cents, remains in a pending retry and changes its immutable request key',()=>{
  assert.equal(pdvHelpers.saleChargeTotal(sale),115);
  assert.equal(pdvHelpers.saleChargeTotal({total:0.1,freight_fee:0.2}),0.3);
  assert.equal(pdvHelpers.saleChargeTotal({total:100}),100);
  const values=new Map();
  const store=new pdvHelpers.PdvSaleAttemptStore({getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},'test');
  store.begin(sale);
  assert.equal(store.read().freight_fee,15);
  assert.throws(()=>store.begin({...sale,freight_fee:20}),/resultado pendente/);
});
test('printed and shared receipts show merchandise subtotal, freight and full charge',async()=>{
  function element(tag){return {tag,children:[],style:{},append(...nodes){this.children.push(...nodes);},textContent:''};}
  const document={head:element('head'),body:element('body'),documentElement:{},createElement:element,images:[]};
  const popup={document,requestAnimationFrame(){},focus(){},print(){}};
  const print=await load('salePrint',{open:()=>popup});
  print.printSale(sale,'receipt');
  function texts(node){return [node.textContent,...node.children.flatMap(texts)];}
  const output=texts(document.body);
  assert.ok(output.includes(`Frete terceirizado: ${currency.format(15)}`));
  assert.ok(output.includes(`Subtotal produtos/serviços: ${currency.format(100)}`));
  assert.ok(output.includes(`TOTAL: ${currency.format(115)}`));
  const share=await load('saleShare');
  const message=decodeURIComponent(share.saleShareUrl(sale,'whatsapp',{name:'Cliente',phone:'11999999999'}));
  assert.ok(message.includes(`Frete terceirizado: ${currency.format(15)}`));
  assert.ok(message.includes(`Total: ${currency.format(115)}`));
});
test('revenue CSV separates freight from merchandise revenue',async()=>{
  const metrics=await load('reportMetrics');
  const csv=metrics.buildSalesCsv([sale]);
  assert.ok(csv.includes('Frete terceirizado'));
  assert.ok(csv.includes('"100.00";"15.00";"115.00"'));
});
