import assert from 'node:assert/strict';
import {before,after,beforeEach,test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const owner=randomUUID(),other=randomUUID(),admin=randomUUID(),secondAdmin=randomUUID();
const read=p=>readFile(new URL('../migrations/'+p,import.meta.url),'utf8');
const migration=await read('20261015034207_fix_support_delivery_and_conversation_state.sql');
async function fixture(legacy=false){
 const db=new PGlite();
 await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA auth TO authenticated,anon;
 CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT auth.uid() IN ('${admin}'::uuid,'${secondAdmin}'::uuid)$$;
 CREATE TABLE partner_profiles(id uuid PRIMARY KEY,business_name text);CREATE TABLE partner_plan_change_requests(status text);
 INSERT INTO auth.users(id) VALUES('${owner}'),('${other}'),('${admin}'),('${secondAdmin}');
 INSERT INTO partner_profiles VALUES('${owner}','Empresa A'),('${other}','Empresa B');`);
 await db.exec(await read('20260826130000_add_support_messages.sql'));
 await db.exec(`DROP POLICY clients_read_own_support_messages ON support_messages;DROP POLICY clients_send_support_messages ON support_messages;
 CREATE POLICY support_messages_read ON support_messages FOR SELECT TO authenticated USING ((SELECT auth.uid())=user_id OR (SELECT is_super_admin()));
 CREATE POLICY support_messages_send ON support_messages FOR INSERT TO authenticated WITH CHECK (((SELECT auth.uid())=user_id AND sender_role='cliente') OR ((SELECT is_super_admin()) AND sender_role='suporte'));
 GRANT SELECT,INSERT ON support_messages TO authenticated;`);
 const workspace=await read('20261012181517_complete_super_admin_workspace.sql');
 await db.exec(workspace.slice(workspace.indexOf('CREATE TABLE public.admin_support_states'),workspace.indexOf('ALTER TABLE public.partner_plan_change_requests')));
 await db.exec(workspace.slice(workspace.indexOf('CREATE FUNCTION public.get_super_admin_pending_summary'),workspace.lastIndexOf('COMMIT;')));
 if(legacy)await db.query("INSERT INTO support_messages(user_id,sender_role,message,created_at) VALUES($1,'cliente',$2,'2099-01-01')",[owner,'x'.repeat(2500)]);
 await db.exec(migration);return db;
}
let db;
const sql=(s,p=[])=>db.query(s,p);
async function login(user){await db.exec('RESET ROLE');await sql("SELECT set_config('test.uid',$1,false)",[user??'']);await db.exec('SET ROLE authenticated');}
const send=async(id=randomUUID(),text='Ajuda',user=owner,asAdmin=false)=>(await sql('SELECT to_jsonb(send_support_message_once($1,$2,$3,$4)) message',[id,user,asAdmin,text])).rows[0].message;
const state=async(action,user=owner,position=null)=>(await sql('SELECT to_jsonb(update_admin_support_state($1,$2,$3)) state',[user,action,position])).rows[0].state;
const inbox=async()=>(await sql('SELECT get_admin_support_inbox() result')).rows[0].result;
before(async()=>{db=await fixture();});after(async()=>db?.close());
beforeEach(async()=>{await db.exec('RESET ROLE;TRUNCATE support_messages,admin_support_states');await login(owner);});
test('support retries return the same row and changed data or actor cannot reuse the attempt',async()=>{
 const id=randomUUID();const first=await send(id);assert.deepEqual(await send(id),first);
 assert.equal((await sql('SELECT count(*)::int n FROM support_messages')).rows[0].n,1);
 await assert.rejects(send(id,'Outro texto'),/outros dados/);await login(other);await assert.rejects(send(id,'Ajuda',other),/outros dados/);
 await login(admin);await assert.rejects(send(id,'Ajuda',owner,true),/outros dados/);
});
test('support RPC and legacy inserts use server dates, actor and position and reject invalid length',async()=>{
 const row=(await sql("INSERT INTO support_messages(user_id,sender_role,message,created_at,read_at,message_position,sender_auth_user_id) VALUES($1,'cliente','  Texto  ','2099-01-01',now(),99999999,$2) RETURNING *",[owner,other])).rows[0];
 assert.equal(row.message,'Texto');assert.equal(row.read_at,null);assert.equal(row.sender_auth_user_id,owner);assert.ok(Number(row.message_position)<99999999);assert.ok(new Date(row.created_at).getFullYear()<2099);
 await assert.rejects(send(randomUUID(),'x'.repeat(2001)),/2000/);await assert.rejects(send(randomUUID(),'   '),/2000/);
 await assert.rejects(sql("INSERT INTO support_messages(user_id,sender_role,message) VALUES($1,'cliente',$2)",[owner,'x'.repeat(2001)]),/2000/);
 assert.equal((await send(randomUUID(),'x'.repeat(2000))).message.length,2000);
});
test('support isolates customers and denies admin state mutation and impersonation',async()=>{
 await send();await assert.rejects(send(randomUUID(),'Ajuda',other),/autorizada/);await assert.rejects(send(randomUUID(),'Ajuda',owner,true),/autorizada/);
 await assert.rejects(state('close'),/administrativo/);await assert.rejects(inbox(),/administrativo/);
 await login(other);assert.equal((await sql('SELECT count(*)::int n FROM support_messages')).rows[0].n,0);
 await login(null);await assert.rejects(send(),/autenticado/);await db.exec('RESET ROLE;SET ROLE anon');await assert.rejects(send(),/permission denied/);
});
test('support priority changes preserve closure and closing uses server snapshot; new messages reopen',async()=>{
 const message=await send();await login(admin);const closed=await state('close',owner,message.message_position);
 assert.ok(closed.closed_at);assert.equal(Number(closed.closed_message_position),message.message_position);
 assert.equal((await inbox()).conversations[0].closed,true);
 const high=await state('priority_high');assert.equal(high.priority,'high');assert.equal(high.closed_at,closed.closed_at);
 await state('priority_normal');assert.equal((await inbox()).conversations[0].closed,true);
 await login(owner);const newer=await send(randomUUID(),'Nova pergunta');await login(admin);
 await state('close',owner,message.message_position);assert.equal((await inbox()).conversations[0].closed,false);
 assert.equal(Number((await inbox()).pending),1);assert.equal(Number((await sql('SELECT get_super_admin_pending_summary() result')).rows[0].result.support),1);
 await state('close',owner,newer.message_position);assert.equal((await inbox()).conversations[0].closed,true);
});
test('support refuses stale closure, preserves another administrator priority and forbids direct state writes',async()=>{
 const old=await send();const fresh=await send(randomUUID(),'Nova');await login(admin);
 await assert.rejects(state('close',owner,old.message_position),/Novas mensagens/);await assert.rejects(state('close'),/Atualize/);
 await state('priority_high');await login(secondAdmin);await state('close',owner,fresh.message_position);assert.equal((await inbox()).conversations[0].priority,'high');
 await assert.rejects(sql("UPDATE admin_support_states SET closed_at='2099-01-01' WHERE user_id=$1",[owner]),/permission denied/);
 await state('reopen');assert.equal((await inbox()).conversations[0].closed,false);
});
test('support keyset position recovers more than 50 new messages without skipping or duplicates',async()=>{
 const first=await send();for(let i=0;i<61;i++)await send(randomUUID(),'Mensagem '+i);
 const positions=[];let cursor=first.message_position;
 for(;;){const rows=(await sql('SELECT message_position FROM support_messages WHERE user_id=$1 AND message_position>$2 ORDER BY message_position LIMIT 50',[owner,cursor])).rows;if(!rows.length)break;positions.push(...rows.map(r=>Number(r.message_position)));cursor=positions.at(-1);}
 assert.equal(positions.length,61);assert.equal(new Set(positions).size,61);
});
test('support public entrypoints are invoker, anonymous is denied and sequence is private',async()=>{
 for(const signature of ['send_support_message_once(uuid,uuid,boolean,text)','update_admin_support_state(uuid,text,bigint)','get_admin_support_conversation(uuid)']){
  const row=(await sql("SELECT prosecdef,prorettype::regtype::text return_type,has_function_privilege('anon',oid,'EXECUTE') anon FROM pg_proc WHERE oid=$1::regprocedure",['public.'+signature])).rows[0];assert.equal(row.prosecdef,false);assert.equal(row.anon,false);assert.equal(row.return_type,'jsonb');
 }
 assert.equal((await sql("SELECT has_sequence_privilege('authenticated','partner_support_private.message_position','USAGE') allowed")).rows[0].allowed,false);
});
test('support migration preserves legacy oversized/future messages but newer replies and closure win by position',async()=>{
 const isolated=await fixture(true);try{
  const legacy=(await isolated.query('SELECT * FROM support_messages')).rows[0];assert.equal(legacy.message.length,2500);assert.ok(legacy.message_position);
  await isolated.query("SELECT set_config('test.uid',$1,false)",[admin]);await isolated.exec('SET ROLE authenticated');
  const reply=(await isolated.query('SELECT to_jsonb(send_support_message_once($1,$2,true,$3)) message',[randomUUID(),owner,'Resposta atual'])).rows[0].message;
  await isolated.query('SELECT update_admin_support_state($1,$2,$3)',[owner,'close',reply.message_position]);
  const summary=(await isolated.query('SELECT get_admin_support_inbox() result')).rows[0].result;
  assert.equal(summary.conversations[0].id,reply.id);assert.equal(summary.conversations[0].closed,true);assert.equal(Number(summary.pending),0);
 }finally{await isolated.close();}
});
