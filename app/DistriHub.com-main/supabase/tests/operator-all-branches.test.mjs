import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../migrations/20261029204344_optional_operator_all_branches.sql', import.meta.url), 'utf8');
const ids = Array.from({ length: 10 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
const [owner, other, a, b, foreign, admin, manager, seller, adminAuth, inactive] = ids;
test('all-branch access is explicit, owner-authorized, role-bound, tenant-isolated and revocable', async () => {
 const db = new PGlite();
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
   CREATE TABLE public.partner_profiles(id uuid PRIMARY KEY);
   CREATE TABLE public.partner_branches(id uuid PRIMARY KEY,user_id uuid,name text,is_active boolean DEFAULT true);
   CREATE TABLE public.partner_salespeople(id uuid PRIMARY KEY,user_id uuid,auth_user_id uuid,name text,role text,active boolean,branch_id uuid,pin_hash text);
   CREATE TABLE public.partner_audit_logs(id text,user_id uuid,actor_name text,actor_role text,action text,entity_type text,entity_id text,details text);
   CREATE FUNCTION public.verify_partner_salesperson_pin(text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT md5($1)=$2 $$;
   INSERT INTO partner_profiles VALUES ('${owner}'),('${other}');
   INSERT INTO partner_branches VALUES ('${a}','${owner}','Atacado',true),('${b}','${owner}','Varejo',true),('${foreign}','${other}','Outra empresa',true);
   INSERT INTO partner_salespeople VALUES ('${admin}','${owner}','${adminAuth}','Amanda','administrador',true,'${a}',md5('1234')),
    ('${manager}','${owner}',NULL,'Gerente','gerente',true,'${a}',md5('9876')),
    ('${seller}','${owner}',NULL,'Vendedor','vendedor',true,'${a}',md5('4567')),
    ('${inactive}','${owner}',NULL,'Amanda','administrador',false,'${b}',md5('9999'));`);
  await db.exec(migration);
  const actor = id => db.query("select set_config('test.actor',$1,false)", [id]);
  const resolve = async (id,pin,branch=null) => (await db.query('select * from public.resolve_partner_pdv_operator($1,$2,$3)',[id,pin,branch])).rows[0];
  const grant = async (id,allowed) => (await db.query('select public.set_partner_salesperson_branch_access($1,$2) as ok',[id,allowed])).rows[0].ok;
  await actor(owner);
  assert.equal((await resolve(null,null,b)).branch_id,b);
  assert.equal((await resolve(admin,'1234')).branch_id,a);
  await assert.rejects(resolve(admin,'1234',b),/filial/);
  await assert.rejects(resolve(manager,'9876',b),/filial/);
  assert.equal(await grant(admin,true),true);
  assert.equal((await resolve(admin,'1234',b)).branch_id,b);
  assert.equal((await resolve(admin,'1234',b)).role,'administrador');
  assert.equal(await grant(manager,true),true);
  assert.equal((await resolve(manager,'9876',b)).branch_id,b);
  await assert.rejects(resolve(admin,'wrong',b),/PIN/);
  await assert.rejects(resolve(admin,'1234',foreign),/filial/);
  await assert.rejects(resolve(inactive,'9999',b),/inativo/);
  await assert.rejects(grant(seller,true),/administrador ou gerente/);
  const directory=(await db.query('select public.list_partner_operator_directory() as data')).rows[0].data;
  assert.equal(directory.length,4);
  assert.equal(directory.find(row=>row.id===admin).branch_name,'Atacado');
  assert.equal(directory.find(row=>row.id===inactive).branch_name,'Varejo');
  assert.equal(directory.find(row=>row.id===inactive).active,false);
  assert.ok(directory.every(row=>!('pin_hash' in row)&&!('email' in row)));
  const scope=(await db.query('select public.read_partner_operator_branch_access($1,$2) as data',[admin,'1234'])).rows[0].data;
  assert.equal(scope.can_access_all_branches,true);
  assert.deepEqual(scope.branches.map(row=>row.id).sort(),[a,b].sort());
  await actor(adminAuth);
  assert.equal((await resolve(null,null,b)).branch_id,b);
  assert.equal((await db.query('select public.partner_employee_can_access_branch($1,$2) as ok',[owner,b])).rows[0].ok,true);
  assert.equal((await db.query('select public.list_partner_operator_directory() as data')).rows[0].data.length,1);
  await assert.rejects(grant(admin,true),/proprietário/);
  await actor(other);await assert.rejects(grant(admin,true),/empresa/);
  await actor(owner);assert.equal(await grant(admin,false),false);
  await assert.rejects(resolve(admin,'1234',b),/filial/);
  assert.equal(await grant(admin,true),true);
  await db.query("update partner_salespeople set role='caixa' where id=$1",[admin]);
  assert.equal((await db.query('select can_access_all_branches as allowed from partner_salespeople where id=$1',[admin])).rows[0].allowed,false);
  await assert.rejects(resolve(admin,'1234',b),/filial/);
  await db.query('update partner_branches set is_active=false where id=$1',[b]);
  await assert.rejects(resolve(manager,'9876',b),/filial/);
  await actor('');await assert.rejects(resolve(admin,'1234',a),/autenticado/);
  assert.equal((await db.query("select has_function_privilege('anon','public.list_partner_operator_directory()','EXECUTE') as ok")).rows[0].ok,false);
 } finally { await db.close(); }
});
