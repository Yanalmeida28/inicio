/*
# Add Fiscal Fields to Products & Order Origin Fields to Sales

1. Purpose
   Adds fiscal classification columns to partner_products (NCM, CFOP, CST/CSOSN,
   ICMS/PIS/COFINS rates) and order origin/payment tracking columns to
   partner_sales (origin, online_payment, payment_status).

2. New Columns on `partner_products`
   - ncm (text, nullable) — NCM product classification code
   - cfop (text, nullable) — CFOP code
   - cst_csosn (text, nullable) — CST/CSOSN tax regime code
   - icms_rate (numeric, default 0) — ICMS rate percentage
   - pis_rate (numeric, default 0) — PIS rate percentage
   - cofins_rate (numeric, default 0) — COFINS rate percentage

3. New Columns on `partner_sales`
   - origin (text, default 'pdv') — Sale origin: 'pdv' or 'catalogo'
   - online_payment (boolean, default false) — Whether payment was online
   - payment_status (text, default 'pago') — Payment status: pago/pendente/cancelado

4. Security
   No new tables. RLS already enabled. Existing policies cover new columns.

5. Notes
   - All additive (ADD COLUMN IF NOT EXISTS), safe to re-run.
   - No data lost or transformed.
*/

DO $$
BEGIN
  -- Fiscal fields on partner_products
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_products' AND column_name = 'ncm') THEN
    ALTER TABLE partner_products ADD COLUMN ncm text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_products' AND column_name = 'cfop') THEN
    ALTER TABLE partner_products ADD COLUMN cfop text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_products' AND column_name = 'cst_csosn') THEN
    ALTER TABLE partner_products ADD COLUMN cst_csosn text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_products' AND column_name = 'icms_rate') THEN
    ALTER TABLE partner_products ADD COLUMN icms_rate numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_products' AND column_name = 'pis_rate') THEN
    ALTER TABLE partner_products ADD COLUMN pis_rate numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_products' AND column_name = 'cofins_rate') THEN
    ALTER TABLE partner_products ADD COLUMN cofins_rate numeric DEFAULT 0;
  END IF;

  -- Origin & payment tracking on partner_sales
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_sales' AND column_name = 'origin') THEN
    ALTER TABLE partner_sales ADD COLUMN origin text DEFAULT 'pdv';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_sales' AND column_name = 'online_payment') THEN
    ALTER TABLE partner_sales ADD COLUMN online_payment boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_sales' AND column_name = 'payment_status') THEN
    ALTER TABLE partner_sales ADD COLUMN payment_status text DEFAULT 'pago';
  END IF;
END $$;
