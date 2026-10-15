import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
const db=new PGlite();
const owner=randomUUID(),other=randomUUID(),branch=randomUUID(),customer=randomUUID(),product=randomUUID();
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
const sql=(q,a=[])=>db.query(q,a);
before(async()=>{
 await db.exec(await read('./fixtures/pdv_schema.sql'));
 await db.exec(await read('./fixtures/pdv_payment_production.sql'));
 await db.exec(await read('../migrations/20260929181116_fix_partner_invoice_payment_profile.sql'));
 await db.exec(`CREATE SCHEMA partner_subscription_private;
 CREATE FUNCTION partner_subscription_private.require_actor(text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF; END$$;
 CREATE FUNCTION public.partner_has_saas_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
 CREATE FUNCTION public.partner_employee_can_access_branch(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 GRANT SELECT ON public.partner_customers,public.partner_branches,public.partner_salespeople TO authenticated;
 ALTER TABLE public.partner_products ADD COLUMN cost_price numeric DEFAULT 10;
 ALTER TABLE public.partner_customers ADD COLUMN address text,ADD COLUMN address_number text,ADD COLUMN complement text,ADD COLUMN neighborhood text,ADD COLUMN city text,ADD COLUMN state text,ADD COLUMN zip_code text,ADD COLUMN phone text;
 ALTER TABLE public.partner_sales ADD COLUMN delivery_status text,ADD COLUMN delivery_driver_id uuid;
 CREATE TABLE public.rma_requests_v2(id uuid PRIMARY KEY,user_id uuid,branch_id uuid);
 ALTER TABLE public.rma_requests_v2 ENABLE ROW LEVEL SECURITY;
 CREATE POLICY rma_select ON public.rma_requests_v2 FOR SELECT TO authenticated USING(user_id=auth.uid());
 GRANT SELECT ON public.rma_requests_v2 TO authenticated;
 CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$SELECT string_to_array($1,'/')$$;
 GRANT USAGE ON SCHEMA storage,auth TO authenticated;
 GRANT SELECT,INSERT,UPDATE ON storage.objects TO authenticated;
 CREATE FUNCTION public.execute_partner_delivery_mutation(uuid,text,uuid,text,uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 UPDATE public.partner_sales SET delivery_status=$4,delivery_driver_id=$5 WHERE id=$3 AND user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Acesso negado'; END IF;RETURN true;END$$;`);
 await db.exec(await read('../migrations/20261011231054_complete_operational_modules.sql'));
 await sql("SELECT set_config('test.auth_uid',$1,false)",[owner]);
 await sql('INSERT INTO partner_profiles(id) VALUES($1),($2)',[owner,other]);
 await sql('INSERT INTO partner_branches(id,user_id) VALUES($1,$2)',[branch,owner]);
 await sql("INSERT INTO partner_customers(id,user_id,branch_id,address,phone) VALUES($1,$2,$3,'Rua A','11999999999')",[customer,owner,branch]);
 await sql("INSERT INTO partner_products(id,user_id,branch_id,name,stock,cost_price) VALUES($1,$2,$3,'Produto',20,10)",[product,owner,branch]);
});
after(()=>db.close());
test('recebimento com identificador: repetição não duplica; valores iguais com identificadores diferentes são legítimos',async()=>{
 const invoice=randomUUID(),request=randomUUID();
 await sql("INSERT INTO partner_invoices(id,user_id,amount,status) VALUES($1,$2,100,'aberta')",[invoice,owner]);
 for(let i=0;i<2;i++)await sql('SELECT record_partner_invoice_payment_once($1,20,$2)',[invoice,request]);
 assert.equal(Number((await sql('SELECT paid_amount FROM partner_invoices WHERE id=$1',[invoice])).rows[0].paid_amount),20);
 await sql('SELECT record_partner_invoice_payment_once($1,20,$2)',[invoice,randomUUID()]);
 assert.equal(Number((await sql('SELECT paid_amount FROM partner_invoices WHERE id=$1',[invoice])).rows[0].paid_amount),40);
 await assert.rejects(sql('SELECT record_partner_invoice_payment_once($1,30,$2)',[invoice,request]),/outro recebimento/);
 await sql("SELECT set_config('test.auth_uid',$1,false)",[other]);
 await assert.rejects(sql('SELECT record_partner_invoice_payment_once($1,20,$2)',[invoice,request]),/Fatura nao encontrada/);
 await sql("SELECT set_config('test.auth_uid',$1,false)",[owner]);
});
test('manual-customer invoices receive partial and final payment without a customer registry link',async()=>{
 const id=randomUUID(),first=randomUUID(),second=randomUUID();
 await sql("INSERT INTO partner_invoices(id,user_id,customer_id,customer_name,amount,status) VALUES($1,$2,NULL,'Cliente manual da OS',80,'aberta')",[id,owner]);
 for(let i=0;i<2;i++)await sql('SELECT record_partner_invoice_payment_once($1,30,$2)',[id,first]);
 assert.equal(Number((await sql('SELECT paid_amount FROM partner_invoices WHERE id=$1',[id])).rows[0].paid_amount),30);
 await sql('SELECT record_partner_invoice_payment_once($1,50,$2)',[id,second]);
 const row=(await sql('SELECT customer_id,customer_name,paid_amount,status FROM partner_invoices WHERE id=$1',[id])).rows[0];
 assert.equal(row.customer_id,null);assert.equal(row.customer_name,'Cliente manual da OS');assert.equal(Number(row.paid_amount),80);assert.equal(row.status,'paga');
});

