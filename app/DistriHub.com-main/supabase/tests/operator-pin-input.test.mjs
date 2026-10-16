import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import React,{useState} from 'react';
import Renderer,{act} from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';
const require=createRequire(import.meta.url),exports={};
const source=await readFile(new URL('../../src/components/partner/OperatorPinInput.tsx',import.meta.url),'utf8');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require});

test('operator PIN ignores unsolicited changes, clears stale input and requires deliberate typing',async()=>{
 let value='saved-password',r;
 function Host(){const [pin,setPin]=useState(value);return React.createElement(exports.OperatorPinInput,{value:pin,onValueChange:v=>{value=v;setPin(v);}});}
 await act(async()=>{r=Renderer.create(React.createElement(Host));});
 const input=()=>r.root.findByType('input');
 assert.equal(input().props.value,'');assert.equal(input().props.readOnly,true);assert.equal(input().props.autoComplete,'new-password');
 await act(async()=>input().props.onChange({target:{value:'saved-password'}}));assert.equal(input().props.value,'');
 await act(async()=>input().props.onPointerDown());assert.equal(value,'');assert.equal(input().props.readOnly,false);
 await act(async()=>input().props.onChange({target:{value:'12a34567890'}}));assert.equal(value,'12345678');
 await act(async()=>r.unmount());
});

test('operator PIN supports the first keyboard digit, deliberate paste, and clears after operator changes',async()=>{
 let r,value='';const changed=v=>{value=v;};
 const render=key=>React.createElement(exports.OperatorPinInput,{key,value,onValueChange:changed});
 await act(async()=>{r=Renderer.create(render('first'));});
 let prevented=false;
 await act(async()=>r.root.findByType('input').props.onKeyDown({key:'7',preventDefault(){prevented=true;}}));assert.equal(value,'7');assert.equal(prevented,true);
 await act(async()=>r.update(render('second')));assert.equal(r.root.findByType('input').props.value,'');assert.equal(r.root.findByType('input').props.readOnly,true);
 await act(async()=>r.root.findByType('input').props.onPaste({preventDefault(){},clipboardData:{getData:()=> '1234'}}));assert.equal(value,'1234');
 await act(async()=>r.unmount());
});
