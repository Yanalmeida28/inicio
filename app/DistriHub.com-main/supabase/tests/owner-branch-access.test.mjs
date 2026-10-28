import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(
  new URL('../migrations/20261028180000_owner_authorized_admin_branch_access.sql', import.meta.url),
  'utf8',
);
const authSource = await readFile(new URL('../../src/hooks/useAuth.ts', import.meta.url), 'utf8');
const panelSource = await readFile(new URL('../../src/components/PartnerPanel.tsx', import.meta.url), 'utf8');
const cadastrosSource = await readFile(new URL('../../src/components/partner/CadastrosModule.tsx', import.meta.url), 'utf8');

test('owner grants explicit branch scopes; every other role stays in its authorized branch', async () => {
  const db = new PGlite();
  const owner = '00000000-0000-0000-0000-000000000001';
  const otherOwner = '00000000-0000-0000-0000-000000000002';
  const admin = '10000000-0000-0000-0000-000000000001';
  const manager = '10000000-0000-0000-0000-000000000002';
  const seller = '10000000-0000-0000-0000-000000000003';
  const noBranch = '10000000-0000-0000-0000-000000000004';
  const cashier = '10000000-0000-0000-0000-000000000005';
  const technician = '10000000-0000-0000-0000-000000000006';
  const attendant = '10000000-0000-0000-0000-000000000007';
  const logistics = '10000000-0000-0000-0000-000000000008';
  const ownerStaff = '10000000-0000-0000-0000-000000000009';
  const mainBranch = '20000000-0000-0000-0000-000000000001';
  const secondBranch = '20000000-0000-0000-0000-000000000002';
  const thirdBranch = '20000000-0000-0000-0000-000000000003';
  const foreignBranch = '20000000-0000-0000-0000-000000000004';

  try {
    await db.exec(`
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
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES public.partner_profiles(id),
        name text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        UNIQUE(id,user_id)
      );
      CREATE TABLE public.partner_salespeople(
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES public.partner_profiles(id),
        name text NOT NULL,
        role text NOT NULL,
        active boolean NOT NULL DEFAULT true,
        branch_id uuid,
        auth_user_id uuid,
        pin_hash text,
        commission_rate numeric DEFAULT 0,
        email text,
        phone text,
        pin text,
        created_at timestamptz DEFAULT now(),
        blocked_modules text[] NOT NULL DEFAULT '{}',
        UNIQUE(id,user_id)
      );
      CREATE TABLE public.partner_products(id uuid PRIMARY KEY, user_id uuid, branch_id uuid, name text);
      CREATE TABLE public.partner_stock_movements(id uuid PRIMARY KEY, user_id uuid, branch_id uuid, product_id uuid);
      CREATE TABLE public.partner_customers(id uuid PRIMARY KEY, user_id uuid, branch_id uuid, name text);
      CREATE TABLE public.partner_sales(id uuid PRIMARY KEY, user_id uuid, branch_id uuid, salesperson_id uuid);
      CREATE TABLE public.stock_movements(id uuid PRIMARY KEY, user_id uuid, branch_id uuid, product_id uuid);
      CREATE TABLE public.partner_cash_sessions(id uuid PRIMARY KEY, user_id uuid, branch_id uuid);
      CREATE TABLE public.catalog_orders(id uuid PRIMARY KEY, user_id uuid, branch_id uuid);
      CREATE TABLE public.service_orders(id uuid PRIMARY KEY, user_id uuid, branch_id uuid);
      CREATE TABLE public.partner_audit_logs(
        id text, user_id uuid, actor_name text, actor_role text, action text,
        entity_type text, entity_id text, details text
      );
      CREATE FUNCTION public.verify_partner_salesperson_pin(text, text)
        RETURNS boolean LANGUAGE sql AS $$ SELECT $1 = '1234' $$;
      ALTER TABLE public.partner_products ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.partner_customers ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.partner_sales ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.partner_salespeople ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.partner_branches ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.partner_stock_movements ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.partner_cash_sessions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.catalog_orders ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_products, public.partner_customers,
        public.partner_sales, public.partner_salespeople, public.partner_branches,
        public.stock_movements, public.partner_stock_movements, public.partner_cash_sessions, public.catalog_orders,
        public.service_orders TO authenticated;
      CREATE POLICY test_products_read ON public.partner_products FOR SELECT TO authenticated USING (true);
      CREATE POLICY test_customers_read ON public.partner_customers FOR SELECT TO authenticated USING (true);
      CREATE POLICY test_sales_read ON public.partner_sales FOR SELECT TO authenticated USING (true);
      CREATE POLICY test_salespeople_read ON public.partner_salespeople FOR SELECT TO authenticated USING (true);
      CREATE POLICY test_branches_read ON public.partner_branches FOR SELECT TO authenticated USING (true);
      CREATE POLICY test_movements_read ON public.stock_movements FOR SELECT TO authenticated USING (true);
      CREATE POLICY test_partner_movements_read ON public.partner_stock_movements FOR SELECT TO authenticated USING (true);
      CREATE POLICY test_cash_read ON public.partner_cash_sessions FOR SELECT TO authenticated USING (true);
      CREATE POLICY test_catalog_read ON public.catalog_orders FOR SELECT TO authenticated USING (true);
      CREATE POLICY test_service_orders_read ON public.service_orders FOR SELECT TO authenticated USING (true);
      INSERT INTO auth.users(id) VALUES
        ('${owner}'),('${otherOwner}'),
        ('${admin}'),('${manager}'),('${seller}'),('${noBranch}'),
        ('${cashier}'),('${technician}'),('${attendant}'),('${logistics}');
      INSERT INTO public.partner_profiles(id) VALUES ('${owner}'),('${otherOwner}');
      INSERT INTO public.partner_branches(id,user_id,name) VALUES
        ('${mainBranch}','${owner}','Principal'),
        ('${secondBranch}','${owner}','Segunda'),
        ('${thirdBranch}','${owner}','Terceira'),
        ('${foreignBranch}','${otherOwner}','Outra empresa');
      INSERT INTO public.partner_salespeople(id,user_id,name,role,active,branch_id,auth_user_id,pin_hash)
      VALUES
        ('${admin}','${owner}','Admin','administrador',true,'${mainBranch}','${admin}','hash'),
        ('${manager}','${owner}','Gerente','gerente',true,'${mainBranch}','${manager}','hash'),
        ('${seller}','${owner}','Vendedor','vendedor',true,'${mainBranch}','${seller}','hash'),
        ('${noBranch}','${owner}','Sem filial','administrador',true,NULL,'${noBranch}','hash'),
        ('${cashier}','${owner}','Caixa','caixa',true,'${mainBranch}','${cashier}','hash'),
        ('${technician}','${owner}','Técnico','tecnico',true,'${mainBranch}','${technician}','hash'),
        ('${attendant}','${owner}','Atendente','atendente',true,'${mainBranch}','${attendant}','hash'),
        ('${logistics}','${owner}','Logística','logistica',true,'${mainBranch}','${logistics}','hash'),
        ('${ownerStaff}','${owner}','Titular operacional','administrador',true,'${mainBranch}','${owner}','hash');
      INSERT INTO public.partner_products(id,user_id,branch_id,name) VALUES
        ('30000000-0000-0000-0000-000000000001','${owner}','${mainBranch}','Produto 1'),
        ('30000000-0000-0000-0000-000000000002','${owner}','${secondBranch}','Produto 2'),
        ('30000000-0000-0000-0000-000000000003','${otherOwner}','${foreignBranch}','Produto externo');
      INSERT INTO public.partner_customers(id,user_id,branch_id,name) VALUES
        ('31000000-0000-0000-0000-000000000001','${owner}','${mainBranch}','Cliente 1'),
        ('31000000-0000-0000-0000-000000000002','${owner}','${secondBranch}','Cliente 2');
      INSERT INTO public.partner_cash_sessions(id,user_id,branch_id) VALUES
        ('32000000-0000-0000-0000-000000000001','${owner}','${mainBranch}'),
        ('32000000-0000-0000-0000-000000000002','${owner}','${secondBranch}');
      INSERT INTO public.catalog_orders(id,user_id,branch_id) VALUES
        ('33000000-0000-0000-0000-000000000001','${owner}','${mainBranch}'),
        ('33000000-0000-0000-0000-000000000002','${owner}','${secondBranch}');
      INSERT INTO public.service_orders(id,user_id,branch_id) VALUES
        ('34000000-0000-0000-0000-000000000001','${owner}','${mainBranch}'),
        ('34000000-0000-0000-0000-000000000002','${owner}','${secondBranch}');
    `);
    await db.exec(migration);

    const setAuth = async userId => {
      await db.exec('RESET ROLE');
      await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId]);
      await db.exec('SET ROLE authenticated');
    };
    const canAccess = async branchId => (await db.query(
      'SELECT public.partner_employee_can_access_branch($1,$2) AS allowed',
      [owner, branchId],
    )).rows[0].allowed;

    await setAuth(owner);
    assert.equal(await canAccess(mainBranch), true);
    assert.equal(await canAccess(secondBranch), true);
    assert.equal(await canAccess(foreignBranch), false);
    const ownerBranches = await db.query('SELECT id FROM public.partner_branches ORDER BY id');
    assert.deepEqual(ownerBranches.rows.map(row => row.id), [mainBranch, secondBranch, thirdBranch]);
    const ownerOperator = await db.query(
      'SELECT * FROM public.resolve_partner_operator(NULL,NULL,$1)',
      [secondBranch],
    );
    assert.equal(ownerOperator.rows[0].company_id, owner);
    assert.equal(ownerOperator.rows[0].salesperson_id, null);
    assert.equal(ownerOperator.rows[0].role, 'administrador');

    await setAuth(admin);
    assert.equal(await canAccess(mainBranch), true);
    assert.equal(await canAccess(secondBranch), false);
    assert.equal(await canAccess(foreignBranch), false);
    const adminBranches = await db.query('SELECT id FROM public.partner_branches ORDER BY id');
    assert.deepEqual(adminBranches.rows.map(row => row.id), [mainBranch]);
    for (const table of ['partner_products', 'partner_customers', 'partner_cash_sessions', 'catalog_orders', 'service_orders']) {
      const { rows } = await db.query(`SELECT branch_id FROM public.${table} ORDER BY branch_id`);
      assert.deepEqual(rows.map(row => row.branch_id), [mainBranch]);
    }
    await assert.rejects(
      db.query(
        'SELECT public.set_partner_admin_branch_access($1,$2,false,true)',
        [admin, secondBranch],
      ),
      /Somente o proprietário autenticado/,
    );
    await assert.rejects(
      db.query(
        'INSERT INTO public.partner_admin_branch_access(company_id,salesperson_id,branch_id,all_branches,granted_by) VALUES($1,$2,$3,false,$4)',
        [owner, admin, secondBranch, owner],
      ),
    );
    const directRoleChange = await db.query(
      "UPDATE public.partner_salespeople SET role='administrador' WHERE id=$1 RETURNING id",
      [manager],
    );
    assert.equal(directRoleChange.rows.length, 0);
    await assert.rejects(
      db.query(
        `SELECT public.update_partner_salesperson_access(
          $1,'Gerente','administrador',0,NULL,NULL,true,$2,NULL,NULL,NULL,'{}'::text[]
        )`,
        [manager, mainBranch],
      ),
      /Somente o proprietário/,
    );
    await setAuth(manager);
    const selfOperator = await db.query(
      'SELECT * FROM public.resolve_partner_operator(NULL,NULL,$1)',
      [mainBranch],
    );
    assert.equal(selfOperator.rows[0].salesperson_id, manager);
    assert.equal(selfOperator.rows[0].role, 'gerente');

    await setAuth(owner);
    await db.query(
      'SELECT public.set_partner_admin_branch_access($1,$2,false,true)',
      [admin, secondBranch],
    );
    await assert.rejects(
      db.query(
        'SELECT public.set_partner_admin_branch_access($1,$2,false,true)',
        [manager, thirdBranch],
      ),
      /Somente um administrador/,
    );
    await db.query(
      'SELECT public.set_partner_admin_branch_access($1,$2,false,true)',
      [admin, thirdBranch],
    );
    await db.exec('RESET ROLE');
    await db.query(
      `INSERT INTO public.partner_sales(id,user_id,branch_id,salesperson_id)
       VALUES ('40000000-0000-0000-0000-000000000001',$1,$2,$3)`,
      [owner, secondBranch, admin],
    );
    await assert.rejects(
      db.query(
        `INSERT INTO public.partner_sales(id,user_id,branch_id,salesperson_id)
         VALUES ('40000000-0000-0000-0000-000000000002',$1,$2,$3)`,
        [owner, secondBranch, seller],
      ),
      /Funcionário sem autorização/,
    );
    await setAuth(admin);
    assert.equal(await canAccess(secondBranch), true);
    assert.equal(await canAccess(thirdBranch), true);
    const grantedBranches = await db.query('SELECT public.list_saas_access_branches($1) AS branches', [owner]);
    assert.deepEqual(
      new Set(grantedBranches.rows[0].branches.map(branch => branch.id)),
      new Set([mainBranch, secondBranch, thirdBranch]),
    );
    const adminOperator = await db.query(
      'SELECT * FROM public.resolve_partner_operator($1,$2,$3)',
      [admin, '1234', secondBranch],
    );
    assert.equal(adminOperator.rows[0].branch_id, secondBranch);
    assert.equal(
      (await db.query('SELECT public.partner_employee_can_operate_sale($1,$2,$3) AS allowed', [owner, secondBranch, admin])).rows[0].allowed,
      true,
    );
    await setAuth(manager);
    await assert.rejects(
      db.query('SELECT * FROM public.resolve_partner_operator($1,$2,$3)', [manager, '1234', secondBranch]),
      /Acesso negado/,
    );
    await assert.rejects(
      db.query('SELECT * FROM public.resolve_partner_operator($1,$2,$3)', [admin, '1234', secondBranch]),
      /Operador inválido/,
    );
    await setAuth(admin);
    for (const table of ['partner_products', 'partner_customers', 'partner_cash_sessions', 'catalog_orders', 'service_orders']) {
      const { rows } = await db.query(`SELECT branch_id FROM public.${table} ORDER BY branch_id`);
      assert.deepEqual(rows.map(row => row.branch_id), [mainBranch, secondBranch]);
    }

    await setAuth(owner);
    await db.query(
      'SELECT public.set_partner_admin_branch_access($1,NULL,true,true)',
      [admin],
    );
    await setAuth(admin);
    assert.equal(await canAccess(secondBranch), true);
    assert.equal(await canAccess(thirdBranch), true);
    assert.equal(
      (await db.query('SELECT public.partner_employee_can_operate_sale($1,$2,$3) AS allowed', [owner, thirdBranch, admin])).rows[0].allowed,
      true,
    );

    await setAuth(owner);
    await db.query(
      'SELECT public.set_partner_admin_branch_access($1,NULL,true,false)',
      [admin],
    );
    await db.query(
      'SELECT public.set_partner_admin_branch_access($1,$2,false,false)',
      [admin, secondBranch],
    );
    await db.query(
      'SELECT public.set_partner_admin_branch_access($1,$2,false,false)',
      [admin, thirdBranch],
    );
    await setAuth(admin);
    assert.equal(await canAccess(secondBranch), false);
    assert.equal(await canAccess(thirdBranch), false);
    assert.equal(
      (await db.query('SELECT public.partner_employee_can_operate_sale($1,$2,$3) AS allowed', [owner, thirdBranch, admin])).rows[0].allowed,
      false,
    );

    for (const employeeId of [manager, seller, cashier, technician, attendant, logistics, noBranch]) {
      await setAuth(employeeId);
      assert.equal(await canAccess(mainBranch), employeeId !== noBranch);
      assert.equal(await canAccess(secondBranch), false);
      assert.equal(await canAccess(foreignBranch), false);
    }

    await setAuth(owner);
    const history = await db.query(
      'SELECT all_branches, branch_id, revoked_at IS NOT NULL AS revoked FROM public.partner_admin_branch_access WHERE salesperson_id=$1 ORDER BY granted_at,id',
      [admin],
    );
    assert.equal(history.rows.length, 3);
    assert.deepEqual(history.rows.map(row => row.revoked), [true, true, true]);
    assert.equal(history.rows.filter(row => row.all_branches).length, 1);
    await db.query(
      'SELECT public.set_partner_admin_branch_access($1,$2,false,true)',
      [admin, secondBranch],
    );
    await db.exec('RESET ROLE');
    await db.query(
      "UPDATE public.partner_salespeople SET role='gerente' WHERE id=$1",
      [admin],
    );
    await db.query(
      "UPDATE public.partner_salespeople SET role='administrador' WHERE id=$1",
      [admin],
    );
    await setAuth(admin);
    assert.equal(await canAccess(secondBranch), false);
    await setAuth(owner);
    const demotionHistory = await db.query(
      'SELECT revoked_at IS NOT NULL AS revoked FROM public.partner_admin_branch_access WHERE salesperson_id=$1 ORDER BY granted_at,id',
      [admin],
    );
    assert.equal(demotionHistory.rows.length, 4);
    assert.equal(demotionHistory.rows[3].revoked, true);
  } finally {
    await db.close();
  }
});