test('nova venda captura custo e endereço; mudanças de cadastro não reescrevem histórico',async()=>{
 const sale=randomUUID();
 await sql("INSERT INTO partner_sales(id,user_id,customer_id,items,total,status,delivery_type) VALUES($1,$2,$3,$4::jsonb,100,'concluida','entrega')",[sale,owner,customer,JSON.stringify([{product_id:product,quantity:1,unit_price:100}])]);
 await sql('UPDATE partner_products SET cost_price=99 WHERE id=$1',[product]);
 await sql("UPDATE partner_customers SET address='Rua B' WHERE id=$1",[customer]);
 await sql("UPDATE partner_sales SET customer_name='Nome corrigido' WHERE id=$1",[sale]);
 const row=(await sql('SELECT * FROM partner_sales WHERE id=$1',[sale])).rows[0];
 assert.equal(Number(row.cost_snapshot[product]),10);assert.equal(row.delivery_address,'Rua A');assert.equal(row.delivery_contact,'11999999999');
});
test('entrega exige recebedor/motivo e grava detalhes com histórico; empresa alheia é bloqueada',async()=>{
 const sale=randomUUID();
 await sql("INSERT INTO partner_sales(id,user_id,items,total,status,delivery_type) VALUES($1,$2,'[]',0,'concluida','entrega')",[sale,owner]);
 const save=(status,details)=>sql('SELECT save_partner_delivery_details(NULL,NULL,$1,$2,NULL,$3::jsonb)',[sale,status,JSON.stringify(details)]);
 await assert.rejects(save('falhou',{address:'Rua C'}),/motivo/);
 await assert.rejects(save('entregue',{address:'Rua C'}),/recebeu/);
 await save('falhou',{address:'Rua C',contact:'1199',failure_reason:'Cliente ausente',scheduled_date:'2026-10-12'});
 await save('pendente',{address:'Rua C',scheduled_date:'2026-10-13'});
 await save('entregue',{address:'Rua C',received_by:'Maria'});
 const row=(await sql('SELECT * FROM partner_sales WHERE id=$1',[sale])).rows[0];assert.equal(row.delivery_details.received_by,'Maria');assert.ok(row.delivery_details.delivered_at);assert.ok(row.delivery_history.some(e=>e.details?.failure_reason==='Cliente ausente'));
 await sql("SELECT set_config('test.auth_uid',$1,false)",[other]);await assert.rejects(save('pendente',{address:'Outra'}),/Acesso negado/);await sql("SELECT set_config('test.auth_uid',$1,false)",[owner]);
});
test('RLS de CRM rejeita cliente de outra empresa e preserva vínculo na conclusão',async()=>{
 const foreignCustomer=randomUUID(),task=randomUUID();await sql('INSERT INTO partner_customers(id,user_id) VALUES($1,$2)',[foreignCustomer,other]);
 await db.exec('SET ROLE authenticated');
 try {
  await assert.rejects(sql("INSERT INTO partner_crm_tasks(id,user_id,branch_id,customer_id,description,due_date) VALUES($1,$2,$3,$4,'Retorno',CURRENT_DATE)",[task,owner,branch,foreignCustomer]),/row-level security/);
  await sql("INSERT INTO partner_crm_tasks(id,user_id,branch_id,customer_id,description,due_date) VALUES($1,$2,$3,$4,'Retorno',CURRENT_DATE)",[task,owner,branch,customer]);
  await sql("UPDATE partner_crm_tasks SET status='concluida',completed_at=now() WHERE id=$1",[task]);
  await assert.rejects(sql('UPDATE partner_crm_tasks SET user_id=$1 WHERE id=$2',[other,task]),/permission denied/);
  await sql("SELECT set_config('test.auth_uid',$1,false)",[other]);assert.equal((await sql('SELECT * FROM partner_crm_tasks')).rows.length,0);
 } finally {await db.exec('RESET ROLE');await sql("SELECT set_config('test.auth_uid',$1,false)",[owner]);}
});
test('armazenamento privado só permite upload na pasta do usuário e leitura de RMA autorizado',async()=>{
 const id=randomUUID();await sql('INSERT INTO rma_requests_v2(id,user_id,attachments) VALUES($1,$2,$3::jsonb)',[id,owner,JSON.stringify([{path:`${owner}/${id}/before.png`}])]);
 await db.exec('SET ROLE authenticated');
 try {
  await sql("INSERT INTO storage.objects(bucket_id,name) VALUES('rma-attachments',$1)",[`${owner}/${id}/before.png`]);
  await assert.rejects(sql("INSERT INTO storage.objects(bucket_id,name) VALUES('rma-attachments',$1)",[`${other}/${id}/bad.png`]),/row-level security/);
  await sql("SELECT set_config('test.auth_uid',$1,false)",[other]);assert.equal((await sql('SELECT * FROM storage.objects')).rows.length,0);
 }finally{await db.exec('RESET ROLE');await sql("SELECT set_config('test.auth_uid',$1,false)",[owner]);}
});
test('tentativas de recebimento sobrevivem ao recarregamento e não misturam valores ou empresas',async()=>{
 const exports={};vm.runInNewContext(ts.transpileModule(await read('../../src/lib/invoicePayments.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
 const values=new Map();const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const store=new exports.InvoicePaymentAttempts(storage);assert.equal(store.get('owner','invoice',20,'first').token,'first');
 const refreshed=new exports.InvoicePaymentAttempts(storage);assert.equal(refreshed.get('owner','invoice',20,'new').token,'first');assert.throws(()=>refreshed.get('owner','invoice',30,'new'),/sem confirmação/);
 assert.equal(refreshed.get('other','invoice',20,'other').token,'other');refreshed.confirm('owner','invoice');assert.equal(refreshed.get('owner','invoice',20,'second').token,'second');
});
