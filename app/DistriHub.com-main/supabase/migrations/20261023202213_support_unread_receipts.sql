CREATE TABLE partner_support_private.read_receipts (
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_position bigint NOT NULL CHECK (last_read_position > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, user_id)
);
ALTER TABLE partner_support_private.read_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON partner_support_private.read_receipts FROM PUBLIC, anon, authenticated;
CREATE INDEX support_read_receipts_user_idx ON partner_support_private.read_receipts(user_id);
CREATE INDEX support_messages_unread_idx ON public.support_messages(sender_role,user_id,message_position);

CREATE FUNCTION public.get_support_unread_counts(p_admin boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); result jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;
  IF p_admin IS NULL OR (p_admin AND NOT public.is_super_admin()) THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
  SELECT jsonb_build_object('total',coalesce(sum(unread_count),0),'conversations',coalesce(jsonb_agg(to_jsonb(counts)),'[]'::jsonb)) INTO result
  FROM (
    SELECT m.user_id,count(*) AS unread_count
    FROM public.support_messages m
    LEFT JOIN partner_support_private.read_receipts r ON r.actor_id=actor AND r.user_id=m.user_id
    WHERE (p_admin OR m.user_id=actor)
      AND m.sender_role=CASE WHEN p_admin THEN 'cliente' ELSE 'suporte' END
      AND m.message_position>coalesce(r.last_read_position,0)
    GROUP BY m.user_id
  ) counts;
  RETURN result;
END $$;

CREATE FUNCTION public.mark_support_messages_read(p_user_id uuid,p_position bigint,p_admin boolean DEFAULT false)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); result bigint;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;
  IF p_admin IS NULL OR p_user_id IS NULL OR (p_admin AND NOT public.is_super_admin()) OR (NOT p_admin AND p_user_id<>actor) THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.support_messages WHERE user_id=p_user_id AND message_position=p_position AND sender_role=CASE WHEN p_admin THEN 'cliente' ELSE 'suporte' END) THEN
    RAISE EXCEPTION 'Mensagem recebida inválida';
  END IF;
  INSERT INTO partner_support_private.read_receipts(actor_id,user_id,last_read_position) VALUES(actor,p_user_id,p_position)
  ON CONFLICT(actor_id,user_id) DO UPDATE SET last_read_position=greatest(read_receipts.last_read_position,excluded.last_read_position),updated_at=now()
  RETURNING last_read_position INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_support_unread_counts(boolean), public.mark_support_messages_read(uuid,bigint,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_support_unread_counts(boolean), public.mark_support_messages_read(uuid,bigint,boolean) TO authenticated;
