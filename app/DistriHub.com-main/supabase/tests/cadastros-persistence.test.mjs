import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const migration = await readFile(new URL('../migrations/20261014201623_fix_cadastros_xml_customer_and_permissions.sql',import.meta.url),'utf8');
const owner='00000000-0000-0000-0000-000000000001', branch='00000000-0000-0000-0000-000000000002', employee='00000000-0000-0000-0000-000000000003', operator='00000000-0000-0000-0000-000000000004', other='00000000-0000-0000-0000-000000000005', foreignBranch='00000000-0000-0000-0000-000000000006', customer='00000000-0000-0000-0000-000000000007';
const textFields=['name','document','phone','email','address','neighborhood','city','device_model','notes','trade_name','rg','municipal_registration','state_registration','suframa_id','sex','address_number','zip_code','state','complement','reference_point','country','customer_group','price_table','phone_commercial_1','phone_commercial_2','photo_url'];
async function database() {
 const db=new PGlite();
 try {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA partner_subscription_private;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('app.actor',true),'')::uuid$$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES('${owner}'),('${employee}'),('${other}');
 CREATE TABLE partner_branches(id uuid PRIMARY KEY,user_id uuid); INSERT INTO partner_branches VALUES('${branch}','${owner}'),('${foreignBranch}','${other}');
 CREATE TABLE partner_salespeople(id uuid PRIMARY KEY,user_id uuid,auth_user_id uuid,active boolean,role text,branch_id uuid,blocked_modules text[]);
 INSERT INTO partner_salespeople VALUES('${operator}','${owner}','${employee}',true,'vendedor','${branch}','{}');
 CREATE FUNCTION partner_subscription_private.require_actor(text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF auth.uid() IS NULL OR EXISTS(SELECT 1 FROM public.partner_salespeople WHERE auth_user_id=auth.uid() AND (NOT active OR $1=ANY(blocked_modules))) THEN RAISE EXCEPTION 'Acesso bloqueado'; END IF; END$$;
 CREATE FUNCTION partner_subscription_private.require_operator_module(text,uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF EXISTS(SELECT 1 FROM public.partner_salespeople WHERE id=$2 AND $1=ANY(blocked_modules)) THEN RAISE EXCEPTION 'Operador bloqueado'; END IF; END$$;
 CREATE FUNCTION resolve_partner_operator(uuid,text,uuid) RETURNS TABLE(company_id uuid,salesperson_id uuid,role text,branch_id uuid) LANGUAGE plpgsql AS $$BEGIN
 IF auth.uid()='${owner}'::uuid AND $1 IS NULL THEN RETURN QUERY SELECT auth.uid(),null::uuid,'administrador'::text,$3; RETURN; END IF;
 IF $2='1234' AND EXISTS(SELECT 1 FROM public.partner_salespeople s WHERE s.id=$1 AND s.auth_user_id=auth.uid() AND s.active AND s.branch_id=$3) THEN RETURN QUERY SELECT s.user_id,s.id,s.role,s.branch_id FROM public.partner_salespeople s WHERE s.id=$1; RETURN; END IF;
 RAISE EXCEPTION 'Operador inválido'; END$$;
 CREATE TABLE partner_customers(id uuid PRIMARY KEY,user_id uuid,branch_id uuid,${textFields.map(f=>f+' text').join(',')},person_type text DEFAULT 'PF',customer_type text DEFAULT 'varejo',birthday date,credit_limit numeric DEFAULT 0,salesperson_id uuid,convenio text,${['allow_credit','ie_isento','simples_nacional','reter_iss','is_active','is_store_admin'].map(f=>f+' boolean DEFAULT false').join(',')});
 INSERT INTO partner_customers(id,user_id,branch_id,name) VALUES('${customer}','${owner}','${branch}','Cliente');
 CREATE TABLE partner_suppliers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,name text,phone text,payable_balance numeric);
 CREATE TABLE partner_products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,branch_id uuid,name text,sku text,cost_price numeric,sale_price numeric,wholesale_price numeric,stock integer,min_stock integer,is_service boolean,supplier_id uuid,ncm text,updated_at timestamptz);
 CREATE TABLE stock_movements(user_id uuid,product_id uuid,product_name text,type text,quantity integer,reason text,branch_id uuid);
 CREATE TABLE partner_categories(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,name text);
 CREATE TABLE partner_combos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,name text,price numeric,items jsonb);
 CREATE TABLE partner_modifiers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,product_id uuid,name text,price_adjustment numeric);
 CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
 ALTER TABLE partner_categories ENABLE ROW LEVEL SECURITY; ALTER TABLE partner_combos ENABLE ROW LEVEL SECURITY; ALTER TABLE partner_modifiers ENABLE ROW LEVEL SECURITY;
 GRANT USAGE ON SCHEMA public,auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
 GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
 SELECT set_config('app.actor','${owner}',false);`);
 await db.exec(migration);
 } catch (error) { await db.close(); throw error; }
 return db;
}
const invoice=(key='1'.repeat(44),items=[{name:'Peça',sku:'P1',qty:2,cost:12.5,ncm:'12345678'}])=>({invoiceKey:key,supplier:{name:'Fornecedor',document:'12345678000199',phone:null},items});
const importInvoice=(db,data,branchId=branch,operatorId=null,pin=null)=>db.query('SELECT import_partner_stock_xml($1,$2::jsonb,$3,$4) AS result',[branchId,JSON.stringify(data),operatorId,pin]);

test('XML import is atomic, preserves prices, reconciles SKU per branch and replays without duplicate stock',async()=>{
 const db=await database();
 try {
  const first=await importInvoice(db,invoice());
  assert.equal((await db.query('SELECT stock,cost_price FROM partner_products')).rows[0].stock,2);
  assert.equal(Number((await db.query('SELECT cost_price FROM partner_products')).rows[0].cost_price),12.5);
  await db.exec('UPDATE partner_products SET sale_price=99');
  const replay=await importInvoice(db,invoice()); assert.deepEqual(replay.rows,first.rows);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM stock_movements')).rows[0].n,1);
  await importInvoice(db,invoice('2'.repeat(44)));
  const product=(await db.query('SELECT stock,sale_price FROM partner_products')).rows[0]; assert.equal(product.stock,4);assert.equal(Number(product.sale_price),99);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM partner_suppliers')).rows[0].n,1);
  await assert.rejects(importInvoice(db,invoice('1'.repeat(44),[{name:'Alterado',sku:'P1',qty:3,cost:1}])),/outros dados/);
  await assert.rejects(importInvoice(db,invoice('3'.repeat(44),[{name:'Válido',sku:'P2',qty:1,cost:1},{name:'Inválido',sku:'P3',qty:0.5,cost:1}])),/inválido/);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM partner_products WHERE sku='P2'")).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM partner_cadastros_private.xml_receipts')).rows[0].n,2);
  await assert.rejects(importInvoice(db,invoice('4'.repeat(44)),foreignBranch),/Filial/);
 } finally {await db.close();}
});

test('customer profile persists extended fields and clears nullable fields, rejects foreign identities and photos',async()=>{
 const db=await database();
 const update=(fields)=>db.query('SELECT update_partner_customer_profile($1,$2::jsonb) AS customer',[customer,JSON.stringify(fields)]);
 try {
  await update({trade_name:'Nome fantasia',zip_code:'12345678',state:'SP',address_number:'10',price_table:'atacado',phone_commercial_1:'11999999999',notes:'Observação',person_type:'PJ',document:'12345678000199',is_active:false});
  const saved=(await db.query('SELECT * FROM partner_customers WHERE id=$1',[customer])).rows[0];
  assert.equal(saved.trade_name,'Nome fantasia');assert.equal(saved.zip_code,'12345678');assert.equal(saved.person_type,'PJ');assert.equal(saved.is_active,false);
  await update({notes:null,user_id:other,id:other});const cleared=(await db.query('SELECT * FROM partner_customers')).rows[0];assert.equal(cleared.notes,null);assert.equal(cleared.user_id,owner);assert.equal(cleared.id,customer);
  await assert.rejects(update({photo_url:'foreign/path.jpg'}),/Foto/);
  const path=owner+'/'+customer+'/photo.jpg';await db.query('INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)',['customer-photos',path]);
  await update({photo_url:path});assert.equal((await db.query('SELECT photo_url FROM partner_customers')).rows[0].photo_url,path);
  await update({photo_url:null});assert.equal((await db.query('SELECT photo_url FROM partner_customers')).rows[0].photo_url,null);
  await db.query("SELECT set_config('app.actor',$1,false)",[other]);await assert.rejects(update({name:'Ataque'}),/Operador/);
 } finally {await db.close();}
});

test('authorized employee can manage categories and own-branch kits/modifiers but not foreign records',async()=>{
 const db=await database();
 try {
  const own=(await importInvoice(db,invoice())).rows[0].result.product_ids[0];
  await db.query('INSERT INTO partner_products(id,user_id,branch_id,name) VALUES($1,$2,$3,$4)',[other,other,foreignBranch,'Outro']);
  await db.query("SELECT set_config('app.actor',$1,false)",[employee]);
  await db.exec('SET ROLE authenticated');
  await db.query('INSERT INTO partner_categories(user_id,name) VALUES($1,$2)',[owner,'Categoria']);
  await db.query('INSERT INTO partner_modifiers(user_id,product_id,name,price_adjustment) VALUES($1,$2,$3,1)',[owner,own,'Modificador']);
  await db.query('INSERT INTO partner_combos(user_id,name,price,items) VALUES($1,$2,10,$3::jsonb)',[owner,'Kit',JSON.stringify([{product_id:own,quantity:1}])]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM partner_combos')).rows[0].n,1);
  await assert.rejects(db.query('INSERT INTO partner_categories(user_id,name) VALUES($1,$2)',[other,'Ataque']),/row-level security/);
  await assert.rejects(db.query('INSERT INTO partner_modifiers(user_id,product_id,name) VALUES($1,$2,$3)',[owner,other,'Ataque']),/row-level security/);
  await assert.rejects(db.query('INSERT INTO partner_combos(user_id,name,price,items) VALUES($1,$2,-1,$3::jsonb)',[owner,'Kit',JSON.stringify([{product_id:own,quantity:1}])]),/preço/);
  await db.exec('RESET ROLE');
  await db.query("UPDATE partner_salespeople SET blocked_modules=ARRAY['cadastros'] WHERE id=$1",[operator]);
  await db.exec('SET ROLE authenticated');
  await assert.rejects(db.query('INSERT INTO partner_categories(user_id,name) VALUES($1,$2)',[owner,'Bloqueada']),/row-level security/);
 } finally {await db.close();}
});
