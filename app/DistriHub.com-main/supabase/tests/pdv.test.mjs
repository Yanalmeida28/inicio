import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import ts from '../../node_modules/typescript/lib/typescript.js';

const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const sql = (text, args = []) => db.query(text, args);
let owner, otherOwner, branch, otherBranch, foreignBranch, customer, product, service, employee, employeeAuth, manager, managerAuth;
const login = id => sql("SELECT set_config('test.auth_uid',$1,false)", [id]);
async function sale(overrides={}) {
  const request={id:randomUUID(), customer, branch, total:100, method:'pix', status:'concluida',
    items:[{product_id:product,name:'Produto',quantity:1,unit_price:100}],operator:null,pin:null,commercial:null,...overrides};
  const args=[request.operator,request.pin,request.id,request.customer,'Cliente',JSON.stringify(request.items),request.total,null,null,request.method,request.branch,request.status,'pdv','varejo','balcao',request.commercial];
  const {rows}=await sql('SELECT public.execute_partner_sale_mutation($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) AS id',args);
  assert.equal(rows[0].id,request.id);
  return request;
}
async function state() {
  const {rows}=await sql(`SELECT
    (SELECT stock FROM partner_products WHERE id=$1) AS stock,
    (SELECT count(*)::int FROM partner_sales) AS sales,
    (SELECT count(*)::int FROM partner_invoices) AS invoices,
    (SELECT count(*)::int FROM stock_movements) AS movements,
    (SELECT count(*)::int FROM partner_audit_logs) AS logs`,[product]);
  return rows[0];
}
before(async()=>{
  await db.exec(await read('./fixtures/pdv_schema.sql'));
  try {
    await db.exec(await read('./fixtures/pdv_production.sql'));
    await db.exec(await read('../migrations/20260928044542_fix_pdv_sales_reconciliation.sql'));
  } catch (error) { throw new Error(`${error.message} (position ${error.position})`); }
});
after(()=>db.close());
beforeEach(async()=>{
  await db.exec('RESET ROLE; TRUNCATE partner_audit_logs,stock_movements,partner_invoices,partner_sales,partner_products,partner_customers,partner_salespeople,partner_branches,partner_profiles CASCADE');
  [owner,otherOwner,branch,otherBranch,foreignBranch,customer,product,service,employee,employeeAuth,manager,managerAuth]=Array.from({length:12},()=>randomUUID());
  await sql('INSERT INTO partner_profiles VALUES($1,\'Owner\',\'Test\'),($2,\'Other\',\'Test\')',[owner,otherOwner]);
  await sql('INSERT INTO partner_branches VALUES($1,$4),($2,$4),($3,$5)',[branch,otherBranch,foreignBranch,owner,otherOwner]);
  await sql("INSERT INTO partner_salespeople(id,user_id,auth_user_id,branch_id,role,active) VALUES($1,$5,$2,$6,'vendedor',true),($3,$5,$4,$6,'gerente',true)",[employee,employeeAuth,manager,managerAuth,owner,branch]);
  await sql('INSERT INTO partner_customers VALUES($1,$2,NULL,true,1000)',[customer,owner]);
  await sql("INSERT INTO partner_products VALUES($1,$3,$4,'Produto',10,false,NULL),($2,$3,$4,'Servico',0,true,NULL)",[product,service,owner,branch]);
  await login(owner);
});

