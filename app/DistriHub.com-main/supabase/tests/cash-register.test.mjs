import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import ts from '../../node_modules/typescript/lib/typescript.js';

const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const sql = (text, args = []) => db.query(text, args);
let owner, other, branch, foreignBranch, employee, employeeAuth, manager, product, fiscalDefaultsBefore;
const login = id => sql("SELECT set_config('test.auth_uid',$1,false)", [id]);
async function mutate(action, amount, extra = {}) {
  const request = { branch, session: null, kind: null, reason: '', supervisor: null, pin: null, request: randomUUID(), ...extra };
  const { rows } = await sql('SELECT mutate_partner_cash_register($1,$2,NULL,NULL,$3,$4,$5,$6,$7,$8,$9) AS id',
    [action, request.branch, request.session, amount, request.kind, request.reason, request.supervisor, request.pin, request.request]);
  return rows[0].id;
}
async function sale(extra = {}) {
  const r = { id: randomUUID(), method: 'dinheiro', status: 'concluida', ...extra };
  await sql('SELECT execute_partner_sale_mutation(NULL,NULL,$1,NULL,$2,$3::jsonb,100,NULL,NULL,$4,$5,$6,$7,$8,$9,NULL)',
    [r.id,'Cliente',JSON.stringify([{product_id:product,name:'Produto',quantity:1,unit_price:100}]),r.method,branch,r.status,'pdv','varejo','balcao']);
  return r;
}
before(async () => {
  await db.exec(await read('./fixtures/pdv_schema.sql'));
  await db.exec(await read('./fixtures/pdv_production.sql'));
  await db.exec('GRANT SELECT ON public.partner_profiles TO authenticated');
  await db.exec('CREATE TABLE auth.users(id uuid PRIMARY KEY)');
  await db.exec('ALTER TABLE partner_profiles ADD COLUMN document text, ADD COLUMN whatsapp text, ADD COLUMN segment text, ADD COLUMN subscription_plan text NOT NULL DEFAULT \'basico\', ADD COLUMN subscription_status text NOT NULL DEFAULT \'trial\', ADD COLUMN next_billing_date date, ADD COLUMN payment_method text');
  await db.exec('ALTER TABLE partner_branches ADD COLUMN name text, ADD COLUMN address text, ADD COLUMN is_active boolean NOT NULL DEFAULT true, ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN updated_at timestamptz');
  await db.exec('CREATE TABLE public.b2b_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,total numeric,created_at timestamptz DEFAULT now())');
  await db.exec('CREATE VIEW public.admin_financial_months AS SELECT 1 AS financial_total');
  await db.exec('GRANT SELECT ON public.admin_financial_months TO anon, authenticated');
  await db.exec(await read('../migrations/20260928044542_fix_pdv_sales_reconciliation.sql'));
  await db.exec(await read('../migrations/20260928195329_enforce_pdv_authoritative_pricing.sql'));
  await db.exec(await read('../migrations/20260826110000_add_fiscal_documents_foundation.sql'));
  await db.exec(await read('../migrations/20260826150000_add_fiscal_rules_and_inutilizations.sql'));
  await db.exec("CREATE FUNCTION public.verify_super_admin(input_password text) RETURNS boolean LANGUAGE sql AS $$ SELECT input_password='admin-secret' $$");
  await db.exec("CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid() IS NOT NULL AND auth.uid()::text=current_setting('test.super_admin_uid',true) $$");
  await db.exec(await read('../migrations/20260826140000_add_super_admin_financial_overview.sql'));
  await db.exec("CREATE FUNCTION public.record_fiscal_document(p_document_id uuid DEFAULT NULL, p_document_type text DEFAULT 'nfe', p_status text DEFAULT 'pending', p_document_number text DEFAULT NULL, p_access_key text DEFAULT NULL, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$");
  fiscalDefaultsBefore = (await sql("SELECT pg_get_function_arguments('public.record_fiscal_document(uuid,text,text,text,text,jsonb)'::regprocedure) AS args")).rows[0].args;
  await db.exec('ALTER TABLE partner_salespeople ADD COLUMN name text');
  await db.exec(await read('../migrations/20261003182612_partner_cash_register.sql'));
  await db.exec(await read('../migrations/20261003190000_secure_financial_subscription_fiscal_and_branch_flows.sql'));
  await db.exec(await read('../migrations/20261003193000_add_post_close_cash_refunds.sql'));
  await db.exec(await read('../migrations/20261005211357_allow_owner_manager_sale_prices.sql'));
  await db.exec('ALTER TABLE partner_customers ADD COLUMN name text');
  await db.exec(await read('../migrations/20261007211956_change_open_order_customer.sql'));
  await db.exec(await read('../migrations/20261009184720_add_third_party_freight.sql'));
  // Subscription authorization is isolated from these cash tests; branch/PIN/role guards remain real.
  await db.exec(`CREATE SCHEMA partner_subscription_private;
    CREATE FUNCTION partner_subscription_private.require_operator_module(text,uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
    CREATE FUNCTION partner_subscription_private.require_actor(text) RETURNS void LANGUAGE sql AS $$ SELECT $$;`);
  await db.exec(JSON.parse(await read('./fixtures/split_payment_baseline.json')));
  await db.exec(await read('../migrations/20261009211459_add_split_sale_payments.sql'));
});
after(() => db.close());

async function splitSale(extra = {}) {
  const r = {id:randomUUID(),method:'misto',status:'concluida',fee:15,
    parts:[{method:'dinheiro',amount:50},{method:'pix',amount:65}],...extra};
  await sql('SELECT execute_partner_sale_mutation(NULL,NULL,$1,NULL,$2,$3::jsonb,100,NULL,NULL,$4,$5,$6,$7,$8,$9,NULL,$10,$11::jsonb)',
    [r.id,'Cliente',JSON.stringify([{product_id:product,name:'Produto',quantity:1,unit_price:100}]),r.method,branch,r.status,'pdv','varejo','entrega',r.fee,JSON.stringify(r.parts)]);
  return r;
}

