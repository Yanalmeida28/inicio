import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import vm from 'node:vm';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import TestRenderer, { act } from 'react-test-renderer';
import ts from '../../node_modules/typescript/lib/typescript.js';

const owner='00000000-0000-0000-0000-000000000001';
const branch='00000000-0000-0000-0000-000000000002';
const product='00000000-0000-0000-0000-000000000003';
const sale='00000000-0000-0000-0000-000000000004';
const customer='00000000-0000-0000-0000-000000000005';
const foreign='00000000-0000-0000-0000-000000000006';
const invoice='00000000-0000-0000-0000-000000000008';
const operation='00000000-0000-0000-0000-000000000009';
const migration = await readFile(new URL('../migrations/20261010200046_add_rma_customer_credits.sql',import.meta.url),'utf8');

test('RMA customer credit is bounded, atomic, idempotent and settles invoices without inventing cash receipts', async () => {
 const db=new PGlite();
 const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('test.actor',true),'')::uuid $$;
   CREATE TABLE auth.users(id uuid PRIMARY KEY);
   INSERT INTO auth.users VALUES('${owner}'),('${foreign}'); SET test.actor='${owner}';
   CREATE TABLE partner_branches(id uuid PRIMARY KEY,user_id uuid);
   CREATE TABLE partner_customers(id uuid PRIMARY KEY,user_id uuid);
   CREATE TABLE partner_products(id uuid PRIMARY KEY,user_id uuid,branch_id uuid,name text,sku text,stock integer,is_service boolean,updated_at timestamptz);
   CREATE TABLE partner_sales(id uuid PRIMARY KEY,user_id uuid,branch_id uuid,customer_id uuid,customer_name text,items jsonb,status text,total numeric);
   CREATE TABLE stock_movements(user_id uuid,product_id uuid,product_name text,type text,quantity integer,reason text,branch_id uuid);
   CREATE TABLE rma_requests_v2(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,product_name text,product_sku text,batch_or_order text,defect_description text,status text DEFAULT 'aguardando_troca',updated_at timestamptz);
   CREATE TABLE partner_invoices(id uuid PRIMARY KEY,user_id uuid,branch_id uuid,customer_id uuid,customer_name text,number text,amount numeric,paid_amount numeric DEFAULT 0,status text,paid_at timestamptz,sale_id uuid);
   CREATE TABLE partner_invoice_receipts(user_id uuid,invoice_id uuid,branch_id uuid,customer_id uuid,customer_name text,invoice_number text,amount numeric,occurred_at timestamptz);
   CREATE FUNCTION partner_employee_can_access_branch(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
   CREATE FUNCTION resolve_partner_pdv_operator(uuid,text,uuid) RETURNS TABLE(company_id uuid,salesperson_id uuid,role text,branch_id uuid) LANGUAGE sql AS $$ SELECT auth.uid(),NULL::uuid,COALESCE(NULLIF(current_setting('test.operator_role',true),''),'administrador'),$3 $$;
   CREATE SCHEMA partner_subscription_private;
   CREATE FUNCTION partner_subscription_private.require_actor(text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF; END $$;
   INSERT INTO partner_branches VALUES('${branch}','${owner}');
   INSERT INTO partner_customers VALUES('${customer}','${owner}'),('${foreign}','${foreign}');
   INSERT INTO partner_products VALUES('${product}','${owner}','${branch}','Peca','SKU',4,false,now());
   INSERT INTO partner_sales VALUES('${sale}','${owner}','${branch}','${customer}','Cliente','[{"product_id":"${product}","name":"Peca","quantity":3,"unit_price":20}]','concluida',60);
   INSERT INTO partner_invoices VALUES('${invoice}','${owner}','${branch}','${customer}','Cliente','F001',50,0,'aberta',NULL,NULL);`);
  await db.exec(await readFile(new URL('../migrations/20261006165722_link_rma_sale_items_and_stock.sql',import.meta.url),'utf8'));
  await db.exec(migration);
  await db.exec('CREATE TRIGGER capture_receipt AFTER INSERT OR UPDATE ON partner_invoices FOR EACH ROW EXECUTE FUNCTION capture_partner_invoice_receipt()');
  const rma=await one(`INSERT INTO rma_requests_v2(user_id,branch_id,sale_id,sale_item_index,product_id,customer_id,quantity,product_name,product_sku,batch_or_order) VALUES($1,$2,$3,0,$4,$5,2,'Peca','SKU','Venda') RETURNING id`,[owner,branch,sale,product,customer]);
  await assert.rejects(db.query('SELECT grant_partner_rma_credit($1,20)',[rma.id]),/Transicao|Credito exige/);
  await db.query("UPDATE rma_requests_v2 SET status='retornou_fornecedor' WHERE id=$1",[rma.id]);
  await db.query("UPDATE rma_requests_v2 SET status='reintegrado_estoque' WHERE id=$1",[rma.id]);
  await assert.rejects(db.query("UPDATE rma_requests_v2 SET status='credito_gerado' WHERE id=$1",[rma.id]),/Informe o valor/);
  await assert.rejects(db.query('SELECT grant_partner_rma_credit($1,40.01)',[rma.id]),/excede/);
  await assert.rejects(db.query('SELECT grant_partner_rma_credit($1,1.001)',[rma.id]),/invalido/);
  await db.exec("SET test.operator_role='vendedor'");
  await assert.rejects(db.query('SELECT grant_partner_rma_credit($1,40)',[rma.id]),/permissao/);
  await db.exec("SET test.operator_role='administrador'");
  await db.query('SELECT grant_partner_rma_credit($1,40)',[rma.id]);
  await db.query('SELECT grant_partner_rma_credit($1,40)',[rma.id]);
  assert.equal((await one('SELECT credit_amount FROM rma_requests_v2 WHERE id=$1',[rma.id])).credit_amount,'40.00');
  assert.equal((await one('SELECT stock FROM partner_products')).stock,6);
  await assert.rejects(db.query('SELECT grant_partner_rma_credit($1,39)',[rma.id]),/outro valor/);
  await assert.rejects(db.query('UPDATE rma_requests_v2 SET credit_amount=80 WHERE id=$1',[rma.id]),/imutavel/);
  await db.exec(`SET test.actor='${foreign}'`);
  await assert.rejects(db.query('SELECT apply_partner_rma_credit($1,$2,20,$3)',[rma.id,invoice,operation]),/permissao/);
  await db.exec(`SET test.actor='${owner}'; UPDATE partner_invoices SET customer_id='${foreign}' WHERE id='${invoice}'`);
  await assert.rejects(db.query('SELECT apply_partner_rma_credit($1,$2,20,$3)',[rma.id,invoice,operation]),/mesmo cliente/);
  await db.exec(`UPDATE partner_invoices SET customer_id='${customer}' WHERE id='${invoice}';
   CREATE FUNCTION fail_credit_application() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'ledger unavailable'; END $$;
   CREATE TRIGGER fail_application BEFORE INSERT ON partner_rma_credit_applications FOR EACH ROW EXECUTE FUNCTION fail_credit_application()`);
  await assert.rejects(db.query('SELECT apply_partner_rma_credit($1,$2,20,$3)',[rma.id,invoice,operation]),/ledger unavailable/);
  assert.equal((await one('SELECT paid_amount FROM partner_invoices')).paid_amount,'0');
  await db.exec('DROP TRIGGER fail_application ON partner_rma_credit_applications');
  await db.query('SELECT apply_partner_rma_credit($1,$2,20,$3)',[rma.id,invoice,operation]);
  await db.query('SELECT apply_partner_rma_credit($1,$2,20,$3)',[rma.id,invoice,operation]);
  assert.equal((await one('SELECT count(*)::int n FROM partner_rma_credit_applications')).n,1);
  assert.equal((await one('SELECT count(*)::int n FROM partner_invoice_receipts')).n,0);
  assert.equal((await one('SELECT return_credit_amount FROM partner_invoices')).return_credit_amount,'20.00');
  await assert.rejects(db.query('SELECT apply_partner_rma_credit($1,$2,21,gen_random_uuid())',[rma.id,invoice]),/insuficiente/);
  await assert.rejects(db.query('SELECT apply_partner_rma_credit($1,$2,19,$3)',[rma.id,invoice,operation]),/original/);
  await db.query('SELECT apply_partner_rma_credit($1,$2,20,gen_random_uuid())',[rma.id,invoice]);
  await db.exec("UPDATE partner_invoices SET paid_amount=50,status='paga'");
  assert.equal((await one('SELECT amount FROM partner_invoice_receipts')).amount,'10.00');
  await assert.rejects(db.exec("UPDATE partner_invoices SET status='cancelada'"),/preservar/);
  await db.exec('SET ROLE authenticated');
  assert.equal((await one('SELECT count(*)::int n FROM partner_rma_credit_applications')).n,2);
  await assert.rejects(db.exec('DELETE FROM partner_rma_credit_applications'),/permission denied/);
  await db.exec(`SET test.actor='${foreign}'`);
  assert.equal((await one('SELECT count(*)::int n FROM partner_rma_credit_applications')).n,0);
  await db.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(db.query('SELECT grant_partner_rma_credit($1,40)',[rma.id]),/permission denied/);
 } finally { await db.close(); }
});

async function component(file, name) {
 const module={exports:{}};
 const source=await readFile(new URL(`../../src/components/partner/${file}.tsx`,import.meta.url),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
  exports:module.exports, crypto:{randomUUID:()=>operation}, require(dependency) {
   if(dependency==='react') return React;
   if(dependency==='react/jsx-runtime') return jsx;
   if(dependency==='lucide-react') return new Proxy({},{get:()=>()=>null});
   if(dependency==='../../utils') return {money:{format:value=>`R$ ${Number(value).toFixed(2)}`}};
   if(dependency==='../../lib/saleReturns') return {returnedQuantity:()=>0};
   if(dependency==='../../data') return {rmaStatusFlow:['aguardando_troca','retornou_fornecedor','reintegrado_estoque','credito_gerado'],rmaStatusLabels:{reintegrado_estoque:'Reintegrado'},rmaStatusColors:{}};
   throw new Error(dependency);
  },
 });
 return module.exports[name];
}

test('RMA asks for a credit value, preserves a failed value and submits the linked return', async () => {
 const RmaModule=await component('RmaModule','RmaModule');
 let view; const calls=[];
 const rma={id:'rma',customer_name:'Cliente',customer_id:customer,sale_id:sale,sale_item_index:0,quantity:2,product_name:'Peca',status:'reintegrado_estoque',created_at:'2026-10-10',credit_amount:0,credit_used_amount:0};
 act(()=>{view=TestRenderer.create(React.createElement(RmaModule,{rmaRequests:[rma],customers:[],products:[],sales:[{id:sale,items:[{unit_price:20}]}],currentRole:'administrador',warrantyTerms:'',onGrantCredit:async(id,value)=>{calls.push([id,value]);if(calls.length===1)throw {message:'Falha temporária'};},onUpdateStatus:async()=>{throw new Error('status-only credit must not be sent');}}));});
 try {
  await act(async()=>{await view.root.findAllByType('button').find(button=>button.props.title==='Avançar Status').props.onClick();});
  assert.equal(view.root.findByProps({'aria-label':'Valor do crédito'}).props.value,'40.00');
  await act(async()=>{await view.root.findByType('form').props.onSubmit({preventDefault(){}});});
  assert.equal(view.root.findByProps({role:'alert'}).children.join(''),'Falha temporária');
  assert.equal(view.root.findByProps({'aria-label':'Valor do crédito'}).props.value,'40.00');
  await act(async()=>{await view.root.findByType('form').props.onSubmit({preventDefault(){}});});
  assert.deepEqual(calls,[['rma',40],['rma',40]]);
  assert.equal(view.root.findAllByType('form').length,0);
 } finally {act(()=>view.unmount());}
});

test('Finance only offers the same customer and branch credit and keeps the operation ID on retry', async () => {
 const FinancialModule=await component('FinancialModule','FinancialModule');
 const calls=[]; let view;
 const props={invoices:[{id:invoice,customer_id:customer,branch_id:branch,customer_name:'Cliente',amount:50,paid_amount:0,status:'aberta',number:'F001'}],rmaRequests:[
  {id:'valid',customer_id:customer,branch_id:branch,product_name:'Peca',credit_amount:40,credit_used_amount:10},
  {id:'foreign',customer_id:foreign,branch_id:branch,product_name:'Outro',credit_amount:100,credit_used_amount:0},
 ],creditLimit:100,creditUsed:50,onApplyCredit:async(...args)=>{calls.push(args);if(calls.length===1)throw {message:'Falha temporária'};}};
 act(()=>{view=TestRenderer.create(React.createElement(FinancialModule,props));});
 try {
  act(()=>view.root.findAllByType('button').find(button=>button.children.join('')==='Abater crédito RMA').props.onClick());
  const choices=view.root.findByProps({'aria-label':'Crédito disponível'}).findAllByType('option');
  assert.equal(choices.length,1); assert.equal(choices[0].props.value,'valid');
  assert.equal(view.root.findByProps({'aria-label':'Valor a abater'}).props.value,'30.00');
  await act(async()=>{await view.root.findByType('form').props.onSubmit({preventDefault(){}});});
  await act(async()=>{await view.root.findByType('form').props.onSubmit({preventDefault(){}});});
  assert.deepEqual(calls,[['valid',invoice,30,operation],['valid',invoice,30,operation]]);
  assert.equal(view.root.findAllByType('form').length,0);
 } finally {act(()=>view.unmount());}
});
