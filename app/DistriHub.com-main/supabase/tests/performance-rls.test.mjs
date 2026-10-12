import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const policies = JSON.parse(await readFile(new URL('./fixtures/performance_policies_before.json', import.meta.url), 'utf8'));
const migration = await readFile(new URL('../migrations/20261012230152_optimize_statement_identity_policies.sql', import.meta.url), 'utf8');
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const ident = value => '"' + value.replaceAll('"', '""') + '"';
const ids = Object.fromEntries(['ownerA','ownerB','employee','administrator','superadmin','unrelated','branchA','branchA2','branchB','rowA','rowA2','rowB'].map(key => [key,randomUUID()]));
const tables = [...new Set([...policies.map(p => p.tablename), 'partner_branches', 'partner_products'])];
async function fixture() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon;`);
  for (const table of tables) await db.exec(`CREATE TABLE public.${ident(table)}(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, branch_id uuid, service_order_id uuid,
    customer_id uuid, responsible_id uuid, product_id uuid, auth_user_id uuid, role text,
    sender_role text DEFAULT 'cliente', message text, active boolean DEFAULT true, is_active boolean DEFAULT true);
    ALTER TABLE public.${ident(table)} ENABLE ROW LEVEL SECURITY;`);
  await db.exec(`CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT auth.uid()='${ids.superadmin}'::uuid$$;
    CREATE FUNCTION public.partner_employee_can_access_branch(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM partner_salespeople sp WHERE sp.user_id=$1 AND sp.auth_user_id=auth.uid() AND sp.active AND (sp.role='administrador' OR sp.branch_id=$2))$$;
    CREATE FUNCTION public.partner_rma_company_access(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT $1=auth.uid() OR is_super_admin() OR EXISTS(SELECT 1 FROM partner_salespeople sp WHERE sp.user_id=$1 AND sp.auth_user_id=auth.uid() AND sp.active)$$;
    CREATE FUNCTION public.partner_has_saas_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT $1::text<>coalesce(current_setting('test.blocked_company',true),'') AND partner_rma_company_access($1)$$;
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;`);
  for (const table of tables) {
    await db.query(`INSERT INTO public.${ident(table)}(id,user_id,branch_id,service_order_id,customer_id,product_id,sender_role) VALUES
      ($1,$2,$3,$1,$1,$1,'cliente'),($4,$2,$5,$4,$4,$4,'suporte'),($6,$7,$8,$6,$6,$6,'cliente')`,
    [ids.rowA,ids.ownerA,ids.branchA,ids.rowA2,ids.branchA2,ids.rowB,ids.ownerB,ids.branchB]);
  }
  await db.query(`INSERT INTO partner_salespeople(user_id,branch_id,auth_user_id,role) VALUES ($1,$2,$3,'gerente'),($1,$2,$4,'administrador')`, [ids.ownerA,ids.branchA,ids.employee,ids.administrator]);
  for (const p of policies) await db.exec(`CREATE POLICY ${ident(p.policyname)} ON public.${ident(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO authenticated${p.qual?' USING ('+p.qual+')':''}${p.with_check?' WITH CHECK ('+p.with_check+')':''};`);
  return db;
}
async function login(db,user,blocked='') {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('test.uid',$1,false),set_config('test.blocked_company',$2,false)",[user??'',blocked]);
  await db.exec('SET ROLE authenticated');
}
async function matrix(db) {
  const result = [];
  for (const [kind,user,blocked] of [['owner',ids.ownerA,''],['otherOwner',ids.ownerB,''],['employee',ids.employee,''],['administrator',ids.administrator,''],['superadmin',ids.superadmin,''],['unrelated',ids.unrelated,''],['missingIdentity',null,''],['blocked',ids.ownerA,ids.ownerA]]) {
    await login(db,user,blocked);
    for (const table of [...new Set(policies.map(p=>p.tablename))]) result.push({kind,table,ids:(await db.query(`SELECT id FROM public.${ident(table)} ORDER BY id`)).rows.map(row=>row.id)});
  }
  await db.exec('RESET ROLE');
  return result;
}
test('optimized policies preserve the read matrix for owners, employees, other companies, admins and blocked subscriptions', async () => {
  const db = await fixture();
  try {
    const before = await matrix(db);
    assert.deepEqual(before.find(r=>r.kind==='unrelated'&&r.table==='support_messages').ids,[]);
    assert.deepEqual(before.find(r=>r.kind==='otherOwner'&&r.table==='service_orders').ids,[ids.rowB]);
    assert.equal(before.find(r=>r.kind==='employee'&&r.table==='service_orders').ids.length,1);
    assert.equal(before.find(r=>r.kind==='superadmin'&&r.table==='support_messages').ids.length,3);
    await db.exec(migration);
    assert.deepEqual(await matrix(db),before);
    const duplicates = await db.query("SELECT tablename,cmd,count(*)::int n FROM pg_policies WHERE tablename IN ('fiscal_documents','support_messages') AND permissive='PERMISSIVE' GROUP BY tablename,cmd HAVING count(*)>1");
    assert.equal(duplicates.rows.length,0);
  } finally { await db.close(); }
});
test('consolidated support policies allow client messages and admin replies while rejecting other users and forged sender roles', async () => {
  const db = await fixture();
  try {
    await db.exec(migration);
    await login(db,ids.ownerA);
    await db.query("INSERT INTO support_messages(user_id,sender_role,message) VALUES($1,'cliente','Allowed')",[ids.ownerA]);
    await assert.rejects(db.query("INSERT INTO support_messages(user_id,sender_role,message) VALUES($1,'cliente','Denied')",[ids.ownerB]),/row-level security/);
    await assert.rejects(db.query("INSERT INTO support_messages(user_id,sender_role,message) VALUES($1,'suporte','Forged')",[ids.ownerA]),/row-level security/);
    await login(db,ids.superadmin);
    await db.query("INSERT INTO support_messages(user_id,sender_role,message) VALUES($1,'suporte','Allowed')",[ids.ownerA]);
    await assert.rejects(db.query("INSERT INTO support_messages(user_id,sender_role,message) VALUES($1,'cliente','Forged')",[ids.ownerA]),/row-level security/);
  } finally { await db.close(); }
});
test('migration rejects policy drift instead of replacing newer authorization rules', async () => {
  const db = await fixture();
  try {
    await db.exec('ALTER POLICY select_own_categories ON partner_categories USING(false)');
    await assert.rejects(db.exec(migration),/Policy changed before optimization/);
    await db.exec('ROLLBACK');
    assert.equal((await db.query("SELECT count(*)::int n FROM pg_policies WHERE tablename='support_messages'")).rows[0].n,4);
  } finally { await db.close(); }
});
test('identity subquery produces an InitPlan for a 10000-row scan and preserves results', async () => {
  const db = await fixture();
  try {
    await db.exec(`CREATE TABLE performance_probe(user_id uuid); INSERT INTO performance_probe SELECT '${ids.ownerA}'::uuid FROM generate_series(1,10000);
      ALTER TABLE performance_probe ENABLE ROW LEVEL SECURITY; GRANT SELECT ON performance_probe TO authenticated;
      CREATE POLICY read_probe ON performance_probe TO authenticated USING(user_id=auth.uid());`);
    await login(db,ids.ownerA);
    const before=JSON.stringify((await db.query('EXPLAIN (ANALYZE,FORMAT JSON) SELECT count(*) FROM performance_probe')).rows);
    assert.equal(before.includes('InitPlan'),false);
    await db.exec('RESET ROLE; ALTER POLICY read_probe ON performance_probe USING(user_id=(SELECT auth.uid()))');
    await login(db,ids.ownerA);
    const after=JSON.stringify((await db.query('EXPLAIN (ANALYZE,FORMAT JSON) SELECT count(*) FROM performance_probe')).rows);
    assert.equal(after.includes('InitPlan'),true);
    assert.equal((await db.query('SELECT count(*)::int n FROM performance_probe')).rows[0].n,10000);
  } finally { await db.close(); }
});
