
-- Add wholesale_price to partner_products
ALTER TABLE partner_products ADD COLUMN IF NOT EXISTS wholesale_price numeric DEFAULT 0;

-- Add new fields to partner_customers
ALTER TABLE partner_customers ADD COLUMN IF NOT EXISTS document text;
ALTER TABLE partner_customers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE partner_customers ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE partner_customers ADD COLUMN IF NOT EXISTS neighborhood text;
ALTER TABLE partner_customers ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE partner_customers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE partner_customers ADD COLUMN IF NOT EXISTS customer_type text DEFAULT 'varejo';

-- Add RBAC + PIN to partner_salespeople
ALTER TABLE partner_salespeople ADD COLUMN IF NOT EXISTS pin text;
ALTER TABLE partner_salespeople ADD COLUMN IF NOT EXISTS role text DEFAULT 'vendedor';

-- Add print/warranty settings to store_settings_v2
ALTER TABLE store_settings_v2 ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE store_settings_v2 ADD COLUMN IF NOT EXISTS warranty_terms text;
ALTER TABLE store_settings_v2 ADD COLUMN IF NOT EXISTS receipt_footer_text text;
ALTER TABLE store_settings_v2 ADD COLUMN IF NOT EXISTS show_logo_on_receipt boolean DEFAULT true;
ALTER TABLE store_settings_v2 ADD COLUMN IF NOT EXISTS show_cnpj_on_receipt boolean DEFAULT true;
