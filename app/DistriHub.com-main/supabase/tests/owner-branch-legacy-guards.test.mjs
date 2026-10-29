import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { openDatabase } from './fixtures/test-database.mjs';

// NOTE: stand-in schemas. The stand-in RPCs embed the exact guard text found in the audited migrations
// (asserted below), so they exercise the dynamic patch on a real engine when DISTRIHUB_REAL_PG_URL is set
// (see supabase/tests/real-postgres/run.mjs). They are NOT a production-equivalent validation.
const read = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const migration = await read('20261028180000_owner_authorized_admin_branch_access.sql');
const sources = {
  productDelete: await read('20261016195155_fix_audit_operator_authorization.sql'),
  customerMutation: await read('20261009192448_fix_shared_customer_credit_updates.sql'),
  saleDelete: await read('20260928044542_fix_pdv_sales_reconciliation.sql'),
  productMutation: await read('20261005161213_add_product_supplier.sql'),
  customerProfile: await read('20261021043934_enforce_frontend_business_invariants.sql'),
};
const legacyFunctions = await readFile(new URL('./fixtures/legacy-privileged-functions.sql', import.meta.url), 'utf8');
const norm = s => s.replace(/\s+/g, ' ');

const owner = '00000000-0000-0000-0000-000000000001';
const otherOwner = '00000000-0000-0000-0000-000000000002';
const adminA = '10000000-0000-0000-0000-000000000001';
const adminNoBranch = '10000000-0000-0000-0000-000000000005';
const manager = '10000000-0000-0000-0000-000000000003';
const foreignAdmin = '10000000-0000-0000-0000-000000000006';
const branchA = '20000000-0000-0000-0000-000000000001';
const branchB = '20000000-0000-0000-0000-000000000002';
const foreignBranch = '20000000-0000-0000-0000-000000000009';
const productA = '40000000-0000-0000-0000-00000000000a';
const productB = '40000000-0000-0000-0000-00000000000b';
const customerB = '50000000-0000-0000-0000-00000000000b';
const saleB = '60000000-0000-0000-0000-00000000000b';

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
  CREATE TABLE public.partner_products(id uuid PRIMARY KEY, user_id uuid, branch_id uuid, name text, stock integer DEFAULT 0);
  CREATE TABLE public.partner_stock_movements(id uuid PRIMARY KEY, user_id uuid, branch_id uuid, product_id uuid);
  CREATE TABLE public.partner_customers(id uuid PRIMARY KEY, user_id uuid, branch_id uuid, name text);
  CREATE TABLE public.partner_sales(id uuid PRIMARY KEY, user_id uuid, branch_id uuid, salesperson_id uuid);
  CREATE TABLE public.stock_movements(id uuid PRIMARY KEY, user_id uuid, branch_id uuid, product_id uuid);
  CREATE TABLE public.partner_audit_logs(
    id text, user_id uuid, actor_name text, actor_role text, action text,
    entity_type text, entity_id text, details text
  );
  CREATE FUNCTION public.verify_partner_salesperson_pin(text, text)
    RETURNS boolean LANGUAGE sql AS $$ SELECT $1 = '1234' $$;
`;

const seed = `
  INSERT INTO auth.users(id) VALUES ('${owner}'),('${otherOwner}'),('${adminA}'),('${manager}'),
    ('${adminNoBranch}'),('${foreignAdmin}');
  INSERT INTO public.partner_profiles(id) VALUES ('${owner}'),('${otherOwner}');
  INSERT INTO public.partner_branches(id,user_id,name) VALUES
    ('${branchA}','${owner}','A'),('${branchB}','${owner}','B'),('${foreignBranch}','${otherOwner}','Externa');
  INSERT INTO public.partner_salespeople(id,user_id,name,role,active,branch_id,auth_user_id,pin_hash) VALUES
    ('${adminA}','${owner}','Admin A','administrador',true,'${branchA}','${adminA}','h'),
    ('${manager}','${owner}','Gerente','gerente',true,'${branchA}','${manager}','h'),
    ('${adminNoBranch}','${owner}','Sem filial','administrador',true,NULL,'${adminNoBranch}','h'),
    ('${foreignAdmin}','${otherOwner}','Admin externo','administrador',true,'${foreignBranch}','${foreignAdmin}','h');
  INSERT INTO public.partner_products(id,user_id,branch_id,name) VALUES
    ('${productA}','${owner}','${branchA}','Produto A'),('${productB}','${owner}','${branchB}','Produto B');
  INSERT INTO public.partner_customers(id,user_id,branch_id,name) VALUES ('${customerB}','${owner}','${branchB}','Cliente B');
  INSERT INTO public.partner_sales(id,user_id,branch_id) VALUES ('${saleB}','${owner}','${branchB}');
