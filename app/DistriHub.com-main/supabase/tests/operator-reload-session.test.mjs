import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const migration=await readFile(new URL('../migrations/20261030184031_operator_reload_sessions.sql',import.meta.url),'utf8');
const branches=await readFile(new URL('../migrations/20261029204344_optional_operator_all_branches.sql',import.meta.url),'utf8');
const rotationGuard=await readFile(new URL('../migrations/20261030190000_guard_operator_session_pin_rotation.sql',import.meta.url),'utf8');
const [owner,other,operator,branch,branch2,session,session2]=Array.from({length:7},(_,i)=>'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'));
test('operator reload credential is session-bound, expires and respects PIN, operator and branch revocations',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE SCHEMA extensions;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
   CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('session_id',current_setting('test.session',true)) $$;
   CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid);
   -- Deterministic hash stand-ins are confined to this isolated test database.
   CREATE FUNCTION extensions.crypt(text,text) RETURNS text LANGUAGE sql AS $$ SELECT md5($1) $$;
   CREATE FUNCTION extensions.digest(text,text) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(md5($1),'hex') $$;
   CREATE FUNCTION extensions.gen_random_bytes(integer) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(md5(random()::text)||md5(random()::text),'hex') $$;
   CREATE TABLE public.partner_profiles(id uuid PRIMARY KEY);
   CREATE TABLE public.partner_branches(id uuid PRIMARY KEY,user_id uuid,name text,is_active boolean DEFAULT true);
   CREATE TABLE public.partner_salespeople(id uuid PRIMARY KEY,user_id uuid,auth_user_id uuid,name text,role text,active boolean,branch_id uuid,pin_hash text);
   CREATE TABLE public.partner_audit_logs(id text,user_id uuid,actor_name text,actor_role text,action text,entity_type text,entity_id text,details text);
   CREATE FUNCTION public.verify_partner_salesperson_pin(p_pin text,p_pin_hash text) RETURNS boolean LANGUAGE sql AS $$ SELECT md5(p_pin)=p_pin_hash $$;
   INSERT INTO partner_profiles VALUES ('${owner}'),('${other}');
   INSERT INTO partner_branches VALUES ('${branch}','${owner}','Varejo',true),('${branch2}','${owner}','Atacado',true);
   INSERT INTO partner_salespeople VALUES ('${operator}','${owner}',NULL,'Ana','gerente',true,'${branch}',md5('1234'));
   INSERT INTO auth.sessions VALUES ('${session}','${owner}'),('${session2}','${owner}');`);
  await db.exec(branches);await db.exec(migration);await db.exec(rotationGuard);
  const actor=async(id,sid)=>{await db.query("select set_config('test.actor',$1,false),set_config('test.session',$2,false)",[id,sid]);};
  const issue=async(pin='1234')=>(await db.query('select public.create_partner_operator_session($1,$2) as value',[operator,pin])).rows[0].value;
  const resolve=async(token,b=branch)=>(await db.query('select * from public.resolve_partner_pdv_operator($1,$2,$3)',[operator,token,b])).rows[0];
  await actor(owner,session);
  await assert.rejects(issue('9999'),/PIN/);
  const issued=await issue();const token=issued.credential;
  assert.match(token,/^ops_[0-9a-f]{64}$/);
  assert.equal((await resolve(token)).salesperson_id,operator);
  await assert.rejects(issue(token),/PIN/);
  await assert.rejects(resolve(token,branch2),/filial/);
  await db.query('select public.set_partner_salesperson_branch_access($1,true)',[operator]);
  assert.equal((await resolve(token,branch2)).branch_id,branch2);
  await db.query('select public.set_partner_salesperson_branch_access($1,false)',[operator]);
  await assert.rejects(resolve(token,branch2),/filial/);
  await actor(owner,session2);await assert.rejects(resolve(token),/PIN/);
  await actor(other,session);await assert.rejects(resolve(token),/PIN/);
  await actor(owner,session);
  await db.query('update partner_salespeople set active=false where id=$1',[operator]);await assert.rejects(resolve(token),/PIN/);
  await db.query("update partner_salespeople set active=true,pin_hash=md5('4321') where id=$1",[operator]);await assert.rejects(resolve(token),/PIN/);
  const fresh=(await issue('4321')).credential;
  await db.query("update partner_access_private.operator_sessions set expires_at=now()-interval '1 second'");await assert.rejects(resolve(fresh),/PIN/);
  const revoked=(await issue('4321')).credential;
  await db.query('select public.revoke_partner_operator_session($1)',[revoked]);await assert.rejects(resolve(revoked),/PIN/);
  const original=(await db.query("select pg_get_functiondef('public.resolve_partner_pdv_operator(uuid,text,uuid)'::regprocedure) as sql")).rows[0].sql;
  await db.exec(`CREATE OR REPLACE FUNCTION public.resolve_partner_pdv_operator(p_salesperson_id uuid,p_pin text,p_requested_branch_id uuid)
   RETURNS TABLE(company_id uuid,salesperson_id uuid,role text,branch_id uuid) LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
   DECLARE op record;
   BEGIN
    SELECT * INTO op FROM public.resolve_partner_operator(p_salesperson_id,p_pin,p_requested_branch_id);
    UPDATE public.partner_salespeople SET pin_hash=md5('9999') WHERE id=op.salesperson_id;
    RETURN QUERY SELECT op.company_id,op.salesperson_id,op.role,op.branch_id;
   END; $$;`);
  await assert.rejects(issue('4321'),/indisponível/);
  await db.exec(original);
  const loggedOut=(await issue('4321')).credential;
  await db.query('delete from auth.sessions where id=$1',[session]);await assert.rejects(resolve(loggedOut),/PIN/);
  assert.equal((await db.query("select has_table_privilege('authenticated','partner_access_private.operator_sessions','SELECT') as ok")).rows[0].ok,false);
  assert.equal((await db.query("select has_function_privilege('anon','public.create_partner_operator_session(uuid,text)','EXECUTE') as ok")).rows[0].ok,false);
 }finally{await db.close();}
});