for(const method of ['pix','dinheiro','cartao']) test(`${method}: no credit dependency; one stock movement`,async()=>{
  await sql('UPDATE partner_customers SET allow_credit=false,credit_limit=0');
  await sale({method,customer:null});
  assert.deepEqual(await state(),{stock:9,sales:1,invoices:0,movements:1,logs:1});
  assert.equal((await sql('SELECT payment_status FROM partner_sales')).rows[0].payment_status,'pago');
});
test('billed sale atomically creates the correct invoice and commercial attribution',async()=>{
  const request=await sale({method:'faturado',commercial:employee});
  const i=(await sql('SELECT *,due_date=CURRENT_DATE+30 AS correct_due FROM partner_invoices')).rows[0];
  assert.equal(i.sale_id,request.id); assert.equal(i.customer_id,customer); assert.equal(Number(i.amount),100);
  assert.equal(i.status,'aberta');assert.equal(Number(i.paid_amount),0);assert.equal(i.branch_id,branch);
  assert.equal(i.salesperson_id,employee);assert.equal(i.correct_due,true);
});
test('invoice insertion failure rolls back sale, stock and movements together',async()=>{
  await db.exec('ALTER TABLE partner_invoices ADD CONSTRAINT test_invoice_rejection CHECK (amount <> 123)');
  const before=await state();
  try {
    await assert.rejects(sale({method:'faturado',total:123}),/test_invoice_rejection/);
    assert.deepEqual(await state(),before);
  } finally { await db.exec('ALTER TABLE partner_invoices DROP CONSTRAINT test_invoice_rejection'); }
});
test('legacy 15-argument callers still work and cannot access another company branch',async()=>{
  await sql('SELECT execute_partner_sale_mutation(NULL,NULL,$1,NULL,$2,$3::jsonb,100,NULL,NULL,$4,$5,$6,$7,$8,$9)',
    [randomUUID(),'Cliente',JSON.stringify([{product_id:product,name:'Produto',quantity:1,unit_price:100}]),'pix',branch,'concluida','pdv','varejo','balcao']);
  assert.equal((await state()).stock,9);
  await assert.rejects(sale({branch:foreignBranch}),/Filial invalida/);
});
test('retry same sale ID does not repeat stock, invoice or audit, even after credit consumed',async()=>{
  const request=await sale({method:'faturado',total:1000});
  const before=await state(); await sale(request);assert.deepEqual(await state(),before);
  await assert.rejects(sale({...request,total:999}),/dados diferentes/);
  assert.deepEqual(await state(),before);
});
test('partial balances across branches consume credit and reject excess without side effects',async()=>{
  await sql("INSERT INTO partner_invoices(user_id,customer_id,amount,paid_amount,status,branch_id) VALUES($1,$2,950,50,'parcial',$3)",[owner,customer,otherBranch]);
  const before=await state();
  await assert.rejects(sale({method:'faturado',total:101}),/Credito insuficiente/);
  assert.deepEqual(await state(),before);
  await sale({method:'faturado',total:100});
});
test('missing customer or credit permission rejects billed sale without stock writes',async()=>{
  await assert.rejects(sale({method:'faturado',customer:null}),/exige cliente/);
  await sql('UPDATE partner_customers SET allow_credit=false');
  await assert.rejects(sale({method:'faturado'}),/sem credito/);
  assert.equal((await state()).stock,10);
});
test('pre-sale has no stock reservation; finalization repeats validation and creates one invoice',async()=>{
  const pre=await sale({status:'pre_venda',method:null,commercial:employee});
  assert.deepEqual(await state(),{stock:10,sales:1,invoices:0,movements:0,logs:1});
  await sql('UPDATE partner_products SET stock=0 WHERE id=$1',[product]);
  await assert.rejects(sale({...pre,status:'concluida',method:'faturado'}),/Estoque insuficiente/);
  await sql('UPDATE partner_products SET stock=3 WHERE id=$1',[product]);
  const completed=await sale({...pre,status:'concluida',method:'faturado'});
  const before=await state(); await sale(completed); assert.deepEqual(await state(),before);
  assert.equal((await sql('SELECT salesperson_id FROM partner_invoices')).rows[0].salesperson_id,employee);
});
test('service does not change physical stock or create movements',async()=>{
  const pre=await sale({status:'pre_venda',method:null,items:[{product_id:service,name:'Servico',quantity:3,unit_price:100}]});
  const done=await sale({...pre,status:'concluida',method:'pix'});
  await sale({...done,status:'cancelada'});
  assert.equal((await state()).movements,0);
  assert.equal((await sql('SELECT stock FROM partner_products WHERE id=$1',[service])).rows[0].stock,0);
});
test('NULL is_service follows physical stock rules for finalization, retry and cancellation',async()=>{
  await sql('UPDATE partner_products SET is_service=NULL WHERE id=$1',[product]);
  const pre=await sale({status:'pre_venda',method:null});
  assert.equal((await state()).stock,10);
  const done=await sale({...pre,status:'concluida',method:'pix'});
  await sale(done);
  assert.equal((await state()).stock,9);assert.equal((await state()).movements,1);
  await sale({...done,status:'cancelada'});
  assert.equal((await state()).stock,10);assert.equal((await state()).movements,2);
});

