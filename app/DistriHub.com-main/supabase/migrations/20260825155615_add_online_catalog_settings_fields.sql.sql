/*
# Add Online Catalog Settings Fields

1. Purpose
  Adds catalog configuration columns to the `store_settings_v2` table so each
   partner store can control its public online catalog: a URL slug, an
   enable/disable toggle, out-of-stock behavior, social links, and business
   hours text.

2. New Columns on `store_settings_v2`
   - `catalog_slug` (text, nullable) — URL-friendly store identifier for the
     public catalog (e.g. "tech-cell" → /catalogo/tech-cell).
   - `catalog_enabled` (boolean, default true) — master toggle for the public
     catalog.
   - `catalog_oos_behavior` (text, default 'indisponivel') — how to display
     out-of-stock items: 'indisponivel' (show as unavailable) or 'ocultar'
     (hide entirely).
   - `social_facebook` (text, nullable) — Facebook page URL.
   - `social_instagram` (text, nullable) — Instagram handle or URL.
   - `social_whatsapp` (text, nullable) — WhatsApp contact number.
   - `business_hours` (text, nullable) — Free-text business hours string.

3. Security
  No new tables. RLS already enabled on `store_settings_v2`. No policy changes
   needed — existing owner-scoped policies cover the new columns.

4. Notes
   - All additions are additive (ALTER TABLE ADD COLUMN IF NOT EXISTS) and
     safe to re-run.
   - No data is lost or transformed.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_settings_v2' AND column_name = 'catalog_slug') THEN
    ALTER TABLE store_settings_v2 ADD COLUMN catalog_slug text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_settings_v2' AND column_name = 'catalog_enabled') THEN
    ALTER TABLE store_settings_v2 ADD COLUMN catalog_enabled boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_settings_v2' AND column_name = 'catalog_oos_behavior') THEN
    ALTER TABLE store_settings_v2 ADD COLUMN catalog_oos_behavior text NOT NULL DEFAULT 'indisponivel';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_settings_v2' AND column_name = 'social_facebook') THEN
    ALTER TABLE store_settings_v2 ADD COLUMN social_facebook text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_settings_v2' AND column_name = 'social_instagram') THEN
    ALTER TABLE store_settings_v2 ADD COLUMN social_instagram text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_settings_v2' AND column_name = 'social_whatsapp') THEN
    ALTER TABLE store_settings_v2 ADD COLUMN social_whatsapp text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_settings_v2' AND column_name = 'business_hours') THEN
    ALTER TABLE store_settings_v2 ADD COLUMN business_hours text;
  END IF;
END $$;
