import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const sql=(s,args=[])=>db.query(s,args);
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
let owner,other,branch,closedBranch,product;
before(async()=>{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated;
    CREATE SCHEMA partner_subscription_private;
    CREATE FUNCTION public.partner_has_saas_access(company uuid,feature text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid()=company AND current_setting('test.branding',true)='true' $$;
    CREATE TABLE store_settings_v2(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE NOT NULL,logo_url text,primary_color text DEFAULT '#3193e5',nav_color text DEFAULT '#0f2747',internal_notice text,updated_at timestamptz,banner_url text,warranty_terms text,receipt_footer_text text,show_logo_on_receipt boolean DEFAULT true,show_cnpj_on_receipt boolean DEFAULT true,catalog_slug text,catalog_enabled boolean DEFAULT false,catalog_oos_behavior text,social_facebook text,social_instagram text,social_whatsapp text,business_hours text,created_at timestamptz DEFAULT now(),service_warranty_terms text);
    ALTER TABLE store_settings_v2 ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_settings ON store_settings_v2 TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
    GRANT SELECT,INSERT,UPDATE ON store_settings_v2 TO authenticated;
    CREATE VIEW partner_store_settings WITH(security_invoker=true) AS SELECT * FROM store_settings_v2;
    GRANT SELECT ON partner_store_settings TO authenticated;
    CREATE TABLE partner_profiles(id uuid PRIMARY KEY,business_name text,account_name text);
    CREATE TABLE partner_branches(id uuid PRIMARY KEY,user_id uuid,name text,address text,is_active boolean);
    CREATE TABLE partner_products(id uuid PRIMARY KEY,user_id uuid,branch_id uuid,name text,sale_price numeric,wholesale_price numeric,image_url text,stock integer,category text,sku text,is_service boolean,created_at timestamptz DEFAULT now());`);
  await db.exec(await read('./fixtures/branding_guard_production.sql'));
  await db.exec('CREATE TRIGGER branding BEFORE INSERT OR UPDATE ON store_settings_v2 FOR EACH ROW EXECUTE FUNCTION partner_subscription_private.guard_branding()');
  await db.exec(await read('../migrations/20261009194603_expand_store_personalization.sql'));
});
after(()=>db.close());
async function login(id,role='authenticated',branding=false){
  await db.exec('RESET ROLE');
  await sql("SELECT set_config('test.uid',$1,false),set_config('test.branding',$2,false)",[id??'',String(branding)]);
  await db.exec(`SET ROLE ${role}`);
}
beforeEach(async()=>{
  await login(null,'postgres');
  await db.exec('TRUNCATE store_settings_v2,partner_profiles,partner_branches,partner_products');
  [owner,other,branch,closedBranch,product]=Array.from({length:5},()=>randomUUID());
  await sql("INSERT INTO partner_profiles VALUES($1,'Loja teste','Loja'),($2,'Outra loja','Outra')",[owner,other]);
  await sql("INSERT INTO partner_branches VALUES($1,$3,'Centro','Rua exemplo',true),($2,$3,'Fechada','Outro endereço',false)",[branch,closedBranch,owner]);
  await sql("INSERT INTO partner_products(id,user_id,branch_id,name,sale_price,wholesale_price,stock,sku,is_service) VALUES($1,$2,$3,'Produto',100,55,10,'001',false),($4,$2,$5,'Não publicar',100,50,10,'002',false)",[product,owner,branch,randomUUID(),closedBranch]);
  await sql("INSERT INTO store_settings_v2(user_id,catalog_slug,catalog_enabled,internal_notice,personalization) VALUES($1,'loja-teste',true,'Segredo interno',$3::jsonb),($2,'desativada',false,'Outro segredo','{}')",[owner,other,JSON.stringify({receipt:{header_text:'Texto privado'},panel:{text_size:'large'},catalog:{welcome_message:'Bem-vindo!',whatsapp_phone:'11999999999',secret_key:'Não publicar'}})]);
});
test('receipt options save on the basic plan while visual options keep the Enterprise restriction',async()=>{
  await login(owner);
  await sql("UPDATE store_settings_v2 SET personalization=jsonb_set(personalization,'{receipt}','{\"paper_width\":\"58\",\"font_size\":14}') WHERE user_id=$1",[owner]);
  await assert.rejects(sql("UPDATE store_settings_v2 SET personalization=jsonb_set(personalization,'{panel}','{\"density\":\"compact\"}') WHERE user_id=$1",[owner]),/Enterprise/);
  await login(owner,'authenticated',true);
  await sql("UPDATE store_settings_v2 SET personalization=jsonb_set(personalization,'{panel}','{\"density\":\"compact\"}') WHERE user_id=$1",[owner]);
  const settings=(await sql('SELECT personalization FROM partner_store_settings WHERE user_id=$1',[owner])).rows[0].personalization;
  assert.equal(settings.receipt.paper_width,'58');
  assert.equal(settings.panel.density,'compact');
});
test('public catalog reads only enabled stores and approved fields, with private base tables still inaccessible',async()=>{
  await login(null,'anon');
  const data=(await sql("SELECT read_public_store_catalog('loja-teste') AS data")).rows[0].data;
  assert.equal(data.products.length,1);
  assert.equal(data.products[0].id,product);
  assert.equal(data.settings.catalog_preferences.welcome_message,'Bem-vindo!');
  const content=JSON.stringify(data);
  for(const hidden of ['internal_notice','Segredo interno','Texto privado','secret_key','wholesale_price','user_id','Não publicar']) assert.ok(!content.includes(hidden),hidden);
  assert.equal((await sql("SELECT read_public_store_catalog('desativada') AS data")).rows[0].data,null);
  await assert.rejects(sql('SELECT * FROM store_settings_v2'),/permission denied/);
  await assert.rejects(sql("UPDATE store_settings_v2 SET personalization='{}'"),/permission denied/);
});
test('public branch lookup scopes products and does not show inactive or unknown branches',async()=>{
  await login(null,'anon');
  const data=(await sql("SELECT read_public_store_catalog('loja-teste','Centro') AS data")).rows[0].data;
  assert.equal(data.branch.id,branch);
  assert.equal(data.products.length,1);
  assert.equal((await sql("SELECT read_public_store_catalog('loja-teste','Fechada') AS data")).rows[0].data.products.length,0);
  assert.equal((await sql("SELECT read_public_store_catalog('loja-teste','Desconhecida') AS data")).rows[0].data.products.length,0);
});
test('personalization remains isolated by owner and rejects non-object preferences',async()=>{
  await login(other,'authenticated',true);
  assert.equal((await sql('SELECT * FROM partner_store_settings WHERE user_id=$1',[owner])).rows.length,0);
  assert.equal((await sql("UPDATE store_settings_v2 SET personalization='{}' WHERE user_id=$1 RETURNING id",[owner])).rows.length,0);
  await login(owner,'authenticated',true);
  await assert.rejects(sql("UPDATE store_settings_v2 SET personalization='[]' WHERE user_id=$1",[owner]),/check constraint/);
  await login(null,'authenticated');
  await assert.rejects(sql("SELECT read_public_store_catalog('loja-teste')"),/Não autenticado/);
});
