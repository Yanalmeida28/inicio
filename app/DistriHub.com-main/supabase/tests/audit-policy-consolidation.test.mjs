import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const policies=JSON.parse(await read('./fixtures/audit_policies_before.json'));
const migration=await read('../migrations/20261016195516_consolidate_audit_catalog_policies.sql');
const names=['partner_categories','partner_combos','partner_modifiers'];
const ids=Object.fromEntries(['owner','foreignOwner','employee','stranger','branch','foreignBranch','product','foreignProduct','row','foreignRow'].map(k=>[k,randomUUID()]));
const ident=s=>'"'+s.replaceAll('"','""')+'"';

async function fixture() {
  const db=new PGlite();
  await db.exec(`CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE SCHEMA partner_cadastros_private;
    GRANT USAGE ON SCHEMA auth,partner_cadastros_private TO authenticated;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION partner_rma_company_access(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1=auth.uid() OR ($1='${ids.owner}' AND auth.uid()='${ids.employee}') $$;
    CREATE FUNCTION partner_employee_can_access_branch(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1='${ids.owner}' AND $2='${ids.branch}' AND auth.uid()='${ids.employee}' $$;
    CREATE FUNCTION partner_has_saas_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1::text<>coalesce(current_setting('test.blocked',true),'') $$;
    CREATE FUNCTION partner_cadastros_private.can_manage(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT partner_rma_company_access($1) $$;
    CREATE FUNCTION partner_cadastros_private.can_manage(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1=auth.uid() OR partner_employee_can_access_branch($1,$2) $$;
    CREATE FUNCTION partner_cadastros_private.can_manage_combo(uuid,jsonb) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT partner_rma_company_access($1) $$;
    CREATE TABLE partner_products(id uuid,user_id uuid,branch_id uuid);
    INSERT INTO partner_products VALUES('${ids.product}','${ids.owner}','${ids.branch}'),('${ids.foreignProduct}','${ids.foreignOwner}','${ids.foreignBranch}');
    GRANT SELECT ON partner_products TO authenticated;`);
  for(const table of names){
    await db.exec(`CREATE TABLE ${table}(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,branch_id uuid,product_id uuid,items jsonb DEFAULT '[]',note text);
      ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT,UPDATE,DELETE ON ${table} TO authenticated;
      INSERT INTO ${table}(id,user_id,branch_id,product_id) VALUES('${ids.row}','${ids.owner}','${ids.branch}','${ids.product}'),('${ids.foreignRow}','${ids.foreignOwner}','${ids.foreignBranch}','${ids.foreignProduct}');`);
  }
  for(const p of policies)await db.exec(`CREATE POLICY ${ident(p.policyname)} ON ${p.tablename} AS ${p.permissive} FOR ${p.cmd} TO authenticated${p.qual?' USING ('+p.qual+')':''}${p.with_check?' WITH CHECK ('+p.with_check+')':''}`);
  return db;
}
async function probe(db,query,args=[]) {
  await db.exec('SAVEPOINT probe');
  try {return {rows:(await db.query(query,args)).rows};}
  catch(e){return {error:e.code};}
  finally {await db.exec('ROLLBACK TO probe; RELEASE probe');}
}
async function matrix(db) {
  const results=[];
  for(const [actor,blocked] of [[ids.owner,''],[ids.foreignOwner,''],[ids.employee,''],[ids.stranger,''],['',''],[ids.owner,ids.owner],[ids.employee,ids.owner]]) {
    await db.exec('BEGIN');
    try {
      await db.query("SELECT set_config('test.uid',$1,true),set_config('test.blocked',$2,true)",[actor,blocked]);
      await db.exec('SET LOCAL ROLE authenticated');
      for(const table of names) {
        results.push(await probe(db,`SELECT id FROM ${table} ORDER BY id`));
        results.push(await probe(db,`UPDATE ${table} SET note='test' WHERE id=$1 RETURNING id`,[ids.row]));
        results.push(await probe(db,`UPDATE ${table} SET user_id=$1 WHERE id=$2 RETURNING id`,[ids.foreignOwner,ids.row]));
        results.push(await probe(db,`DELETE FROM ${table} WHERE id=$1 RETURNING id`,[ids.row]));
        for(const foreign of [false,true])results.push(await probe(db,`INSERT INTO ${table}(id,user_id,branch_id,product_id) VALUES($1,$2,$3,$4) RETURNING user_id`,[randomUUID(),foreign?ids.foreignOwner:ids.owner,foreign?ids.foreignBranch:ids.branch,foreign?ids.foreignProduct:ids.product]));
      }
    } finally {await db.exec('ROLLBACK');}
  }
  return results;
}
test('catalog policy consolidation preserves read/write access and restrictive gates',async()=>{
  const db=await fixture();
  try {
    const before=await matrix(db);
    const restrictive=await db.query("SELECT tablename,policyname,qual,with_check FROM pg_policies WHERE permissive='RESTRICTIVE' ORDER BY tablename,policyname");
    await db.exec(migration);
    assert.deepEqual(await matrix(db),before);
    assert.deepEqual(await db.query("SELECT tablename,policyname,qual,with_check FROM pg_policies WHERE permissive='RESTRICTIVE' ORDER BY tablename,policyname"),restrictive);
    assert.equal((await db.query("SELECT 1 FROM pg_policies WHERE permissive='PERMISSIVE' GROUP BY tablename,cmd HAVING count(*)>1 OR bool_or(cmd='ALL')")).rows.length,0);
    assert.ok(before.some(result=>result.error==='42501'));
    assert.ok(before.some(result=>result.rows?.length));
  } finally {await db.close();}
});
test('catalog policy consolidation stops if roles or policy counts drift',async()=>{
  const db=await fixture();
  try {
    await db.exec('ALTER POLICY employee_combo_write ON partner_combos TO PUBLIC');
    await assert.rejects(db.exec(migration),/Unexpected catalog policies/);
  } finally {await db.close();}
});
