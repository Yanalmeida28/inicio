/* Fiscal rules and number inutilization records, ready for a future provider API. */

CREATE TABLE IF NOT EXISTS public.fiscal_inutilizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('nfe', 'nfce')),
  series text NOT NULL,
  number_start integer NOT NULL CHECK (number_start > 0),
  number_end integer NOT NULL CHECK (number_end >= number_start),
  justification text NOT NULL CHECK (char_length(trim(justification)) >= 15),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'authorized', 'rejected')),
  protocol text,
  provider_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fiscal_inutilizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_manage_own_inutilizations" ON public.fiscal_inutilizations;
CREATE POLICY "users_manage_own_inutilizations" ON public.fiscal_inutilizations
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.fiscal_tax_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  ncm text,
  cfop text NOT NULL,
  cst_csosn text NOT NULL,
  icms_rate numeric(8,4) NOT NULL DEFAULT 0,
  pis_rate numeric(8,4) NOT NULL DEFAULT 0,
  cofins_rate numeric(8,4) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fiscal_tax_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_manage_own_tax_rules" ON public.fiscal_tax_rules;
CREATE POLICY "users_manage_own_tax_rules" ON public.fiscal_tax_rules
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
