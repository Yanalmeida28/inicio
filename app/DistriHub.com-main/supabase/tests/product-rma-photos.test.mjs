import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';
import { PGlite } from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const owner='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002',rma='00000000-0000-0000-0000-000000000003';
const migration=await readFile(new URL('../migrations/20261013193346_product_photos_and_rma_attachments.sql',import.meta.url),'utf8');
test('product photos are owner-scoped and RMA attachments are additive, private and retry-safe',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE SCHEMA storage;CREATE SCHEMA partner_rma_private;CREATE SCHEMA partner_subscription_private;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
   CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1,'/') $$;
   CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
   ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT USAGE ON SCHEMA auth,storage TO authenticated;GRANT SELECT,INSERT,UPDATE ON storage.objects TO authenticated;
   CREATE TABLE rma_requests_v2(id uuid PRIMARY KEY,user_id uuid,branch_id uuid,attachments jsonb DEFAULT '[]',updated_at timestamptz,destination text,refund_amount numeric,credit_amount numeric);
   CREATE FUNCTION partner_subscription_private.require_actor(text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF; END $$;
   CREATE FUNCTION resolve_partner_pdv_operator(uuid,text,uuid) RETURNS TABLE(company_id uuid) LANGUAGE sql AS $$ SELECT auth.uid() $$;
   INSERT INTO rma_requests_v2 VALUES('${rma}','${owner}','${owner}','[]',now(),'avaria',20,0);SET test.actor='${owner}';
  `);
  await db.exec(migration);
  const path=`${owner}/${rma}/photo.png`;
  await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('rma-attachments',$1)",[path]);
  const add=()=>db.query("SELECT add_partner_rma_attachment($1,'defect','photo.png',$2)",[rma,path]);
  await add();await add();
  const saved=(await db.query('SELECT * FROM rma_requests_v2')).rows[0];
  assert.equal(saved.attachments.length,1);assert.equal(saved.destination,'avaria');assert.equal(Number(saved.refund_amount),20);
  await assert.rejects(db.query("SELECT add_partner_rma_attachment($1,'after','different.png',$2)",[rma,path]),/outros dados/);
  await assert.rejects(db.query("UPDATE rma_requests_v2 SET attachments='[]'"),/permanecer/);
  await assert.rejects(db.query("SELECT add_partner_rma_attachment($1,'defect','photo.png',$2)",[rma,`${other}/${rma}/other.png`]),/invalido/);
  await db.exec(`SET test.actor='${other}'`);await assert.rejects(add(),/fora da empresa/);
  await db.exec(`SET test.actor='${owner}';SET ROLE authenticated`);
  await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('product-photos',$1)",[`${owner}/product.png`]);
  await assert.rejects(db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('product-photos',$1)",[`${other}/product.png`]),/row-level security/);
  assert.equal((await db.query('SELECT count(*)::int n FROM storage.objects')).rows[0].n,1);
  await db.exec('RESET ROLE;SET ROLE anon');await assert.rejects(add(),/permission denied/);
 } finally {await db.close();}
});
async function component(file,client,extra={}) {
 const exports={};let id=0;
 const photos={};
 vm.runInNewContext(ts.transpileModule(await readFile(new URL('../../src/lib/productPhoto.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:photos,Error,File});
 vm.runInNewContext(ts.transpileModule(await readFile(new URL(`../../src/components/partner/${file}.tsx`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Error,crypto:{randomUUID:()=>`photo-${++id}`},URL:{createObjectURL:file=>`blob:${file.name}`,revokeObjectURL(){}},require:name=>name==='../../lib/supabase'?{supabase:client}:name==='../../lib/productPhoto'?photos:require(name),...extra});
 return exports[file];
}
test('product photo rejects unsupported files, uploads to the current user folder and permits removal',async()=>{
 const uploads=[],changes=[],busy=[];
 const Field=await component('ProductPhotoField',{auth:{getUser:async()=>({data:{user:{id:owner}}})},storage:{from:bucket=>({upload:async(path,file)=>{uploads.push([bucket,path,file]);return {};},getPublicUrl:path=>({data:{publicUrl:`https://storage.test/${path}`}})})}});
 let view;act(()=>{view=TestRenderer.create(React.createElement(Field,{value:null,onChange:value=>changes.push(value),disabled:false,onBusyChange:value=>busy.push(value)}));});
 try {
  assert.equal(view.root.findAllByType('input').filter(input=>!input.props.hidden).length,0);
  const select=async file=>act(async()=>view.root.findByProps({className:'product-photo-control'}).props.onPaste({preventDefault(){},clipboardData:{files:[file]}}));
  await select({name:'bad.svg',type:'image/svg+xml',size:10});assert.equal(uploads.length,0);
  await select({name:'large.png',type:'image/png',size:26*1024*1024});assert.equal(uploads.length,0);
  busy.length=0;
  await select({name:'ok.png',type:'image/png',size:100});assert.equal(uploads.length,1);assert.equal(uploads[0][0],'product-photos');assert.equal(uploads[0][1],`${owner}/photo-1.png`);
  assert.deepEqual(busy,[true,false]);assert.equal(changes.length,1);
  act(()=>view.update(React.createElement(Field,{value:changes[0],onChange:value=>changes.push(value),disabled:false,onBusyChange(){}})));
  act(()=>view.root.findByProps({'aria-label':'Opções da foto do produto'}).props.onClick());
  act(()=>view.root.findAllByProps({role:'menuitem'}).find(button=>button.children.includes('Remover foto')).props.onClick());assert.equal(changes[1],null);
 } finally {act(()=>view.unmount());}
});

