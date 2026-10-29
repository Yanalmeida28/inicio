import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';

const source=await readFile(new URL('../../src/lib/productLabelPrint.ts',import.meta.url),'utf8');
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
    assert.match(css,/grid-template-rows: minmax\(0,1fr\) auto; text-align: center/);
    assert.equal(doc.body.children[0].children[0].className,'label-qr');
    assert.equal(doc.body.children[0].children[1].className,'label-info');
  }
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