test('split payment charges cash and PIX once, includes freight and cancels each part with stock restored once',async()=>{
  const session=await mutate('abrir',20);
  const r=await splitSale();
  await splitSale({...r,parts:[...r.parts].reverse()});
  assert.equal((await sql('SELECT stock FROM partner_products WHERE id=$1',[product])).rows[0].stock,9);
  const saved=(await sql('SELECT total,freight_fee,payment_splits FROM partner_sales WHERE id=$1',[r.id])).rows[0];
  assert.equal(Number(saved.total),100); assert.equal(Number(saved.freight_fee),15);
  assert.deepEqual(saved.payment_splits,r.parts);
  assert.deepEqual((await sql('SELECT partner_cash_private.totals($1) AS totals',[session])).rows[0].totals,{dinheiro:50,pix:65,cartao:0,faturado:0});
  await assert.rejects(splitSale({...r,parts:[{method:'dinheiro',amount:40},{method:'pix',amount:75}]}),/dados diferentes/);
  await splitSale({...r,status:'cancelada',parts:[]});
  assert.equal((await sql('SELECT stock FROM partner_products WHERE id=$1',[product])).rows[0].stock,10);
  assert.equal((await sql("SELECT count(*)::int AS n FROM partner_cash_movements WHERE sale_id=$1 AND kind='estorno'",[r.id])).rows[0].n,2);
  assert.deepEqual((await sql('SELECT partner_cash_private.totals($1) AS totals',[session])).rows[0].totals,{dinheiro:0,pix:0,cartao:0,faturado:0});
});

test('invalid split payments reject atomically, without stock, sale, invoice or cash writes',async()=>{
  await mutate('abrir',0);
  for(const parts of [[],[{method:'dinheiro',amount:115}],
    [{method:'dinheiro',amount:50},{method:'pix',amount:64.99}],
    [{method:'pix',amount:50},{method:'pix',amount:65}],
    [{method:'faturado',amount:50},{method:'dinheiro',amount:65}],
    [{method:'dinheiro',amount:-1},{method:'pix',amount:116}],
    [{method:'dinheiro',amount:50.001},{method:'pix',amount:64.999}],
    [{method:'dinheiro',amount:'50'},{method:'pix',amount:65}]]) await assert.rejects(splitSale({parts}));
  assert.equal((await sql('SELECT stock FROM partner_products WHERE id=$1',[product])).rows[0].stock,10);
  assert.equal((await sql('SELECT count(*)::int AS n FROM partner_sales')).rows[0].n,0);
  assert.equal((await sql('SELECT count(*)::int AS n FROM partner_cash_movements')).rows[0].n,0);
  assert.equal((await sql('SELECT count(*)::int AS n FROM partner_invoices')).rows[0].n,0);
});

test('pre-sale finalizes with split payments, closure counts only cash and closed retries preserve snapshots',async()=>{
  const r=await splitSale({status:'pre_venda',method:'pix',parts:[]});
  const session=await mutate('abrir',20);
  const paid={...r,status:'concluida',method:'misto',parts:[{method:'dinheiro',amount:50},{method:'pix',amount:45},{method:'cartao',amount:20}]};
  await splitSale(paid);
  await mutate('fechar',70,{session});
  await splitSale(paid);
  const closing=(await sql('SELECT expected_amount,closing_totals FROM partner_cash_sessions WHERE id=$1',[session])).rows[0];
  assert.equal(Number(closing.expected_amount),70);
  assert.deepEqual(closing.closing_totals,{dinheiro:50,pix:45,cartao:20,faturado:0});
  await assert.rejects(splitSale({...paid,status:'cancelada'}),/fechado/);
  assert.equal((await sql('SELECT stock FROM partner_products WHERE id=$1',[product])).rows[0].stock,9);
  assert.equal((await sql("SELECT count(*)::int AS n FROM partner_cash_movements WHERE kind='venda'")).rows[0].n,3);
});

test('split refund requires a method, caps each part separately and keeps closed cash immutable',async()=>{
  const original=await mutate('abrir',0);
  const sale=await splitSale();
  await mutate('fechar',50,{session:original});
  const current=await mutate('abrir',50);
  const refund=(method,amount,id=randomUUID())=>sql('SELECT record_partner_cash_refund($1,NULL,NULL,$2,$3,$4,$5,NULL,NULL,$6,$7)',[branch,current,sale.id,amount,'Devolução',id,method]);
  await assert.rejects(refund(null,10),/Selecione a forma/);
  await assert.rejects(refund('dinheiro',51),/excede o saldo/);
  await assert.rejects(refund('cartao',10),/eleg/);
  const request=randomUUID();
  await refund('dinheiro',30,request); await refund('dinheiro',30,request);
  await assert.rejects(refund('pix',30,request),/dados diferentes/);
  await assert.rejects(refund('dinheiro',21),/excede o saldo/);
  await refund('pix',65);
  await refund('dinheiro',20);
  await assert.rejects(refund('pix',0.01),/excede o saldo/);
  assert.deepEqual((await sql('SELECT partner_cash_private.totals($1) AS totals',[current])).rows[0].totals,{dinheiro:-50,pix:-65,cartao:0,faturado:0});
  assert.deepEqual((await sql('SELECT closing_totals FROM partner_cash_sessions WHERE id=$1',[original])).rows[0].closing_totals,{dinheiro:50,pix:65,cartao:0,faturado:0});
});

async function freightSale(extra = {}) {
  const r = { id: randomUUID(), fee: 15, method: 'dinheiro', status: 'concluida', customer: null, ...extra };
  await sql('SELECT execute_partner_sale_mutation(NULL,NULL,$1,$2,$3,$4::jsonb,100,NULL,NULL,$5,$6,$7,$8,$9,$10,NULL,$11)',
    [r.id,r.customer,'Cliente',JSON.stringify([{product_id:product,name:'Produto',quantity:1,unit_price:100}]),r.method,branch,r.status,'pdv','varejo','entrega',r.fee]);
  return r;
}