test('product photo offers capture, gallery, paste and removal without visible file selectors',async()=>{
 const uploads=[],changes=[];
 const file=new File(['photo'],'copied.png',{type:'image/png'});
 const Field=await component('ProductPhotoField',{auth:{getUser:async()=>({data:{user:{id:owner}}})},storage:{from:()=>({upload:async(path,file)=>{uploads.push(file);return {};},getPublicUrl:()=>({data:{publicUrl:'https://storage.test/photo.png'}})})}},{File,navigator:{clipboard:{read:async()=>[{types:['image/png'],getType:async()=>file}]}}});
 let view;
 await act(async()=>{view=TestRenderer.create(React.createElement(Field,{value:null,onChange:value=>changes.push(value),disabled:false,onBusyChange(){}}));});
 try {
  assert.equal(view.root.findAllByType('input').length,2);
  assert.ok(view.root.findAllByType('input').every(input=>input.props.hidden));
  assert.equal(view.root.findByProps({'aria-label':'Tirar foto do produto'}).props.capture,'environment');
  assert.equal(view.root.findByProps({'aria-label':'Escolher foto nos arquivos ou galeria'}).props.capture,undefined);
  await act(async()=>view.root.findByProps({'aria-label':'Opções da foto do produto'}).props.onClick());
  assert.equal(view.root.findAllByProps({role:'menuitem'}).length,4);
  await act(async()=>view.root.findAllByProps({role:'menuitem'}).find(button=>button.children.includes('Colar foto')).props.onClick());
  assert.equal(uploads.length,1);assert.equal(uploads[0].type,'image/png');
  assert.deepEqual(changes,['https://storage.test/photo.png']);
  assert.equal(view.root.findAllByProps({role:'menu'}).length,0);
 } finally {await act(async()=>view.unmount());}
});
test('product camera and gallery open separate pickers and send selected photos through the authenticated upload',async()=>{
 const uploads=[],changes=[],opened=[];
 const Field=await component('ProductPhotoField',{auth:{getUser:async()=>({data:{user:{id:owner}}})},storage:{from:()=>({upload:async(path,file)=>{uploads.push({path,file});return {};},getPublicUrl:path=>({data:{publicUrl:`https://storage.test/${path}`}})})}});
 let view;
 await act(async()=>{view=TestRenderer.create(React.createElement(Field,{value:null,onChange:value=>changes.push(value),disabled:false,onBusyChange(){}}),{createNodeMock:element=>element.type==='input'?{click(){opened.push(element.props.capture?'camera':'gallery');}}:null});});
 try {
  for(const [action,label,type] of [['Tirar foto','Tirar foto do produto','image/jpeg'],['Arquivos / Galeria','Escolher foto nos arquivos ou galeria','image/png']]) {
   await act(async()=>view.root.findByProps({'aria-label':'Opções da foto do produto'}).props.onClick());
   await act(async()=>view.root.findAllByProps({role:'menuitem'}).find(button=>button.children.includes(action)).props.onClick());
   const target={files:[{name:'photo',type,size:100}],value:'selected'};
   await act(async()=>view.root.findByProps({'aria-label':label}).props.onChange({currentTarget:target}));
   assert.equal(target.value,'');
  }
  assert.deepEqual(opened,['camera','gallery']);assert.equal(uploads.length,2);assert.equal(changes.length,2);
  assert.ok(uploads.every(row=>row.path.startsWith(owner+'/')));
  await act(async()=>view.root.findByProps({'aria-label':'Tirar foto do produto'}).props.onChange({currentTarget:{files:[],value:''}}));
  assert.equal(uploads.length,2);
 } finally {await act(async()=>view.unmount());}
});

test('RMA multiple photos preserve file identities after a failed save and block duplicate submissions',async()=>{
 const Form=await component('RmaPhotoUpload');let view,fail=true;const calls=[];
 act(()=>{view=TestRenderer.create(React.createElement(Form,{rma:{id:rma,product_name:'Peça',attachments:[]},onClose(){},onSave:async(id,files)=>{calls.push([id,files]);if(fail)throw new Error('Falha de conexão');}}));});
 try {
  act(()=>view.root.findByType('input').props.onChange({target:{files:[{name:'a.png',type:'image/png',size:10},{name:'b.png',type:'image/png',size:10}],value:'file'}}));
  await act(async()=>{const submit=view.root.findByType('form').props.onSubmit;await Promise.all([submit({preventDefault(){}}),submit({preventDefault(){}})]);});
  assert.equal(calls.length,1);assert.equal(calls[0][1].length,2);
  assert.equal(view.root.findByType('fieldset').props.disabled,true);
  fail=false;await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
  assert.equal(calls[0][1],calls[1][1]);assert.equal(calls[0][1][0].id,'photo-1');
 } finally {act(()=>view.unmount());}
});
