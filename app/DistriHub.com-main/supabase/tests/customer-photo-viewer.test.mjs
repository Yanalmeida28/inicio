import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';
const require=createRequire(import.meta.url),exports={},listeners=new Map(),requests=[];
let response={data:{signedUrl:'https://example.test/private-photo'},error:null},view;
const document={activeElement:null,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
vm.runInNewContext(ts.transpileModule(await readFile(new URL('../../src/components/partner/CustomerPhotoViewer.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Error,document,HTMLElement:class {},require(name){
 if(name==='../../lib/supabase')return {supabase:{storage:{from(bucket){return {async createSignedUrl(path){requests.push({bucket,path});return response;}};}}}};
 return require(name);
}});
afterEach(async()=>{if(view)await act(async()=>view.unmount());view=null;requests.length=0;response={data:{signedUrl:'https://example.test/private-photo'},error:null};});
test('photo viewer shows the full saved photo without an edit form and closes with X or Escape',async()=>{
 let closed=0;
 await act(async()=>{view=Renderer.create(React.createElement(exports.CustomerPhotoViewer,{name:'Cliente',path:'owner/customer/photo.png',onClose:()=>closed++}));});
 assert.equal(view.root.findByType('img').props.src,response.data.signedUrl);
 assert.equal(view.root.findAllByType('form').length,0);
 assert.equal(view.root.findAllByType('input').length,0);
 assert.deepEqual(requests,[{bucket:'customer-photos',path:'owner/customer/photo.png'}]);
 await act(async()=>view.root.findByProps({'aria-label':'Fechar foto ampliada'}).props.onClick());
 assert.equal(closed,1);
 listeners.get('keydown')({key:'Escape',preventDefault(){}});
 assert.equal(closed,2);
 await act(async()=>view.unmount());view=null;
 assert.equal(listeners.has('keydown'),false);
});
test('missing customer photo explains the empty state without requesting storage',async()=>{
 await act(async()=>{view=Renderer.create(React.createElement(exports.CustomerPhotoViewer,{name:'Cliente',path:null,onClose(){}}));});
 assert.equal(requests.length,0);
 assert.equal(view.root.findAllByType('img').length,0);
 assert.match(JSON.stringify(view.toJSON()),/ainda não possui foto/);
});
test('unavailable photo is reported and the close button remains available',async()=>{
 response={data:null,error:{message:'denied'}};
 await act(async()=>{view=Renderer.create(React.createElement(exports.CustomerPhotoViewer,{name:'Cliente',path:'private.png',onClose(){}}));});
 assert.match(view.root.findByProps({role:'alert'}).children.join(''),/Não foi possível carregar/);
 assert.equal(view.root.findByProps({'aria-label':'Fechar foto ampliada'}).props.type,'button');
});
