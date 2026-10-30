import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';
const require=createRequire(import.meta.url),source=await readFile(new URL('../../src/components/partner/ProductLabelModal.tsx',import.meta.url),'utf8');
function harness(){
 const calls=[],exports={};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,{
  exports,Error,require:name=>{
   if(name.endsWith('/productLabelPrint'))return {validateProductLabelSize(){},productLabelQr:async()=>'qr',productLabelDocument:()=>({documentElement:{outerHTML:'<html></html>'}}),printProductLabel:async(...args)=>calls.push(args)};
   if(name.endsWith('/productBarcodes'))return {generateInternalBarcode:()=> '200000500006',productBarcodeValue:p=>p.barcode||p.sku||'',productBarcodeSvg:async code=>{if(!code)throw Error('Informe um código');return 'bars';}};
   return require(name);
  },
 });return {...exports,calls};
}
test('generated barcode waits for confirmed persistence, blocks duplicate saves and prints the saved product code',async()=>{
 const h=harness(),saved=[];let finish,r,closed=false;
 const product={id:'p',name:'Product',branch_id:'b',sku:null,barcode:null,sale_price:10};
 await act(async()=>{r=Renderer.create(React.createElement(h.ProductLabelModal,{product,products:[product],onSaveBarcode:code=>{saved.push(code);return new Promise(resolve=>{finish=resolve;});},onClose:()=>{closed=true;}}));});
 try {
  await act(async()=>r.root.findByProps({'aria-label':'Tipo de código da etiqueta'}).props.onChange({target:{value:'barcode'}}));
  const generate=r.root.findAllByType('button').find(b=>b.children.includes('Gerar código interno'));
  await act(async()=>{generate.props.onClick();generate.props.onClick();});
  assert.deepEqual(saved,['200000500006']);
  const print=()=>r.root.findByProps({className:'module-submit-btn'});
  assert.equal(print().props.disabled,true);
  await act(async()=>r.root.findByProps({'aria-label':'Fechar etiqueta'}).props.onClick());
  assert.equal(closed,false);
  await act(async()=>finish());
  assert.equal(print().props.disabled,false);
  await act(async()=>print().props.onClick());
  assert.equal(h.calls[0][0].barcode,'200000500006');
  assert.equal(h.calls[0][1].codeType,'barcode');
 }finally{await act(async()=>r.unmount());}
});
test('failed persistence leaves the new code unavailable for printing',async()=>{
 const h=harness();let r;
 await act(async()=>{r=Renderer.create(React.createElement(h.ProductLabelModal,{product:{id:'p',name:'Product',barcode:null},onSaveBarcode:async()=>{throw Error('Save rejected');},onClose(){}}));});
 try {
  await act(async()=>r.root.findByProps({'aria-label':'Tipo de código da etiqueta'}).props.onChange({target:{value:'barcode'}}));
  await act(async()=>r.root.findAllByType('button').find(b=>b.children.includes('Gerar código interno')).props.onClick());
  assert.match(JSON.stringify(r.toJSON()),/Save rejected/);
  assert.equal(r.root.findByProps({className:'module-submit-btn'}).props.disabled,true);
  assert.equal(h.calls.length,0);
 }finally{await act(async()=>r.unmount());}
});