test('third-party freight enters cash once while merchandise revenue remains separate; cancellation reverses full charge', async () => {
  const session = await mutate('abrir', 0);
  const r = await freightSale();
  await freightSale(r);
  const saved = (await sql('SELECT total,freight_fee FROM partner_sales WHERE id=$1',[r.id])).rows[0];
  assert.equal(Number(saved.total),100);
  assert.equal(Number(saved.freight_fee),15);
  const movements = (await sql("SELECT amount FROM partner_cash_movements WHERE sale_id=$1 AND kind='venda'",[r.id])).rows;
  assert.equal(movements.length,1);
  assert.equal(Number(movements[0].amount),115);
  await assert.rejects(freightSale({...r,fee:16}), /dados diferentes/);
  await freightSale({...r,status:'cancelada'});
  assert.equal((await sql('SELECT partner_cash_private.totals($1) AS totals',[session])).rows[0].totals.dinheiro,0);
});

test('billed freight consumes customer credit and the invoice includes the full charge', async () => {
  await mutate('abrir',0);
  const customer=randomUUID();
  await sql("INSERT INTO partner_customers(id,user_id,branch_id,allow_credit,credit_limit) VALUES($1,$2,$3,true,110)",[customer,owner,branch]);
  await assert.rejects(freightSale({customer,method:'faturado'}), /Credito insuficiente/);
  assert.equal((await sql('SELECT count(*)::int AS n FROM partner_sales')).rows[0].n,0);
  await sql('UPDATE partner_customers SET credit_limit=115 WHERE id=$1',[customer]);
  const r=await freightSale({customer,method:'faturado'});
  assert.equal(Number((await sql('SELECT amount FROM partner_invoices WHERE sale_id=$1',[r.id])).rows[0].amount),115);
  assert.equal(Number((await sql('SELECT total FROM partner_sales WHERE id=$1',[r.id])).rows[0].total),100);
});

test('pre-sale preserves freight when finalized by a legacy caller; freight cannot change at checkout', async () => {
  const r=await freightSale({status:'pre_venda'});
  assert.equal((await sql('SELECT count(*)::int AS n FROM partner_cash_movements')).rows[0].n,0);
  await mutate('abrir',0);
  await assert.rejects(freightSale({...r,status:'concluida',fee:20}), /alterar o frete/);
  await freightSale({...r,status:'concluida',fee:null});
  assert.equal(Number((await sql('SELECT amount FROM partner_cash_movements WHERE sale_id=$1',[r.id])).rows[0].amount),115);
});

test('invalid freight is rejected atomically without stock or cash writes', async () => {
  await mutate('abrir',0);
  for (const fee of [-1, 0.001, 'NaN', 100000000]) await assert.rejects(freightSale({fee}), /Frete invalido/);
  assert.equal((await sql('SELECT stock FROM partner_products WHERE id=$1',[product])).rows[0].stock,10);
  assert.equal((await sql('SELECT count(*)::int AS n FROM partner_cash_movements')).rows[0].n,0);
});
beforeEach(async () => {
  await db.exec('RESET ROLE; TRUNCATE partner_plan_change_requests,fiscal_documents,fiscal_tax_rules,fiscal_inutilizations,partner_cash_movements,partner_cash_sessions,partner_audit_logs,stock_movements,partner_invoices,partner_sales,partner_products,partner_customers,partner_salespeople,partner_branches,partner_profiles CASCADE; TRUNCATE auth.users CASCADE');
  [owner,other,branch,foreignBranch,employee,employeeAuth,manager,product]=Array.from({length:8},()=>randomUUID());
  await sql('INSERT INTO auth.users(id) VALUES($1),($2)',[owner,other]);
  await sql("SELECT set_config('test.super_admin_uid',$1,false)",[owner]);
  await sql("INSERT INTO partner_profiles(id,account_name,business_name,document,whatsapp,subscription_plan) VALUES($1,'Owner','Test',NULL,NULL,'basico'),($2,'Other','Test',NULL,NULL,'basico')",[owner,other]);
  await sql('INSERT INTO partner_branches(id,user_id,name) VALUES($1,$3,\'Main\'),($2,$4,\'Foreign\')',[branch,foreignBranch,owner,other]);
  await sql("INSERT INTO partner_salespeople(id,user_id,auth_user_id,branch_id,role,active,pin_hash,name) VALUES($1,$4,$2,$5,'caixa',true,md5('1234'),'Caixa'),($3,$4,NULL,$5,'gerente',true,md5('9876'),'Gerente')",[employee,employeeAuth,manager,owner,branch]);
  await sql("INSERT INTO partner_products(id,user_id,branch_id,name,stock,is_service) VALUES($1,$2,$3,'Produto',10,false)",[product,owner,branch]);
  await login(owner);
});

async function negotiatedSale(price, extra = {}) {
  const r = { id: randomUUID(), status: 'pre_venda', method: null, operator: null, pin: null, total: price, ...extra };
  await sql('SELECT execute_partner_sale_mutation($1,$2,$3,NULL,$4,$5::jsonb,$6,NULL,NULL,$7,$8,$9,$10,$11,$12,NULL)',
    [r.operator,r.pin,r.id,'Cliente',JSON.stringify([{product_id:product,name:'Produto',quantity:1,unit_price:price}]),r.total,r.method,branch,r.status,'pdv','varejo','balcao']);
  return r;
}

