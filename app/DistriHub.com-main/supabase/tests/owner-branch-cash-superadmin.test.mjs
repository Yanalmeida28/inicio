import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { openDatabase } from './fixtures/test-database.mjs';

// NOTE: by default these tests run on PGlite (WASM PostgreSQL); with DISTRIHUB_REAL_PG_URL they run on a real
// PostgreSQL server (see supabase/tests/real-postgres/run.mjs). Both use stand-in schemas, so neither is a
// substitute for validation on a Supabase-equivalent environment.
const migration = await readFile(
  new URL('../migrations/20261028180000_owner_authorized_admin_branch_access.sql', import.meta.url),
  'utf8',
);
const legacyFunctions = await readFile(new URL('./fixtures/legacy-privileged-functions.sql', import.meta.url), 'utf8');
const originalCashMigration = await readFile(
  new URL('../migrations/20261003182612_partner_cash_register.sql', import.meta.url),
  'utf8',
);

const owner = '00000000-0000-0000-0000-000000000001';
const otherOwner = '00000000-0000-0000-0000-000000000002';
const superAdmin = '00000000-0000-0000-0000-0000000000aa';
const adminA = '10000000-0000-0000-0000-000000000001';
const adminB = '10000000-0000-0000-0000-000000000002';
const manager = '10000000-0000-0000-0000-000000000003';
const seller = '10000000-0000-0000-0000-000000000004';
const adminNoBranch = '10000000-0000-0000-0000-000000000005';
const foreignAdmin = '10000000-0000-0000-0000-000000000006';
const branchA = '20000000-0000-0000-0000-000000000001';
const branchB = '20000000-0000-0000-0000-000000000002';
const foreignBranch = '20000000-0000-0000-0000-000000000009';
const osIdA = '30000000-0000-0000-0000-000000000001';
const osIdForeign = '30000000-0000-0000-0000-000000000002';

const baseSchema = `
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  CREATE SCHEMA partner_subscription_private;
  CREATE FUNCTION partner_subscription_private.require_operator_module(text, uuid)
    RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
  CREATE TABLE public.partner_profiles(id uuid PRIMARY KEY REFERENCES auth.users(id));
  CREATE TABLE public.partner_branches(
    id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.partner_profiles(id),
    name text NOT NULL, is_active boolean NOT NULL DEFAULT true, UNIQUE(id,user_id)
  );
  CREATE TABLE public.partner_salespeople(
    id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.partner_profiles(id),
    name text NOT NULL, role text NOT NULL, active boolean NOT NULL DEFAULT true, branch_id uuid,
    auth_user_id uuid, pin_hash text, commission_rate numeric DEFAULT 0, email text, phone text, pin text,
    created_at timestamptz DEFAULT now(), blocked_modules text[] NOT NULL DEFAULT '{}', UNIQUE(id,user_id)
  );
  CREATE TABLE public.partner_products(id uuid PRIMARY KEY, user_id uuid, branch_id uuid, name text);
  CREATE TABLE public.partner_stock_movements(id uuid PRIMARY KEY, user_id uuid, branch_id uuid, product_id uuid);
  CREATE TABLE public.partner_customers(id uuid PRIMARY KEY, user_id uuid, branch_id uuid, name text);
  CREATE TABLE public.partner_sales(id uuid PRIMARY KEY, user_id uuid, branch_id uuid, salesperson_id uuid);
  CREATE TABLE public.stock_movements(id uuid PRIMARY KEY, user_id uuid, branch_id uuid, product_id uuid);
  CREATE TABLE public.partner_cash_sessions(id uuid PRIMARY KEY, user_id uuid, branch_id uuid);
  CREATE TABLE public.catalog_orders(id uuid PRIMARY KEY, user_id uuid, branch_id uuid);
  CREATE TABLE public.service_orders(id uuid PRIMARY KEY, user_id uuid, branch_id uuid, title text);
  CREATE TABLE public.service_order_items(id uuid PRIMARY KEY, service_order_id uuid, user_id uuid, branch_id uuid);
  CREATE TABLE public.service_order_photos(id uuid PRIMARY KEY, service_order_id uuid, user_id uuid, branch_id uuid);
  CREATE TABLE public.partner_audit_logs(
    id text, user_id uuid, actor_name text, actor_role text, action text,
    entity_type text, entity_id text, details text
  );
  CREATE FUNCTION public.verify_partner_salesperson_pin(text, text)
    RETURNS boolean LANGUAGE sql AS $$ SELECT $1 = '1234' $$;
`;

