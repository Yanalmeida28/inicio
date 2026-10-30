import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
const require=createRequire(import.meta.url),print={},api={};
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
vm.runInNewContext(compile(await readFile(new URL('../../src/lib/productLabelPrint.ts',import.meta.url),'utf8')),{exports:print,require:()=>({money})});
class Parser{
 parseFromString(source){
  const attrs=text=>Object.fromEntries([...text.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
  const root=attrs(source.match(/<svg ([^>]+)>/)?.[1]??'');
  return {documentElement:{localName:source.startsWith('<svg ')?'svg':'parsererror',getAttribute:k=>root[k]??null},querySelector:()=>null,
   getElementsByTagName:()=>[...source.matchAll(/<rect ([^>]+)>/g)].map(m=>({getAttribute:k=>attrs(m[1])[k]??null}))};
 }
}
vm.runInNewContext(compile(await readFile(new URL('../../src/lib/productLabelPdf.ts',import.meta.url),'utf8')),{exports:api,DOMParser:Parser,require:name=>name==='./productLabelPrint'?print:name==='../utils'?{money}:require(name)});
const product={id:'id',name:"CABO DE DADOS LCD DIGITAL TIPO/IOS H'MASTON",sku:'206930688421',sale_price:35};
const uri=barcode=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(barcode
 ?'<svg viewBox="0 0 121 60" data-bar-modules="121"><rect x="10" y="0" width="2" height="60" fill="#000"/></svg>'
 :'<svg viewBox="0 0 29 29" data-modules="29"><rect x="4" y="4" width="7" height="7" fill="#000000"/></svg>');
test('QR and barcode PDFs contain exactly one custom-sized page in either orientation without browser headers or blank pages',async()=>{
 for(const codeType of ['qr','barcode'])for(const [width,height] of [[40,58],[58,40],[50,80]]){
  const pdf=await api.createProductLabelPdf(product,{width,height,codeType},uri(codeType==='barcode'));
  assert.equal(pdf.getNumberOfPages(),1);
  assert.ok(Math.abs(pdf.internal.pageSize.getWidth()-width)<0.00001);
  assert.ok(Math.abs(pdf.internal.pageSize.getHeight()-height)<0.00001);
  const output=pdf.output();
  assert.match(output,/\/Count 1\b/);
  assert.doesNotMatch(output,/about:blank|window\.print|<html/);
  assert.ok(pdf.output('blob').size>0);
 }
});
test('PDF layout keeps all code rectangles in the safe printable area and rejects invalid or oversized contents',async()=>{
 const layout=print.productLabelLayout({width:40,height:58,marginMm:4},uri(false));
 assert.ok(layout.imageX>=4&&layout.imageY>=4);
 assert.ok(layout.imageX+layout.imageWidth<=36&&layout.imageY+layout.imageHeight<=54);
 await assert.rejects(api.createProductLabelPdf(product,{width:40,height:58},'invalid'),/inválido/);
 await assert.rejects(api.createProductLabelPdf({...product,sku:'LONGCODE'.repeat(40)},{width:40,height:58},uri(false)),/informações/);
 const hidden=await api.createProductLabelPdf(product,{width:40,height:58,showPrice:false},uri(false));
 assert.equal(hidden.getNumberOfPages(),1);
});
