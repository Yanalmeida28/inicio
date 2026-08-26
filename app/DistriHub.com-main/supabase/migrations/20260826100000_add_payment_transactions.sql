/* Payment gateway foundation. Provider secrets stay in Supabase Edge Function secrets. */

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_payment_id text,
  order_reference text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'BRL',
  payment_method text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'refunded')),
  checkout_url text,
  qr_code text,
  qr_code_base64 text,
  provider_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_transactions_user_id_idx ON public.payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS payment_transactions_provider_id_idx ON public.payment_transactions(provider_payment_id);
CREATE UNIQUE INDEX IF NOT EXISTS admin_lojistas_user_id_unique_idx ON public.admin_lojistas(user_id) WHERE user_id IS NOT NULL;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_payment_transactions" ON public.payment_transactions;
CREATE POLICY "users_select_own_payment_transactions" ON public.payment_transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_payment_transactions" ON public.payment_transactions;
CREATE POLICY "users_insert_own_payment_transactions" ON public.payment_transactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_payment_transactions" ON public.payment_transactions;
CREATE POLICY "users_update_own_payment_transactions" ON public.payment_transactions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_payment_transaction_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_transactions_updated_at ON public.payment_transactions;
CREATE TRIGGER payment_transactions_updated_at
  BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_payment_transaction_updated_at();