`;

// Guards copied from the audited migrations; each assertion below keeps them in sync with the sources.
const guards = {
  productDelete: "IF v_operator.role <> 'administrador' AND ( v_operator.branch_id IS NULL OR v_operator.branch_id IS DISTINCT FROM v_product_branch ) THEN",
  customerMutation: "IF v_operator.role <> 'administrador' AND v_existing_branch_id IS NOT NULL AND v_existing_branch_id <> v_operator.branch_id THEN",
  saleDelete: "IF v_role <> 'administrador' AND (v_branch IS NULL OR v_sale_branch IS DISTINCT FROM v_branch) THEN",
  productMutation: "IF v_role <> 'administrador' AND (v_branch IS NULL OR v_branch <> p_branch_id) THEN",
};

const legacyRpcs = `
  CREATE FUNCTION public.execute_partner_product_delete(p_salesperson_id uuid, p_pin text, p_product_id uuid)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
  DECLARE v_operator record; v_product_branch uuid;
  BEGIN
    SELECT * INTO v_operator FROM public.resolve_partner_operator(p_salesperson_id, p_pin, NULL);
    SELECT branch_id INTO v_product_branch FROM public.partner_products
      WHERE id = p_product_id AND user_id = v_operator.company_id;
    ${guards.productDelete} RAISE EXCEPTION 'Acesso negado a filial'; END IF;
    DELETE FROM public.partner_products WHERE id = p_product_id AND user_id = v_operator.company_id;
    RETURN p_product_id;
  END $$;

  CREATE FUNCTION public.execute_partner_customer_mutation(p_salesperson_id uuid, p_pin text, p_customer_id uuid, p_branch_id uuid, p_name text)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
  DECLARE v_operator record; v_existing_branch_id uuid;
  BEGIN
    SELECT branch_id INTO v_existing_branch_id FROM public.partner_customers WHERE id = p_customer_id;
    SELECT * INTO v_operator FROM public.resolve_partner_operator(
      p_salesperson_id, p_pin, COALESCE(p_branch_id, v_existing_branch_id));
    ${guards.customerMutation} RAISE EXCEPTION 'Acesso negado: cliente de outra filial'; END IF;
    UPDATE public.partner_customers SET name = p_name WHERE id = p_customer_id AND user_id = v_operator.company_id;
    RETURN p_customer_id;
  END $$;

  CREATE FUNCTION public.execute_partner_sale_delete(p_salesperson_id uuid, p_pin text, p_sale_id uuid)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
  DECLARE v_company_id uuid; v_role text; v_branch uuid; v_sale_branch uuid;
  BEGIN
    SELECT op.company_id, op.role, op.branch_id INTO v_company_id, v_role, v_branch
    FROM public.resolve_partner_pdv_operator(p_salesperson_id, p_pin, NULL) op;
    IF v_role NOT IN ('administrador','gerente') THEN RAISE EXCEPTION 'Acesso negado: cargo'; END IF;
    SELECT s.branch_id INTO v_sale_branch FROM public.partner_sales s WHERE s.id = p_sale_id AND s.user_id = v_company_id;
    ${guards.saleDelete} RAISE EXCEPTION 'Acesso negado a filial'; END IF;
    DELETE FROM public.partner_sales WHERE id = p_sale_id AND user_id = v_company_id;
    RETURN p_sale_id;
  END $$;

  CREATE FUNCTION public.execute_partner_product_mutation(p_salesperson_id uuid, p_pin text, p_product_id uuid, p_branch_id uuid, p_name text)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
  DECLARE
    v_auth_user uuid := (SELECT auth.uid()); v_company_id uuid; v_role text; v_branch uuid;
    v_existing_user uuid; v_existing_branch uuid; v_old_stock integer;
  BEGIN
    v_company_id := v_auth_user;
    IF p_salesperson_id IS NOT NULL THEN
      SELECT sp.user_id, sp.role, sp.branch_id INTO v_company_id, v_role, v_branch
      FROM public.partner_salespeople sp
      WHERE sp.id = p_salesperson_id AND sp.active = true
        AND public.verify_partner_salesperson_pin(p_pin, sp.pin_hash)
        AND (sp.user_id = v_auth_user OR sp.auth_user_id = v_auth_user);
      IF v_company_id IS NULL THEN RAISE EXCEPTION 'Operador invalido ou PIN incorreto'; END IF;
      ${guards.productMutation}
        RAISE EXCEPTION 'Acesso negado à filial';
      END IF;
    ELSE
      v_role := 'administrador';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.partner_branches b WHERE b.id = p_branch_id AND b.user_id = v_company_id) THEN
      RAISE EXCEPTION 'Filial inválida';
    END IF;
    SELECT pp.user_id, pp.branch_id, pp.stock INTO v_existing_user, v_existing_branch, v_old_stock
    FROM public.partner_products pp WHERE pp.id = p_product_id FOR UPDATE;
    IF v_existing_user IS NOT NULL AND v_existing_user <> v_company_id THEN
      RAISE EXCEPTION 'Produto não pertence à empresa';
    END IF;
    IF v_existing_user IS NOT NULL AND v_existing_branch IS DISTINCT FROM p_branch_id AND COALESCE(v_old_stock, 0) <> 0 THEN
      RAISE EXCEPTION 'Não é permitido trocar a filial de um produto com estoque.';
    END IF;
    INSERT INTO public.partner_products(id, user_id, branch_id, name) VALUES (p_product_id, v_company_id, p_branch_id, p_name)
    ON CONFLICT (id) DO UPDATE SET branch_id = EXCLUDED.branch_id, name = EXCLUDED.name;
    RETURN p_product_id;
  END $$;

  GRANT EXECUTE ON FUNCTION
    public.execute_partner_product_delete(uuid,text,uuid),
    public.execute_partner_customer_mutation(uuid,text,uuid,uuid,text),
    public.execute_partner_sale_delete(uuid,text,uuid),
    public.execute_partner_product_mutation(uuid,text,uuid,uuid,text)
  TO authenticated;
  REVOKE EXECUTE ON FUNCTION
    public.execute_partner_product_delete(uuid,text,uuid),
    public.execute_partner_customer_mutation(uuid,text,uuid,uuid,text),
    public.execute_partner_sale_delete(uuid,text,uuid),
    public.execute_partner_product_mutation(uuid,text,uuid,uuid,text)
  FROM PUBLIC, anon;
