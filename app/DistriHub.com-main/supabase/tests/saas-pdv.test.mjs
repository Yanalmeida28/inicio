import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const sql = (query, args = []) => db.query(query, args);
let owner, branch, product, saleId;
async function sale(status = 'concluida') {
  return sql('select execute_partner_sale_mutation(NULL,NULL,$1,NULL,$2,$3::jsonb,100,NULL,NULL,$4,$5,$6,$7,$8,$9,NULL)',
    [saleId, 'Cliente', JSON.stringify([{ product_id: product, name: 'Produto', quantity: 1, unit_price: 100 }]), 'pix', branch, status, 'pdv', 'varejo', 'balcao']);
}
before(async () => {
  await db.exec(await read('./fixtures/pdv_schema.sql'));
  await db.exec(await read('./fixtures/pdv_production.sql'));
  await db.exec(await read('../migrations/20260928044542_fix_pdv_sales_reconciliation.sql'));
  await db.exec(await read('../migrations/20260928195329_enforce_pdv_authoritative_pricing.sql'));
  await db.exec(`
    ALTER TABLE partner_profiles ADD COLUMN subscription_plan text DEFAULT 'basico', ADD COLUMN subscription_status text DEFAULT 'trial', ADD COLUMN next_billing_date date;
    ALTER TABLE partner_branches ADD COLUMN name text, ADD COLUMN address text;
    CREATE FUNCTION is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE TABLE partner_plan_change_requests(id uuid PRIMARY KEY,user_id uuid,requested_plan text,status text,resolved_at timestamptz);
  `);
  await db.exec(await read('../migrations/20261008025310_add_managed_saas_subscriptions.sql'));
  await db.exec(await read('../migrations/20261008025316_enforce_saas_access_and_billing_jobs.sql'));
});
after(() => db.close());
beforeEach(async () => {
  await sql("select set_config('test.auth_uid','',false)");
  await db.exec('TRUNCATE partner_profiles,partner_branches,partner_products,partner_sales,partner_audit_logs,stock_movements,partner_invoices CASCADE');
  [owner, branch, product, saleId] = Array.from({ length: 4 }, randomUUID);
  await sql("insert into partner_profiles(id,account_name,business_name) values($1,'Owner','Empresa')", [owner]);
  await sql("insert into partner_branches(id,user_id,name) values($1,$2,'Filial')", [branch, owner]);
  await sql("insert into partner_products(id,user_id,branch_id,name,stock,is_service) values($1,$2,$3,'Produto',10,false)", [product, owner, branch]);
  await sql("select set_config('test.auth_uid',$1,false)", [owner]);
});
test('PDV básico continua vendendo e baixando estoque uma vez com os novos controles SaaS', async () => {
  await sale(); await sale();
  assert.equal((await sql('select stock from partner_products where id=$1', [product])).rows[0].stock, 9);
  assert.equal((await sql('select count(*)::int count from partner_sales')).rows[0].count, 1);
  assert.equal((await sql('select count(*)::int count from stock_movements')).rows[0].count, 1);
});
test('expiração bloqueia a venda inteira sem criar baixa de estoque ou venda parcial', async () => {
  await sql("update saas_subscriptions set trial_ends_at=now()-interval '1 day' where company_id=$1", [owner]);
  await assert.rejects(sale(), /indisponível/);
  assert.equal((await sql('select stock from partner_products where id=$1', [product])).rows[0].stock, 10);
  assert.equal((await sql('select count(*)::int count from partner_sales')).rows[0].count, 0);
  assert.equal((await sql('select count(*)::int count from stock_movements')).rows[0].count, 0);
});
test('pré-venda salva continua finalizando normalmente após renovação de acesso', async () => {
  await sale('pre_venda');
  await sql("update saas_subscriptions set trial_ends_at=now()-interval '1 day' where company_id=$1", [owner]);
  await assert.rejects(sale(), /indisponível/);
  await sql("update saas_subscriptions set paid_until=now()+interval '1 month' where company_id=$1", [owner]);
  await sale();
  assert.equal((await sql('select status from partner_sales where id=$1', [saleId])).rows[0].status, 'concluida');
  assert.equal((await sql('select stock from partner_products where id=$1', [product])).rows[0].stock, 9);
});
