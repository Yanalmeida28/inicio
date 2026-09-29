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
  request.total=overrides.total ?? request.items.reduce((sum,item)=>sum+item.quantity*item.unit_price,0);
  const args=[request.operator,request.pin,request.id,request.customer,'Cliente',JSON.stringify(request.items),request.total,null,null,request.method,request.branch,request.status,'pdv',request.customerType??'varejo','balcao',request.commercial];
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
    await db.exec(await read('../migrations/20260928195329_enforce_pdv_authoritative_pricing.sql'));
    await db.exec(await read('./fixtures/pdv_payment_production.sql'));
    await db.exec(await read('../migrations/20260929181116_fix_partner_invoice_payment_profile.sql'));
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
  await sql('UPDATE partner_products SET sale_price=123 WHERE id=$1',[product]);
  await db.exec('ALTER TABLE partner_invoices ADD CONSTRAINT test_invoice_rejection CHECK (amount <> 123)');
  const before=await state();
  try {
    await assert.rejects(sale({method:'faturado',total:123,items:[{product_id:product,name:'Produto',quantity:1,unit_price:123}]}),/test_invoice_rejection/);
    assert.deepEqual(await state(),before);
    assert.equal((await sql('SELECT count(*)::int AS n FROM partner_pdv_price_snapshots')).rows[0].n,0);
  } finally { await db.exec('ALTER TABLE partner_invoices DROP CONSTRAINT test_invoice_rejection'); }
});
test('legacy 15-argument callers still work and cannot access another company branch',async()=>{
  await sql('SELECT execute_partner_sale_mutation(NULL,NULL,$1,NULL,$2,$3::jsonb,100,NULL,NULL,$4,$5,$6,$7,$8,$9)',
    [randomUUID(),'Cliente',JSON.stringify([{product_id:product,name:'Produto',quantity:1,unit_price:100}]),'pix',branch,'concluida','pdv','varejo','balcao']);
  assert.equal((await state()).stock,9);
  await assert.rejects(sale({branch:foreignBranch}),/Filial invalida/);
});
test('retry same sale ID does not repeat stock, invoice or audit, even after credit consumed',async()=>{
  const request=await sale({method:'faturado',total:1000,items:[{product_id:product,name:'Produto',quantity:10,unit_price:100}]});
  const before=await state(); await sale(request);assert.deepEqual(await state(),before);
  await assert.rejects(sale({...request,total:999}),/dados diferentes/);
  assert.deepEqual(await state(),before);
});
test('partial balances across branches consume credit and reject excess without side effects',async()=>{
  await sql("INSERT INTO partner_invoices(user_id,customer_id,amount,paid_amount,status,branch_id) VALUES($1,$2,950,50,'parcial',$3)",[owner,customer,otherBranch]);
  const before=await state();
  await assert.rejects(sale({method:'faturado',total:200,items:[{product_id:product,name:'Produto',quantity:2,unit_price:100}]}),/Credito insuficiente/);
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

// Pricing regressions run against both migrations, with synthetic catalog prices.
const line=(changes={})=>({product_id:product,name:'Produto',quantity:1,unit_price:100,...changes});
async function rejectPricing(request,pattern) {
  const previous=await state();
  await assert.rejects(sale(request),pattern);
  assert.deepEqual(await state(),previous);
  assert.equal((await sql('SELECT count(*)::int AS n FROM partner_pdv_price_snapshots')).rows[0].n,0);
}
for(const total of [99,101,-1,0.001]) test(`pricing: declared total ${total} is rejected atomically`,async()=>{
  await rejectPricing({method:'faturado',total},/Total/);
});
test('pricing: manipulated unit price and discount fields are rejected',async()=>{
  await rejectPricing({items:[line({unit_price:1})]},/Preco unitario/);
  await rejectPricing({items:[line({discount:10})]},/desconto/);
  await rejectPricing({items:[line({unit_price:-1})]},/Total|Preco/);
});
test('pricing: subtotal is checked rather than trusted',async()=>{
  await rejectPricing({items:[line({subtotal:1})]},/Subtotal/);
  await sale({items:[line({subtotal:100})]});
});
for(const quantity of [0,-1,1.5,2147483648,null,'1']) test(`pricing: invalid quantity ${JSON.stringify(quantity)}`,async()=>{
  await rejectPricing({items:[line({quantity})],total:100},/Quantidade/);
});
test('pricing: changing quantity without matching the total fails',async()=>{
  await rejectPricing({items:[line({quantity:2})],total:100},/Total diverge/);
});
test('pricing: each repeated line is validated before aggregation',async()=>{
  await rejectPricing({items:[line({quantity:2}),line({quantity:-1})],total:100},/Quantidade/);
  await sale({items:[line(),line()],total:200});
  assert.equal((await state()).stock,8);assert.equal((await state()).movements,1);
});
test('pricing: missing, foreign-company and foreign-branch products cannot be sold',async()=>{
  await rejectPricing({items:[line({product_id:randomUUID()})]},/Produto invalido/);
  await sql('UPDATE partner_products SET user_id=$1 WHERE id=$2',[otherOwner,product]);
  await rejectPricing({},/Produto invalido/);
  await sql('UPDATE partner_products SET user_id=$1,branch_id=$2 WHERE id=$3',[owner,otherBranch,product]);
  await rejectPricing({},/Produto fora da filial/);
});
test('pricing: empty cart and missing unit price fail',async()=>{
  await rejectPricing({items:[],total:0},/vazios/);
  await rejectPricing({items:[{product_id:product,quantity:1}],total:100},/preco unitario/);
});
test('pricing: wholesale follows registered customer type, ignoring unused price_table',async()=>{
  await sql("UPDATE partner_customers SET customer_type='atacado',price_table='premium'");
  await sql('UPDATE partner_products SET wholesale_price=75');
  await rejectPricing({customerType:'varejo'},/Tipo de cliente diverge/);
  await sale({customerType:'atacado',items:[line({unit_price:75})],method:'faturado'});
  assert.equal(Number((await sql('SELECT amount FROM partner_invoices')).rows[0].amount),75);
});
test('pricing: retail cannot claim a wholesale classification',async()=>{
  await sql('UPDATE partner_products SET wholesale_price=75');
  await rejectPricing({customerType:'atacado',items:[line({unit_price:75})]},/Tipo de cliente diverge/);
});
test('pricing: anonymous wholesale is allowed, with retail fallback for zero or NULL wholesale',async()=>{
  await sale({customer:null,customerType:'atacado'});
  await sql('UPDATE partner_products SET wholesale_price=NULL');
  await sale({customer:null,customerType:'atacado'});
  await sql('UPDATE partner_products SET wholesale_price=75');
  await sale({customer:null,customerType:'atacado',items:[line({unit_price:75})]});
});
test('pricing: zero catalog price and decimal cents are legitimate',async()=>{
  await sql('UPDATE partner_products SET sale_price=0 WHERE id=$1',[service]);
  await sale({items:[line({product_id:service,unit_price:0})],total:0});
  await sql('UPDATE partner_products SET sale_price=0.10 WHERE id=$1',[product]);
  await sale({items:[line({unit_price:0.10,quantity:3})],total:0.30});
  assert.equal(Number((await sql("SELECT total FROM partner_sales WHERE total>0")).rows[0].total),0.3);
});
test('pricing: catalog nonfinite, negative or subcent prices fail',async()=>{
  for(const price of ['NaN','Infinity','1.001']) {
    await sql('UPDATE partner_products SET wholesale_price=$1',[price]);
    await rejectPricing({customer:null,customerType:'atacado'},/Preco do cadastro/);
  }
  await sql('UPDATE partner_products SET sale_price=-1');
  await rejectPricing({},/Preco do cadastro/);
});
test('pricing: services and NULL classification use the catalog price',async()=>{
  await sql('UPDATE partner_products SET is_service=NULL WHERE id=$1',[product]);
  await rejectPricing({items:[line({product_id:service,unit_price:1})]},/Preco unitario/);
  await sale({items:[line(),line({product_id:service})],total:200});
  assert.equal((await state()).movements,1);assert.equal((await state()).stock,9);
});
test('pricing: credit is checked against authorized total, with no underbilling',async()=>{
  await sql('UPDATE partner_customers SET credit_limit=99');
  await rejectPricing({method:'faturado',total:1},/Total diverge/);
  await rejectPricing({method:'faturado',total:100},/Credito insuficiente/);
});
test('pricing: validated pre-sale keeps its quote after catalog and classification changes',async()=>{
  const pre=await sale({status:'pre_venda',method:null});
  await sql('UPDATE partner_products SET sale_price=150');
  await sql("UPDATE partner_customers SET customer_type='atacado'");
  await sale({...pre,status:'concluida',method:'faturado'});
  assert.equal(Number((await sql('SELECT amount FROM partner_invoices')).rows[0].amount),100);
});
test('pricing: finalization cannot replace saved quote with new price or quantity',async()=>{
  const pre=await sale({status:'pre_venda',method:null});
  const previous=await state();
  await assert.rejects(sale({...pre,status:'concluida',total:200,items:[line({quantity:2})]}),/dados financeiros/);
  assert.deepEqual(await state(),previous);
});
test('pricing: legacy pre-sale without proof is blocked when its quote is no longer verifiable',async()=>{
  const pre=await sale({status:'pre_venda',method:null});
  await sql('DELETE FROM partner_pdv_price_snapshots'); // Synthetic legacy fixture; no production writes.
  await sql('UPDATE partner_products SET sale_price=150');
  const previous=await state();
  await assert.rejects(sale({...pre,status:'concluida',method:'pix'}),/Preco unitario/);
  assert.deepEqual(await state(),previous);
  await sql('UPDATE partner_products SET sale_price=100');
  await sale({...pre,status:'concluida',method:'pix'});
});
test('pricing: exact retry after price changes has no second stock, invoice or audit',async()=>{
  const request=await sale({method:'faturado'});
  const previous=await state();
  await sql('UPDATE partner_products SET sale_price=200');
  await sale(request);await sale(request);
  assert.deepEqual(await state(),previous);
  await assert.rejects(sale({...request,total:200,items:[line({unit_price:200})]}),/dados diferentes/);
});
test('pricing: quote helper and storage are inaccessible to authenticated clients',async()=>{
  await db.exec('SET ROLE authenticated');
  await assert.rejects(sql('SELECT * FROM partner_pdv_price_snapshots'),/permission denied/);
  await assert.rejects(sql('DELETE FROM partner_pdv_price_snapshots'),/permission denied/);
  await assert.rejects(sql('SELECT validate_partner_pdv_prices($1,$2,$3,$4,$5::jsonb,100)',[owner,branch,customer,'varejo',JSON.stringify([line()])]),/permission denied/);
});
test('pricing: direct PDV financial edits cannot forge a validated quote',async()=>{
  const pre=await sale({status:'pre_venda',method:null});
  await assert.rejects(sql('UPDATE partner_sales SET total=1 WHERE id=$1',[pre.id]),/RPC autorizada/);
  await assert.rejects(sql("INSERT INTO partner_sales(id,user_id,branch_id,customer_id,customer_type,items,total,origin,status) VALUES($1,$2,$3,$4,'varejo',$5::jsonb,1,'pdv','pre_venda')",[randomUUID(),owner,branch,customer,JSON.stringify([line()])]),/RPC autorizada/);
});
test('pricing: frontend declares exact cents without changing unit prices',async()=>{
  const source=await read('../../src/lib/pdv.ts');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
  const {pdvTotal}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
  assert.equal(pdvTotal([{unit_price:0.1,quantity:3}]),0.3);
  assert.equal(pdvTotal([{unit_price:19.99,quantity:7},{unit_price:0.01,quantity:1}]),139.94);
});
test('pricing: duplicate submitted requests share one sale, invoice, movement and quote',async()=>{
  const request={id:randomUUID(),method:'faturado'};
  await Promise.all([sale(request),sale(request)]);
  assert.deepEqual(await state(),{stock:9,sales:1,invoices:1,movements:1,logs:1});
  assert.equal((await sql('SELECT count(*)::int AS n FROM partner_pdv_price_snapshots')).rows[0].n,1);
});
test('pricing: unknown classification and invalid pre-sale prices fail before stock',async()=>{
  await rejectPricing({customer:null,customerType:'premium'},/Tipo de cliente invalido/);
  await rejectPricing({status:'pre_venda',method:null,total:1},/Total diverge/);
});
test('pricing: NUMERIC total capacity and aggregate quantity capacity are enforced',async()=>{
  await rejectPricing({items:[line({quantity:1000000})],total:100000000},/precisao financeira/);
  await sql('UPDATE partner_products SET sale_price=0');
  await rejectPricing({items:[line({quantity:2147483647,unit_price:0}),line({unit_price:0})],total:0},/Quantidade agregada/);
});
test('pricing: direct legacy finalization cannot bypass quote validation',async()=>{
  const pre=await sale({status:'pre_venda',method:null});
  await sql('DELETE FROM partner_pdv_price_snapshots');
  await assert.rejects(sql("UPDATE partner_sales SET status='concluida' WHERE id=$1",[pre.id]),/RPC autorizada/);
});

test('pricing: pre-sale retries preserve the quote and audit after catalog changes',async()=>{
  const pre=await sale({status:'pre_venda',method:null});
  const previous=await state();
  const quote=(await sql('SELECT * FROM partner_pdv_price_snapshots')).rows;
  await sql('UPDATE partner_products SET sale_price=150');
  await sql("UPDATE partner_customers SET customer_type='atacado'");
  await Promise.all([sale(pre),sale(pre)]);
  assert.deepEqual(await state(),previous);
  assert.deepEqual((await sql('SELECT * FROM partner_pdv_price_snapshots')).rows,quote);
});

test('pricing: canonical UUID duplicates cannot exceed quantity capacity in a pre-sale',async()=>{
  await sql('UPDATE partner_products SET sale_price=0');
  await rejectPricing({status:'pre_venda',total:0,items:[
    line({quantity:2147483647,unit_price:0}),
    line({product_id:`{${product}}`,unit_price:0}),
  ]},/Quantidade agregada/);
});

test('pricing: nonfinite declared totals and malformed numeric items roll back',async()=>{
  for(const total of ['NaN','Infinity','-Infinity']) await rejectPricing({total},/Total/);
  for(const field of ['quantity','unit_price','subtotal']) {
    for(const value of ['NaN','Infinity',null]) {
      await rejectPricing({total:100,items:[line({[field]:value})]},/Quantidade|Subtotal/);
    }
  }
});

test('pricing: finalization rejects changes to every quoted financial field',async()=>{
  const pre=await sale({status:'pre_venda',method:null});
  const previous=await state();
  for(const change of [
    {items:[line({product_id:service})]}, {items:[line({unit_price:99})],total:99},
    {total:99}, {customerType:'atacado'}, {customer:null},
  ]) await assert.rejects(sale({...pre,status:'concluida',...change}),/dados financeiros/);
  assert.deepEqual(await state(),previous);
});

test('pricing: wholesale services and maximum financial total use the authoritative invoice',async()=>{
  await sql('UPDATE partner_products SET wholesale_price=99999999.99 WHERE id=$1',[service]);
  await sql("UPDATE partner_customers SET customer_type='atacado',credit_limit=99999999.99");
  await sale({customerType:'atacado',method:'faturado',items:[line({product_id:service,unit_price:99999999.99})]});
  assert.equal(Number((await sql('SELECT total FROM partner_sales')).rows[0].total),99999999.99);
  assert.equal(Number((await sql('SELECT amount FROM partner_invoices')).rows[0].amount),99999999.99);
  assert.equal((await state()).movements,0);
});

test('pricing: clients cannot insert or update protected quotes',async()=>{
  const pre=await sale({status:'pre_venda',method:null});
  await db.exec('SET ROLE authenticated');
  await assert.rejects(sql('UPDATE partner_pdv_price_snapshots SET total=1 WHERE sale_id=$1',[pre.id]),/permission denied/);
  await assert.rejects(sql('INSERT INTO partner_pdv_price_snapshots SELECT * FROM partner_pdv_price_snapshots'),/permission denied/);
});

test('pricing: customer deletion detaches sale and quote without changing finance or duplicating effects',async()=>{
  const pre=await sale({status:'pre_venda',method:null});
  const previous=await state();
  await sql('DELETE FROM partner_customers WHERE id=$1',[customer]);
  assert.deepEqual(await state(),previous);
  const saved=(await sql('SELECT customer_id,items,total FROM partner_sales')).rows[0];
  const quote=(await sql('SELECT customer_id,items,total FROM partner_pdv_price_snapshots')).rows[0];
  assert.equal(saved.customer_id,null);assert.deepEqual(saved,quote);
  assert.deepEqual(saved.items,pre.items);assert.equal(Number(saved.total),100);
  const done=await sale({...pre,customer:null,status:'concluida',method:'pix'});
  const completed=await state();await sale(done);assert.deepEqual(await state(),completed);
  assert.equal((await sql('SELECT count(*)::int AS n FROM partner_pdv_price_snapshots')).rows[0].n,1);
});

test('pricing: completed cash sale permits real customer FK deletion but no manual quote edits',async()=>{
  const done=await sale();
  await assert.rejects(sql('UPDATE partner_sales SET customer_id=NULL WHERE id=$1',[done.id]),/RPC autorizada/);
  await sql('DELETE FROM partner_customers WHERE id=$1',[customer]);
  for(const assignment of ["total=1", "items='[]'::jsonb", "customer_type='atacado'"]) {
    await assert.rejects(sql(`UPDATE partner_sales SET ${assignment} WHERE id=$1`,[done.id]),/RPC autorizada/);
  }
  assert.equal((await sql('SELECT customer_id FROM partner_sales')).rows[0].customer_id,null);
  assert.equal((await state()).stock,9);
});

const receive=(id,amount)=>sql('SELECT public.record_partner_invoice_payment($1,$2) AS id',[id,amount]);
async function billedInvoice() {
  await sale({method:'faturado'});
  return (await sql('SELECT id FROM partner_invoices')).rows[0].id;
}

test('receipts: owner receives partial and total amounts with actor and atomic audit',async()=>{
  const id=await billedInvoice();
  await db.exec('SET ROLE authenticated');
  assert.equal((await receive(id,25)).rows[0].id,id);
  await db.exec('RESET ROLE');
  let invoice=(await sql('SELECT * FROM partner_invoices')).rows[0];
  assert.equal(Number(invoice.paid_amount),25);assert.equal(invoice.status,'parcial');assert.equal(invoice.paid_at,null);
  await receive(id,75);
  invoice=(await sql('SELECT * FROM partner_invoices')).rows[0];
  assert.equal(Number(invoice.paid_amount),100);assert.equal(invoice.status,'paga');assert.ok(invoice.paid_at);
  const logs=(await sql("SELECT * FROM partner_audit_logs WHERE action='recebimento_fatura'")).rows;
  assert.equal(logs.length,2);
  for(const log of logs) {assert.equal(log.user_id,owner);assert.equal(log.actor_name,'Owner');assert.equal(log.entity_id,id);}
  assert.equal((await state()).stock,9);
});

test('receipts: an open invoice can be paid in full; excess or repeat after full payment fails',async()=>{
  const id=await billedInvoice();
  await assert.rejects(receive(id,101),/excede/);
  await receive(id,100);
  const previous=await state();
  await assert.rejects(receive(id,100),/excede/);
  assert.deepEqual(await state(),previous);
  assert.equal((await sql('SELECT status FROM partner_invoices')).rows[0].status,'paga');
});

test('receipts: unauthenticated, foreign owner and employees cannot receive company invoices',async()=>{
  const id=await billedInvoice();const previous=await state();
  await login('');await assert.rejects(receive(id,10),/Nao autenticado/);
  for(const actor of [otherOwner,employeeAuth,managerAuth]) {
    await login(actor);await assert.rejects(receive(id,10),/Fatura nao encontrada/);
  }
  assert.deepEqual(await state(),previous);
  assert.equal(Number((await sql('SELECT paid_amount FROM partner_invoices')).rows[0].paid_amount),0);
});

test('receipts: owner scope spans own branches but never another company',async()=>{
  const id=await billedInvoice();
  await sql('UPDATE partner_invoices SET branch_id=$1 WHERE id=$2',[otherBranch,id]);
  await receive(id,10);
  await login(otherOwner);await assert.rejects(receive(id,10),/Fatura nao encontrada/);
  assert.equal(Number((await sql('SELECT paid_amount FROM partner_invoices')).rows[0].paid_amount),10);
});

test('receipts: invalid amounts and cancelled invoices produce no receipt or audit',async()=>{
  const id=await billedInvoice();const previous=await state();
  for(const value of [null,0,-1,0.001,'NaN','Infinity','-Infinity']) await assert.rejects(receive(id,value),/Valor de recebimento invalido/);
  assert.deepEqual(await state(),previous);
  await sql("UPDATE partner_invoices SET status='cancelada' WHERE id=$1",[id]);
  await assert.rejects(receive(id,1),/cancelada/);
  assert.deepEqual(await state(),previous);
});

test('receipts: audit failure rolls back balance, status and paid_at',async()=>{
  const id=await billedInvoice();
  await db.exec("ALTER TABLE partner_audit_logs ADD CONSTRAINT reject_receipt_audit CHECK(action<>'recebimento_fatura')");
  try {
    await assert.rejects(receive(id,100),/reject_receipt_audit/);
    const invoice=(await sql('SELECT paid_amount,status,paid_at FROM partner_invoices')).rows[0];
    assert.equal(Number(invoice.paid_amount),0);assert.equal(invoice.status,'aberta');assert.equal(invoice.paid_at,null);
    assert.equal((await state()).logs,1);
  } finally {await db.exec('ALTER TABLE partner_audit_logs DROP CONSTRAINT reject_receipt_audit');}
});

test('receipts: existing two-argument contract treats equal partial payments as distinct receipts',async()=>{
  const id=await billedInvoice();
  await receive(id,10);await receive(id,10);
  assert.equal(Number((await sql('SELECT paid_amount FROM partner_invoices')).rows[0].paid_amount),20);
  assert.equal((await state()).logs,3);
});
