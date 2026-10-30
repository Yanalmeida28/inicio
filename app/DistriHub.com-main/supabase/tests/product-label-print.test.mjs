import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from '../../node_modules/typescript/lib/typescript.js';

const source=await readFile(new URL('../../src/lib/productLabelPrint.ts',import.meta.url),'utf8');
const require=createRequire(import.meta.url);
const product={id:'product-id',name:'Produto <img src=x onerror=alert(1)>',sku:'TEST-123',sale_price:39.9};
function harness({blocked=false,decode=()=>Promise.resolve()}={}) {
  const calls=[];
  function document() {
    const doc={images:[],documentElement:{lang:''},createElement(tag){
      const node={tag,children:[],attributes:{},setAttribute(key,value){this.attributes[key]=value;},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},decode};
      if(tag==='img')doc.images.push(node);
      return node;
    }};
    doc.head=doc.createElement('head');doc.body=doc.createElement('body');return doc;
  }
  const doc=document();
  const popup={document:doc,closed:false,focus(){calls.push('focus');},print(){calls.push('popup-print');},close(){calls.push('close');this.closed=true;},requestAnimationFrame(callback){callback();}};
  const exports={};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
    exports,document:{implementation:{createHTMLDocument:document}},window:{open(){calls.push('open');return blocked?null:popup;},print(){throw Error('The application page must never be printed');}},
    require(name){if(name==='../utils')return {money:new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})};throw Error(name);},
  });
  return {...exports,doc,popup,calls};
}
test('product label is an isolated white document with physical page size and literal product text',()=>{
  const api=harness();
  const doc=api.productLabelDocument(product,{width:50,height:30},'data:image/svg+xml,qr');
  assert.equal(doc.body.children.length,1);assert.equal(doc.body.children[0].tag,'main');
  assert.equal(doc.images.length,1);assert.equal(doc.images[0].src,'data:image/svg+xml,qr');
  const info=doc.body.children[0].children[1].children;
  assert.equal(info[0].textContent,product.name);assert.equal(info[0].children.length,0);
  assert.equal(info[1].textContent,'SKU: TEST-123');assert.match(info[2].textContent,/39,90/);
  const css=doc.head.children.find(node=>node.tag==='style').textContent;
  assert.match(css,/@page \{ size: 50mm 30mm; margin: 0;/);
  assert.match(css,/background: #fff; color: #000/);
  assert.doesNotMatch(css,/modal|partner-panel/);
});
test('vertical labels use portrait paper and stack the QR above centered product information',()=>{
  const api=harness();
  for(const size of [{width:40,height:58},{width:50,height:80},{width:30,height:50}]) {
    const doc=api.productLabelDocument(product,size,'qr');
    const css=doc.head.children.find(node=>node.tag==='style').textContent;
    assert.ok(css.includes('size: '+size.width+'mm '+size.height+'mm'));
    assert.match(css,/grid-template-columns: minmax\(0,1fr\)/);
    assert.ok(css.includes('grid-template-rows: '+api.productLabelQrSide(size,'qr')+'mm minmax(0,1fr); text-align: center'));
    assert.equal(doc.body.children[0].children[0].className,'label-qr');
    assert.equal(doc.body.children[0].children[1].className,'label-info');
  }
});

test('hiding price removes it from both generated labels and the printed document',async()=>{
  const api=harness();
  for (const size of [{width:40,height:58},{width:58,height:40}]) {
    const doc=api.productLabelDocument(product,{...size,showPrice:false},'qr');
    const info=doc.body.children[0].children[1].children;
    assert.deepEqual(info.map(node=>node.className),['label-name','label-sku']);
  }
  await api.printProductLabel(product,{width:40,height:58,showPrice:false},'qr');
  assert.equal(api.doc.body.children[0].children[1].children.some(node=>node.className==='label-price'),false);
  assert.ok(api.calls.includes('popup-print'));
});

test('small labels refuse to shrink a dense QR and longer data requires more physical space',()=>{
  const api=harness();
  assert.throws(()=>api.productLabelDocument(product,{width:30,height:20},'qr'),/pequena/);
  const dense='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg data-modules="65"></svg>');
  assert.equal(api.productLabelQrSide({width:50,height:80},dense),46);
  assert.throws(()=>api.productLabelQrSide({width:40,height:58},dense),/pequena/);
});

test('real generated SVG QR codes decode to the exact SKU or product ID with white four-module margins',async()=>{
  const previous=globalThis.document;
  const node=tag=>({tag,attributes:{},children:[],setAttribute(k,v){this.attributes[k]=String(v);},getAttribute(k){return this.attributes[k]??null;},
    appendChild(n){this.children.push(n);},insertBefore(n){this.children.unshift(n);},get firstChild(){return this.children[0]??null;}});
  const dom={createElementNS(_ns,tag){return node(tag);}};
  const serialize=n=>'<'+n.tag+' '+Object.entries(n.attributes).map(([k,v])=>k+'="'+v+'"').join(' ')+'>'+n.children.map(serialize).join('')+'</'+n.tag+'>';
  const exports={};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
    exports,document:dom,XMLSerializer:class{serializeToString(n){return serialize(n);}},
    require:name=>name==='../utils'?{money:new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})}:require(name),
  });
  const {QRCodeReader,RGBLuminanceSource,HybridBinarizer,BinaryBitmap}=require('@zxing/library');
  try {
    globalThis.document=dom;
    for(const sku of ['TEST-123','Peça-çã-中文','', 'SKU-'+ '1234567890'.repeat(10)]) {
      const url=await exports.productLabelQr({...product,sku});
      const svg=decodeURIComponent(url.split(',')[1]);
      const modules=Number(svg.match(/data-modules="(\d+)"/)[1]);
      assert.match(svg,/fill="#fff"/);
      const scale=4,width=modules*scale,pixels=new Uint8ClampedArray(width*width).fill(255);
      for(const rect of svg.matchAll(/<rect ([^>]+)>/g)) {
        const attrs=Object.fromEntries([...rect[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
        if(attrs.fill!=='#000000')continue;
        const x=Number(attrs.x),y=Number(attrs.y),w=Number(attrs.width),h=Number(attrs.height);
        assert.ok(x>=4&&y>=4&&x+w<=modules-4&&y+h<=modules-4);
        for(let row=y*scale;row<(y+h)*scale;row++)for(let col=x*scale;col<(x+w)*scale;col++)pixels[row*width+col]=0;
      }
      const result=new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels,width,width))));
      assert.equal(result.getText(),sku||product.id);
    }
  } finally {globalThis.document=previous;}
});

