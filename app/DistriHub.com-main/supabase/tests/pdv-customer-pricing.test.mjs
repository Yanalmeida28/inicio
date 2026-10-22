import assert from 'node:assert/strict';
import { test, before, beforeEach, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const owner='00000000-0000-0000-0000-000000000001',branch='00000000-0000-0000-0000-000000000002',customer='00000000-0000-0000-0000-000000000003',product='00000000-0000-0000-0000-000000000004',other='00000000-0000-0000-0000-000000000005',saleId='00000000-0000-0000-0000-000000000006';
before(async()=>{
 try {
  await db.exec(await read('./fixtures/pdv_schema.sql'));
  await db.exec(await read('./fixtures/pdv_production.sql'));
  await db.exec(await read('../migrations/20260928044542_fix_pdv_sales_reconciliation.sql'));
  await db.exec(await read('../migrations/20260928195329_enforce_pdv_authoritative_pricing.sql'));
  await db.exec(`CREATE SCHEMA partner_cash_private; CREATE SCHEMA partner_subscription_private;
   CREATE FUNCTION partner_subscription_private.require_actor(text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF; END$$;
   CREATE FUNCTION partner_subscription_private.require_operator_module(text,uuid) RETURNS void LANGUAGE sql AS $$SELECT$$;
   ALTER TABLE partner_products ADD COLUMN cost_price numeric,ADD COLUMN min_stock integer,ADD COLUMN sku text,ADD COLUMN category text,ADD COLUMN image_url text,ADD COLUMN supplier_id uuid;
   CREATE TABLE partner_suppliers(id uuid,user_id uuid);`);
  await db.exec(await read('../migrations/20261014210022_fix_pdv_presales_and_customer_price_tables.sql'));
  await db.exec(await read('../migrations/20261022185925_add_product_barcode.sql'));
 } catch(error){console.error(error.message,error.position,error.internalQuery);throw error;}
});
after(()=>db.close());
beforeEach(async()=>{
 await db.exec('TRUNCATE partner_audit_logs,stock_movements,partner_invoices,partner_sales,partner_products,partner_customers,partner_profiles,partner_branches,partner_pdv_price_snapshots CASCADE');
 await db.query("SELECT set_config('test.auth_uid',$1,false)",[owner]);
 await db.query("INSERT INTO partner_profiles(id) VALUES($1),($2)",[owner,other]);
 await db.query('INSERT INTO partner_branches VALUES($1,$2)',[branch,owner]);
 await db.query("INSERT INTO partner_customers(id,user_id,branch_id,customer_type,price_table,is_active) VALUES($1,$2,$3,'varejo','premium',true)",[customer,owner,branch]);
 await db.query("INSERT INTO partner_products(id,user_id,branch_id,name,stock,sale_price,wholesale_price,premium_price) VALUES($1,$2,$3,'Produto',10,100,80,140)",[product,owner,branch]);
});
const item=price=>JSON.stringify([{product_id:product,name:'Produto',quantity:1,unit_price:price}]);
const validate=(price)=>db.query('SELECT partner_cash_private.validate_partner_pdv_negotiated_prices($1,$2,$3,$4,$5::jsonb,$6,false) AS total',[owner,branch,customer,'varejo',item(price),price]);
const mutate=(price)=>db.query('SELECT execute_partner_product_priced_mutation(NULL,NULL,$1,$2,$3,10,100,80,10,1,NULL,NULL,false,NULL,NULL,$4) AS id',[product,branch,'Produto',price]);
const barcodeMutation=(id,barcode,image=null)=>db.query('SELECT execute_partner_product_barcode_mutation(NULL,NULL,$1,$2,$3,10,100,80,10,1,NULL,$4,false,$6,NULL,140,$5) AS id',[id,branch,'Produto','INTERNO-42',barcode,image]);

test('product photo survives database reload and barcode edits and can be explicitly removed',async()=>{
 const image='https://storage.test/storage/v1/object/public/product-photos/photo.jpg';
 const id=(await barcodeMutation(null,'0012345678905',image)).rows[0].id;
 const readPhoto=async()=> (await db.query('SELECT image_url FROM partner_products WHERE id=$1',[id])).rows[0].image_url;
 assert.equal(await readPhoto(),image);
 await barcodeMutation(id,'0098765432109',image);assert.equal(await readPhoto(),image);
 await barcodeMutation(id,'0098765432109',null);assert.equal(await readPhoto(),null);
});

test('barcode persists independently of SKU on create, update and clear, preserving leading zeroes',async()=>{
 const id=(await barcodeMutation(null,' 0012345678905 ')).rows[0].id;
 const codes=async()=> (await db.query('SELECT sku,barcode FROM partner_products WHERE id=$1',[id])).rows[0];
 assert.deepEqual(await codes(),{sku:'INTERNO-42',barcode:'0012345678905'});
 await barcodeMutation(id,'0098765432109');
 assert.deepEqual(await codes(),{sku:'INTERNO-42',barcode:'0098765432109'});
 await barcodeMutation(id,null);
 assert.deepEqual(await codes(),{sku:'INTERNO-42',barcode:null});
 await barcodeMutation(id,'0012345678905');
 await db.query("SELECT set_config('test.auth_uid',$1,false)",[other]);
 await assert.rejects(barcodeMutation(id,'999'),/Filial|empresa/);
 assert.deepEqual(await codes(),{sku:'INTERNO-42',barcode:'0012345678905'});
 await db.query("SELECT set_config('test.auth_uid','',false)");
 await assert.rejects(barcodeMutation(id,'999'),/autenticado/);
});
const sale=(status='pre_venda')=>db.query('SELECT execute_partner_sale_mutation(NULL,NULL,$1,$2,$3,$4::jsonb,140,NULL,NULL,$5,$6,$7,$8,$9,$10,NULL) AS id',[saleId,customer,'Cliente',item(140),status==='concluida'?'pix':null,branch,status,'pdv','varejo','balcao']);

test('customer price table overrides commercial type and Premium requires its own product price',async()=>{
 assert.equal(Number((await validate(140)).rows[0].total),140);
 await assert.rejects(validate(100),/alterar o preco/);
 await db.query("UPDATE partner_customers SET price_table='atacado' WHERE id=$1",[customer]);
 assert.equal(Number((await validate(80)).rows[0].total),80);
 await db.query("UPDATE partner_customers SET price_table='varejo' WHERE id=$1",[customer]);
 assert.equal(Number((await validate(100)).rows[0].total),100);
 await db.query("UPDATE partner_customers SET price_table='premium' WHERE id=$1",[customer]);
 await mutate(null);await assert.rejects(validate(140),/Preco do cadastro invalido/);
});

test('Premium product creation/update preserves valid zero, rejects invalid values and foreign identities',async()=>{
 await mutate(155.25);assert.equal(Number((await db.query('SELECT premium_price FROM partner_products')).rows[0].premium_price),155.25);
 for(const invalid of [-1,1.001,'NaN','Infinity'])await assert.rejects(mutate(invalid),/Premium inválido/);
 assert.equal(Number((await db.query('SELECT premium_price FROM partner_products')).rows[0].premium_price),155.25);
 await mutate(0);assert.equal(Number((await db.query('SELECT premium_price FROM partner_products')).rows[0].premium_price),0);
 await db.query("SELECT set_config('test.auth_uid',$1,false)",[other]);await assert.rejects(mutate(1),/Filial|empresa/);
});

test('inactive customers cannot start new sales or finalize old quotes; rejected checkout preserves stock',async()=>{
 await sale();
 await db.query('UPDATE partner_customers SET is_active=false WHERE id=$1',[customer]);
 await assert.rejects(validate(140),/Cliente invalido/);
 await assert.rejects(sale('concluida'),/Cliente inativo|Cliente invalido/);
 assert.equal((await db.query('SELECT stock FROM partner_products')).rows[0].stock,10);
 assert.equal((await db.query('SELECT status FROM partner_sales')).rows[0].status,'pre_venda');
 await db.query('UPDATE partner_customers SET is_active=true WHERE id=$1',[customer]);
 await sale('concluida');assert.equal((await db.query('SELECT stock FROM partner_products')).rows[0].stock,9);
});