test('changing an open order customer preserves negotiated prices and checkout uses the new customer', async () => {
  const customer = randomUUID();
  await sql("INSERT INTO partner_customers(id,user_id,name) VALUES($1,$2,'Novo cliente')",[customer,owner]);
  const pre = await negotiatedSale(75.5);
  await login(employeeAuth);
  assert.equal((await sql('SELECT execute_partner_open_order_customer_mutation(NULL,NULL,$1,$2) AS ok',[pre.id,customer])).rows[0].ok,true);
  const updated = (await sql('SELECT * FROM partner_sales WHERE id=$1',[pre.id])).rows[0];
  assert.equal(updated.customer_id,customer);
  assert.equal(updated.customer_name,'Novo cliente');
  assert.equal(Number(updated.total),75.5);
  assert.equal(updated.items[0].unit_price,75.5);
  assert.equal(updated.status,'pre_venda');
  assert.equal((await sql('SELECT customer_id FROM partner_pdv_price_snapshots WHERE sale_id=$1',[pre.id])).rows[0].customer_id,customer);
  await login(owner);
  await mutate('abrir',0);
  await sql('SELECT execute_partner_sale_mutation(NULL,NULL,$1,$2,$3,$4::jsonb,$5,NULL,NULL,$6,$7,$8,$9,$10,$11,NULL)',
    [pre.id,customer,'Novo cliente',JSON.stringify(updated.items),75.5,'pix',branch,'concluida','pdv','varejo','balcao']);
  await assert.rejects(sql('SELECT execute_partner_open_order_customer_mutation(NULL,NULL,$1,$2)',[pre.id,customer]),/Somente pedidos abertos/);
});

test('customer change rejects foreign customers, branch access, payments and anonymous callers', async () => {
  const pre = await sale({status:'pre_venda',method:null});
  const customer=randomUUID();
  await sql("INSERT INTO partner_customers(id,user_id,branch_id,name) VALUES($1,$2,$3,'Cliente externo')",[customer,other,foreignBranch]);
  await assert.rejects(sql('SELECT execute_partner_open_order_customer_mutation(NULL,NULL,$1,$2)',[pre.id,customer]),/Cliente inválido/);
  await sql('UPDATE partner_customers SET user_id=$1,branch_id=NULL WHERE id=$2',[owner,customer]);
  await sql("UPDATE partner_salespeople SET branch_id=$1 WHERE id=$2",[foreignBranch,employee]);
  await login(employeeAuth);
  await assert.rejects(sql('SELECT execute_partner_open_order_customer_mutation(NULL,NULL,$1,$2)',[pre.id,customer]),/outra filial/);
  await login(owner);
  await sql("UPDATE partner_sales SET online_payment=true WHERE id=$1",[pre.id]);
  await assert.rejects(sql('SELECT execute_partner_open_order_customer_mutation(NULL,NULL,$1,$2)',[pre.id,customer]),/pagamento/);
  await login(null);
  await assert.rejects(sql('SELECT execute_partner_open_order_customer_mutation(NULL,NULL,$1,$2)',[pre.id,customer]),/Não autenticado/);
  await db.exec('SET ROLE anon');
  await assert.rejects(sql('SELECT execute_partner_open_order_customer_mutation(NULL,NULL,$1,$2)',[pre.id,customer]),/permission denied/);
});

test('online open orders can change customer without changing totals or creating stock and cash movements', async () => {
  const id=randomUUID(), customer=randomUUID();
  await sql("INSERT INTO partner_customers(id,user_id,name) VALUES($1,$2,'Cliente online')",[customer,owner]);
  await sql("INSERT INTO partner_sales(id,user_id,branch_id,status,payment_status,origin,online_payment,total,items) VALUES($1,$2,$3,'aberta','pendente','catalogo',false,150,'[]')",[id,owner,branch]);
  await sql('SELECT execute_partner_open_order_customer_mutation(NULL,NULL,$1,$2)',[id,customer]);
  const order=(await sql('SELECT status,total,customer_id FROM partner_sales WHERE id=$1',[id])).rows[0];
  assert.equal(order.status,'aberta');
  assert.equal(Number(order.total),150);
  assert.equal(order.customer_id,customer);
  assert.equal((await sql('SELECT count(*)::int AS n FROM stock_movements')).rows[0].n,0);
  assert.equal((await sql('SELECT count(*)::int AS n FROM partner_cash_movements')).rows[0].n,0);
});

test('pre-sale saves a planned payment without requiring open cash, charging or issuing an invoice', async () => {
  const pre=await sale({status:'pre_venda',method:'faturado'});
  const saved=(await sql('SELECT status,payment_method,payment_status FROM partner_sales WHERE id=$1',[pre.id])).rows[0];
  assert.deepEqual(saved,{status:'pre_venda',payment_method:'faturado',payment_status:'pendente'});
  assert.equal((await sql('SELECT count(*)::int AS n FROM partner_invoices')).rows[0].n,0);
  assert.equal((await sql('SELECT count(*)::int AS n FROM partner_cash_movements')).rows[0].n,0);
  assert.equal((await sql('SELECT stock FROM partner_products WHERE id=$1',[product])).rows[0].stock,10);
});

test('negotiated prices: owner and authenticated manager save prices without editing the catalog', async () => {
  await negotiatedSale(75.5);
  await negotiatedSale(120,{operator:manager,pin:'9876'});
  assert.equal(Number((await sql('SELECT sale_price FROM partner_products WHERE id=$1',[product])).rows[0].sale_price),100);
  assert.deepEqual((await sql('SELECT total FROM partner_sales ORDER BY total')).rows.map(row=>Number(row.total)),[75.5,120]);
  assert.equal((await sql('SELECT count(*)::int AS n FROM partner_pdv_price_snapshots')).rows[0].n,2);
  assert.equal((await sql('SELECT stock FROM partner_products WHERE id=$1',[product])).rows[0].stock,10);
});

test('negotiated prices: cashier, seller and employee administrator cannot override prices', async () => {
  await login(employeeAuth);
  for (const role of ['caixa','vendedor','administrador']) {
    await sql('UPDATE partner_salespeople SET role=$1 WHERE id=$2',[role,employee]);
    await assert.rejects(negotiatedSale(70),/Somente o gerente ou o dono/);
  }
  await sql("UPDATE partner_salespeople SET role='gerente' WHERE id=$1",[employee]);
  await negotiatedSale(70);
  await sql("UPDATE partner_salespeople SET active=false WHERE id=$1",[employee]);
  await assert.rejects(negotiatedSale(70));
});

