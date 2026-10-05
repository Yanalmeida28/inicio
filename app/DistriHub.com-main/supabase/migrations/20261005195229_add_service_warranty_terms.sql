ALTER TABLE public.store_settings_v2
  ADD COLUMN IF NOT EXISTS service_warranty_terms text NOT NULL DEFAULT '';

CREATE OR REPLACE VIEW public.partner_store_settings WITH (security_invoker = true) AS
SELECT id, user_id, logo_url, primary_color, nav_color, internal_notice, updated_at,
  banner_url, warranty_terms, receipt_footer_text, show_logo_on_receipt,
  show_cnpj_on_receipt, catalog_slug, catalog_enabled, catalog_oos_behavior,
  social_facebook, social_instagram, social_whatsapp, business_hours, created_at,
  service_warranty_terms
FROM public.store_settings_v2;

NOTIFY pgrst, 'reload schema';
