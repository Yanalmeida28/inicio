import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import ts from '../../node_modules/typescript/lib/typescript.js';
import vm from 'node:vm';

test('fiscal patch preserves explicit clearing and omits unrelated/absent attributes', async () => {
 const exports={};
 const source=await readFile(new URL('../../src/lib/productPersistence.ts',import.meta.url),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
 assert.equal(JSON.stringify(exports.productFiscalPatch({barcode:'123',ncm:null,icms_rate:0})),JSON.stringify({ncm:null,icms_rate:0}));
 assert.equal(JSON.stringify(exports.productFiscalPatch({barcode:'123'})),'{}');
});

test('production product mutation persists fiscal fields atomically and guards normalized identifiers',async()=>{
 const db=new PGlite();
 const owner='00000000-0000-0000-0000-000000000001',branch='00000000-0000-0000-0000-000000000002',other='00000000-0000-0000-0000-000000000003';
 try {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE SCHEMA partner_pdv_fix_private; CREATE SCHEMA partner_subscription_private;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULLIF(current_setting('test.uid',true),'')::uuid$$;
 SELECT set_config('test.uid','${owner}',false);
 CREATE TABLE partner_branches(id uuid PRIMARY KEY,user_id uuid);
 CREATE TABLE partner_suppliers(id uuid PRIMARY KEY,user_id uuid);
 CREATE TABLE partner_products(id uuid PRIMARY KEY,user_id uuid,branch_id uuid,name text,cost_price numeric,sale_price numeric,wholesale_price numeric,stock integer,min_stock integer,category text,sku text,barcode text,is_service boolean,image_url text,supplier_id uuid,premium_price numeric,ncm text,cfop text,cst_csosn text,icms_rate numeric DEFAULT 0,pis_rate numeric DEFAULT 0,cofins_rate numeric DEFAULT 0,updated_at timestamptz);
 CREATE TABLE stock_movements(user_id uuid,product_id uuid,product_name text,type text,quantity integer,reason text,branch_id uuid);
 CREATE FUNCTION partner_subscription_private.require_actor(text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF current_setting('test.blocked',true)='yes' THEN RAISE EXCEPTION 'Module denied'; END IF; END$$;
 CREATE FUNCTION partner_subscription_private.require_operator_module(text,uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN END$$;
 CREATE FUNCTION resolve_partner_pdv_operator(uuid,text,uuid) RETURNS TABLE(company_id uuid,role text,branch_id uuid) LANGUAGE sql AS $$SELECT auth.uid(),'administrador'::text,$3$$;
 INSERT INTO partner_branches VALUES ('${branch}','${owner}'),('${other}','${owner}');`);
 await db.exec(await readFile(new URL('./fixtures/product_contract_production.sql',import.meta.url),'utf8'));
 // Existing ambiguous codes must survive migration and unrelated fiscal edits.
 await db.exec(`INSERT INTO partner_products(id,user_id,branch_id,name,barcode,stock) VALUES
 ('00000000-0000-0000-0000-000000000010','${owner}','${branch}','Legacy A','legacy',0),
 ('00000000-0000-0000-0000-000000000011','${owner}','${branch}','Legacy B','legacy',0);`);
 const dir=new URL('../migrations/',import.meta.url);
 const migration=(await readdir(dir)).find(n=>n.endsWith('_product_frontend_database_alignment.sql'));
 await db.exec(await readFile(migration ? new URL(migration,dir) : new URL('../../../../../product-contract-fix.sql',import.meta.url),'utf8'));
 const save=async(id,code,sku=null,fiscal={},b=branch)=> (await db.query(`SELECT public.save_partner_product_profile(NULL,NULL,$1::uuid,$2::uuid,'Product',10,20,15,0,1,NULL,$3,false,NULL,NULL,18,$4,$5::jsonb) saved`,[id,b,sku,code,JSON.stringify(fiscal)])).rows[0].saved;
 const created=await save(null,'001234','FACTORY',{ncm:'12345678',cfop:'5102',cst_csosn:'102',icms_rate:18,pis_rate:1.65,cofins_rate:7.6});
 const persisted=(await db.query('SELECT * FROM partner_products WHERE id=$1',[created.id])).rows[0];
 assert.equal(persisted.ncm,'12345678'); assert.equal(Number(persisted.icms_rate),18); assert.equal(Number(persisted.pis_rate),1.65); assert.equal(Number(persisted.cofins_rate),7.6);
 assert.equal(created.barcode,'001234'); assert.equal(created.cfop,'5102'); assert.equal(created.cst_csosn,'102');
 await save(created.id,'001234','FACTORY',{});
 assert.equal((await db.query('SELECT ncm FROM partner_products WHERE id=$1',[created.id])).rows[0].ncm,'12345678');
 const cleared=await save(created.id,'001234','FACTORY',{ncm:null,cfop:null,cst_csosn:null,icms_rate:0});
 assert.equal(cleared.ncm,null); assert.equal(cleared.icms_rate,0);
 const count=async()=>Number((await db.query('SELECT count(*) n FROM partner_products')).rows[0].n);
 const before=await count();
 for(const fiscal of [{icms_rate:101},{pis_rate:-1},{cofins_rate:'NaN'},{stock:999}]) await assert.rejects(save(null,'invalid',null,fiscal),/alíquotas|fiscal/);
 assert.equal(await count(),before);
 await assert.rejects(save(null,' factory '),/já pertence/);
 await assert.rejects(save(null,'new-code',' 001234 '),/já pertence/);
 assert.equal(await count(),before);
 await save(null,'001234',null,{},other); // Different branches are independent.
 const second=await save(null,'other-code');
 await assert.rejects(db.query('UPDATE partner_products SET barcode=$1 WHERE id=$2',['001234',second.id]),/já pertence/);
 assert.equal((await db.query('SELECT barcode FROM partner_products WHERE id=$1',[second.id])).rows[0].barcode,'other-code');
 await save('00000000-0000-0000-0000-000000000010','legacy',null,{ncm:'87654321'});
 assert.equal((await db.query("SELECT count(*)::int n FROM partner_products WHERE barcode='legacy'")).rows[0].n,2);
 await db.exec("SELECT set_config('test.blocked','yes',false)");
 await assert.rejects(save(created.id,'001234','FACTORY'),/Module denied/);
 await db.exec("SELECT set_config('test.blocked','no',false); SELECT set_config('test.uid','',false)");
 await assert.rejects(save(null,'anonymous'),/Não autenticado/);
 const grants=(await db.query(`SELECT has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') member FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='save_partner_product_profile'`)).rows[0];
 assert.equal(grants.anon,false); assert.equal(grants.member,true);
 }finally{await db.close();}
});