test('negotiated prices: selected seller and invalid supervisor PIN do not inherit owner permission', async () => {
  await assert.rejects(negotiatedSale(70,{operator:employee,pin:'1234'}),/Somente o gerente ou o dono/);
  await assert.rejects(negotiatedSale(70,{operator:manager,pin:'wrong'}));
  assert.equal((await sql('SELECT count(*)::int AS n FROM partner_sales')).rows[0].n,0);
});

test('negotiated prices: cashier finalizes the saved manager quote and cash uses its actual amount', async () => {
  const pre=await negotiatedSale(75.5,{operator:manager,pin:'9876'});
  await login(employeeAuth);
  const session=await mutate('abrir',0);
  await assert.rejects(negotiatedSale(74,{id:pre.id,status:'concluida',method:'dinheiro'}),/Finalizacao nao pode alterar/);
  await negotiatedSale(75.5,{id:pre.id,status:'concluida',method:'dinheiro'});
  await negotiatedSale(75.5,{id:pre.id,status:'concluida',method:'dinheiro'});
  assert.equal((await sql('SELECT stock FROM partner_products WHERE id=$1',[product])).rows[0].stock,9);
  const movements=(await sql("SELECT amount FROM partner_cash_movements WHERE session_id=$1 AND kind='venda'",[session])).rows;
  assert.equal(movements.length,1);assert.equal(Number(movements[0].amount),75.5);
});

test('negotiated prices: invalid amounts, totals, direct helper and direct quote writes remain blocked', async () => {
  for (const price of [-1,1.001,100000000]) await assert.rejects(negotiatedSale(price));
  await assert.rejects(negotiatedSale(75,{total:74}),/Total diverge/);
  await db.exec('SET ROLE authenticated');
  await assert.rejects(sql('SELECT partner_cash_private.validate_partner_pdv_negotiated_prices($1,$2,NULL,$3,$4::jsonb,75,true)',[owner,branch,'varejo',JSON.stringify([{product_id:product,name:'Produto',quantity:1,unit_price:75}])]),/permission denied/);
  await assert.rejects(sql('UPDATE partner_pdv_price_snapshots SET total=75'),/permission denied/);
});

test('requires open cash for checkout; pre-sale is excluded; rolls stock back on refusal', async () => {
  await assert.rejects(sale(), /Abra o caixa/);
  assert.equal((await sql('SELECT stock FROM partner_products')).rows[0].stock,10);
  const draft=await sale({status:'pre_venda',method:null});
  assert.equal((await sql('SELECT count(*)::int AS n FROM partner_cash_movements')).rows[0].n,0);
  const session=await mutate('abrir',100);
  await sale({...draft,status:'concluida',method:'dinheiro'});
  const rows=(await sql('SELECT * FROM partner_cash_movements')).rows;
  assert.equal(rows.length,1); assert.equal(rows[0].session_id,session);
});

test('opening retry is idempotent, rejects second open and mismatching payload', async () => {
  const request=randomUUID(); const id=await mutate('abrir',100,{request});
  assert.equal(await mutate('abrir',100,{request}),id);
  await assert.rejects(mutate('abrir',100),/já possui/);
  await assert.rejects(mutate('abrir',101,{request}),/dados diferentes/);
});

test('separate cash by operator, even when commercial salesperson is the same', async () => {
  const ownerCash=await mutate('abrir',100);
  await login(employeeAuth);
  await assert.rejects(sale(),/Abra o caixa/);
  const employeeCash=await mutate('abrir',20);
  await sale();
  assert.equal((await sql('SELECT session_id FROM partner_cash_movements')).rows[0].session_id,employeeCash);
  assert.notEqual(ownerCash,employeeCash);
});

test('cash expected amount includes opening, cash sales, supplies and withdrawals only', async () => {
  const session=await mutate('abrir',100);
  await sale(); await sale({method:'pix'}); await sale({method:'cartao'});
  await mutate('movimentar',50,{session,kind:'suprimento',reason:'Troco'});
  await mutate('movimentar',20,{session,kind:'sangria',reason:'Retirada'});
  await mutate('fechar',230,{session});
  const s=(await sql('SELECT * FROM partner_cash_sessions')).rows[0];
  assert.equal(Number(s.expected_amount),230); assert.equal(Number(s.difference),0);
  assert.deepEqual(s.closing_totals,{dinheiro:130,pix:100,cartao:100,faturado:0});
  await assert.rejects(sale(),/Abra o caixa/);
});

