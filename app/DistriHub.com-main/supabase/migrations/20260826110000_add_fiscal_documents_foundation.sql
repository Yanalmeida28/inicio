/* Fiscal document foundation. Issuance remains disabled until a provider is configured. */

CREATE TABLE IF NOT EXISTS public.fiscal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.b2b_orders(id) ON DELETE SET NULL,
  provider text,
  document_type text NOT NULL DEFAULT 'nfce',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'authorized', 'rejected', 'cancelled')),
  series text,
  number text,
  access_key text,
  protocol text,
  provider_document_id text,
  xml_url text,
  pdf_url text,
  rejection_reason text,
  provider_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fiscal_documents_user_id_idx ON public.fiscal_documents(user_id);
CREATE INDEX IF NOT EXISTS fiscal_documents_order_id_idx ON public.fiscal_documents(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_documents_access_key_idx ON public.fiscal_documents(access_key) WHERE access_key IS NOT NULL;
ALTER TABLE public.fiscal_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_fiscal_documents" ON public.fiscal_documents;
CREATE POLICY "users_select_own_fiscal_documents" ON public.fiscal_documents
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_fiscal_documents" ON public.fiscal_documents;
CREATE POLICY "users_insert_own_fiscal_documents" ON public.fiscal_documents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_fiscal_document_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fiscal_documents_updated_at ON public.fiscal_documents;
CREATE TRIGGER fiscal_documents_updated_at
  BEFORE UPDATE ON public.fiscal_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_fiscal_document_updated_at();
