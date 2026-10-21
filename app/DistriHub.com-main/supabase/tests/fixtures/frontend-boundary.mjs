// Synthetic fixture with captured pre-fix production definitions. No production data.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const snapshot=JSON.parse(await readFile(new URL('./frontend-boundary-metadata.json',import.meta.url),'utf8'));
export async function boundaryDatabase() {
 const db=new PGlite();
 const [owner,other,branch,foreignBranch,customer,foreignCustomer,product,foreignProduct,foreignStaff,task,modifier,os]=Array.from({length:12},()=>randomUUID());
 await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
 CREATE SCHEMA partner_subscription_private; CREATE SCHEMA partner_operations_private; CREATE SCHEMA partner_service_orders_private; CREATE SCHEMA partner_cadastros_private;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('audit.actor',true),'')::uuid $$;
 CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE TABLE partner_profiles(id uuid PRIMARY KEY REFERENCES auth.users);
 CREATE TABLE partner_branches(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users,is_active boolean DEFAULT true);
 CREATE TABLE partner_salespeople(id uuid PRIMARY KEY,user_id uuid,auth_user_id uuid,branch_id uuid,role text,active boolean DEFAULT true,blocked_modules text[] DEFAULT '{}');
 CREATE TABLE partner_customers(id uuid,user_id uuid,branch_id uuid,name text,person_type text,document text,credit_limit numeric DEFAULT 0,allow_credit boolean DEFAULT false,salesperson_id uuid);
 CREATE TABLE partner_products(id uuid PRIMARY KEY,user_id uuid,branch_id uuid,name text,stock integer DEFAULT 10,cost_price numeric DEFAULT 10,is_service boolean DEFAULT false,updated_at timestamptz);
 CREATE TABLE partner_modifiers(id uuid,user_id uuid,product_id uuid,name text,price_adjustment numeric,created_at timestamptz DEFAULT now());
 CREATE TABLE partner_crm_tasks(id uuid,user_id uuid,branch_id uuid,customer_id uuid,description text,due_date date,responsible_id uuid,status text DEFAULT 'pendente',completed_at timestamptz,created_at timestamptz);
 CREATE TABLE service_orders(id uuid,user_id uuid,branch_id uuid,customer_id uuid,customer_name text,customer_email text,customer_address text,customer_phone text,service_segment text,equipment_type text,equipment_identification text,serial_number text,accessories_left text,physical_condition text,entry_damage text,entry_notes text,status text DEFAULT 'aberta',labor_total numeric DEFAULT 0,parts_total numeric DEFAULT 0,total numeric DEFAULT 0,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),technician_name text,approval_status text DEFAULT 'aguardando_aprovacao',approval_notes text,forecast_delivery date,status_history jsonb DEFAULT '[]');
 CREATE TABLE service_order_items(id uuid DEFAULT gen_random_uuid(),service_order_id uuid,user_id uuid,product_id uuid,branch_id uuid,product_name text,quantity integer,unit_cost numeric,unit_price numeric,stock_consumed boolean);
 CREATE TABLE partner_invoices(id uuid,service_order_id uuid,paid_amount numeric DEFAULT 0,status text);
 CREATE TABLE stock_movements(user_id uuid,product_id uuid,product_name text,type text,quantity integer,reason text,branch_id uuid);
 CREATE TABLE partner_operations_private.operation_requests(actor_id uuid,kind text,request_id uuid,payload jsonb,result jsonb,created_at timestamptz,PRIMARY KEY(actor_id,kind,request_id));
 -- Only subscription state is synthetic. Real authorization helpers/policies follow below.
 CREATE FUNCTION partner_subscription_private.state(uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"can_access":true,"features":["cadastros","relatorios","os"]}'::jsonb $$;
 GRANT USAGE ON SCHEMA auth,public,partner_subscription_private,partner_operations_private,partner_service_orders_private,partner_cadastros_private TO authenticated;
 GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
 GRANT INSERT,UPDATE,DELETE ON partner_customers,partner_modifiers,partner_crm_tasks TO authenticated;
 ALTER TABLE partner_customers ENABLE ROW LEVEL SECURITY;
 ALTER TABLE partner_modifiers ENABLE ROW LEVEL SECURITY;
 ALTER TABLE partner_crm_tasks ENABLE ROW LEVEL SECURITY;
 ALTER TABLE partner_products ENABLE ROW LEVEL SECURITY;
 CREATE POLICY product_owner ON partner_products FOR SELECT TO authenticated USING(user_id=auth.uid());`);
 const customerConstraints=snapshot.final.customer_constraints;
 const cadastrosMigration=await readFile(new URL('../../migrations/20261014201623_fix_cadastros_xml_customer_and_permissions.sql',import.meta.url),'utf8');
 const canManage=cadastrosMigration.slice(cadastrosMigration.indexOf('CREATE OR REPLACE FUNCTION partner_cadastros_private.can_manage'));
 await db.exec(canManage.slice(0,canManage.indexOf('$$;')+3));
 const constraints=[...snapshot.audit.constraints.filter(c=>['partner_modifiers','partner_crm_tasks','service_orders'].includes(c.table)),...customerConstraints.map(definition=>({table:'partner_customers',definition}))];
 for(const c of constraints.sort((a,b)=>Number(!a.definition.startsWith('PRIMARY KEY'))-Number(!b.definition.startsWith('PRIMARY KEY'))))await db.exec(`ALTER TABLE public.${c.table} ADD ${c.definition}`);
 for(const f of snapshot.more.functions.filter(f=>/partner_has_saas_access|partner_employee_can_access_branch|partner_rma_company_access|guard_collaborator_write|guard_operational_write/.test(f.signature)))await db.exec(f.definition);
 for(const f of snapshot.helpers)await db.exec(f.definition);
 for(const f of snapshot.audit.functions.filter(f=>/stamp_crm_task|create_service_order_once|partner_service_orders_private.update_workflow|update_service_order_workflow_checked/.test(f.signature)).sort((a,b)=>Number(a.signature.startsWith('update_service_order_workflow_checked'))-Number(b.signature.startsWith('update_service_order_workflow_checked'))))await db.exec(f.definition);
 for(const p of [...snapshot.audit.policies.filter(p=>['partner_modifiers','partner_crm_tasks'].includes(p.tablename)),...snapshot.more.customer_policies]){
  await db.exec(`CREATE POLICY "${p.policyname}" ON public.${p.tablename} AS ${p.permissive} FOR ${p.cmd} TO authenticated${p.qual?' USING ('+p.qual+')':''}${p.with_check?' WITH CHECK ('+p.with_check+')':''}`);
 }
 for(const table of ['partner_customers','partner_modifiers'])await db.exec(`CREATE TRIGGER operational BEFORE INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION partner_subscription_private.guard_operational_write('cadastros'); CREATE TRIGGER collaborator BEFORE INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION partner_subscription_private.guard_collaborator_write('cadastros')`);
 await db.exec('CREATE TRIGGER stamp_crm_task BEFORE INSERT OR UPDATE ON partner_crm_tasks FOR EACH ROW EXECUTE FUNCTION partner_operations_private.stamp_crm_task()');
 await db.query('INSERT INTO auth.users VALUES($1),($2)',[owner,other]);await db.query('INSERT INTO partner_profiles VALUES($1),($2)',[owner,other]);
 await db.query('INSERT INTO partner_branches(id,user_id) VALUES($1,$3),($2,$4)',[branch,foreignBranch,owner,other]);
 await db.query("INSERT INTO partner_salespeople(id,user_id,branch_id,role) VALUES($1,$2,$3,'gerente')",[foreignStaff,other,foreignBranch]);
 await db.query("INSERT INTO partner_products(id,user_id,branch_id,name) VALUES($1,$3,$5,'Own'),($2,$4,$6,'Foreign')",[product,foreignProduct,owner,other,branch,foreignBranch]);
 await db.query("SELECT set_config('audit.actor',$1,false)",[owner]);
 await db.query("INSERT INTO partner_customers(id,user_id,branch_id,name,person_type) VALUES($1,$2,$3,'Own','PF')",[customer,owner,branch]);
 await db.query("SELECT set_config('audit.actor',$1,false)",[other]);
 await db.query("INSERT INTO partner_customers(id,user_id,branch_id,name,person_type) VALUES($1,$2,$3,'Foreign','PF')",[foreignCustomer,other,foreignBranch]);
 await db.query("SELECT set_config('audit.actor',$1,false)",[owner]);

 return {db,owner,other,branch,foreignBranch,customer,foreignCustomer,product,foreignProduct,foreignStaff,task,modifier,os};
}
