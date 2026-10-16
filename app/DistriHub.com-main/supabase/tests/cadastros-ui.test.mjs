import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';
const require=createRequire(import.meta.url);
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
const xmlModule={};
vm.runInNewContext(compile(await readFile(new URL('../../src/lib/cadastroXml.ts',import.meta.url),'utf8')),{exports:xmlModule,Error});
const invoice={invoiceKey:'1'.repeat(44),supplier:{name:'Fornecedor',document:'12345678000199'},items:[{name:'Produto',sku:'P1',qty:2,cost:12.5}]};
const exports={};
vm.runInNewContext(compile(await readFile(new URL('../../src/components/partner/CadastrosModule.tsx',import.meta.url),'utf8')+'\nexports.Suppliers=SuppliersSubTab;exports.Xml=XmlSubTab;exports.Categories=CategoriesSubTab;exports.Combos=CombosSubTab;exports.Profile=CustomerProfileModal;exports.Products=ProductsSubTab;'),{
 exports,Error,document:{body:{}},window:{confirm:()=>true,innerWidth:1024,innerHeight:768},require(name){
  if(name==='react-dom')return {createPortal:children=>children};
  if(name==='./ImportExportModule')return {ExportButtons:()=>null};
  if(name==='../../lib/cadastroXml')return {parseStockXml:()=>invoice};
  if(name==='./CustomerPhoto')return {CustomerPhoto:()=>null};
  if(name==='../../utils')return {money:new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}),normalizeDocument:value=>value.replace(/\D/g,''),isValidCpf:()=>true,isValidCnpj:()=>true};
  if(name==='../../hooks/useSessionDraft')return {useSessionDraftState:(_key,value)=>React.useState(value)};
  if(['./ProductProfitPreview','./ProductPhotoField','./ProductLabelModal','./ImportExportModule','../../lib/saleReturns'].includes(name))return {};
  return require(name);
 },
});
let renderer;
afterEach(async()=>{if(renderer)await act(async()=>renderer.unmount());renderer=null;});
const rendered=()=>JSON.stringify(renderer.toJSON());
const submit=()=>renderer.root.findByType('form').props.onSubmit({preventDefault(){}});
async function productDeleteAction(onDeleteProduct) {
 const product={id:'p',name:'Produto teste',stock:5,min_stock:1,sale_price:10,cost_price:5,branch_id:'branch'};
 await act(async()=>{renderer=TestRenderer.create(React.createElement(exports.Products,{products:[product],allProducts:[product],branches:[],selectedBranchId:'branch',categories:[],suppliers:[],segment:'assistencia',onAddSupplier:async()=>{},onAddProduct:async()=>{},onUpdateProduct:async()=>{},onDeleteProduct}));});
 await act(async()=>renderer.root.findByProps({'aria-label':'Ações de Produto teste'}).props.onClick({currentTarget:{getBoundingClientRect:()=>({right:500,top:100,bottom:140})}}));
 return renderer.root.findAllByType('button').find(button=>button.children.includes(' Excluir')).props.onClick;
}
test('product deletion displays the stock rejection instead of silently ignoring it',async()=>{
 let calls=0;
 const remove=await productDeleteAction(async()=>{calls++;throw {message:'Produto com estoque nao pode ser excluido. Zere ou transfira o estoque primeiro.'};});
 await act(async()=>remove());
 assert.equal(calls,1);
 assert.match(renderer.root.findByProps({role:'alert'}).children.join(''),/saldo em estoque/);
 assert.match(rendered(),/Produto teste/);
});
test('product deletion explains linked-history restrictions and keeps the product',async()=>{
 const remove=await productDeleteAction(async()=>{throw {code:'23503',message:'foreign key violation'};});
 await act(async()=>remove());
 assert.match(renderer.root.findByProps({role:'alert'}).children.join(''),/histórico precisa ser preservado/);
});
test('product deletion runs only once while a request is pending and clears busy state after success',async()=>{
 let finish,calls=0;
 const pending=new Promise(resolve=>{finish=resolve;});
 const remove=await productDeleteAction(async()=>{calls++;await pending;});
 await act(async()=>{remove();remove();});
 assert.equal(calls,1);
 assert.match(renderer.root.findByProps({role:'status'}).children.join(''),/Excluindo/);
 await act(async()=>finish());
 assert.equal(renderer.root.findAllByProps({role:'status'}).length,0);
 assert.equal(renderer.root.findAllByProps({role:'alert'}).length,0);
});