`;

async function buildDb() {
  const db = await openDatabase();
  await db.exec(baseSchema);
  await db.exec(seed);
  await db.exec(legacyFunctions);
  await db.exec(legacyRpcs);
  return db;
}

async function setAuth(db, userId) {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  await db.exec('SET ROLE authenticated');
}

const attempt = async (db, sql, params) => {
  await db.exec('BEGIN');
  try {
    await db.query(sql, params);
    await db.exec('COMMIT');
    return true;
  } catch (error) {
    await db.exec('ROLLBACK');
    return error.message;
  }
};

const grant = (db, admin, branch, active) =>
  db.query('SELECT public.set_partner_admin_branch_access($1,$2,false,$3)', [admin, branch, active]);

test('stand-in guards are the exact audited text from the source migrations', () => {
  for (const [key, guard] of Object.entries(guards)) {
    assert.ok(norm(sources[key]).includes(norm(guard)), `${key} guard changed in its source migration`);
  }
  assert.ok(norm(sources.customerProfile).includes("operator.role<>'administrador' AND existing.branch_id IS NOT NULL"));
});

test('legacy administrator object-branch guards honour owner-granted branch access', async () => {
  const db = await buildDb();
  try {
    await db.exec(migration);
    await db.exec(migration); // idempotent

    const productDelete = (id, op) => attempt(db, 'SELECT public.execute_partner_product_delete($1,$2,$3)', [op, '1234', id]);
    const customerEdit = (op, branch) =>
      attempt(db, 'SELECT public.execute_partner_customer_mutation($1,$2,$3,$4,$5)', [op, '1234', customerB, branch, 'X']);
    const saleDelete = op => attempt(db, 'SELECT public.execute_partner_sale_delete($1,$2,$3)', [op, '1234', saleB]);
    const productEdit = (op, id, branch) =>
      attempt(db, 'SELECT public.execute_partner_product_mutation($1,$2,$3,$4,$5)', [op, '1234', id, branch, 'Y']);

    await setAuth(db, owner);
    // Admin A is only authorised for branch A: every object of branch B must be refused.
    assert.notEqual(await productDelete(productB, adminA), true, 'admin deletes product of branch B');
    assert.notEqual(await customerEdit(adminA, branchA), true, 'admin edits branch B customer passing own branch');
    assert.notEqual(await customerEdit(adminA, null), true, 'admin edits branch B customer without branch');
    assert.notEqual(await saleDelete(adminA), true, 'admin deletes sale of branch B');
    assert.notEqual(await productEdit(adminA, productB, branchA), true, 'admin moves product of branch B to A');
    assert.notEqual(await productEdit(adminA, productA, branchB), true, 'admin creates/moves product into branch B');
    assert.notEqual(await saleDelete(manager), true, 'manager limited to own branch');
    assert.notEqual(await productDelete(productA, adminNoBranch), true, 'admin without main branch gets no access');
    assert.notEqual(await productDelete(productA, foreignAdmin), true, 'other company admin');

    // Allowed on the authorised branch.
    assert.equal(await productEdit(adminA, productA, branchA), true);

    await grant(db, adminA, branchB, true);
    assert.equal(await customerEdit(adminA, branchB), true, 'granted admin edits branch B customer');
    assert.equal(await productEdit(adminA, productB, branchB), true, 'granted admin edits branch B product');
    assert.equal(await saleDelete(adminA), true, 'granted admin deletes branch B sale');
    assert.equal(await productDelete(productB, adminA), true, 'granted admin deletes branch B product');

    await grant(db, adminA, branchB, false);
    assert.notEqual(await productEdit(adminA, productB, branchB), true, 'revoked admin is blocked again');

    // The owner (no operator selected) is unrestricted inside the company.
    assert.equal(await productEdit(null, productB, branchB), true, 'owner edits any branch');
    assert.equal(await customerEdit(null, branchB), true, 'owner edits any customer');
  } finally {
    await db.close();
  }
});

test('patched legacy RPCs keep SECURITY DEFINER, search_path and ACL; helper is not callable by API roles', async () => {
  const db = await buildDb();
  try {
    const snapshot = async () => (await db.query(`
      SELECT p.proname, p.prosecdef, p.proconfig::text AS config, p.proacl::text AS acl
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('execute_partner_product_delete',
        'execute_partner_customer_mutation', 'execute_partner_sale_delete', 'execute_partner_product_mutation')
      ORDER BY 1`)).rows;
    const before = await snapshot();
    await db.exec(migration);
    assert.deepEqual(await snapshot(), before);

    const helper = (await db.query(`
      SELECT has_function_privilege('anon','public.partner_operator_can_use_branch(uuid,uuid,uuid)','EXECUTE') AS anon,
             has_function_privilege('authenticated','public.partner_operator_can_use_branch(uuid,uuid,uuid)','EXECUTE') AS auth`)).rows[0];
    assert.equal(helper.anon, false);
    assert.equal(helper.auth, false);
    const dml = (await db.query(`
      SELECT has_table_privilege('authenticated','public.partner_admin_branch_access','INSERT') AS i,
             has_table_privilege('authenticated','public.partner_admin_branch_access','UPDATE') AS u,
             has_table_privilege('authenticated','public.partner_admin_branch_access','DELETE') AS d`)).rows[0];
    assert.deepEqual(dml, { i: false, u: false, d: false });
  } finally {
    await db.close();
  }
});

test('legacy NULL-branch administrators and their records are not modified by the migration', async () => {
  const db = await buildDb();
  try {
    const dump = async () => JSON.stringify((await db.query(
      'SELECT id, user_id, role, active, branch_id FROM public.partner_salespeople ORDER BY id')).rows);
    const before = await dump();
    await db.exec(migration);
    assert.equal(await dump(), before);
    const counts = (await db.query(`SELECT (SELECT count(*) FROM public.partner_products)::int AS p,
      (SELECT count(*) FROM public.partner_customers)::int AS c, (SELECT count(*) FROM public.partner_sales)::int AS s`)).rows[0];
    assert.deepEqual(counts, { p: 2, c: 1, s: 1 });
  } finally {
    await db.close();
  }
});
