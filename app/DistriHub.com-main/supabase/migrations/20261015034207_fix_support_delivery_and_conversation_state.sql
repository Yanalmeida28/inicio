BEGIN;
CREATE SCHEMA partner_support_private;
REVOKE ALL ON SCHEMA partner_support_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA partner_support_private TO authenticated;
CREATE SEQUENCE partner_support_private.message_position;
REVOKE ALL ON SEQUENCE partner_support_private.message_position FROM PUBLIC,anon,authenticated;
ALTER TABLE public.support_messages ADD COLUMN message_position bigint, ADD COLUMN sender_auth_user_id uuid;
-- Preserve original content and timestamps. Oversized legacy messages stay readable.
WITH ordered AS (SELECT id,row_number() OVER(ORDER BY created_at,id) n FROM public.support_messages)
UPDATE public.support_messages m SET message_position=o.n FROM ordered o WHERE o.id=m.id;
SELECT setval('partner_support_private.message_position',coalesce((SELECT max(message_position) FROM public.support_messages),0)+1,false);
ALTER TABLE public.support_messages ALTER COLUMN message_position SET NOT NULL;
CREATE UNIQUE INDEX support_messages_position_unique ON public.support_messages(message_position);
CREATE INDEX support_messages_conversation_position_idx ON public.support_messages(user_id,message_position DESC);

CREATE FUNCTION partner_support_private.prepare_message() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT ((NEW.user_id=auth.uid() AND NEW.sender_role='cliente') OR (public.is_super_admin() AND NEW.sender_role='suporte')) THEN
  RAISE EXCEPTION 'Conversa não autorizada';
 END IF;
 IF NEW.message IS NULL OR char_length(btrim(NEW.message)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'A mensagem deve ter de 1 a 2000 caracteres'; END IF;
 -- Allocated under the conversation lock: another writer cannot commit a lower
 -- position after a reader has already advanced its cursor in this conversation.
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,41));
 NEW.message:=btrim(NEW.message); NEW.created_at:=clock_timestamp(); NEW.read_at:=NULL;
 NEW.sender_auth_user_id:=auth.uid();
 NEW.message_position:=nextval('partner_support_private.message_position');
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION partner_support_private.prepare_message() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER prepare_support_message BEFORE INSERT ON public.support_messages FOR EACH ROW EXECUTE FUNCTION partner_support_private.prepare_message();

