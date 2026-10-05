import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('product supplier persists, can be cleared, and rejects suppliers from another company', async () => {
  const db = new PGlite();
  const owner='00000000-0000-0000-0000-000000000001';
  const branch='00000000-0000-0000-0000-000000000002';
  const supplier='00000000-0000-0000-0000-000000000003';
  const foreign='00000000-0000-0000-0000-000000000004';
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT ''${owner}''::uuid';
      CREATE TABLE partner_branches(id uuid PRIMARY KEY,user_id uuid);
      CREATE TABLE partner_suppliers(id uuid PRIMARY KEY,user_id uuid);
      CREATE TABLE partner_salespeople(id uuid,user_id uuid,role text,branch_id uuid,active boolean,pin_hash text,auth_user_id uuid);
      CREATE FUNCTION verify_partner_salesperson_pin(text,text) RETURNS boolean LANGUAGE sql AS 'SELECT false';
      CREATE TABLE partner_products(id uuid PRIMARY KEY,user_id uuid,branch_id uuid,name text,cost_price numeric,sale_price numeric,wholesale_price numeric,stock integer,min_stock integer,category text,sku text,is_service boolean,image_url text,updated_at timestamptz);
      CREATE TABLE stock_movements(user_id uuid,product_id uuid,product_name text,type text,quantity integer,reason text,branch_id uuid);
      INSERT INTO partner_branches VALUES ('${branch}','${owner}');
      INSERT INTO partner_suppliers VALUES ('${supplier}','${owner}'),('${foreign}','${foreign}');`);
    await db.exec(await readFile(new URL('../migrations/20260921120000_fix_product_mutation_target_id.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../migrations/20261005161213_add_product_supplier.sql',import.meta.url),'utf8'));
    const mutate=async (id,supplierId) => (await db.query(`SELECT execute_partner_product_mutation(null::uuid,null::text,$1::uuid,$2::uuid,'Produto'::text,10::numeric,20::numeric,15::numeric,3::integer,1::integer,null::text,null::text,false,null::text,$3::uuid) AS id`,[id,branch,supplierId])).rows[0].id;
    const id=await mutate(null,supplier);
    assert.equal((await db.query('SELECT supplier_id FROM partner_products WHERE id=$1',[id])).rows[0].supplier_id,supplier);
    await assert.rejects(mutate(id,foreign),/Fornecedor nao pertence a empresa/);
    assert.equal((await db.query('SELECT supplier_id FROM partner_products WHERE id=$1',[id])).rows[0].supplier_id,supplier);
    await mutate(id,null);
    assert.equal((await db.query('SELECT supplier_id FROM partner_products WHERE id=$1',[id])).rows[0].supplier_id,null);
    await mutate(id,supplier);
    await db.query('DELETE FROM partner_suppliers WHERE id=$1',[supplier]);
    assert.equal((await db.query('SELECT supplier_id FROM partner_products WHERE id=$1',[id])).rows[0].supplier_id,null);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM stock_movements')).rows[0].count,1);
  } finally { await db.close(); }
});