test('changing authorizer preserves an existing sale without a commercial seller',async()=>{
  const request=await sale();
  await login(managerAuth);
  await sale(request);
  assert.equal((await sql('SELECT salesperson_id FROM partner_sales')).rows[0].salesperson_id,null);
  assert.equal((await state()).movements,1);
});

test('open invoice with a receipt also blocks cancellation',async()=>{
  const request=await sale({method:'faturado'});
  await sql('UPDATE partner_invoices SET paid_amount=1');
  const before=await state();
  await assert.rejects(sale({...request,status:'cancelada'}),/possui recebimentos/);
  assert.deepEqual(await state(),before);
});

test('duplicate product lines aggregate once and cannot overdraw stock',async()=>{
  const item={product_id:product,name:'Produto',quantity:6,unit_price:100};
  await assert.rejects(sale({items:[item,item]}),/Estoque insuficiente/);
  await sale({items:[{...item,quantity:2},{...item,quantity:3}]});
  assert.equal((await state()).stock,5); assert.equal((await state()).movements,1);
});
test('unpaid billed cancellation keeps invoice history, releases credit and restores only once',async()=>{
  const request=await sale({method:'faturado'});
  const id=(await sql('SELECT id FROM partner_invoices')).rows[0].id;
  await sale({...request,status:'cancelada'});
  assert.deepEqual(await state(),{stock:10,sales:1,invoices:1,movements:2,logs:2});
  const i=(await sql('SELECT id,status,paid_amount FROM partner_invoices')).rows[0];
  assert.equal(i.id,id);assert.equal(i.status,'cancelada');assert.equal(Number(i.paid_amount),0);
  const snapshot=(await sql('SELECT get_partner_pdv_snapshot($1) AS result',[branch])).rows[0].result;
  assert.equal(snapshot.credits[0].available,1000);
  await assert.rejects(sale({...request,status:'cancelada'}),/imutavel/);
  assert.equal((await state()).stock,10);
});
test('historical commercial seller moving branches does not block cancellation or exact retry',async()=>{
  const request=await sale({method:'faturado',commercial:employee});
  await sql('UPDATE partner_salespeople SET branch_id=$1 WHERE id=$2',[otherBranch,employee]);
  await sale(request);
  await sale({...request,status:'cancelada'});
  assert.equal((await state()).stock,10);
});
for(const status of ['parcial','paga']) test(`${status}: cancellation rolls back without financial or stock changes`,async()=>{
  const request=await sale({method:'faturado'});
  await sql('UPDATE partner_invoices SET status=$1,paid_amount=$2',[status,status==='paga'?100:25]);
  const before=await state();await assert.rejects(sale({...request,status:'cancelada'}),/possui recebimentos/);
  assert.deepEqual(await state(),before);
  assert.equal((await sql('SELECT status FROM partner_sales')).rows[0].status,'concluida');
});
test('stock failure after invoice lock rolls back cancellation',async()=>{
  const request=await sale({method:'faturado'});
  await sql('DELETE FROM partner_products WHERE id=$1',[product]);
  await assert.rejects(sale({...request,status:'cancelada'}),/historico nao existe/);
  assert.equal((await sql('SELECT status FROM partner_invoices')).rows[0].status,'aberta');
});
test('employee session resolves company, attribution and branch with no PIN',async()=>{
  await login(employeeAuth); await db.exec('SET ROLE authenticated');
  await sale();
  await assert.rejects(sale({branch:otherBranch}),/Acesso negado a filial/);
  await assert.rejects(sale({branch:foreignBranch}),/Acesso negado a filial/);
  await db.exec('RESET ROLE');
  const s=(await sql('SELECT user_id,salesperson_id FROM partner_sales')).rows[0];
  assert.equal(s.user_id,owner);assert.equal(s.salesperson_id,employee);
});
test('inactive employee and unauthorized role cannot conclude; seller cannot cancel/delete',async()=>{
  const pre=await sale({status:'pre_venda',method:null});const done=await sale();
  await login(employeeAuth);
  await assert.rejects(sale({...done,status:'cancelada'}),/apenas administradores ou gerentes/);
  await assert.rejects(sql('SELECT execute_partner_sale_delete(NULL,NULL,$1)',[pre.id]),/apenas administradores ou gerentes/);
  await sql("UPDATE partner_salespeople SET role='tecnico' WHERE id=$1",[employee]);
  await assert.rejects(sale(),/Acesso negado para concluir/);
  await sql('UPDATE partner_salespeople SET active=false WHERE id=$1',[employee]);
  await assert.rejects(sale(),/Funcionario inativo/);
});
test('manager session cancels and only deletes pre-sales',async()=>{
  const pre=await sale({status:'pre_venda',method:null});const done=await sale();
  await login(managerAuth);
  await sql('SELECT execute_partner_sale_delete(NULL,NULL,$1)',[pre.id]);
  await assert.rejects(sql('SELECT execute_partner_sale_delete(NULL,NULL,$1)',[done.id]),/nao podem ser excluidas/);
  await sale({...done,status:'cancelada'});
  await assert.rejects(sql('SELECT execute_partner_sale_delete(NULL,NULL,$1)',[done.id]),/nao podem ser excluidas/);
  assert.equal((await state()).stock,10);
});
test('explicit owner operator/PIN remains required and supports linked employee',async()=>{
  const credential=randomUUID();
  await sql('UPDATE partner_salespeople SET pin_hash=md5($1) WHERE id=$2',[credential,employee]);
  await assert.rejects(sale({operator:employee}),/PIN incorreto/);
  await sale({operator:employee,pin:credential});
  await login(otherOwner);
  await assert.rejects(sale({operator:employee,pin:credential}),/PIN incorreto/);
});
test('snapshot returns global credit without other-branch invoice rows; helper cannot be called by client',async()=>{
  await sale({method:'faturado',commercial:employee});
  await sql("INSERT INTO partner_invoices(user_id,customer_id,amount,paid_amount,status,branch_id) VALUES($1,$2,500,100,'parcial',$3)",[owner,customer,otherBranch]);
  await login(employeeAuth);await db.exec('SET ROLE authenticated');
  const snapshot=(await sql('SELECT get_partner_pdv_snapshot($1) AS result',[branch])).rows[0].result;
  assert.equal(snapshot.credits[0].used,500);assert.equal(snapshot.credits[0].available,500);
  assert.equal(snapshot.invoices.length,1);assert.equal(snapshot.invoices[0].branch_id,branch);
  await assert.rejects(sql('SELECT * FROM resolve_partner_pdv_operator(NULL,NULL,$1)',[branch]),/permission denied/);
  await assert.rejects(sql('SELECT get_partner_pdv_snapshot($1)',[foreignBranch]),/Acesso negado/);
});

