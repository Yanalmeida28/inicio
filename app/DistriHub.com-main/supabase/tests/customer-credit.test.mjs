import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db=new PGlite();
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const sql=(text,args=[])=>db.query(text,args);
let owner,other,branch,secondBranch,foreignBranch,customer,manager;
const login=id=>sql("SELECT set_config('test.auth_uid',$1,false)",[id??'']);
async function save({id=customer,context=null,limit=500,allow=true,operator=null,pin=null}={}) {
  return sql('SELECT execute_partner_customer_mutation($1,$2,$3,$4,$5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,$6,$7,$8) AS id',
    [operator,pin,id,context,'Cliente teste','varejo',limit,allow]);
}
before(async()=>{
  await db.exec(await read('./fixtures/pdv_schema.sql'));
  await db.exec(await read('./fixtures/pdv_production.sql'));
  for(const column of ['name','document','person_type','phone','email','address','neighborhood','city','device_model','notes']) {
    await db.exec(`ALTER TABLE partner_customers ADD COLUMN ${column} text`);
  }
  await db.exec('ALTER TABLE partner_customers ADD COLUMN birthday date');
  await db.exec(await read('./fixtures/customer_mutation_production.sql'));
  const baselineOwner=randomUUID(),baselineCustomer=randomUUID();
  await sql('INSERT INTO partner_profiles(id) VALUES($1)',[baselineOwner]);
  await sql('INSERT INTO partner_customers(id,user_id) VALUES($1,$2)',[baselineCustomer,baselineOwner]);
  await login(baselineOwner);
  await assert.rejects(save({id:baselineCustomer}),/E necessario informar uma filial valida/);
  await db.exec(await read('../migrations/20261009192448_fix_shared_customer_credit_updates.sql'));
});
after(()=>db.close());
beforeEach(async()=>{
  await db.exec('RESET ROLE; TRUNCATE partner_invoices,partner_sales,partner_customers,partner_salespeople,partner_branches,partner_profiles CASCADE');
  [owner,other,branch,secondBranch,foreignBranch,customer,manager]=Array.from({length:7},()=>randomUUID());
  await sql('INSERT INTO partner_profiles(id) VALUES($1),($2)',[owner,other]);
  await sql('INSERT INTO partner_branches(id,user_id) VALUES($1,$4),($2,$4),($3,$5)',[branch,secondBranch,foreignBranch,owner,other]);
  await sql("INSERT INTO partner_customers(id,user_id,name,branch_id) VALUES($1,$2,'Cliente teste',NULL)",[customer,owner]);
  await sql("INSERT INTO partner_salespeople(id,user_id,branch_id,role,active,pin_hash) VALUES($1,$2,$3,'gerente',true,md5('1234'))",[manager,owner,branch]);
  await login(owner);
});
test('owner saves billed credit for a shared customer in the all-branches view',async()=>{
  await sql("INSERT INTO partner_invoices(id,user_id,customer_id,amount,status) VALUES($1,$2,$3,100,'aberta')",[randomUUID(),owner,customer]);
  await save();
  const row=(await sql('SELECT branch_id,allow_credit,credit_limit FROM partner_customers WHERE id=$1',[customer])).rows[0];
  assert.equal(row.branch_id,null);
  assert.equal(row.allow_credit,true);
  assert.equal(Number(row.credit_limit),500);
  assert.equal(Number((await sql('SELECT amount FROM partner_invoices WHERE customer_id=$1',[customer])).rows[0].amount),100);
});
test('selected branch and valid manager authorization do not move a shared customer into one branch',async()=>{
  await save({context:branch,limit:1000});
  await save({context:branch,operator:manager,pin:'1234',limit:750});
  const row=(await sql('SELECT branch_id,credit_limit FROM partner_customers WHERE id=$1',[customer])).rows[0];
  assert.equal(row.branch_id,null);
  assert.equal(Number(row.credit_limit),750);
});
test('linked customers reuse their own branch when omitted and credit can be disabled or set to zero',async()=>{
  await sql('UPDATE partner_customers SET branch_id=$1 WHERE id=$2',[branch,customer]);
  await save();
  await save({limit:0,allow:false});
  const row=(await sql('SELECT branch_id,credit_limit,allow_credit FROM partner_customers WHERE id=$1',[customer])).rows[0];
  assert.equal(row.branch_id,branch);
  assert.equal(Number(row.credit_limit),0);
  assert.equal(row.allow_credit,false);
});
test('foreign tenants, foreign branch contexts, invalid PINs and anonymous calls remain denied',async()=>{
  await assert.rejects(save({context:foreignBranch}),/Filial invalida/);
  await assert.rejects(save({context:branch,operator:manager,pin:'bad'}),/Operador invalido/);
  await sql('UPDATE partner_customers SET branch_id=$1 WHERE id=$2',[secondBranch,customer]);
  await assert.rejects(save({context:branch,operator:manager,pin:'1234'}),/outra filial/);
  await login(other);
  await assert.rejects(save({context:foreignBranch}),/outra empresa/);
  await login(null);
  await assert.rejects(save(),/Nao autenticado/);
});
test('new customers still require a valid branch and negative credit limits are rejected',async()=>{
  await assert.rejects(save({id:null}),/filial valida/);
  await assert.rejects(save({limit:-1}),/nao pode ser negativo/);
  assert.equal((await sql('SELECT count(*)::int AS n FROM partner_customers')).rows[0].n,1);
});
