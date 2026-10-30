import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
const require=createRequire(import.meta.url);
const source=await readFile(new URL('../../src/lib/productBarcodes.ts',import.meta.url),'utf8');
const exports={};
const element=(tag,ns)=>({tag,namespaceURI:ns,attrs:{},children:[],setAttribute(k,v){this.attrs[k]=String(v);},appendChild(n){this.children.push(n);}});
const serialize=n=>'<'+n.tag+' '+Object.entries(n.attrs).map(([k,v])=>k+'="'+v+'"').join(' ')+'>'+n.children.map(serialize).join('')+'</'+n.tag+'>';
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
 exports,document:{createElementNS:(ns,tag)=>element(tag,ns)},XMLSerializer:class{serializeToString(n){return serialize(n);}},
 require:name=>({default:require(name)}),
});
test('factory numbers retain leading zeros and internal generation skips existing barcode and SKU values',()=>{
 assert.equal(exports.productBarcodeValue({barcode:' 001234 ',sku:'fallback'}),'001234');
 assert.equal(exports.productBarcodeValue({sku:'FACTORY-1'}),'FACTORY-1');
 const used='200000100002';let calls=0;
 const code=exports.generateInternalBarcode([{barcode:used},{sku:'200000300004'}],()=>++calls===1?[1,2]:calls===2?[3,4]:[5,6]);
 assert.equal(code,'200000500006');
 assert.throws(()=>exports.generateInternalBarcode([{barcode:used}],()=>[1,2]),/gerar/);
});
test('actual Code 128 bars decode exactly for manufacturer numbers, letters and generated internal codes',async()=>{
 const {Code128Reader,BitArray}=require('@zxing/library');
 for(const code of ['001234567890','ABC-123','200000500006']) {
  const uri=await exports.productBarcodeSvg(code),svg=decodeURIComponent(uri.split(',')[1]);
  const width=Number(svg.match(/data-bar-modules="(\d+)"/)[1]);
  const row=new BitArray(width*3);
  for(const match of svg.matchAll(/<rect ([^>]+)>/g)){
   const attrs=Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
   if(attrs.fill!=='#000')continue;
   const x=Number(attrs.x);assert.ok(x>=10&&x<width-10);
   for(let i=x*3;i<(x+1)*3;i++)row.set(i);
  }
  assert.equal(new Code128Reader().decodeRow(0,row).getText(),code);
 }
 await assert.rejects(exports.productBarcodeSvg(''),/Informe/);
 await assert.rejects(exports.productBarcodeSvg('Peça'),/Informe/);
});