test('barcode labels print the saved code and refuse bars that would be too narrow',()=>{
 const api=harness();
 const uri='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg data-bar-modules="121"></svg>');
 const doc=api.productLabelDocument({...product,barcode:'001234567890'},{width:40,height:58,codeType:'barcode'},uri);
 assert.equal(doc.body.children[0].children[1].children[1].textContent,'Código: 001234567890');
 assert.equal(doc.images[0].alt,'Código de barras do produto');
 const dense='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg data-bar-modules="300"></svg>');
 assert.throws(()=>api.productLabelDocument(product,{width:40,height:58,codeType:'barcode'},dense),/pequena/);
});

test('printing waits for QR image decoding and prints the separate document only',async()=>{
  let release;
  const api=harness({decode:()=>new Promise(resolve=>{release=resolve;})});
  const pending=api.printProductLabel(product,{width:58,height:40},'qr');
  assert.deepEqual(api.calls,['open']);
  release();await pending;
  assert.deepEqual(api.calls,['open','focus','popup-print']);
});
test('invalid dimensions never open a print window',async()=>{
  const api=harness();
  for(const size of [{width:NaN,height:30},{width:50,height:0},{width:151,height:30},{width:10,height:20}])await assert.rejects(api.printProductLabel(product,size,'qr'),/largura/);
  assert.deepEqual(api.calls,[]);
});
test('blocked popups report an actionable error; failed QR never prints',async()=>{
  await assert.rejects(harness({blocked:true}).printProductLabel(product,{width:80,height:50},'qr'),/pop-ups/);
  const api=harness({decode:()=>Promise.reject(Error('Image failed'))});
  await assert.rejects(api.printProductLabel(product,{width:80,height:50},'qr'),/Image failed/);
  assert.deepEqual(api.calls,['open','close']);
});
