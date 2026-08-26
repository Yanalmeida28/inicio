/* Persistent support chat per authenticated company. */

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role text NOT NULL DEFAULT 'cliente' CHECK (sender_role IN ('cliente', 'suporte')),
  message text NOT NULL CHECK (char_length(trim(message)) > 0),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_messages_user_created_idx
  ON public.support_messages(user_id, created_at);
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_read_own_support_messages" ON public.support_messages;
CREATE POLICY "clients_read_own_support_messages" ON public.support_messages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "clients_send_support_messages" ON public.support_messages;
CREATE POLICY "clients_send_support_messages" ON public.support_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND sender_role = 'cliente');