const rlsTables = [
  'partner_products', 'partner_customers', 'partner_sales', 'partner_salespeople', 'partner_branches',
  'stock_movements', 'partner_stock_movements', 'partner_cash_sessions', 'catalog_orders',
  'service_orders', 'service_order_items', 'service_order_photos',
];
const branchScoped = rlsTables.filter(t => !['partner_salespeople', 'partner_branches'].includes(t));

const seed = `
  ${rlsTables.map(t => `ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`).join('\n')}
  GRANT SELECT, INSERT, UPDATE, DELETE ON ${rlsTables.map(t => `public.${t}`).join(', ')} TO authenticated;
  ${rlsTables.map(t => `CREATE POLICY test_${t}_all ON public.${t} FOR ALL TO authenticated USING (true) WITH CHECK (true);`).join('\n')}
  INSERT INTO auth.users(id) VALUES
    ('${owner}'),('${otherOwner}'),('${superAdmin}'),('${adminA}'),('${adminB}'),('${manager}'),
    ('${seller}'),('${adminNoBranch}'),('${foreignAdmin}');
  INSERT INTO public.partner_profiles(id) VALUES ('${owner}'),('${otherOwner}');
  INSERT INTO public.partner_branches(id,user_id,name) VALUES
    ('${branchA}','${owner}','A'),('${branchB}','${owner}','B'),('${foreignBranch}','${otherOwner}','Externa');
  INSERT INTO public.partner_salespeople(id,user_id,name,role,active,branch_id,auth_user_id,pin_hash) VALUES
    ('${adminA}','${owner}','Admin A','administrador',true,'${branchA}','${adminA}','h'),
    ('${adminB}','${owner}','Admin B','administrador',true,'${branchA}','${adminB}','h'),
    ('${manager}','${owner}','Gerente','gerente',true,'${branchA}','${manager}','h'),
    ('${seller}','${owner}','Vendedor','vendedor',true,'${branchA}','${seller}','h'),
    ('${adminNoBranch}','${owner}','Sem filial','administrador',true,NULL,'${adminNoBranch}','h'),
    ('${foreignAdmin}','${otherOwner}','Admin externo','administrador',true,'${foreignBranch}','${foreignAdmin}','h');
  INSERT INTO public.service_orders(id,user_id,branch_id,title) VALUES
    ('${osIdA}','${owner}','${branchA}','OS A'),('${osIdForeign}','${otherOwner}','${foreignBranch}','OS externa');
  INSERT INTO public.service_order_items(id,service_order_id,user_id,branch_id) VALUES
    ('${osIdA}','${osIdA}','${owner}','${branchA}'),('${osIdForeign}','${osIdForeign}','${otherOwner}','${foreignBranch}');
  INSERT INTO public.service_order_photos(id,service_order_id,user_id,branch_id) VALUES
    ('${osIdA}','${osIdA}','${owner}','${branchA}'),('${osIdForeign}','${osIdForeign}','${otherOwner}','${foreignBranch}');
  ${['partner_products', 'partner_customers', 'partner_sales', 'partner_cash_sessions', 'catalog_orders']
    .map((t, i) => `INSERT INTO public.${t}(id,user_id,branch_id) VALUES
      ('4000000${i}-0000-0000-0000-000000000001','${owner}','${branchA}'),
      ('4000000${i}-0000-0000-0000-000000000002','${otherOwner}','${foreignBranch}');`).join('\n')}
`;

async function buildDb({ dropPublicCash = false } = {}) {
  const db = await openDatabase();
  await db.exec(baseSchema);
  await db.exec(seed);
  await db.exec(legacyFunctions);
  if (dropPublicCash) {
    await db.exec(`DROP FUNCTION public.mutate_partner_cash_register(
      text,uuid,uuid,text,uuid,numeric,text,text,uuid,text,uuid)`);
  }
  return db;
}

