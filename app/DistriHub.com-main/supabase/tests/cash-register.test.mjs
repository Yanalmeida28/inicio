import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import ts from '../../node_modules/typescript/lib/typescript.js';

const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const sql = (text, args = []) => db.query(text, args);
let owner, other, branch, foreignBranch, employee, employeeAuth, manager, product;
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
  await db.exec(await read('../migrations/20260928044542_fix_pdv_sales_reconciliation.sql'));
  await db.exec(await read('../migrations/20260928195329_enforce_pdv_authoritative_pricing.sql'));
  await db.exec('ALTER TABLE partner_salespeople ADD COLUMN name text');
  await db.exec(await read('../migrations/20261003182612_partner_cash_register.sql'));
});
after(() => db.close());
beforeEach(async () => {
  await db.exec('RESET ROLE; TRUNCATE partner_cash_movements,partner_cash_sessions,partner_audit_logs,stock_movements,partner_invoices,partner_sales,partner_products,partner_customers,partner_salespeople,partner_branches,partner_profiles CASCADE');
  [owner,other,branch,foreignBranch,employee,employeeAuth,manager,product]=Array.from({length:8},()=>randomUUID());
  await sql("INSERT INTO partner_profiles VALUES($1,'Owner','Test'),($2,'Other','Test')",[owner,other]);
  await sql('INSERT INTO partner_branches VALUES($1,$3),($2,$4)',[branch,foreignBranch,owner,other]);
  await sql("INSERT INTO partner_salespeople(id,user_id,auth_user_id,branch_id,role,active,pin_hash,name) VALUES($1,$4,$2,$5,'caixa',true,md5('1234'),'Caixa'),($3,$4,NULL,$5,'gerente',true,md5('9876'),'Gerente')",[employee,employeeAuth,manager,owner,branch]);
  await sql("INSERT INTO partner_products(id,user_id,branch_id,name,stock,is_service) VALUES($1,$2,$3,'Produto',10,false)",[product,owner,branch]);
  await login(owner);
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