test('post-close partial refunds are linked, authorized, bounded and recorded in a new session', async () => {
  const closedSession = await mutate('abrir', 0);
  const originalSale = await sale();
  await mutate('fechar', 100, { session: closedSession });
  const closing = (await sql('SELECT closing_totals FROM partner_cash_sessions WHERE id=$1', [closedSession])).rows[0];
  assert.deepEqual(closing.closing_totals, { dinheiro: 100, pix: 0, cartao: 0, faturado: 0 });

  await login(employeeAuth);
  const refundSession = await mutate('abrir', 100);
  const firstRequest = randomUUID();
  const refund = (request, amount, supervisor = null, pin = null) => sql(
    'SELECT record_partner_cash_refund($1,NULL,NULL,$2,$3,$4,$5,$6,$7,$8) AS id',
    [branch, refundSession, originalSale.id, amount, 'Devolução parcial', supervisor, pin, request],
  );
  await assert.rejects(refund(firstRequest, 25), /Responsável inválido/);
  await assert.rejects(refund(firstRequest, 25, manager, 'bad-pin'), /PIN incorreto/);
  await refund(firstRequest, 25, manager, '9876');
  await refund(firstRequest, 25, manager, '9876');
  const fullRefundRequest = randomUUID();
  await refund(fullRefundRequest, 75, manager, '9876');
  await assert.rejects(refund(randomUUID(), 1, manager, '9876'), /excede o saldo disponível/);
  await assert.rejects(
    sql("UPDATE public.partner_sales SET status='cancelada' WHERE id=$1", [originalSale.id]),
    /Venda com devolução financeira não pode ser cancelada/,
  );
  assert.equal((await sql('SELECT status FROM public.partner_sales WHERE id=$1', [originalSale.id])).rows[0].status, 'concluida');
  await mutate('fechar', 0, { session: refundSession });
  await refund(fullRefundRequest, 75, manager, '9876');
  await assert.rejects(refund(fullRefundRequest, 74, manager, '9876'), /Operação repetida com dados diferentes/);

  const movements = (await sql(
    "SELECT kind,amount,session_id,sale_id FROM partner_cash_movements WHERE kind='devolucao' ORDER BY amount",
  )).rows;
  assert.equal(movements.length, 2);
  assert.deepEqual(movements.map(row => Number(row.amount)), [25, 75]);
  assert.ok(movements.every(row => row.session_id === refundSession && row.sale_id === originalSale.id));
  assert.deepEqual((await sql('SELECT partner_cash_private.totals($1) AS totals', [refundSession])).rows[0].totals,
    { dinheiro: -100, pix: 0, cartao: 0, faturado: 0 });
  assert.deepEqual((await sql('SELECT closing_totals FROM partner_cash_sessions WHERE id=$1', [closedSession])).rows[0].closing_totals, closing.closing_totals);
});

test('cash refunds cannot precede closing the original sale session', async () => {
  const originalSession = await mutate('abrir', 0);
  const originalSale = await sale();
  await login(employeeAuth);
  const refundSession = await mutate('abrir', 0);
  await assert.rejects(
    sql(
      'SELECT record_partner_cash_refund($1,NULL,NULL,$2,$3,10,$4,$5,$6,$7)',
      [branch, refundSession, originalSale.id, 'Teste antes do fechamento', manager, '9876', randomUUID()],
    ),
    /somente após o fechamento da sessão original/,
  );
  await login(owner);
  await mutate('fechar', 100, { session: originalSession });
});

test('administrative financial view is not readable by anonymous or authenticated clients', async () => {
  await db.exec('SET ROLE anon');
  await assert.rejects(sql('SELECT * FROM public.admin_financial_months'), /permission denied/);
  await db.exec('RESET ROLE; SET ROLE authenticated');
  await assert.rejects(sql('SELECT * FROM public.admin_financial_months'), /permission denied/);
  await db.exec('RESET ROLE');
  assert.equal((await sql("SELECT has_function_privilege('anon','public.get_super_admin_financial_overview(text)','EXECUTE') AS allowed")).rows[0].allowed, true);
  assert.equal((await sql("SELECT count(*)::int AS n FROM public.get_super_admin_financial_overview('wrong-password')")).rows[0].n, 0);
});

test('subscription values cannot be chosen at signup or changed by an owner', async () => {
  await db.exec('SET ROLE authenticated');
  for (const column of ['subscription_plan', 'subscription_status', 'next_billing_date', 'payment_method']) {
    assert.equal(
      (await sql("SELECT has_column_privilege('authenticated','public.partner_profiles',$1,'UPDATE') AS allowed", [column])).rows[0].allowed,
      false,
    );
    assert.equal(
      (await sql("SELECT has_column_privilege('authenticated','public.partner_profiles',$1,'INSERT') AS allowed", [column])).rows[0].allowed,
      false,
    );
  }
  await assert.rejects(
    sql("UPDATE public.partner_profiles SET subscription_plan='enterprise',subscription_status='ativa' WHERE id=$1", [owner]),
    /permission denied/,
  );
  const newUser = randomUUID();
  await db.exec('RESET ROLE');
  await sql('INSERT INTO auth.users(id) VALUES($1)', [newUser]);
  await login(newUser);
  await db.exec('SET ROLE authenticated');
  await assert.rejects(
    sql("INSERT INTO public.partner_profiles(id,business_name,subscription_plan,subscription_status,next_billing_date) VALUES($1,'New','enterprise','ativa',CURRENT_DATE)", [newUser]),
    /permission denied/,
  );
  await sql("INSERT INTO public.partner_profiles(id,business_name,whatsapp,segment) VALUES($1,'New','555','assistencia')", [newUser]);
  const created = (await sql('SELECT subscription_plan,subscription_status,next_billing_date,payment_method FROM public.partner_profiles WHERE id=$1', [newUser])).rows[0];
  assert.deepEqual(created, { subscription_plan: 'basico', subscription_status: 'trial', next_billing_date: null, payment_method: null });
  await assert.rejects(sql('DELETE FROM public.partner_profiles WHERE id=$1', [newUser]), /permission denied/);
  await db.exec('RESET ROLE');
  await login(owner);
  await db.exec('SET ROLE authenticated');
  const { rows } = await sql("SELECT public.request_partner_plan_change('profissional') AS request_id");
  const requestId = rows[0].request_id;
  assert.equal((await sql("SELECT public.request_partner_plan_change('profissional') AS request_id")).rows[0].request_id, requestId);
  await assert.rejects(
    sql("SELECT public.request_partner_plan_change('enterprise')"),
    /Já existe uma solicitação de mudança de plano pendente/,
  );
  const profile = (await sql('SELECT subscription_plan FROM public.partner_profiles WHERE id=$1', [owner])).rows[0];
  const request = (await sql('SELECT requested_plan,status FROM public.partner_plan_change_requests WHERE id=$1', [requestId])).rows[0];
  assert.equal(profile.subscription_plan, 'basico');
  assert.deepEqual(request, { requested_plan: 'profissional', status: 'pending' });
  assert.deepEqual(
    (await sql('SELECT company_name,current_plan,requested_plan,status FROM public.get_partner_plan_change_requests()')).rows,
    [{ company_name: 'Test', current_plan: 'basico', requested_plan: 'profissional', status: 'pending' }],
  );
  await db.exec('RESET ROLE');
  await login(other);
  await db.exec('SET ROLE authenticated');
  await assert.rejects(
    sql('SELECT public.get_partner_plan_change_requests()'),
    /Operador não autorizado/,
  );
  await assert.rejects(
    sql('SELECT public.resolve_partner_plan_change($1,true)', [requestId]),
    /Operador não autorizado/,
  );
  await db.exec('RESET ROLE');
  await login(owner);
  await db.exec('SET ROLE authenticated');
  await sql('SELECT public.resolve_partner_plan_change($1,true)', [requestId]);
  const approved = (await sql('SELECT subscription_plan,subscription_status,next_billing_date FROM public.partner_profiles WHERE id=$1', [owner])).rows[0];
  assert.equal(approved.subscription_plan, 'profissional');
  assert.equal(approved.subscription_status, 'trial');
  assert.equal(approved.next_billing_date, null);
  assert.equal((await sql('SELECT status FROM public.partner_plan_change_requests WHERE id=$1', [requestId])).rows[0].status, 'approved');
  await assert.rejects(
    sql('SELECT public.resolve_partner_plan_change($1,true)', [requestId]),
    /Solicitação pendente não encontrada/,
  );
  const rejectionId = (await sql("SELECT public.request_partner_plan_change('basico') AS request_id")).rows[0].request_id;
  await sql('SELECT public.resolve_partner_plan_change($1,false)', [rejectionId]);
  assert.equal((await sql('SELECT subscription_plan FROM public.partner_profiles WHERE id=$1', [owner])).rows[0].subscription_plan, 'profissional');
  assert.equal((await sql('SELECT status FROM public.partner_plan_change_requests WHERE id=$1', [rejectionId])).rows[0].status, 'rejected');
});

