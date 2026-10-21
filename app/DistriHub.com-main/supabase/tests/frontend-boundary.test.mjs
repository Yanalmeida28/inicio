import assert from 'node:assert/strict';
import { before,after,test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
import { boundaryDatabase } from './fixtures/frontend-boundary.mjs';
const checklist={};
vm.runInNewContext(ts.transpileModule(await readFile(new URL('../../src/lib/serviceChecklist.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:checklist});
const inspection=(equipment='Celular',phase='entrada',result='Não testado')=>checklist.checklistText(equipment,Object.fromEntries(checklist.checklistItems(equipment).map(([key])=>[key,result])),phase);
const entry=()=>inspection()+'\nCliente ciente das condições de entrada: sim.';
let f,db,legacy,ownStaff,secondBranch,secondCustomer,secondStaff;
const sql=(query,args=[])=>db.query(query,args);
const row=async(query,args=[]) => (await sql(query,args)).rows[0];
const admin=async work=>{await db.exec('RESET ROLE');try{return await work();}finally{await db.exec('SET ROLE authenticated');}};
const payload=()=>({branch_id:f.branch,customer_id:f.customer,equipment_type:'Celular',identification:'Synthetic device',labor_total:10,items:[{product_id:f.product,quantity:1,unit_price:20}],notes:entry(),warranty_terms:'Termo original'});
before(async()=>{
 f=await boundaryDatabase();db=f.db;legacy=randomUUID();ownStaff=randomUUID();secondBranch=randomUUID();secondCustomer=randomUUID();secondStaff=randomUUID();
 await db.exec(`CREATE TABLE store_settings_v2(user_id uuid PRIMARY KEY,service_warranty_terms text);
 CREATE SCHEMA storage; CREATE TABLE storage.objects(bucket_id text,name text);
 ALTER TABLE partner_salespeople ADD COLUMN pin_hash text;
 ALTER TABLE partner_customers ADD COLUMN photo_url text,ADD COLUMN phone text,ADD COLUMN email text,ADD COLUMN birthday date,ADD COLUMN address text,ADD COLUMN neighborhood text,ADD COLUMN city text,ADD COLUMN device_model text,ADD COLUMN notes text,ADD COLUMN customer_type text,ADD COLUMN trade_name text,ADD COLUMN rg text,ADD COLUMN municipal_registration text,ADD COLUMN state_registration text,ADD COLUMN ie_isento boolean,ADD COLUMN suframa_id text,ADD COLUMN sex text,ADD COLUMN address_number text,ADD COLUMN zip_code text,ADD COLUMN state text,ADD COLUMN complement text,ADD COLUMN reference_point text,ADD COLUMN country text,ADD COLUMN customer_group text,ADD COLUMN price_table text,ADD COLUMN convenio text,ADD COLUMN simples_nacional boolean,ADD COLUMN reter_iss boolean,ADD COLUMN is_active boolean,ADD COLUMN is_store_admin boolean,ADD COLUMN phone_commercial_1 text,ADD COLUMN phone_commercial_2 text;
 CREATE FUNCTION partner_subscription_private.require_operator_module(text,uuid) RETURNS void LANGUAGE sql AS $$SELECT$$;
 CREATE FUNCTION public.resolve_partner_operator(uuid,text,uuid) RETURNS TABLE(company_id uuid,salesperson_id uuid,role text,branch_id uuid) LANGUAGE sql AS $$SELECT auth.uid(),NULL::uuid,'administrador'::text,$3$$;`);
 await sql("INSERT INTO store_settings_v2 VALUES($1,'Termo original')",[f.owner]);
 await sql('INSERT INTO partner_branches(id,user_id) VALUES($1,$2)',[secondBranch,f.owner]);
 await sql("INSERT INTO partner_salespeople(id,user_id,branch_id,role) VALUES($1,$3,$4,'vendedor'),($2,$3,$5,'vendedor')",[ownStaff,secondStaff,f.owner,f.branch,secondBranch]);
 await sql("INSERT INTO partner_customers(id,user_id,branch_id,name,person_type) VALUES($1,$2,$3,'Second','PF')",[secondCustomer,f.owner,secondBranch]);
 await sql("INSERT INTO service_orders(id,user_id,branch_id,equipment_type,status) VALUES($1,$2,$3,'Celular','pronta')",[legacy,f.owner,f.branch]);
 await db.exec(await readFile(new URL('../migrations/20261021043934_enforce_frontend_business_invariants.sql',import.meta.url),'utf8'));
 // pg_get_functiondef omits ACLs; restore the existing production RPC grants.
 await db.exec('REVOKE ALL ON FUNCTION update_service_order_workflow_checked(uuid,text,text,text,text,uuid,boolean) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION update_service_order_workflow_checked(uuid,text,text,text,text,uuid,boolean) TO authenticated; SET ROLE authenticated');
});
after(async()=>{await db?.close();});

test('direct customer writes reject invalid amounts, documents and company/branch references',async()=>{
 for(const amount of ['NaN','Infinity','-Infinity','-1'])await assert.rejects(sql('UPDATE partner_customers SET credit_limit=$2::numeric WHERE id=$1',[f.customer,amount]),/crédito/);
 for(const document of ['11111111111','12345678901','abc52998224725'])await assert.rejects(sql('UPDATE partner_customers SET document=$2 WHERE id=$1',[f.customer,document]),/CPF\/CNPJ/);
 await assert.rejects(sql('UPDATE partner_customers SET branch_id=$2 WHERE id=$1',[f.customer,f.foreignBranch]),/Filial/);
 for(const staff of [f.foreignStaff,secondStaff])await assert.rejects(sql('UPDATE partner_customers SET salesperson_id=$2 WHERE id=$1',[f.customer,staff]),/Vendedor/);
 await sql("UPDATE partner_customers SET document='529.982.247-25',credit_limit=100,salesperson_id=$2 WHERE id=$1",[f.customer,ownStaff]);
 assert.equal((await row('SELECT document FROM partner_customers WHERE id=$1',[f.customer])).document,'529.982.247-25');
 assert.equal(Number((await row('SELECT count(*) n FROM partner_customers WHERE id=$1',[f.foreignCustomer])).n),0);
 await assert.rejects(sql("INSERT INTO partner_customers(id,user_id,name,person_type,document) VALUES($1,$2,'Bad','PF','11111111111')",[randomUUID(),f.owner]),/CPF\/CNPJ/);
 await sql("INSERT INTO partner_customers(id,user_id,name,person_type,document) VALUES($1,$2,'Company','PJ','04.252.011/0001-10')",[randomUUID(),f.owner]);
 await assert.rejects(sql("INSERT INTO partner_customers(id,user_id,name,person_type,document) VALUES($1,$2,'Bad Company','PJ','04.252.011/0001-11')",[randomUUID(),f.owner]),/CPF\/CNPJ/);
});

test('customer RPC changes branch and salesperson atomically through the same guard',async()=>{
 const result=await row('SELECT partner_cadastros_private.update_customer_profile($1,$2::jsonb) value',[f.customer,JSON.stringify({branch_id:secondBranch,salesperson_id:secondStaff})]);
 assert.equal(result.value.branch_id,secondBranch);assert.equal(result.value.salesperson_id,secondStaff);
 await sql('SELECT partner_cadastros_private.update_customer_profile($1,$2::jsonb)',[f.customer,JSON.stringify({branch_id:f.branch,salesperson_id:ownStaff})]);
});

test('CRM inserts and edits validate customer, responsible and branch; valid status editing still works',async()=>{
 await sql("INSERT INTO partner_crm_tasks(id,user_id,branch_id,customer_id,description,due_date,responsible_id) VALUES($1,$2,$3,$4,'Call customer',CURRENT_DATE,$5)",[f.task,f.owner,f.branch,f.customer,ownStaff]);
 for(const customer of [f.foreignCustomer,secondCustomer])await assert.rejects(sql('UPDATE partner_crm_tasks SET customer_id=$2 WHERE id=$1',[f.task,customer]),/Cliente/);
 for(const staff of [f.foreignStaff,secondStaff])await assert.rejects(sql('UPDATE partner_crm_tasks SET responsible_id=$2 WHERE id=$1',[f.task,staff]),/Responsável/);
 await assert.rejects(sql('UPDATE partner_crm_tasks SET branch_id=$2 WHERE id=$1',[f.task,f.foreignBranch]),/Filial/);
 await sql("UPDATE partner_crm_tasks SET status='concluida' WHERE id=$1",[f.task]);assert.ok((await row('SELECT completed_at FROM partner_crm_tasks WHERE id=$1',[f.task])).completed_at);
 await assert.rejects(sql("INSERT INTO partner_crm_tasks(id,user_id,branch_id,customer_id,description,due_date) VALUES($1,$2,$3,$4,'Invalid',CURRENT_DATE)",[randomUUID(),f.owner,f.branch,secondCustomer]),/Cliente/);
});

test('modifiers reject foreign products and non-finite prices, preserving signed and global adjustments',async()=>{
 await assert.rejects(sql("INSERT INTO partner_modifiers(id,user_id,product_id,name,price_adjustment) VALUES($1,$2,$3,'Invalid',1)",[randomUUID(),f.owner,f.foreignProduct]),/Produto/);
 for(const price of ['NaN','Infinity','-Infinity'])await assert.rejects(sql("INSERT INTO partner_modifiers(id,user_id,product_id,name,price_adjustment) VALUES($1,$2,$3,'Invalid',$4::numeric)",[randomUUID(),f.owner,f.product,price]),/Ajuste/);
 await assert.rejects(sql("INSERT INTO partner_modifiers(id,user_id,name,price_adjustment) VALUES($1,$2,' ',0)",[randomUUID(),f.owner]),/Nome/);
 await sql("INSERT INTO partner_modifiers(id,user_id,product_id,name,price_adjustment) VALUES($1,$2,$3,'Discount',-5)",[f.modifier,f.owner,f.product]);
 await assert.rejects(sql('UPDATE partner_modifiers SET product_id=$2 WHERE id=$1',[f.modifier,f.foreignProduct]),/Produto/);
 await sql("INSERT INTO partner_modifiers(id,user_id,product_id,name,price_adjustment) VALUES($1,$2,NULL,'Global',0)",[randomUUID(),f.owner]);
});

test('OS requires complete entry checklist and acknowledgment; rejection is atomic',async()=>{
 const stock=await row('SELECT stock FROM partner_products WHERE id=$1',[f.product]);const requests=await admin(()=>row('SELECT count(*) n FROM partner_operations_private.operation_requests'));
 for(const notes of ['No checklist',inspection(),entry().replace('Touch: Não testado','Touch: Invalid'),entry().replace('Touch: Não testado\n',''),entry()+'\n'+inspection()]){
  const id=randomUUID();await assert.rejects(sql('SELECT create_service_order_once($1,$2)',[id,{...payload(),notes}]),/checklist|Checklist/);
  assert.equal(Number((await admin(()=>row('SELECT count(*) n FROM service_orders WHERE id=$1',[id]))).n),0);
 }
 assert.deepEqual(await row('SELECT stock FROM partner_products WHERE id=$1',[f.product]),stock);
 assert.deepEqual(await admin(()=>row('SELECT count(*) n FROM partner_operations_private.operation_requests')),requests);
});

test('OS snapshots entry, actor and warranty; retry after settings change preserves stock and terms',async()=>{
 const id=f.os,p=payload();await sql('SELECT create_service_order_once($1,$2)',[id,p]);
 const saved=await admin(()=>row('SELECT * FROM service_orders WHERE id=$1',[id]));
 assert.equal(saved.inspection_version,1);assert.equal(Object.keys(saved.entry_checklist).length,21);assert.equal(saved.entry_recorded_by,f.owner);assert.equal(saved.customer_acknowledged_by,f.owner);assert.ok(saved.customer_acknowledged_at);assert.equal(saved.warranty_snapshot,'Termo original');
 const stock=await row('SELECT stock FROM partner_products WHERE id=$1',[f.product]);
 await admin(()=>sql("UPDATE store_settings_v2 SET service_warranty_terms='Termo novo' WHERE user_id=$1",[f.owner]));
 await sql('SELECT create_service_order_once($1,$2)',[id,p]);assert.deepEqual(await row('SELECT stock FROM partner_products WHERE id=$1',[f.product]),stock);
 assert.equal((await admin(()=>row('SELECT warranty_snapshot FROM service_orders WHERE id=$1',[id]))).warranty_snapshot,'Termo original');
 await assert.rejects(sql('SELECT create_service_order_once($1,$2)',[randomUUID(),p]),/garantia mudou/);
 await admin(async()=>{
  for(const [field,value] of [['warranty_snapshot','Forged'],['customer_acknowledged_by',f.other],['inspection_version',0],['entry_notes','Forged']])await assert.rejects(sql(`UPDATE service_orders SET ${field}=$2 WHERE id=$1`,[id,value]),/original|originais/);
 });
});

test('OS exit checklist is mandatory through workflow RPC, including old orders',async()=>{
 const update=(id,status,reason)=>sql('SELECT update_service_order_workflow_checked($1,$2,$3,$4,$5,NULL,false) value',[id,status,'Technician','aprovado',reason]);
 await update(f.os,'pronta','Ready');
 for(const id of [f.os,legacy]){
  await assert.rejects(update(id,'finalizada','No inspection'),/checklist de saída/);
  await assert.rejects(update(id,'finalizada',inspection('Celular','saída').replace('Touch: Não testado','Touch: ')),/Touch/);
  const first=(await update(id,'finalizada',inspection('Celular','saída','Funcionando'))).rows[0].value;
  assert.equal(first.status,'finalizada');assert.equal(first.exit_checklist.touch,'Funcionando');assert.equal(first.exit_recorded_by,f.owner);assert.ok(first.exit_recorded_at);
  const second=(await update(id,'finalizada',inspection('Celular','saída','Funcionando'))).rows[0].value;assert.equal(second.exit_recorded_at,first.exit_recorded_at);
 }
 const old=await admin(()=>row('SELECT * FROM service_orders WHERE id=$1',[legacy]));assert.equal(old.inspection_version,0);assert.equal(old.entry_checklist,null);assert.equal(old.customer_acknowledged_at,null);assert.equal(old.warranty_snapshot,null);
});

test('old browser payloads still validate entry and capture the server warranty',async()=>{
 const p=payload();delete p.warranty_terms;p.equipment_type='Impressora';p.notes=inspection('Impressora')+'\nCliente ciente das condições de entrada: sim.';
 const id=randomUUID();await sql('SELECT create_service_order_once($1,$2)',[id,p]);const saved=await admin(()=>row('SELECT * FROM service_orders WHERE id=$1',[id]));assert.equal(Object.keys(saved.entry_checklist).length,8);assert.equal(saved.warranty_snapshot,'Termo novo');
});

test('anonymous callers cannot use creation, workflow or internal functions',async()=>{
 await db.exec('RESET ROLE; SET ROLE anon');
 try{
  await assert.rejects(sql('SELECT create_service_order_once($1,$2)',[randomUUID(),payload()]),/permission denied/);
  await assert.rejects(sql("SELECT update_service_order_workflow_checked($1,'finalizada','','aprovado','',NULL,false)",[f.os]),/permission denied/);
  await assert.rejects(sql("SELECT partner_service_orders_private.parse_checklist('','Celular','entrada')"),/permission denied/);
 }finally{await db.exec('RESET ROLE; SET ROLE authenticated');}
});
