import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const ids = Object.fromEntries(['owner','other','employee','branch','otherBranch','secondBranch'].map(key=>[key,randomUUID()]));
const migration = await readFile(new URL('../migrations/20261012234814_paginate_partner_history.sql',import.meta.url),'utf8');
async function fixture() {
 const db=new PGlite();
 await db.exec(await readFile(new URL('./fixtures/pdv_schema.sql',import.meta.url),'utf8'));
 await db.exec(`ALTER TABLE partner_sales ADD COLUMN IF NOT EXISTS imei text, ADD COLUMN IF NOT EXISTS serial_number text;
 CREATE SCHEMA partner_subscription_private; CREATE SCHEMA partner_operations_private;
 CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 CREATE FUNCTION public.partner_employee_can_access_branch(uuid,uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM partner_salespeople WHERE user_id=$1 AND auth_user_id=auth.uid() AND active AND branch_id=$2)$$;
 CREATE FUNCTION partner_subscription_private.require_actor(text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No actor'; END IF; END$$;
 CREATE FUNCTION partner_subscription_private.require_access(uuid,text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF $1::text=current_setting('test.blocked',true) THEN RAISE EXCEPTION 'Subscription blocked'; END IF; END$$;
 CREATE FUNCTION partner_operations_private.authorize_branch(uuid,text) RETURNS uuid LANGUAGE plpgsql SET search_path=public AS $$DECLARE company uuid; BEGIN SELECT user_id INTO company FROM partner_branches WHERE id=$1; IF company IS NULL OR NOT(company=auth.uid() OR partner_employee_can_access_branch(company,$1)) THEN RAISE EXCEPTION 'Unauthorized branch'; END IF; RETURN company; END$$;
 CREATE TABLE rma_requests_v2(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,sale_id uuid,sale_item_index integer,quantity integer);
 INSERT INTO partner_profiles(id,business_name) VALUES('${ids.owner}','Owner'),('${ids.other}','Other');
 INSERT INTO partner_branches(id,user_id) VALUES('${ids.branch}','${ids.owner}'),('${ids.secondBranch}','${ids.owner}'),('${ids.otherBranch}','${ids.other}');
 INSERT INTO partner_salespeople(id,user_id,auth_user_id,branch_id,role,active) VALUES(gen_random_uuid(),'${ids.owner}','${ids.employee}','${ids.branch}','gerente',true);
 INSERT INTO partner_sales(id,user_id,branch_id,items,total,status,created_at,customer_name)
 SELECT gen_random_uuid(),'${ids.owner}','${ids.branch}','[{"quantity":2,"unit_price":5,"name":"Item"}]'::jsonb,10,'concluida','2026-10-12T12:00:00Z','João da Silva' FROM generate_series(1,73);
 INSERT INTO partner_sales(id,user_id,branch_id,items,total,status,created_at,customer_name)
 SELECT gen_random_uuid(),'${ids.owner}','${ids.secondBranch}','[]'::jsonb,20,'concluida','2026-10-12T12:00:00Z','Second branch' FROM generate_series(1,10);
 INSERT INTO partner_sales(id,user_id,branch_id,items,total,status,created_at,customer_name) VALUES
 (gen_random_uuid(),'${ids.other}','${ids.otherBranch}','[]',999,'concluida','2026-10-12T12:00:00Z','Other company'),
 (gen_random_uuid(),'${ids.owner}','${ids.branch}','[]',100,'pre_venda','2026-10-12T12:00:00Z','Not history'),
 (gen_random_uuid(),'${ids.owner}','${ids.branch}','[]',10,'cancelada','2026-10-12T12:00:00Z','Cancelled'),
 (gen_random_uuid(),'${ids.owner}','${ids.branch}','[]',10,'aberta','2026-10-12T12:00:00Z','Open');
 INSERT INTO rma_requests_v2(user_id,sale_id,sale_item_index,quantity) SELECT '${ids.owner}',id,0,1 FROM partner_sales WHERE user_id='${ids.owner}' AND branch_id='${ids.branch}' AND status='concluida' ORDER BY id DESC LIMIT 1;
 `);
 await db.exec(migration);
 await db.exec("CREATE VIEW public.partner_stock_movements AS SELECT * FROM public.stock_movements");
 await db.exec(await readFile(new URL('../migrations/20261013160000_history_sale_completion_date.sql',import.meta.url),'utf8'));
 return db;
}
async function login(db,id) { await db.query("SELECT set_config('test.auth_uid',$1,false)",[id??'']); }
async function page(db,{company=ids.owner,branch=ids.branch,status='all',search='',number=0,start='2026-10-12',end='2026-10-12'}={}) {
 return (await db.query('SELECT read_partner_sales_history($1,$2,$3,$4,$5,$6,$7) result',[company,branch,start,end,status,search,number])).rows[0].result;
}
test('history returns 25 rows per page, exact full-period totals and deterministic non-overlapping pages',async()=>{
 const db=await fixture();try {
  await login(db,ids.owner);const first=await page(db);const second=await page(db,{number:1});const last=await page(db,{number:2});
  assert.equal(first.sales.length,25);assert.equal(first.total,75);assert.equal(Number(first.completed_total),730);assert.equal(first.page_size,25);
  assert.equal(new Set([...first.sales,...second.sales,...last.sales].map(s=>s.id)).size,75);
  assert.equal((await page(db,{number:3})).sales.length,0);
  assert.equal(first.rmas.length,1);assert.equal(first.rmas[0].sale_id,first.sales.find(s=>s.id===first.rmas[0].sale_id).id);
 }finally{await db.close();}
});
test('server search handles accents and return/status filters match full-history semantics',async()=>{
 const db=await fixture();try{
  await login(db,ids.owner);
  assert.equal((await page(db,{search:'joao'})).total,73);
  const completed=await page(db,{status:'concluida'});assert.equal(completed.total,72);assert.equal(Number(completed.completed_total),720);
  const returned=await page(db,{status:'devolucao'});assert.equal(returned.total,1);assert.equal(returned.rmas[0].quantity,1);
  assert.equal((await page(db,{status:'cancelada'})).total,1);
  assert.equal((await page(db,{status:'aberta'})).total,1);
 }finally{await db.close();}
});
test('owner/employee branch and subscription gates prevent unauthorized history reads and anonymous execution',async()=>{
 const db=await fixture();try{
  await login(db,ids.employee);assert.equal((await page(db,{branch:null})).total,0);
  await db.exec("UPDATE partner_sales SET salesperson_id=(SELECT id FROM partner_salespeople WHERE auth_user_id='"+ids.employee+"') WHERE id IN (SELECT id FROM partner_sales WHERE user_id='"+ids.owner+"' AND branch_id='"+ids.branch+"' AND status<>'pre_venda' ORDER BY id LIMIT 2)");
  assert.equal((await page(db,{branch:null})).total,2);
  await assert.rejects(page(db,{branch:ids.secondBranch}),/Unauthorized branch/);
  await assert.rejects(page(db,{company:ids.other,branch:ids.otherBranch}),/Empresa/);
  await login(db,ids.owner);assert.equal((await page(db,{branch:null})).total,85);
  await assert.rejects(page(db,{company:ids.other,branch:ids.otherBranch}),/Empresa/);
  await db.query("SELECT set_config('test.blocked',$1,false)",[ids.owner]);await assert.rejects(page(db),/Subscription blocked/);
  await login(db,null);await assert.rejects(page(db),/autenticado/);
  assert.equal((await db.query("SELECT has_function_privilege('anon','public.read_partner_sales_history(uuid,uuid,date,date,text,text,integer)','EXECUTE') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
test('Brazilian day boundaries are preserved and invalid filters are rejected',async()=>{
 const db=await fixture();try{
  await login(db,ids.owner);
  await db.query("INSERT INTO partner_sales(id,user_id,branch_id,items,total,status,created_at) VALUES(gen_random_uuid(),$1,$2,'[]',11,'concluida','2026-10-12T02:59:59Z'),(gen_random_uuid(),$1,$2,'[]',12,'concluida','2026-10-12T03:00:00Z')",[ids.owner,ids.branch]);
  const today=await page(db);assert.equal(today.total,76);assert.equal(Number(today.completed_total),742);
  assert.equal((await page(db,{start:'2026-10-11',end:'2026-10-11'})).total,1);
  await assert.rejects(page(db,{number:-1}),/Filtros/);await assert.rejects(page(db,{status:'forged'}),/Filtros/);
  await assert.rejects(page(db,{start:'2026-10-13',end:'2026-10-12'}),/Filtros/);
 }finally{await db.close();}
});

test('history includes a previous-day presale completed today, isolates movements and counts the sale once',async()=>{
 const db=await fixture();try{
  await login(db,ids.owner);const sale=randomUUID();
  await db.query("INSERT INTO partner_sales(id,user_id,branch_id,items,total,status,created_at) VALUES($1,$2,$3,'[]',90,'concluida','2026-10-09T20:10:34Z')",[sale,ids.owner,ids.branch]);
  for(const [company,branch,at] of [[ids.other,ids.branch,'2026-10-10T12:00:00Z'],[ids.owner,ids.secondBranch,'2026-10-11T12:00:00Z'],[ids.owner,ids.branch,'2026-10-13T14:53:30Z'],[ids.owner,ids.branch,'2026-10-13T14:53:31Z']]) await db.query("INSERT INTO partner_stock_movements(user_id,branch_id,type,quantity,reason,created_at) VALUES($1,$2,'saida',1,$3,$4)",[company,branch,'Saida por venda '+sale,at]);
  const today=await page(db,{start:'2026-10-13',end:'2026-10-13'});
  assert.equal(today.total,1);assert.equal(Number(today.completed_total),90);assert.equal(today.sales[0].id,sale);
  assert.equal(new Date(today.sales[0].completed_at).toISOString(),'2026-10-13T14:53:30.000Z');
  assert.equal((await page(db,{start:'2026-10-09',end:'2026-10-09'})).total,0);
 }finally{await db.close();}
});