test('owner identity is resolved before collaborator identity and is not an assignable staff role', () => {
  const ownerLookup = authSource.indexOf(".from('partner_profiles')");
  const staffLookup = authSource.indexOf(".from('partner_salespeople')");
  assert.ok(ownerLookup >= 0 && staffLookup > ownerLookup);
  assert.match(authSource, /isOwner:\s*true/);
  assert.match(authSource, /isOwner:\s*false/);
  assert.match(panelSource, /identity\?\.isOwner === true/);
  assert.match(cadastrosSource, /Proprietário da empresa/);
  assert.match(cadastrosSource, /role === 'administrador'/);
  assert.doesNotMatch(cadastrosSource, /<option value="proprietario">/i);
  assert.match(migration, /deny_direct_salespeople_(insert|update|delete)/);
  assert.match(migration, /Somente o proprietário pode alterar os acessos da equipe/);
});

test('collaborator administration, operator selection and company isolation are enforced server-side', async () => {
  const db = new PGlite();
  const u = n => `00000000-0000-0000-0000-00000000000${n}`;
  const [owner, otherOwner, admin, manager, seller, seller2, otherStaff] = [1, 2, 3, 4, 5, 6, 7].map(u);
  const main = '20000000-0000-0000-0000-000000000001';
  const second = '20000000-0000-0000-0000-000000000002';
  const foreign = '20000000-0000-0000-0000-000000000004';
  const call = (...args) => db.query(
    'SELECT * FROM public.execute_partner_salesperson_mutation($1,$2,$3,0,NULL,NULL,true,$4,$5,$6,NULL)',
    args,
  );
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE SCHEMA partner_subscription_private;
      CREATE FUNCTION partner_subscription_private.require_operator_module(text, uuid)
        RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
      CREATE TABLE public.partner_profiles(id uuid PRIMARY KEY REFERENCES auth.users(id));
      CREATE TABLE public.partner_branches(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.partner_profiles(id),
        name text NOT NULL, is_active boolean NOT NULL DEFAULT true, UNIQUE(id,user_id));
      CREATE TABLE public.partner_salespeople(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.partner_profiles(id),
        name text NOT NULL, role text NOT NULL, active boolean NOT NULL DEFAULT true, branch_id uuid, auth_user_id uuid,
        pin_hash text, commission_rate numeric DEFAULT 0, email text, phone text, pin text,
        created_at timestamptz DEFAULT now(), blocked_modules text[] NOT NULL DEFAULT '{}', UNIQUE(id,user_id));
      CREATE TABLE public.partner_sales(id uuid PRIMARY KEY, user_id uuid, branch_id uuid, salesperson_id uuid);
      CREATE TABLE public.partner_products(id uuid PRIMARY KEY, user_id uuid, branch_id uuid, name text);
      CREATE TABLE public.partner_customers(id uuid PRIMARY KEY, user_id uuid, branch_id uuid, name text);
      CREATE TABLE public.partner_stock_movements(id uuid PRIMARY KEY, user_id uuid, branch_id uuid, product_id uuid);
      CREATE TABLE public.stock_movements(id uuid PRIMARY KEY, user_id uuid, branch_id uuid, product_id uuid);
      CREATE TABLE public.partner_cash_sessions(id uuid PRIMARY KEY, user_id uuid, branch_id uuid);
      CREATE TABLE public.catalog_orders(id uuid PRIMARY KEY, user_id uuid, branch_id uuid);
      CREATE TABLE public.service_orders(id uuid PRIMARY KEY, user_id uuid, branch_id uuid);
      CREATE TABLE public.partner_audit_logs(id text, user_id uuid, actor_name text, actor_role text, action text,
        entity_type text, entity_id text, details text);
      CREATE FUNCTION public.verify_partner_salesperson_pin(text, text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 = '1234' $$;
      ALTER TABLE public.partner_salespeople ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.partner_branches ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON public.partner_salespeople, public.partner_branches TO authenticated;
      CREATE POLICY t1 ON public.partner_salespeople FOR SELECT TO authenticated USING (true);
      CREATE POLICY t2 ON public.partner_branches FOR SELECT TO authenticated USING (true);
      INSERT INTO auth.users(id) VALUES ('${owner}'),('${otherOwner}'),('${admin}'),('${manager}'),('${seller}'),('${seller2}'),('${otherStaff}');
      INSERT INTO public.partner_profiles(id) VALUES ('${owner}'),('${otherOwner}');
      INSERT INTO public.partner_branches(id,user_id,name) VALUES
        ('${main}','${owner}','Principal'),('${second}','${owner}','Segunda'),('${foreign}','${otherOwner}','Outra');
      INSERT INTO public.partner_salespeople(id,user_id,name,role,active,branch_id,auth_user_id,pin_hash) VALUES
        ('${admin}','${owner}','Admin','administrador',true,'${main}','${admin}','h'),
        ('${manager}','${owner}','Gerente','gerente',true,'${main}','${manager}','h'),
        ('${seller}','${owner}','Vendedor','vendedor',true,'${main}','${seller}','h'),
        ('${seller2}','${owner}','Vendedor 2','vendedor',true,'${second}','${seller2}','h'),
        ('${otherStaff}','${otherOwner}','Externo','vendedor',true,'${foreign}','${otherStaff}','h');
    `);
    await db.exec(migration);
    // Re-applying the migration must be idempotent.
    await db.exec(migration);
    const setAuth = async id => {
      await db.exec('RESET ROLE');
      await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [id]);
      await db.exec('SET ROLE authenticated');
    };

    // Admin manages a collaborator of their own branch.
    await setAuth(admin);
    const ok = await call(seller, 'Vendedor X', 'vendedor', main, admin, '1234');
    assert.equal(ok.rows[0].name, 'Vendedor X');
    // ...but cannot pull a collaborator from another branch, edit self, or touch administrators.
    await assert.rejects(call(seller2, 'Vendedor 2', 'vendedor', main, admin, '1234'), /Acesso negado/);
    await assert.rejects(call(seller, 'Vendedor', 'vendedor', second, admin, '1234'), /Acesso negado/);
    await assert.rejects(call(admin, 'Admin', 'administrador', main, admin, '1234'), /próprio acesso/);
    await assert.rejects(call(seller, 'Vendedor', 'administrador', main, admin, '1234'), /Somente o proprietário/);
    await assert.rejects(call(null, 'Novo Admin', 'administrador', main, admin, '1234'), /Somente o proprietário/);
    // A PIN or operator id belonging to someone else never replaces the session.
    await assert.rejects(call(seller, 'Vendedor', 'vendedor', main, manager, '1234'), /Acesso negado|Operador inválido/);
    await assert.rejects(call(seller, 'Vendedor', 'vendedor', main, owner, '1234'), /Acesso negado|Operador inválido/);
    // Cross-company rows are indistinguishable from missing rows.
    await assert.rejects(call(otherStaff, 'Hack', 'vendedor', main, admin, '1234'), /não encontrado nesta empresa/);
    await assert.rejects(call(null, 'Novo', 'vendedor', foreign, admin, '1234'), /Acesso negado|não pertence/);
    // Admin cannot self-grant extra branches.
    await assert.rejects(
      db.query('SELECT public.set_partner_admin_branch_access($1,$2,false,true)', [admin, second]),
      /Somente o proprietário autenticado/,
    );

    // Destination branch B (second) is not authorized: create and transfer are denied.
    await assert.rejects(call(null, 'Novo B', 'vendedor', second, admin, '1234'), /Acesso negado à filial/);
    await assert.rejects(call(seller, 'Vendedor', 'vendedor', second, admin, '1234'), /Acesso negado à filial/);

    await setAuth(owner);
    await db.query('SELECT public.set_partner_admin_branch_access($1,$2,false,true)', [admin, second]);
    await setAuth(admin);
    const created = await call(null, 'Novo B', 'vendedor', second, admin, '1234');
    assert.equal(created.rows[0].branch_id, second);
    const moved = await call(seller, 'Vendedor X', 'vendedor', second, admin, '1234');
    assert.equal(moved.rows[0].branch_id, second);
    const back = await call(seller, 'Vendedor X', 'vendedor', main, admin, '1234');
    assert.equal(back.rows[0].branch_id, main);
    // Still no self-edit, no admin management, no other company with the grant in place.
    await assert.rejects(call(admin, 'Admin', 'administrador', second, admin, '1234'), /próprio acesso/);
    await assert.rejects(call(otherStaff, 'Hack', 'vendedor', second, admin, '1234'), /não encontrado nesta empresa/);
    await assert.rejects(call(null, 'Novo', 'vendedor', foreign, admin, '1234'), /Acesso negado|não pertence/);
    await setAuth(owner);
    await db.query('SELECT public.set_partner_admin_branch_access($1,$2,false,false)', [admin, second]);
    await setAuth(admin);
    await assert.rejects(call(null, 'Novo C', 'vendedor', second, admin, '1234'), /Acesso negado à filial/);

    // Managers cannot touch administrators.
    await setAuth(manager);
    await assert.rejects(call(admin, 'Admin', 'gerente', main, manager, '1234'), /Somente o proprietário/);
    const mgrOk = await call(seller, 'Vendedor Y', 'vendedor', main, manager, '1234');
    assert.equal(mgrOk.rows[0].name, 'Vendedor Y');

    // Owner manages administrators without a PIN, and an operator id does not change the session.
    await setAuth(owner);
    const promoted = await call(seller, 'Vendedor Y', 'administrador', main, seller, 'qualquer');
    assert.equal(promoted.rows[0].role, 'administrador');
    const sel = await db.query('SELECT * FROM public.resolve_partner_operator($1,$2,$3)', [manager, '1234', main]);
    assert.equal(sel.rows[0].role, 'gerente');
    await assert.rejects(call(otherStaff, 'Hack', 'vendedor', foreign, null, null), /não encontrado nesta empresa/);

    // Another company's owner cannot modify or grant on this company.
    await setAuth(otherOwner);
    await assert.rejects(call(seller2, 'Hack', 'vendedor', foreign, null, null), /não encontrado nesta empresa/);
    await assert.rejects(
      db.query('SELECT public.set_partner_admin_branch_access($1,$2,false,true)', [admin, second]),
      /Somente|não|Administrador/i,
    );
    await setAuth(owner);
    const rows = await db.query("SELECT count(*)::int AS n FROM public.partner_salespeople WHERE user_id=$1", [otherOwner]);
    assert.equal(rows.rows[0].n, 0);
    // Branch requirement trigger is part of this migration.
    await db.exec('RESET ROLE');
    await assert.rejects(
      db.query("INSERT INTO public.partner_salespeople(id,user_id,name,role,branch_id) VALUES ('10000000-0000-0000-0000-0000000000aa',$1,'X','vendedor',NULL)", [owner]),
      /filial/,
    );
  } finally {
    await db.close();
  }
});