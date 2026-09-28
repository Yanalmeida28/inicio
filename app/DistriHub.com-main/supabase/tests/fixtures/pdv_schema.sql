-- Minimal synthetic schema for local PostgreSQL tests. No production rows or credentials.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('test.auth_uid',true),'')::uuid
$$;
CREATE TABLE public.partner_profiles(id uuid PRIMARY KEY,account_name text,business_name text);
CREATE TABLE public.partner_branches(id uuid PRIMARY KEY,user_id uuid);
CREATE TABLE public.partner_salespeople(id uuid PRIMARY KEY,user_id uuid,auth_user_id uuid,branch_id uuid,role text,active boolean,pin_hash text);
CREATE FUNCTION public.verify_partner_salesperson_pin(p_pin text,p_hash text) RETURNS boolean LANGUAGE sql AS $$
  SELECT md5(p_pin)=p_hash
$$;
CREATE TABLE public.partner_customers(id uuid PRIMARY KEY,user_id uuid,branch_id uuid,allow_credit boolean NOT NULL DEFAULT false,credit_limit numeric NOT NULL DEFAULT 0);
CREATE TABLE public.partner_products(id uuid PRIMARY KEY,user_id uuid,branch_id uuid NOT NULL,name text,stock integer NOT NULL CHECK(stock>=0),is_service boolean DEFAULT false,updated_at timestamptz);
-- Pricing columns mirror production precision; defaults below are synthetic test data.
ALTER TABLE public.partner_products ADD COLUMN sale_price numeric(10,2) NOT NULL DEFAULT 100,
  ADD COLUMN wholesale_price numeric DEFAULT 0;
ALTER TABLE public.partner_customers ADD COLUMN customer_type text DEFAULT 'varejo',
  ADD COLUMN price_table text;
CREATE TABLE public.partner_sales(id uuid PRIMARY KEY,user_id uuid,customer_id uuid,customer_name text,items jsonb,total numeric CHECK(total>=0),status text,created_at timestamptz,branch_id uuid,salesperson_id uuid,imei text,serial_number text,payment_method text,origin text,online_payment boolean,payment_status text,customer_type text,delivery_type text);
CREATE TABLE public.partner_invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,number text,sale_id uuid REFERENCES partner_sales(id) ON DELETE SET NULL,customer_id uuid,customer_name text,amount numeric NOT NULL CHECK(amount>=0),paid_amount numeric NOT NULL DEFAULT 0 CHECK(paid_amount>=0 AND paid_amount<=amount),status text NOT NULL CHECK(status IN ('aberta','parcial','paga','cancelada')),due_date date,branch_id uuid,salesperson_id uuid);
CREATE UNIQUE INDEX partner_invoices_sale_id_unique ON public.partner_invoices(sale_id) WHERE sale_id IS NOT NULL;
CREATE TABLE public.stock_movements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,product_id uuid,product_name text,type text,quantity integer,reason text,branch_id uuid,created_at timestamptz DEFAULT now());
CREATE TABLE public.partner_audit_logs(id text PRIMARY KEY,user_id uuid,actor_name text,actor_role text,action text,entity_type text,entity_id text,details text);
-- Production sale read authorization, with table fields reduced to the test contract.
CREATE FUNCTION public.partner_employee_can_operate_sale(p_company_id uuid,p_branch_id uuid,p_salesperson_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.partner_salespeople op JOIN public.partner_branches b ON b.id=p_branch_id AND b.user_id=p_company_id JOIN public.partner_salespeople target ON target.id=p_salesperson_id AND target.user_id=p_company_id WHERE op.user_id=p_company_id AND op.auth_user_id=auth.uid() AND COALESCE(op.active,true) AND (op.role='administrador' OR (op.id=p_salesperson_id AND op.branch_id=p_branch_id)))
$$;
