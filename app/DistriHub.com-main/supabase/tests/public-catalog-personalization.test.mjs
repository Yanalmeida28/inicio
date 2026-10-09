import assert from 'node:assert/strict';
import { test,afterEach } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';
import { personalizationHelpers } from './fixtures/personalization_helpers.mjs';
const require=createRequire(import.meta.url);
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
const theme={};
vm.runInNewContext(compile(await readFile(new URL('../../src/lib/storeTheme.ts',import.meta.url),'utf8')),{exports:theme});
const source=compile(await readFile(new URL('../../src/components/PublicCatalogPage.tsx',import.meta.url),'utf8'));
let renderer;
afterEach(async()=>{if(renderer)await act(async()=>renderer.unmount());renderer=null;});
function component(rpc){
  const exports={};
  vm.runInNewContext(source,{exports,Error,require(name){
    if(name==='../lib/supabase')return {supabase:{rpc},isSupabaseConfigured:true};
    if(name==='../lib/personalization')return personalizationHelpers;
    if(name==='../lib/storeTheme')return theme;
    return require(name);
  }});
  return exports.PublicCatalogPage;
}
test('catalog personalization controls welcome text, stock, SKU and contact without reloading after branch resolution',async()=>{
  const calls=[];
  const Component=component(async(name,args)=>{calls.push({name,args});return {error:null,data:{
    settings:{catalog_enabled:true,catalog_slug:'loja',primary_color:'#2563eb',nav_color:'#0f2747',catalog_preferences:{welcome_message:'Bem-vindo à loja!',show_stock:false,show_sku:false,whatsapp_phone:'11999999999'}},
    profile:{business_name:'Loja'},branch:{id:'branch',name:'Centro'},products:[{id:'p',name:'Produto',sale_price:100,stock:10,sku:'ABC123'}],
  }};});
  await act(async()=>{renderer=TestRenderer.create(React.createElement(Component,{slug:'loja',branchSlug:'Centro'}));});
  const output=JSON.stringify(renderer.toJSON());
  assert.ok(output.includes('Bem-vindo à loja!'));
  assert.ok(!output.includes('10 em estoque'));
  assert.ok(!output.includes('ABC123'));
  assert.equal(renderer.root.findByType('a').props.href,'https://wa.me/5511999999999');
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,'read_public_store_catalog');
  assert.equal(calls[0].args.p_branch_slug,'Centro');
});
test('a disabled or unknown catalog displays an unavailable message',async()=>{
  const Component=component(async()=>({data:null,error:null}));
  await act(async()=>{renderer=TestRenderer.create(React.createElement(Component,{slug:'disabled'}));});
  assert.ok(JSON.stringify(renderer.toJSON()).includes('Este catálogo está indisponível'));
  assert.equal(renderer.root.findAllByType('a').length,0);
});