test('frontend retains ID over reload/retry, rejects a changed cart, and isolates identities',async()=>{
  const source=await read('../../src/lib/pdv.ts');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
  const {PdvSaleAttemptStore,billedSaleError}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
  const values=new Map();const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const draft={id:randomUUID(),branch_id:branch,items:[],total:10,payment_method:'pix'};
  const first=new PdvSaleAttemptStore(storage,'owner:company');first.begin({...draft,operatorPin:'test-only-extra-field'});
  assert.ok(![...values.values()][0].includes('operatorPin'));
  const reload=new PdvSaleAttemptStore(storage,'owner:company');
  assert.equal(reload.begin({...draft,id:randomUUID()}).id,draft.id);
  assert.throws(()=>reload.begin({...draft,total:11}),/resultado pendente/);
  assert.equal(new PdvSaleAttemptStore(storage,'employee:company').read(),null);
  reload.complete(draft.id);assert.equal(reload.read(),null);
  assert.equal(billedSaleError({allow_credit:true,available:20},customer,20),null);
  assert.match(billedSaleError({allow_credit:true,available:20},customer,21),/insuficiente/);
  assert.match(billedSaleError(undefined,customer,10),/consultar o crédito/);
  assert.match(billedSaleError(undefined,null,10),/Selecione um cliente/);
});