async function setAuth(db, userId, { superAdminUid = superAdmin } = {}) {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  await db.query(`SELECT set_config('test.super_admin_uid', $1, false)`, [superAdminUid]);
  await db.exec('SET ROLE authenticated');
}

const countRows = async (db, table) => Number((await db.query(`SELECT count(*)::int AS n FROM public.${table}`)).rows[0].n);

test('stand-in supervisor guard is the exact audited text from the original cash migration', () => {
  const realGuard = "AND sp.role IN ('administrador','gerente') AND (sp.role='administrador' OR sp.branch_id=p_branch_id)";
  assert.ok(originalCashMigration.includes(realGuard), 'original cash migration guard changed');
  assert.ok(legacyFunctions.includes(realGuard), 'fixture no longer mirrors the audited guard');
});

test('every supervisor authorization honours owner-granted branch access and PIN', async () => {
  const db = await buildDb();
  try {
    await db.exec(migration);
    // Idempotent: a second run finds nothing left to patch.
    await db.exec(migration);

    const cash = (schema, supervisor, branch, pin = '1234') => db.query(
      `SELECT ${schema}.mutate_partner_cash_register('x',$1,$2,'x',$3,1,'x',$4,NULL,'x',NULL) AS ok`,
      [manager, branch, supervisor, pin],
    ).then(r => r.rows[0].ok);
    const refund = (supervisor, branch, pin = '1234') => db.query(
      'SELECT partner_rma_private.record_cash_refund($1,$2,$3,$4) AS ok', [owner, branch, supervisor, pin],
    ).then(r => r.rows[0].ok);
    const openOrder = (supervisor, branch, pin = '1234') => db.query(
      'SELECT public.authorize_open_order_stub($1,$2,$3,$4) AS ok', [owner, branch, supervisor, pin],
    ).then(r => r.rows[0].ok);
    const history = (supervisor, branch, pin = '1234') => db.query(
      'SELECT public.authorize_history_cancel_stub($1,$2,$3,$4) AS ok', [owner, branch, supervisor, pin],
    ).then(r => r.rows[0].ok);
    const checks = [
      (s, b, p) => cash('public', s, b, p),
      (s, b, p) => cash('partner_cash_supervision_private', s, b, p),
      refund, openOrder, history,
    ];

    await setAuth(db, owner);
    for (const check of checks) {
      assert.equal(await check(adminA, branchA), true, 'admin on primary branch');
      assert.equal(await check(adminA, branchB), false, 'admin on non-granted branch');
      assert.equal(await check(adminA, branchA, '0000'), false, 'wrong PIN stays rejected');
      assert.equal(await check(manager, branchA), true, 'manager on own branch');
      assert.equal(await check(manager, branchB), false, 'manager limited to own branch');
      assert.equal(await check(adminNoBranch, branchA), false, 'admin without branch is not a supervisor');
      assert.equal(await check(seller, branchA), false, 'non-supervisor role');
      assert.equal(await check(foreignAdmin, branchA), false, 'other company supervisor');
    }

    await db.query('SELECT public.set_partner_admin_branch_access($1,$2,false,true)', [adminA, branchB]);
    for (const check of checks) {
      assert.equal(await check(adminA, branchB), true, 'granted additional branch');
      assert.equal(await check(adminB, branchB), false, 'other admin is not granted');
      assert.equal(await check(manager, branchB), false, 'grants never reach managers');
    }

    await db.query('SELECT public.set_partner_admin_branch_access($1,$2,false,false)', [adminA, branchB]);
    for (const check of checks) assert.equal(await check(adminA, branchB), false, 'revoked grant blocks again');

    await db.query('SELECT public.set_partner_admin_branch_access($1,NULL,true,true)', [adminA]);
    for (const check of checks) assert.equal(await check(adminA, branchB), true, 'explicit all-branches grant');

    // A grant must not be creatable by the administrator itself.
    await setAuth(db, adminB);
    await assert.rejects(
      db.query('SELECT public.set_partner_admin_branch_access($1,$2,false,true)', [adminB, branchB]),
      /Somente o proprietário autenticado/,
    );

    const legacy = await db.query(`
      SELECT p.oid::regprocedure::text AS fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.prokind = 'f' AND (n.nspname = 'public' OR n.nspname LIKE 'partner\\_%')
        AND (p.prosrc ~ '\\((\\w+)\\.role\\s*=\\s*''administrador''\\s+OR\\s+\\1\\.branch_id\\s*=\\s*p_branch_id\\)'
          OR p.prosrc ~ '\\(role\\s*=\\s*''administrador''\\s+OR\\s+branch_id\\s*=\\s*p_branch_id\\)')`);
    assert.deepEqual(legacy.rows, [], 'no legacy administrator-wide guard may remain');
  } finally {
    await db.close();
  }
});

