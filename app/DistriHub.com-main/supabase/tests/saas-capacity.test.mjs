import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const admin = randomUUID();
let owner, other, employee, branch, otherBranch;
const sql = (query, args = []) => db.query(query, args);
const value = async (query, args = []) => (await sql(query, args)).rows[0].result;
const login = async (user, session = null) => {
  await sql("select set_config('test.uid',$1,false),set_config('test.session',$2,false)", [user ?? '', session ?? '']);
};
const read = file => readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
const state = () => value('select public.get_partner_subscription($1) result', [owner]);
async function configure({ plan = 'enterprise', extra = 0, courtesy = 0, request = null, billing = 'paid' } = {}) {
  await login(admin);
  return value("select public.admin_save_saas_configuration($1,$2,$3,false,'active',NULL,$4,$5,'Ajuste autorizado no teste',$6) result",
    [owner, plan, billing, extra, courtesy, request]);
}
async function session(user = owner, target = branch, sid = randomUUID()) {
  await sql('insert into auth.sessions(id,user_id) values($1,$2) on conflict do nothing', [sid, user]);
  await login(user, sid);
  await value("select touch_partner_device($1,'Terminal de teste',$2) result", [randomUUID(), target]);
  return sid;
}
async function checkout(provider = 'mp-capacity') {
  await login(owner);
  const attempt = await value('select begin_saas_checkout($1) result', [owner]);
  await login(null);
  const finished = await value("select finish_saas_checkout($1,$2,'https://www.mercadopago.com.br/checkout','pending') result", [attempt.id, provider]);
  assert.equal(finished.accepted, true);
  return attempt;
}
async function payment(attempt, { status = 'paid', amount = attempt.amount, provider = 'mp-capacity', id = 'payment-capacity', period = new Date().toISOString() } = {}) {
  await login(null);
  return value("select apply_saas_payment($1,$2,$3,$4,'BRL',$5,$6) result", [provider, id, status, amount, period, status === 'paid' ? period : null]);
}

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id));
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('session_id',NULLIF(current_setting('test.session',true),'')) $$;
    CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid()='${admin}'::uuid $$;
    CREATE TABLE partner_profiles(id uuid PRIMARY KEY,business_name text,subscription_plan text,subscription_status text,next_billing_date date);
    CREATE TABLE partner_branches(id uuid PRIMARY KEY,user_id uuid,name text,address text,is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE partner_salespeople(id uuid PRIMARY KEY,user_id uuid,auth_user_id uuid,active boolean,branch_id uuid);
    CREATE TABLE partner_sales(id uuid PRIMARY KEY,user_id uuid,total numeric);
    CREATE TABLE service_orders(id uuid PRIMARY KEY,user_id uuid);
    CREATE TABLE partner_store_settings(user_id uuid PRIMARY KEY,primary_color text,nav_color text,logo_url text,banner_url text,receipt_footer_text text);
    CREATE TABLE partner_plan_change_requests(id uuid PRIMARY KEY,user_id uuid,requested_plan text,status text,resolved_at timestamptz);
    CREATE FUNCTION public.get_partner_pdv_snapshot(p_branch_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN RETURN '{}'::jsonb; END; $$;
  `);
  await db.exec(await read('20261008025310_add_managed_saas_subscriptions.sql'));
  await db.exec(await read('20261008025316_enforce_saas_access_and_billing_jobs.sql'));
  await db.exec(await read('20261007065529_add_partner_device_registry.sql'));
  await db.exec(await read('20261023185537_plan_branch_addons_and_device_limits.sql'));
});
after(() => db.close());
beforeEach(async () => {
  await login(null);
  await db.exec('TRUNCATE partner_profiles,partner_branches,partner_salespeople,partner_sales,service_orders,partner_devices,auth.users CASCADE');
  [owner, other, employee, branch, otherBranch] = Array.from({ length: 5 }, randomUUID);
  await sql('insert into auth.users values($1),($2),($3),($4)', [owner, other, employee, admin]);
  await sql("insert into partner_profiles(id,business_name) values($1,'Empresa'),($2,'Outra')", [owner, other]);
  await sql("insert into partner_branches(id,user_id,name,address) values($1,$2,'Matriz',NULL),($3,$4,'Outra',NULL)", [branch, owner, otherBranch, other]);
  await sql('insert into partner_salespeople values($1,$2,$3,true,$4)', [randomUUID(), owner, employee, branch]);
});

test('novos preços, capacidade, dispositivos e remoção das integrações futuras', async () => {
  const plans = (await sql('select * from saas_plans order by monthly_amount')).rows;
  assert.deepEqual(plans.map(p => [Number(p.monthly_amount), p.branch_limit, p.device_limit]), [[49.9, 1, 3], [129.9, 3, 5], [249.9, 5, 8]]);
  assert.equal(Number(plans[2].extra_branch_amount), 39.9);
  assert.ok(!plans[2].features.includes('instagram')); assert.ok(!plans[2].features.includes('api'));
});
test('aprovação não libera adicional pago; webhook pago libera e estorno remove', async () => {
  await configure({ extra: 2 }); await login(owner);
  let s = await state(); assert.equal(s.branch_limit, 5); assert.equal(Number(s.quoted_monthly_amount), 329.7);
  const attempt = await checkout(); assert.equal(Number(attempt.amount), 329.7); assert.equal(attempt.extra_branches, 2);
  const period = new Date().toISOString();
  await payment(attempt, { status: 'pending', period }); await login(owner); assert.equal((await state()).branch_limit, 5);
  await payment(attempt, { period }); await login(owner); s = await state(); assert.equal(s.branch_limit, 7); assert.equal(s.funded_extra_branches, 2);
  await payment(attempt, { period }); await login(owner); assert.equal((await state()).branch_limit, 7);
  assert.equal((await sql('select count(*)::int n from saas_invoices')).rows[0].n, 1);
  const invoice = (await sql("select period_start from saas_invoices where provider_payment_id='payment-capacity'")).rows[0];
  await payment(attempt, { status: 'refunded', period: invoice.period_start }); await login(owner); assert.equal((await state()).branch_limit, 5);
});
test('valor incorreto ou pagamento futuro não libera capacidade', async () => {
  await configure({ extra: 1 }); const attempt = await checkout();
  await assert.rejects(payment(attempt, { amount: 249.9 }), /Valor ou moeda/);
  await payment(attempt, { period: '2099-01-01T00:00:00Z' }); await login(owner); assert.equal((await state()).branch_limit, 5);
});
test('cortesia é imediata, auditada e não aumenta mensalidade; troca paga cancela a autorização anterior', async () => {
  await configure({ courtesy: 2 }); await login(owner);
  assert.equal((await state()).branch_limit, 7); assert.equal(Number((await state()).quoted_monthly_amount), 249.9);
  await checkout(); await configure({ extra: 1, courtesy: 2 }); await login(owner);
  const s = await state(); assert.equal(s.provider_cancel_pending, true); assert.equal(s.provider_subscription_id, null);
  assert.equal(s.auto_renew, false); assert.equal(s.branch_limit, 7);
  assert.equal((await sql("select count(*)::int n from saas_provider_jobs where kind='cancel_subscription'")).rows[0].n, 1);
  assert.ok((await sql("select count(*)::int n from saas_billing_events where action='admin_capacity_update'")).rows[0].n > 0);
});
test('somente titular Enterprise solicita e somente Super Admin decide; decisão obsoleta falha', async () => {
  await configure(); await login(employee);
  await assert.rejects(value('select request_saas_extra_branches(1) result'), /titular/);
  await login(owner); const id = await value('select request_saas_extra_branches(2) result');
  await assert.rejects(value("select admin_reject_saas_branch_request($1,'Motivo de teste') result", [id]), /Super Admin/);
  await assert.rejects(configure({ extra: 1, request: id }), /solicitação mudou/);
  await configure({ extra: 2, request: id });
  assert.equal((await sql('select status from saas_branch_requests where id=$1', [id])).rows[0].status, 'approved');
  await assert.rejects(configure({ extra: 2, request: id }), /solicitação mudou/);
});
test('Básico admite três sessões e recusa a quarta; abas e heartbeat da mesma sessão não duplicam', async () => {
  const sid = await session(); await session(owner, branch, sid); await session(); await session();
  await assert.rejects(session(), /Limite de 3/);
  assert.equal((await sql('select count(*)::int n from partner_subscription_private.device_sessions')).rows[0].n, 3);
});
test('limites 5 e 8 são por filial e transferência não permite exceder capacidade', async () => {
  for (const [plan, limit] of [['profissional', 5], ['enterprise', 8]]) {
    await login(null); await db.exec('TRUNCATE partner_subscription_private.device_sessions'); await configure({ plan });
    for (let n = 0; n < limit; n++) await session();
    await assert.rejects(session(), new RegExp(`Limite de ${limit}`));
  }
  await login(null); const second = randomUUID(); await sql("insert into partner_branches(id,user_id,name,address) values($1,$2,'Filial 2',NULL)", [second, owner]);
  const sid = await session(owner, second);
  await assert.rejects(session(owner, branch, sid), /Limite de 8/);
});
test('sessões expiradas liberam vaga; dispositivo revogado perde acesso e não se readmite sozinho', async () => {
  const sid = await session(); await session(); await session();
  await sql("update partner_subscription_private.device_sessions set last_seen=now()-interval '4 minutes' where session_id=$1", [sid]);
  await session(); await login(owner, sid);
  assert.equal(await value("select partner_has_saas_access($1,'pdv') result", [owner]), false);
  await login(admin); const active = (await sql('select session_id from partner_subscription_private.device_sessions where session_id<>$1 limit 1', [sid])).rows[0].session_id;
  await value('select revoke_saas_device_session($1) result', [active]);
  await assert.rejects(session(owner, branch, active), /encerrada/);
  await session();
});
test('sessão e filial de outra empresa não podem ser falsificadas e funcionários não encerram sessões alheias', async () => {
  const sid = await session(); await session(other, otherBranch);
  await assert.rejects(value('select list_saas_device_sessions($1) result', [owner]), /não autorizada/);
  await assert.rejects(value('select revoke_saas_device_session($1) result', [sid]), /não autorizada/);
  await login(owner, randomUUID()); await assert.rejects(value("select touch_partner_device($1,'Falso',$2) result", [randomUUID(), branch]), /Sessão inválida/);
  const employeeSid = await session(employee); await login(employee, employeeSid);
  await assert.rejects(value("select touch_partner_device($1,'Falso',$2) result", [randomUUID(), otherBranch]), /Filial não autorizada/);
  await assert.rejects(value('select revoke_saas_device_session($1) result', [sid]), /não autorizada/);
});
test('escritas e RPC operacional sem terminal ativo são recusadas no servidor', async () => {
  await login(owner);
  await assert.rejects(value('select get_partner_pdv_snapshot($1) result', [branch]), /Terminal sem sessão/);
  await assert.rejects(sql('insert into partner_sales values($1,$2,10)', [randomUUID(), owner]), /indisponível/);
  const sid = await session();
  await value('select get_partner_pdv_snapshot($1) result', [branch]);
  await sql('insert into partner_sales values($1,$2,10)', [randomUUID(), owner]);
  await sql('delete from auth.sessions where id=$1', [sid]);
  assert.equal(await value("select partner_has_saas_access($1,'pdv') result", [owner]), false);
});
test('limite de filiais é aplicado no INSERT e pagamento vigente aumenta a capacidade', async () => {
  await configure({ extra: 1 }); const sid = await session();
  for (let n = 2; n <= 5; n++) await value("select to_jsonb(create_partner_branch($1)) result", [`Filial ${n}`]);
  await assert.rejects(value("select to_jsonb(create_partner_branch('Filial 6')) result"), /Limite de filiais/);
  const attempt = await checkout(); await payment(attempt); await login(owner, sid);
  await value("select to_jsonb(create_partner_branch('Filial 6')) result");
  await assert.rejects(value("select to_jsonb(create_partner_branch('Filial 7')) result"), /Limite de filiais/);
  await assert.rejects(configure({ plan: 'profissional' }), /mais filiais/);
});
test('autorização antiga conserva seu valor e novo checkout respeita o período pago', async () => {
  await configure(); const old = await checkout();
  await sql('update saas_checkout_attempts set amount=199.90 where id=$1', [old.id]);
  await login(owner); assert.equal(Number((await state()).monthly_amount), 199.9); assert.equal(Number((await state()).quoted_monthly_amount), 249.9);
  await payment({ ...old, amount: 199.90 });
  await configure({ extra: 2 });
  // Simulate the existing cancellation worker acknowledging the old recurring contract.
  await sql('update saas_subscriptions set provider_cancel_pending=false where company_id=$1', [owner]);
  const next = await checkout('mp-next');
  assert.equal(Number(next.amount), 329.7);
  assert.equal(await value('select $1::timestamptz=paid_until result from saas_subscriptions where company_id=$2', [next.trial_ends_at, owner]), true);
  await login(owner); assert.equal((await state()).branch_limit, 5);
});
test('roles do navegador não chamam helpers nem escrevem solicitações diretamente', async () => {
  await login(owner); await db.exec('SET ROLE authenticated');
  try {
    await assert.rejects(sql('select * from saas_branch_requests'), /permission denied/);
    await assert.rejects(value('select get_partner_subscription_before_addons($1) result', [owner]), /permission denied/);
    await assert.rejects(value('select begin_saas_checkout_before_addons($1) result', [owner]), /permission denied/);
    const result = await state(); assert.equal(result.company_id, owner);
    await assert.rejects(value("select admin_save_saas_configuration($1,'enterprise','paid',false,'active',NULL,9,9,'Tentativa não autorizada',NULL) result", [owner]), /Super Admin/);
  } finally { await db.exec('RESET ROLE'); }
});
test('reduzir o plano exige encerrar sessões excedentes, preservando os terminais em operação', async () => {
  await configure();
  for (let n = 0; n < 4; n++) await session();
  await assert.rejects(configure({ plan: 'basico' }), /Encerre sessões excedentes/);
  await login(owner); assert.equal((await state()).plan_id, 'enterprise');
});
