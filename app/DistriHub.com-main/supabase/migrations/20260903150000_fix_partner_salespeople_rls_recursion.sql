-- Remove self-referential RLS evaluation while preserving owner and employee identity access.

DROP POLICY IF EXISTS "select_authenticated_salespeople" ON public.partner_salespeople;

CREATE POLICY "select_authenticated_salespeople" ON public.partner_salespeople
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid() = auth_user_id
  );