test('Fiscal RPC replacement preserves the deployed signature default arguments', async () => {
  const after = (await sql("SELECT pg_get_function_arguments('public.record_fiscal_document(uuid,text,text,text,text,jsonb)'::regprocedure) AS args")).rows[0].args;
  assert.equal(after, fiscalDefaultsBefore);
  await assert.rejects(
    sql('SELECT public.record_fiscal_document()'),
    /Selecione uma filial/,
  );
});

test('branch creation enforces one, three and unlimited plan quotas server-side', async () => {
  await assert.rejects(
    sql("SELECT public.create_partner_branch('Second branch',NULL)"),
    /permite até 1 filial/,
  );
  await sql("UPDATE public.partner_profiles SET subscription_plan='profissional' WHERE id=$1", [owner]);
  await sql("SELECT public.create_partner_branch('Second branch',NULL)");
  await sql("SELECT public.create_partner_branch('Third branch',NULL)");
  await assert.rejects(
    sql("SELECT public.create_partner_branch('Fourth branch',NULL)"),
    /permite até 3 filial/,
  );
  await sql("UPDATE public.partner_profiles SET subscription_plan='enterprise' WHERE id=$1", [owner]);
  await sql("SELECT public.create_partner_branch('Fourth branch',NULL)");
  await sql("SELECT public.create_partner_branch('Fifth branch',NULL)");
  assert.equal((await sql('SELECT count(*)::int AS total FROM public.partner_branches WHERE user_id=$1', [owner])).rows[0].total, 5);
});

test('fiscal RPCs persist branch-scoped pending requests and reject cross-branch writes', async () => {
  await mutate('abrir', 0);
  const completedSale = await sale();
  const payload = {
    branch_id: branch,
    sale_id: completedSale.id,
    series: '001',
    items: [],
    totals: { total: 100 },
  };
  const documentId = (await sql(
    "SELECT public.record_fiscal_document(NULL,'nfe','pending','123',NULL,$1::jsonb) AS id",
    [JSON.stringify(payload)],
  )).rows[0].id;
  const document = (await sql('SELECT user_id,branch_id,status,number FROM public.fiscal_documents WHERE id=$1', [documentId])).rows[0];
  assert.deepEqual(document, { user_id: owner, branch_id: branch, status: 'pending', number: '123' });
  await assert.rejects(
    sql("SELECT public.record_fiscal_document(NULL,'nfe','pending',NULL,NULL,$1::jsonb)", [
      JSON.stringify({ ...payload, branch_id: foreignBranch }),
    ]),
    /Filial inválida/,
  );

  const inutilizationId = (await sql(
    "SELECT public.create_fiscal_inutilization($1::jsonb) AS id",
    [JSON.stringify({
      branch_id: branch, document_type: 'nfce', series: '001',
      number_start: 10, number_end: 11,
      justification: 'Falha de sequência no sistema',
    })],
  )).rows[0].id;
  assert.equal((await sql('SELECT branch_id,status FROM public.fiscal_inutilizations WHERE id=$1', [inutilizationId])).rows[0].branch_id, branch);

  const ruleId = (await sql(
    "SELECT public.save_fiscal_branch_settings($1::jsonb) AS id",
    [JSON.stringify({
      branch_id: branch, name: 'Regra padrão', cfop: '5102', cst_csosn: '102',
      ncm: '12345678', icms_rate: 0, pis_rate: 0, cofins_rate: 0, active: true,
    })],
  )).rows[0].id;
  assert.equal((await sql('SELECT branch_id FROM public.fiscal_tax_rules WHERE id=$1', [ruleId])).rows[0].branch_id, branch);
});

test('cashier cannot withdraw or close a difference without manager PIN and justification', async () => {
  await login(employeeAuth); const session=await mutate('abrir',100);
  await assert.rejects(mutate('movimentar',10,{session,kind:'sangria',reason:'Retirada'}),/autorização/);
  await assert.rejects(mutate('movimentar',10,{session,kind:'sangria',reason:'Retirada',supervisor:manager,pin:'bad'}),/PIN incorreto/);
  await mutate('movimentar',10,{session,kind:'sangria',reason:'Retirada',supervisor:manager,pin:'9876'});
  await assert.rejects(mutate('fechar',80,{session,reason:'Falta'}),/autorização/);
  await assert.rejects(mutate('fechar',80,{session,supervisor:manager,pin:'9876'}),/Justifique/);
  await mutate('fechar',80,{session,reason:'Falta na conferência',supervisor:manager,pin:'9876'});
  assert.equal(Number((await sql('SELECT difference FROM partner_cash_sessions')).rows[0].difference),-10);
});