test('cadastros helper no longer gives administrators implicit access to every branch', async () => {
  const db = await buildDb();
  try {
    await db.exec(migration);
    const can = (branch) => db.query(
      'SELECT partner_cadastros_private.can_manage($1,$2) AS ok', [owner, branch],
    ).then(r => r.rows[0].ok);
    await setAuth(db, adminA);
    assert.equal(await can(branchA), true);
    assert.equal(await can(branchB), false);
    await setAuth(db, owner);
    await db.query('SELECT public.set_partner_admin_branch_access($1,$2,false,true)', [adminA, branchB]);
    await setAuth(db, adminA);
    assert.equal(await can(branchB), true);
    await setAuth(db, owner);
    await db.query('SELECT public.set_partner_admin_branch_access($1,$2,false,false)', [adminA, branchB]);
    await setAuth(db, adminA);
    assert.equal(await can(branchB), false);
    await setAuth(db, manager);
    assert.equal(await can(branchA), true);
    assert.equal(await can(branchB), false);
  } finally {
    await db.close();
  }
});

test('migration fails closed when a cash supervisor RPC is missing', async () => {
  const db = await buildDb({ dropPublicCash: true });
  try {
    await assert.rejects(db.exec(migration), /Cash supervisor RPC missing in schema public/);
  } finally {
    await db.close();
  }
});

test('superadmin keeps support access to service orders, items and photos only', async () => {
  const db = await buildDb();
  try {
    await db.exec(migration);

    await setAuth(db, superAdmin);
    for (const table of ['service_orders', 'service_order_items', 'service_order_photos']) {
      assert.equal(await countRows(db, table), 2, `${table}: superadmin reads both companies`);
    }
    const updated = await db.query("UPDATE public.service_orders SET title='suporte' WHERE id=$1 RETURNING id", [osIdForeign]);
    assert.equal(updated.rows.length, 1, 'superadmin can update OS for support');
    await db.query(
      'INSERT INTO public.service_order_items(id,service_order_id,user_id,branch_id) VALUES($1,$2,$3,$4)',
      ['30000000-0000-0000-0000-0000000000f1', osIdA, owner, branchA],
    );

    // No blanket bypass: tables without a pre-existing superadmin policy stay isolated.
    for (const table of branchScoped.filter(t => !t.startsWith('service_order'))) {
      assert.equal(await countRows(db, table), 0, `${table}: superadmin has no implicit data access`);
    }
    await assert.rejects(
      db.query("INSERT INTO public.partner_products(id,user_id,branch_id,name) VALUES($1,$2,$3,'x')",
        ['40000000-0000-0000-0000-0000000000f2', owner, branchA]),
      /row-level security/,
    );

    // Regular users of another company are still denied on the same OS tables.
    await setAuth(db, foreignAdmin);
    assert.equal(await countRows(db, 'service_orders'), 1);
    const hidden = await db.query('SELECT id FROM public.service_orders WHERE user_id=$1', [owner]);
    assert.equal(hidden.rows.length, 0);
    await setAuth(db, otherOwner);
    assert.equal(await countRows(db, 'service_order_photos'), 1);

    // Branch-limited admin of the owner company sees only OS from the authorized branch.
    await setAuth(db, adminA);
    assert.equal(await countRows(db, 'service_orders'), 1);
    await setAuth(db, adminNoBranch);
    assert.equal(await countRows(db, 'service_orders'), 0);
  } finally {
    await db.close();
  }
});
