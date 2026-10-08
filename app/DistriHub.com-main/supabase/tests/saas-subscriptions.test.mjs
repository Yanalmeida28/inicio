import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHmac, webcrypto } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import ts from '../../node_modules/typescript/lib/typescript.js';

const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const sql = (query, args = []) => db.query(query, args);
const admin = '00000000-0000-0000-0000-000000000001';
let owner, other, employee;
const login = id => sql("select set_config('test.auth_uid',$1,false)", [id ?? '']);
const value = async (query, args = []) => (await sql(query, args)).rows[0].result;
const state = () => value('select public.get_partner_subscription($1) result', [owner]);
async function update(options = {}) {
  await login(admin);
  const result = await value('select public.admin_update_saas_subscription($1,$2,$3,$4,$5,$6,NULL,$7) result',
    [owner, options.plan ?? 'basico', options.billing ?? 'paid', options.full ?? false, options.status ?? 'active', 'Teste administrativo', options.until ?? null]);
  await login(owner);
  return result;
}
async function checkout() {
  await login(owner);
  const attempt = await value('select public.begin_saas_checkout($1) result', [owner]);
  await login(null);
  await value("select public.finish_saas_checkout($1,'mp-subscription','https://www.mercadopago.com.br/checkout','pending') result", [attempt.id]);
  await login(owner);
  return attempt;
}
const apply = async (status = 'paid', paymentId = 'payment-1', amount = 49.90, period = '2030-01-01T00:00:00Z') =>
  value('select public.apply_saas_payment($1,$2,$3,$4,$5,$6,$7) result',
    ['mp-subscription', paymentId, status, amount, 'BRL', period, status === 'paid' ? period : null]);

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.auth_uid',true),'')::uuid $$;
    CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid()='${admin}'::uuid $$;
    CREATE TABLE partner_profiles(id uuid PRIMARY KEY,business_name text,subscription_plan text DEFAULT 'basico',subscription_status text DEFAULT 'trial',next_billing_date date);
    CREATE TABLE partner_branches(id uuid PRIMARY KEY,user_id uuid,name text,address text);
    CREATE TABLE partner_salespeople(id uuid PRIMARY KEY,user_id uuid,auth_user_id uuid,active boolean);
    CREATE TABLE partner_sales(id uuid PRIMARY KEY,user_id uuid,total numeric);
    CREATE TABLE service_orders(id uuid PRIMARY KEY,user_id uuid);
    CREATE TABLE partner_store_settings(user_id uuid PRIMARY KEY,primary_color text,nav_color text,logo_url text,banner_url text,receipt_footer_text text);
    CREATE TABLE partner_plan_change_requests(id uuid PRIMARY KEY,user_id uuid,requested_plan text,status text,resolved_at timestamptz);
    CREATE FUNCTION public.get_partner_pdv_snapshot(p_branch_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN RETURN '{}'::jsonb; END; $$;
    ALTER TABLE partner_sales ENABLE ROW LEVEL SECURITY;
    CREATE POLICY sales_owner ON partner_sales TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
    GRANT SELECT,INSERT,UPDATE,DELETE ON partner_sales TO authenticated;
  `);
  await db.exec(await read('../migrations/20261008025310_add_managed_saas_subscriptions.sql'));
  await db.exec(await read('../migrations/20261008025316_enforce_saas_access_and_billing_jobs.sql'));
});
after(() => db.close());
beforeEach(async () => {
  await db.exec('RESET ROLE'); await login(null);
  await db.exec('TRUNCATE partner_profiles,partner_branches,partner_salespeople,partner_sales,service_orders,partner_plan_change_requests,partner_store_settings CASCADE');
  [owner, other, employee] = Array.from({ length: 3 }, randomUUID);
  await sql("insert into partner_profiles(id,business_name) values($1,'Empresa'),($2,'Outra')", [owner, other]);
  await sql('insert into partner_salespeople values($1,$2,$3,true)', [randomUUID(), owner, employee]);
  await login(owner);
});

test('novas empresas têm teste de 14 dias, básico e nenhuma renovação autorizada', async () => {
  const s = await state();
  assert.equal(s.status, 'trial'); assert.equal(s.can_access, true); assert.equal(s.auto_renew, false);
  assert.equal(s.branch_limit, 1); assert.ok(s.features.includes('pdv')); assert.ok(!s.features.includes('fiscal'));
  assert.equal((await sql('select count(*)::int count from saas_invoices')).rows[0].count, 0);
});
test('titular e funcionário não acessam empresa alheia ou gestão administrativa', async () => {
  await assert.rejects(value('select public.get_partner_subscription($1) result', [other]), /não autorizada/);
  await assert.rejects(value('select public.get_saas_admin_overview() result'), /Super Admin/);
  await login(employee); assert.equal((await state()).company_id, owner);
  await assert.rejects(value('select public.cancel_saas_renewal($1) result', [owner]), /não autorizado/);
});
test('isenção completa libera Enterprise; suspensão e cancelamento prevalecem sobre isenção', async () => {
  await update({ billing: 'exempt', full: true });
  assert.equal((await state()).monthly_amount, 0); assert.equal((await state()).branch_limit, null);
  assert.ok((await state()).features.includes('fiscal'));
  await update({ billing: 'exempt', full: true, status: 'suspended' }); assert.equal((await state()).can_access, false);
  await update({ billing: 'exempt', full: true, status: 'cancelled' }); assert.equal((await state()).can_access, false);
});
test('RPC de leitura e escrita privilegiada respeitam expiração e plano', async () => {
  await sql("update saas_subscriptions set trial_ends_at=now()-interval '1 day' where company_id=$1", [owner]);
  await assert.rejects(value('select get_partner_pdv_snapshot(NULL) result'), /sem acesso ativo/);
  await assert.rejects(sql('insert into partner_sales values($1,$2,100)', [randomUUID(), owner]), /indisponível/);
  await update({ until: '2030-01-01T00:00:00Z' });
  await sql('insert into partner_sales values($1,$2,100)', [randomUUID(), owner]);
  await assert.rejects(sql('insert into service_orders values($1,$2)', [randomUUID(), owner]), /indisponível/);
});
test('limite de filiais protege INSERT direto e RPC; isenção completa remove limite', async () => {
  await value("select to_jsonb(create_partner_branch('Loja 1')) result");
  await assert.rejects(sql('insert into partner_branches values($1,$2,$3,NULL)', [randomUUID(), owner, 'Loja 2']), /Limite/);
  await update({ billing: 'exempt', full: true });
  await value("select to_jsonb(create_partner_branch('Loja 2')) result");
  await assert.rejects(update(), /mais filiais/);
  await login(owner);
  await value('select public.cancel_saas_renewal($1) result', [owner]);
});
test('RLS fecha leituras quando a assinatura vence e mantém a consulta de regularização', async () => {
  await sql('insert into partner_sales values($1,$2,100)', [randomUUID(), owner]);
  await db.exec('SET ROLE authenticated');
  assert.equal((await sql('select * from partner_sales')).rows.length, 1);
  await assert.rejects(sql('select * from saas_subscriptions'), /permission denied/);
  await assert.rejects(value("select finish_saas_checkout($1,'fraud','https://www.mercadopago.com.br/','pending') result", [randomUUID()]), /permission denied/);
  await db.exec('RESET ROLE');
  await sql("update saas_subscriptions set trial_ends_at=now()-interval '1 day' where company_id=$1", [owner]);
  await db.exec('SET ROLE authenticated');
  assert.equal((await sql('select * from partner_sales')).rows.length, 0);
  assert.equal((await state()).can_access, false);
});
test('checkout concorrente reutiliza tentativa e aprovação do gateway sozinha não concede acesso pago', async () => {
  const first = await value('select begin_saas_checkout($1) result', [owner]);
  const again = await value('select begin_saas_checkout($1) result', [owner]);
  assert.equal(first.id, again.id); assert.equal(first.should_create, true); assert.equal(again.should_create, false);
  await value("select finish_saas_checkout($1,'mp-subscription',NULL,'authorized') result", [first.id]);
  assert.equal((await state()).paid_until, null);
});
test('pagamento é idempotente; valor, moeda e período adulterados são recusados', async () => {
  await checkout(); await apply(); await apply();
  assert.equal((await sql('select count(*)::int count from saas_invoices')).rows[0].count, 1);
  assert.equal((await state()).status, 'active');
  await assert.rejects(apply('paid', 'wrong', 1), /Valor ou moeda/);
  await assert.rejects(apply('paid', 'payment-1', 49.90, '2030-02-01T00:00:00Z'), /não correspondem/);
});
test('webhooks antigos não restauram pagamento estornado ou fazem pagamento voltar a pendente', async () => {
  await checkout(); await apply(); await apply('pending');
  assert.equal((await state()).invoices[0].status, 'paid');
  await apply('refunded'); await apply('paid');
  assert.equal((await state()).invoices[0].status, 'refunded'); assert.equal((await state()).paid_until, null);
});
test('cancelar renovação preserva período pago e enfileira cancelamento no gateway', async () => {
  await checkout(); await apply();
  const beforeCancel = await state();
  await value('select cancel_saas_renewal($1) result', [owner]);
  const s = await state();
  assert.equal(s.can_access, true); assert.equal(s.paid_until, beforeCancel.paid_until);
  assert.equal(s.auto_renew, false); assert.equal(s.provider_cancel_pending, true);
  assert.equal((await sql("select count(*)::int count from saas_provider_jobs where kind='cancel_subscription'")).rows[0].count, 1);
});
test('checkout confirmado após isenção é cancelado em vez de criar nova cobrança ativa', async () => {
  const a = await value('select begin_saas_checkout($1) result', [owner]);
  await update({ billing: 'exempt', full: true });
  const result = await value("select finish_saas_checkout($1,'late',NULL,'pending') result", [a.id]);
  assert.equal(result.accepted, false); assert.equal((await state()).provider_subscription_id, null);
  assert.equal((await state()).billing_mode, 'exempt');
});
test('cancelamento de cobrança exige super admin e motivo; trabalhador antigo não confirma lease novo', async () => {
  await checkout(); await apply('pending');
  const id = (await state()).invoices[0].id;
  await assert.rejects(value('select admin_cancel_saas_invoice($1,$2) result', [id, 'Motivo válido']), /não autorizado/);
  await login(admin); await value('select admin_cancel_saas_invoice($1,$2) result', [id, 'Isentar esta mensalidade']);
  await login(null);
  const jobs = (await sql('select * from claim_saas_provider_jobs(10)')).rows;
  const job = jobs.find(j => j.kind === 'cancel_payment'); assert.ok(job);
  await sql("update saas_provider_jobs set lease_until=now()-interval '1 second' where id=$1", [job.id]);
  const renewed = (await sql('select * from claim_saas_provider_jobs(10)')).rows.find(j => j.id === job.id);
  assert.notEqual(renewed.lease_token, job.lease_token);
  assert.equal(await value('select finish_saas_provider_job($1,$2,true) result', [job.id, job.lease_token]), false);
  assert.equal(await value('select finish_saas_provider_job($1,$2,true) result', [job.id, renewed.lease_token]), true);
  assert.equal((await sql('select status from saas_invoices where id=$1', [id])).rows[0].status, 'cancelled');
});
test('aprovação de solicitação altera assinatura autoritativa sem registrar pagamento', async () => {
  const id = randomUUID();
  await sql("insert into partner_plan_change_requests values($1,$2,'profissional','pending',NULL)", [id, owner]);
  await login(admin); await value('select resolve_partner_plan_change($1,true) result', [id]); await login(owner);
  assert.equal((await state()).plan_id, 'profissional'); assert.equal((await state()).paid_until, null);
});
test('personalização visual é protegida no banco, mantendo alterações de texto disponíveis no básico', async () => {
  await sql('insert into partner_store_settings(user_id,receipt_footer_text) values($1,$2)', [owner, 'Obrigado']);
  await assert.rejects(sql("update partner_store_settings set primary_color='#123456' where user_id=$1", [owner]), /Enterprise/);
  await sql("update partner_store_settings set receipt_footer_text='Volte sempre' where user_id=$1", [owner]);
  await update({ billing: 'exempt', full: true });
  await sql("update partner_store_settings set primary_color='#123456' where user_id=$1", [owner]);
});

const compiled = ts.transpileModule(await read('../functions/_shared/mercadoPago.ts'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mp = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
globalThis.crypto ??= webcrypto;
test('assinatura HMAC do Mercado Pago valida ID da URL; alterações ou assinatura ausente são recusadas', async () => {
  const manifest = 'id:abc123;request-id:request;ts:1704908010;';
  const signature = createHmac('sha256', 'secret').update(manifest).digest('hex');
  const request = (id, sig = signature) => new Request(`https://example.com/webhook?data.id=${id}`, {
    headers: { 'x-request-id': 'request', 'x-signature': `ts=1704908010,v1=${sig}` },
  });
  assert.equal(await mp.verifyMpSignature(request('ABC123'), 'secret'), true);
  assert.equal(await mp.verifyMpSignature(request('other'), 'secret'), false);
  assert.equal(await mp.verifyMpSignature(request('abc123'), 'wrong'), false);
  assert.equal(await mp.verifyMpSignature(new Request('https://example.com'), 'secret'), false);
});
test('normalização usa cobrança consultada e pagamento aprovado; dados incompatíveis não concedem acesso', () => {
  const invoice = { preapproval_id: 'sub', payment: { id: 7 }, transaction_amount: '49.90', currency_id: 'BRL', debit_date: '2030-01-01T00:00:00Z' };
  const payment = { id: 7, status: 'approved', transaction_amount: 49.90, currency_id: 'BRL', date_approved: '2030-01-01T01:00:00Z' };
  assert.equal(mp.paymentRpcArgs(invoice, payment).p_status, 'paid');
  assert.throws(() => mp.paymentRpcArgs(invoice, { ...payment, id: 8 }), /inconsistente/);
  assert.throws(() => mp.paymentRpcArgs(invoice, { ...payment, date_approved: null }), /aprovação/);
  assert.equal(mp.paymentRpcArgs(invoice, { ...payment, status: 'authorized' }).p_status, 'pending');
  assert.equal(mp.mercadoPagoCheckoutUrl('https://www.mercadopago.com.br/checkout'), 'https://www.mercadopago.com.br/checkout');
  assert.equal(mp.mercadoPagoCheckoutUrl('https://mercadopago.com.br.evil.com/'), null);
  assert.equal(mp.mercadoPagoCheckoutUrl('javascript:alert(1)'), null);
});