test('consolidated supplier form requires a branch and sends its explicit selection',async()=>{
 let saved;
 await act(async()=>{renderer=TestRenderer.create(React.createElement(exports.Suppliers,{suppliers:[],branches:[{id:'atacado',name:'Atacado'},{id:'varejo',name:'Varejo'}],selectedBranchId:null,onAdd:async value=>{saved=value;},onUpdate:async()=>{},onDelete:async()=>{}}));});
 await act(async()=>renderer.root.findAllByType('input')[0].props.onChange({target:{value:'Fornecedor Varejo'}}));
 await act(async()=>submit());assert.equal(saved,undefined);assert.match(rendered(),/Selecione a filial/);
 await act(async()=>renderer.root.findByProps({'aria-label':'Filial do fornecedor'}).props.onChange({target:{value:'varejo'}}));
 await act(async()=>submit());assert.equal(saved.branch_id,'varejo');
});

test('XML decimals preserve dots and reject ambiguous locale values',()=>{
 assert.equal(xmlModule.parseXmlDecimal('12.50'),12.5);
 assert.equal(xmlModule.parseXmlDecimal('2.0000'),2);
 assert.equal(xmlModule.parseXmlDecimal('10.0000'),10);
 assert.throws(()=>xmlModule.parseXmlDecimal('12,50'),/inválido/);
 assert.throws(()=>xmlModule.parseXmlDecimal('NaN'),/inválido/);
});

test('XML blocks duplicate submissions and preserves invoice for retry after failure',async()=>{
 let calls=0,reject;
 const pending=new Promise((_resolve,fail)=>{reject=fail;});
 await act(async()=>{renderer=TestRenderer.create(React.createElement(exports.Xml,{selectedBranchId:'branch',onImport:async()=>{calls++;await pending;}}));});
 await act(async()=>renderer.root.findByType('input').props.onChange({target:{files:[{name:'nfe.xml',text:async()=>'<xml/>'}]}}));
 const button=()=>renderer.root.findAllByType('button').find(node=>node.props.className==='module-submit-btn');
 let operation;
 await act(async()=>{operation=button().props.onClick();button().props.onClick();});
 assert.equal(calls,1);assert.equal(button().props.disabled,true);
 await act(async()=>{reject(new Error('Conexão perdida'));await operation;});
 assert.match(rendered(),/Conexão perdida/);assert.match(rendered(),/nfe.xml/);assert.doesNotMatch(rendered(),/NF-e processada/);assert.equal(button().props.disabled,false);
});

test('category failure is visible and keeps the draft; concurrent submits run once',async()=>{
 let reject,calls=0;const pending=new Promise((_done,fail)=>{reject=fail;});
 await act(async()=>{renderer=TestRenderer.create(React.createElement(exports.Categories,{categories:[],products:[],onAdd:async()=>{calls++;await pending;},onDelete:async()=>{}}));});
 await act(async()=>renderer.root.findByType('input').props.onChange({target:{value:'Categoria nova'}}));
 let operation;await act(async()=>{operation=submit();submit();});assert.equal(calls,1);
 await act(async()=>{reject(new Error('Permissão negada'));await operation;});
 assert.equal(renderer.root.findByType('input').props.value,'Categoria nova');assert.match(rendered(),/Permissão negada/);
});

test('kit rejects negative price and stale products from a previous branch',async()=>{
 let calls=0;
 const props={products:[{id:'product',name:'Produto'}],combos:[],onAdd:async()=>{calls++;},onDelete:async()=>{}};
 await act(async()=>{renderer=TestRenderer.create(React.createElement(exports.Combos,props));});
 await act(async()=>renderer.root.findByType('button').props.onClick());
 await act(async()=>{renderer.root.findAllByType('input')[0].props.onChange({target:{value:'Kit'}});renderer.root.findByProps({type:'number'}).props.onChange({target:{value:'-1'}});renderer.root.findByProps({className:'picker-item '}).props.onClick();});
 await act(async()=>submit());assert.equal(calls,0);assert.match(rendered(),/preço não negativo/);
 await act(async()=>renderer.root.findByProps({type:'number'}).props.onChange({target:{value:'10'}}));
 await act(async()=>renderer.update(React.createElement(exports.Combos,{...props,products:[]})));
 await act(async()=>submit());assert.equal(calls,0);assert.match(rendered(),/filial atual/);
});

test('customer total excludes pending and cancelled sales and subtracts issued return credit once',async()=>{
 const customer={id:'customer',name:'Cliente',person_type:'PF',credit_limit:0};
 const sale=(id,status,total)=>({id,status,total,customer_id:'customer',user_id:'owner',items:[]});
 await act(async()=>{renderer=TestRenderer.create(React.createElement(exports.Profile,{customer,sales:[sale('done','concluida',100),sale('cancelled','cancelada',200),sale('pending','aberta',300)],rmaRequests:[{sale_id:'done',user_id:'owner',credit_amount:20,refund_amount:20}],salespeople:[],onUpdate:async()=>{},onClose(){}}));});
 assert.match(rendered(),/80,00/);assert.match(rendered(),/compras concluídas/);assert.doesNotMatch(rendered(),/600,00/);
});