CREATE FUNCTION partner_support_private.send_message(p_request_id uuid,p_user_id uuid,p_admin boolean,p_message text)
RETURNS public.support_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved public.support_messages%ROWTYPE; sender text:=CASE WHEN p_admin THEN 'suporte' ELSE 'cliente' END;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL OR p_user_id IS NULL OR p_admin IS NULL THEN RAISE EXCEPTION 'Não autenticado ou tentativa inválida'; END IF;
 IF NOT ((p_user_id=auth.uid() AND NOT p_admin) OR (p_admin AND public.is_super_admin())) THEN RAISE EXCEPTION 'Conversa não autorizada'; END IF;
 IF p_message IS NULL OR char_length(btrim(p_message)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'A mensagem deve ter de 1 a 2000 caracteres'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,42));
 SELECT * INTO saved FROM public.support_messages WHERE id=p_request_id;
 IF FOUND THEN
  IF saved.user_id IS DISTINCT FROM p_user_id OR saved.sender_role IS DISTINCT FROM sender
   OR saved.sender_auth_user_id IS DISTINCT FROM auth.uid() OR saved.message IS DISTINCT FROM btrim(p_message) THEN
   RAISE EXCEPTION 'Tentativa já utilizada com outros dados';
  END IF;
  RETURN saved;
 END IF;
 INSERT INTO public.support_messages(id,user_id,sender_role,message) VALUES(p_request_id,p_user_id,sender,p_message) RETURNING * INTO saved;
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION partner_support_private.send_message(uuid,uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION partner_support_private.send_message(uuid,uuid,boolean,text) TO authenticated;
CREATE FUNCTION public.send_support_message_once(p_request_id uuid,p_user_id uuid,p_admin boolean,p_message text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT to_jsonb(partner_support_private.send_message(p_request_id,p_user_id,p_admin,p_message))
$$;
REVOKE ALL ON FUNCTION public.send_support_message_once(uuid,uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.send_support_message_once(uuid,uuid,boolean,text) TO authenticated;

ALTER TABLE public.admin_support_states ADD COLUMN closed_message_position bigint;
UPDATE public.admin_support_states s SET closed_message_position=(SELECT max(m.message_position) FROM public.support_messages m WHERE m.user_id=s.user_id AND m.created_at<=s.closed_at)
WHERE s.closed_at IS NOT NULL;
-- Restrict writes to a partial, row-locked API. Stale UI state cannot overwrite
-- unrelated fields or supply a browser timestamp for closing a conversation.
REVOKE INSERT,UPDATE ON public.admin_support_states FROM authenticated;
CREATE FUNCTION partner_support_private.update_state(p_user_id uuid,p_action text,p_expected_position bigint)
RETURNS public.admin_support_states LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved public.admin_support_states%ROWTYPE; latest_position bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Acesso administrativo necessário'; END IF;
 IF p_user_id IS NULL OR p_action IS NULL OR p_action NOT IN ('priority_high','priority_normal','close','reopen') THEN RAISE EXCEPTION 'Ação inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,41));
 IF NOT EXISTS(SELECT 1 FROM public.support_messages WHERE user_id=p_user_id) THEN RAISE EXCEPTION 'Atendimento não encontrado'; END IF;
 INSERT INTO public.admin_support_states(user_id) VALUES(p_user_id) ON CONFLICT(user_id) DO NOTHING;
 SELECT * INTO saved FROM public.admin_support_states WHERE user_id=p_user_id FOR UPDATE;
 IF p_action IN ('priority_high','priority_normal') THEN
  UPDATE public.admin_support_states SET priority=CASE WHEN p_action='priority_high' THEN 'high' ELSE 'normal' END,updated_at=clock_timestamp() WHERE user_id=p_user_id;
 ELSIF p_action='close' THEN
  IF p_expected_position IS NULL THEN RAISE EXCEPTION 'Atualize o atendimento antes de encerrar'; END IF;
  IF saved.closed_at IS NOT NULL AND saved.closed_message_position=p_expected_position THEN RETURN saved; END IF;
  SELECT max(message_position) INTO latest_position FROM public.support_messages WHERE user_id=p_user_id;
  IF latest_position IS DISTINCT FROM p_expected_position THEN RAISE EXCEPTION 'Novas mensagens chegaram. Atualize o atendimento antes de encerrar'; END IF;
  UPDATE public.admin_support_states SET closed_at=clock_timestamp(),closed_message_position=latest_position,updated_at=clock_timestamp() WHERE user_id=p_user_id;
 ELSE
  UPDATE public.admin_support_states SET closed_at=NULL,closed_message_position=NULL,updated_at=clock_timestamp() WHERE user_id=p_user_id;
 END IF;
 SELECT * INTO saved FROM public.admin_support_states WHERE user_id=p_user_id;
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION partner_support_private.update_state(uuid,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION partner_support_private.update_state(uuid,text,bigint) TO authenticated;
CREATE FUNCTION public.update_admin_support_state(p_user_id uuid,p_action text,p_expected_position bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT to_jsonb(partner_support_private.update_state(p_user_id,p_action,p_expected_position)) $$;
REVOKE ALL ON FUNCTION public.update_admin_support_state(uuid,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_admin_support_state(uuid,text,bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_support_inbox(p_search text DEFAULT '',p_filter text DEFAULT 'all',p_page integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Acesso administrativo necessário'; END IF;
 IF p_page IS NULL OR p_page<0 OR p_page>100000 OR p_filter IS NULL OR p_filter NOT IN ('all','pending','closed','high') OR p_search IS NULL OR length(p_search)>200 THEN RAISE EXCEPTION 'Filtro inválido'; END IF;
 WITH latest AS (SELECT DISTINCT ON(user_id) * FROM public.support_messages ORDER BY user_id,message_position DESC),
 entries AS (SELECT m.*,coalesce(s.priority,'normal') priority,s.closed_at,s.closed_message_position,
  coalesce(p.business_name,'Cliente '||left(m.user_id::text,8)) company_name,
  (s.closed_at IS NOT NULL AND coalesce(s.closed_message_position,0)>=m.message_position) closed
  FROM latest m LEFT JOIN public.admin_support_states s ON s.user_id=m.user_id LEFT JOIN public.partner_profiles p ON p.id=m.user_id),
 filtered AS (SELECT * FROM entries WHERE (p_search='' OR position(lower(p_search) in lower(company_name||' '||message))>0)
  AND (p_filter='all' OR p_filter='pending' AND NOT closed AND sender_role='cliente' OR p_filter='closed' AND closed OR p_filter='high' AND priority='high')),
 page AS (SELECT * FROM filtered ORDER BY (priority='high') DESC,message_position DESC,user_id LIMIT 25 OFFSET p_page*25)
 SELECT jsonb_build_object('conversations',(SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY (priority='high') DESC,message_position DESC,user_id),'[]'::jsonb) FROM page),
 'total',(SELECT count(*) FROM filtered),'pending',(SELECT count(*) FROM entries WHERE NOT closed AND sender_role='cliente')) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_admin_support_inbox(text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_admin_support_inbox(text,text,integer) TO authenticated;

-- Keep the Super Admin badge consistent with the inbox after migration.
DO $migration$
DECLARE definition text;
BEGIN
 IF to_regprocedure('public.get_super_admin_pending_summary()') IS NOT NULL THEN
  SELECT pg_get_functiondef('public.get_super_admin_pending_summary()'::regprocedure) INTO definition;
  IF position('user_id,sender_role,created_at' IN definition)=0 OR position('m.created_at>s.closed_at' IN definition)=0 THEN
   RAISE EXCEPTION 'Support summary changed; review pending counter';
  END IF;
  definition:=replace(definition,'user_id,sender_role,created_at','user_id,sender_role,message_position');
  definition:=replace(definition,'ORDER BY user_id,created_at DESC,id DESC','ORDER BY user_id,message_position DESC');
  definition:=replace(definition,'m.created_at>s.closed_at','m.message_position>coalesce(s.closed_message_position,0)');
  EXECUTE definition;
 END IF;
END $migration$;

CREATE FUNCTION partner_support_private.read_conversation(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Acesso administrativo necessário'; END IF;
 SELECT to_jsonb(r) INTO result FROM (
  SELECT m.*,coalesce(s.priority,'normal') priority,s.closed_at,s.closed_message_position,
   coalesce(p.business_name,'Cliente '||left(m.user_id::text,8)) company_name,
   (s.closed_at IS NOT NULL AND coalesce(s.closed_message_position,0)>=m.message_position) closed
  FROM public.support_messages m LEFT JOIN public.admin_support_states s ON s.user_id=m.user_id
  LEFT JOIN public.partner_profiles p ON p.id=m.user_id WHERE m.user_id=p_user_id ORDER BY m.message_position DESC LIMIT 1
 ) r;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION partner_support_private.read_conversation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION partner_support_private.read_conversation(uuid) TO authenticated;
CREATE FUNCTION public.get_admin_support_conversation(p_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT partner_support_private.read_conversation(p_user_id) $$;
REVOKE ALL ON FUNCTION public.get_admin_support_conversation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_admin_support_conversation(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