test('movement and close retries do not duplicate data or modify closed snapshots', async () => {
  const session=await mutate('abrir',100); const request=randomUUID();
  await mutate('movimentar',10,{session,kind:'suprimento',reason:'Troco',request});
  await mutate('movimentar',10,{session,kind:'suprimento',reason:'Troco',request});
  assert.equal((await sql('SELECT count(*)::int AS n FROM partner_cash_movements')).rows[0].n,1);
  const close=randomUUID(); await mutate('fechar',110,{session,request:close});
  await mutate('movimentar',10,{session,kind:'suprimento',reason:'Troco',request});
  await mutate('fechar',110,{session,request:close});
  await assert.rejects(mutate('fechar',111,{session,request:close}),/fechado/);
  await assert.rejects(mutate('movimentar',10,{session,kind:'suprimento',reason:'Troco'}),/fechado/);
});

test('retry checkout after closing is allowed, without a second cash or stock entry', async () => {
  const session=await mutate('abrir',0); const request=await sale();
  await mutate('fechar',100,{session}); await sale(request);
  assert.equal((await sql('SELECT count(*)::int AS n FROM partner_cash_movements')).rows[0].n,1);
  assert.equal((await sql('SELECT stock FROM partner_products')).rows[0].stock,9);
});

test('cancellation reverses cash and stock exactly once while cash is open', async () => {
  const session=await mutate('abrir',0); const request=await sale();
  await sale({...request,status:'cancelada'});
  await mutate('fechar',0,{session});
  assert.equal((await sql('SELECT count(*)::int AS n FROM partner_cash_movements')).rows[0].n,2);
  assert.equal((await sql('SELECT stock FROM partner_products')).rows[0].stock,10);
});

test('closed cash blocks cancellation/deletion, preserving financial and stock history', async () => {
  const session=await mutate('abrir',0); const request=await sale(); await mutate('fechar',100,{session});
  await assert.rejects(sale({...request,status:'cancelada'}),/caixa fechado/);
  await assert.rejects(sql('SELECT execute_partner_sale_delete(NULL,NULL,$1)',[request.id]),/nao podem ser excluidas|caixa fechado/);
  assert.equal((await sql('SELECT status FROM partner_sales')).rows[0].status,'concluida');
  assert.equal((await sql('SELECT stock FROM partner_products')).rows[0].stock,9);
});

test('tenant, branch, actor and anonymous access are denied on read and mutation', async () => {
  const session=await mutate('abrir',100);
  await assert.rejects(mutate('abrir',0,{branch:foreignBranch}),/Filial inválida/);
  await login(employeeAuth);
  await assert.rejects(mutate('fechar',100,{session}),/não pertence/);
  const snapshot=(await sql('SELECT read_partner_cash_register($1) AS data',[branch])).rows[0].data;
  assert.equal(snapshot.sessions.length,0);
  await assert.rejects(sql('SELECT read_partner_cash_register($1)',[foreignBranch]),/filial/);
  await login(null); await assert.rejects(mutate('abrir',0),/autenticado/);
  await login(owner); await db.exec('SET ROLE authenticated');
  await assert.rejects(sql('SELECT * FROM partner_cash_sessions'),/permission denied/);
  await assert.rejects(sql('SELECT * FROM partner_cash_movements'),/permission denied/);
  await assert.rejects(sql('SELECT partner_cash_private.totals($1)',[session]),/permission denied/);
  await db.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(sql('SELECT read_partner_cash_register($1)',[branch]),/permission denied/);
});

test('invalid precision, negative amounts and withdrawals exceeding available cash are rejected', async () => {
  await assert.rejects(mutate('abrir',-1),/Valor inválido/);
  await assert.rejects(mutate('abrir',1.001),/Valor inválido/);
  const session=await mutate('abrir',10);
  await assert.rejects(mutate('movimentar',11,{session,kind:'sangria',reason:'Retirada'}),/disponível/);
});

test('manager reads branch history across operators while cashier sees only own cash', async () => {
  await mutate('abrir',100);
  await login(employeeAuth); const session=await mutate('abrir',20);
  await login(owner);
  const data=(await sql('SELECT read_partner_cash_register($1) AS data',[branch])).rows[0].data;
  assert.equal(data.sessions.length,2); assert.equal(data.actor_key,owner);
  assert.ok(data.sessions.some(s=>s.id===session));
});

test('cash movements use exact cents and pending requests survive remount without credentials', async () => {
  const code=ts.transpileModule(await read('../../src/lib/cashRegister.ts'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
  const { CashRequestStore, cashAmount, cashTotals }=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const data=new Map(); const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const store=new CashRequestStore(storage,'owner:branch');
  const request={id:randomUUID(),action:'movimentar',sessionId:randomUUID(),amount:0.1,kind:'sangria',reason:'Troco'};
  store.save(request);
  assert.deepEqual(new CashRequestStore(storage,'owner:branch').read(),request);
  assert.equal(new CashRequestStore(storage,'other:branch').read(),null);
  assert.ok(![...data.values()].join('').includes('pin'));
  assert.equal(cashAmount('10,25'),10.25); assert.throws(()=>cashAmount('10.001'));
  assert.equal(cashTotals([{kind:'venda',payment_method:'dinheiro',amount:0.1},{kind:'venda',payment_method:'dinheiro',amount:0.2},{kind:'sangria',payment_method:'dinheiro',amount:0.1}]).dinheiro,0.2);
  store.clear(); assert.equal(store.read(),null);
});
