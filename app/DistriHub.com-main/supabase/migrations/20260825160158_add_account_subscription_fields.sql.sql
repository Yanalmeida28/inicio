/*
# Add Account Profile & Subscription Fields

1. Purpose
   Adds account management and SaaS subscription columns to the
   `partner_profiles` table so the Configurações panel can edit the
   responsible person's name, contact info, document, and manage their
   subscription plan, billing date, and payment method.

2. New Columns on `partner_profiles`
   - `account_name` (text, nullable) — Name of the responsible person
     (distinct from the business name).
   - `subscription_plan` (text, default 'basico') — Current plan tier
     (basico, profissional, enterprise).
   - `subscription_status` (text, default 'trial') — Subscription state
     (ativa, trial, cancelada, suspensa).
   - `next_billing_date` (date, nullable) — Next recurring billing date.
   - `payment_method` (text, nullable) — Active payment method
     (cartao, pix).

3. Security
   No new tables. RLS already enabled on `partner_profiles`. No policy
   changes needed — existing owner-scoped policies cover the new columns.

4. Notes
   - All additions are additive (ALTER TABLE ADD COLUMN IF NOT EXISTS)
     and safe to re-run.
   - No data is lost or transformed.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_profiles' AND column_name = 'account_name') THEN
    ALTER TABLE partner_profiles ADD COLUMN account_name text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_profiles' AND column_name = 'subscription_plan') THEN
    ALTER TABLE partner_profiles ADD COLUMN subscription_plan text NOT NULL DEFAULT 'basico';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_profiles' AND column_name = 'subscription_status') THEN
    ALTER TABLE partner_profiles ADD COLUMN subscription_status text NOT NULL DEFAULT 'trial';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_profiles' AND column_name = 'next_billing_date') THEN
    ALTER TABLE partner_profiles ADD COLUMN next_billing_date date;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_profiles' AND column_name = 'payment_method') THEN
    ALTER TABLE partner_profiles ADD COLUMN payment_method text;
  END IF;
END $$;
