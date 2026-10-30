import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';
const require=createRequire(import.meta.url);
const source=ts.transpileModule(await readFile(new URL('../../src/components/AppUpdateNotice.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
async function harness(version='current',prepare=async()=>{}){
 const exports={},listeners=new Map(),timers=new Map(),replaced=[],requests=[];let next=version,id=0;
 const add=(name,fn)=>listeners.set(name,fn),remove=name=>listeners.delete(name);
 const document={visibilityState:'visible',addEventListener:add,removeEventListener:remove};
 const window={setTimeout:()=>++id,clearTimeout(){},setInterval:fn=>{timers.set(++id,fn);return id;},clearInterval:key=>timers.delete(key),addEventListener:add,removeEventListener:remove,location:{href:'https://distrihub.com.br/?cadastro=0',replace:url=>replaced.push(url)}};
 vm.runInNewContext(source,{exports,require:name=>name==='../lib/appUpdateSession'?{prepareAppUpdate:prepare}:require(name),Error,URL,AbortController,Date,document,window,__APP_BUILD_ID__:'current',fetch:async(url,options)=>{requests.push(options);if(next==='offline')throw Error('offline');return {ok:true,json:async()=>({buildId:next})};}});
 let view;await act(async()=>{view=TestRenderer.create(React.createElement(exports.AppUpdateNotice));});
 return {view,document,replaced,requests,listeners,timers,setVersion:value=>{next=value;},resume:()=>listeners.get('pageshow')()};
}
test('a stale mobile page offers an explicit cache-busting update without discarding work automatically',async()=>{
 const h=await harness('new-release');try{
 assert.match(JSON.stringify(h.view.toJSON()),/Salve o formulário/);assert.equal(h.replaced.length,0);assert.equal(h.requests[0].cache,'no-store');
 await act(async()=>h.view.root.findByType('button').props.onClick());
 const target=new URL(h.replaced[0]);assert.equal(target.searchParams.get('_app_version'),'new-release');assert.equal(target.searchParams.get('cadastro'),'0');
 }finally{await act(async()=>h.view.unmount());}assert.equal(h.listeners.size,0);assert.equal(h.timers.size,0);
});

test('mobile updates wait for session persistence, block duplicate clicks and preserve the current page on recovery failure',async()=>{
 let finish,calls=0;
 const h=await harness('new-release',()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
 try{
  await act(async()=>{h.view.root.findByType('button').props.onClick();h.view.root.findByType('button').props.onClick();});
  assert.equal(calls,1);assert.equal(h.replaced.length,0);
  assert.equal(h.view.root.findByType('button').props.disabled,true);
  await act(async()=>finish());
  assert.equal(h.replaced.length,1);
 }finally{await act(async()=>h.view.unmount());}
 const failed=await harness('new-release',async()=>{throw Error('Sessão não confirmada');});
 try{
  await act(async()=>failed.view.root.findByType('button').props.onClick());
  assert.equal(failed.replaced.length,0);
  assert.match(JSON.stringify(failed.view.toJSON()),/Sessão não confirmada/);
  assert.equal(failed.view.root.findByType('button').props.disabled,false);
 }finally{await act(async()=>failed.view.unmount());}
});

test('a late update check cannot navigate after the update notice unmounts',async()=>{
 let finish;const h=await harness('new-release',()=>new Promise(resolve=>{finish=resolve;}));
 await act(async()=>h.view.root.findByType('button').props.onClick());
 await act(async()=>h.view.unmount());
 await act(async()=>finish());
 assert.equal(h.replaced.length,0);
});
test('returning to an old Safari page checks the release; current versions and offline work remain uninterrupted',async()=>{
 const h=await harness();try{
 assert.equal(h.view.toJSON(),null);h.setVersion('offline');await act(async()=>h.resume());assert.equal(h.view.toJSON(),null);
 h.setVersion('new-release');h.document.visibilityState='hidden';await act(async()=>h.resume());assert.equal(h.view.toJSON(),null);
 h.document.visibilityState='visible';await act(async()=>h.resume());assert.match(JSON.stringify(h.view.toJSON()),/Nova versão/);
 }finally{await act(async()=>h.view.unmount());}
});
