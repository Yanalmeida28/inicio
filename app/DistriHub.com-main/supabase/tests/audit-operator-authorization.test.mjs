import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const sql = (query,args=[])=>db.query(query,args);
const login = id=>sql("SELECT set_config('test.actor',$1,false)",[id ?? '']);
let owner,worker,operator,branch,otherBranch,foreignOwner,foreignBranch,product;
const resolve = (id=null,pin=null,b=branch,name='resolve_partner_operator')=>sql(`SELECT * FROM public.${name}($1,$2,$3)`,[id,pin,b]);
const remove = (id=null,pin=null)=>sql('SELECT public.execute_partner_product_delete($1,$2,$3)',[id,pin,product]);

before(async()=>{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA partner_subscription_private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
    CREATE TABLE partner_profiles(id uuid PRIMARY KEY);
    CREATE TABLE partner_branches(id uuid PRIMARY KEY,user_id uuid);
    CREATE TABLE partner_salespeople(id uuid PRIMARY KEY,user_id uuid,auth_user_id uuid,branch_id uuid,role text,active boolean,pin_hash text,blocked_modules text[] DEFAULT '{}');
    CREATE TABLE partner_products(id uuid PRIMARY KEY,user_id uuid,branch_id uuid,stock integer);
    CREATE TABLE service_order_items(id uuid,product_id uuid,user_id uuid);
    CREATE FUNCTION verify_partner_salesperson_pin(text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT md5($1)=$2 $$;`);
  const modules=await readFile(new URL('../migrations/20261008173749_enforce_shared_operator_module_permissions.sql',import.meta.url),'utf8');
  await db.exec(modules.slice(0,modules.indexOf('DO $$')));
  await db.exec(await readFile(new URL('../migrations/20261016195155_fix_audit_operator_authorization.sql',import.meta.url),'utf8'));
});
after(()=>db.close());
beforeEach(async()=>{
  await db.exec('TRUNCATE partner_profiles,partner_branches,partner_salespeople,partner_products,service_order_items');
  [owner,worker,operator,branch,otherBranch,foreignOwner,foreignBranch,product]=Array.from({length:8},()=>randomUUID());
  await sql('INSERT INTO partner_profiles VALUES($1),($2)',[owner,foreignOwner]);
  await sql('INSERT INTO partner_branches VALUES($1,$4),($2,$4),($3,$5)',[branch,otherBranch,foreignBranch,owner,foreignOwner]);
  await sql("INSERT INTO partner_salespeople(id,user_id,auth_user_id,branch_id,role,active,pin_hash) VALUES($1,$2,$3,$4,'gerente',true,md5('1234'))",[operator,owner,worker,branch]);
  await sql('INSERT INTO partner_products VALUES($1,$2,$3,0)',[product,owner,branch]);
  await login(worker);
});

for(const name of ['resolve_partner_operator','resolve_partner_pdv_operator']) {
  test(`${name}: own-login employee resolves to company, role and branch`,async()=>{
    const {rows:[row]}=await resolve(null,null,branch,name);
    assert.deepEqual(row,{company_id:owner,salesperson_id:operator,role:'gerente',branch_id:branch});
  });
  test(`${name}: owner can use linked employee PIN`,async()=>{
    await login(owner);
    assert.equal((await resolve(operator,'1234',branch,name)).rows[0].salesperson_id,operator);
    await assert.rejects(resolve(operator,'9999',branch,name),/PIN incorreto/);
  });
  test(`${name}: inactive login cannot fall back to an owner profile`,async()=>{
    await sql('UPDATE partner_salespeople SET active=false');
    await sql('INSERT INTO partner_profiles VALUES($1)',[worker]);
    await assert.rejects(resolve(null,null,branch,name),/inativo/);
  });
  test(`${name}: branch, foreign identity and anonymous calls stay denied`,async()=>{
    await assert.rejects(resolve(null,null,otherBranch,name),/filial/);
    await login(foreignOwner);
    await assert.rejects(resolve(operator,'1234',branch,name),/PIN incorreto/);
    await login(null);
    await assert.rejects(resolve(null,null,branch,name),/Nao autenticado/);
  });
}
test('employee deletes zero-stock product and owner positive control still passes',async()=>{
  await remove();
  assert.equal((await sql('SELECT count(*)::int n FROM partner_products')).rows[0].n,0);
  await sql('INSERT INTO partner_products VALUES($1,$2,$3,0)',[product,owner,branch]);
  await login(owner); await remove();
});
test('owner-selected linked operator deletes with valid PIN',async()=>{
  await login(owner); await remove(operator,'1234');
});
test('foreign-company product and branch cannot be deleted',async()=>{
  await login(foreignOwner); await assert.rejects(remove(),/Produto nao encontrado/);
  await login(worker); await sql('UPDATE partner_products SET branch_id=$1',[otherBranch]);
  await assert.rejects(remove(),/filial/);
  assert.equal((await sql('SELECT count(*)::int n FROM partner_products')).rows[0].n,1);
});
test('stock and service-order history guards are preserved',async()=>{
  await sql('UPDATE partner_products SET stock=1');
  await assert.rejects(remove(),/estoque nao pode/);
  await sql('UPDATE partner_products SET stock=0');
  await sql('INSERT INTO service_order_items VALUES($1,$2,$3)',[randomUUID(),product,owner]);
  await assert.rejects(remove(),/historico em ordens/);
});
test('blocked module denies own-login and owner-selected operator deletion',async()=>{
  await sql("UPDATE partner_salespeople SET blocked_modules=ARRAY['cadastros']");
  await assert.rejects(remove(),/bloqueado/);
  await login(owner); await assert.rejects(remove(operator,'1234'),/bloqueado/);
});
test('unassigned branch, missing role and ambiguous login are rejected',async()=>{
  await sql('UPDATE partner_salespeople SET branch_id=NULL');
  await assert.rejects(resolve(),/filial/);
  await sql('UPDATE partner_salespeople SET branch_id=$1,role=NULL',[branch]);
  await assert.rejects(resolve(),/sem permissao/);
  await sql("INSERT INTO partner_salespeople(id,user_id,auth_user_id,branch_id,role,active) VALUES($1,$2,$3,$4,'gerente',true)",[randomUUID(),owner,worker,branch]);
  await assert.rejects(resolve(),/ambigua/);
});
test('administrator may operate another company-owned branch, never a foreign branch',async()=>{
  await sql("UPDATE partner_salespeople SET role='administrador'");
  await resolve(null,null,otherBranch);
  await assert.rejects(resolve(null,null,foreignBranch),/filial/);
  await login(owner); await assert.rejects(resolve(null,null,foreignBranch),/filial/);
});
test('RPCs cannot be executed by anonymous database role',async()=>{
  const {rows}=await sql("SELECT proname,has_function_privilege('anon',oid,'EXECUTE') allowed FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('resolve_partner_operator','resolve_partner_pdv_operator','execute_partner_product_delete')");
  assert.equal(rows.length,3); assert.ok(rows.every(row=>!row.allowed));
});
