-- Reload credentials are random, tab-scoped on the client, and bound to the
-- authenticated Supabase session. Never store the operator's PIN.
CREATE TABLE partner_access_private.operator_sessions (
 token_hash text PRIMARY KEY,
 actor_id uuid NOT NULL,
 auth_session_id text NOT NULL,
 operator_id uuid NOT NULL REFERENCES public.partner_salespeople(id) ON DELETE CASCADE,
 pin_hash text NOT NULL,
 expires_at timestamptz NOT NULL
);
ALTER TABLE partner_access_private.operator_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON partner_access_private.operator_sessions FROM PUBLIC,anon,authenticated;
CREATE INDEX operator_sessions_expiry ON partner_access_private.operator_sessions(expires_at);
CREATE INDEX operator_sessions_operator ON partner_access_private.operator_sessions(operator_id);

CREATE FUNCTION partner_access_private.verify_credential(p_pin text,p_pin_hash text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_pin IS NULL OR p_pin_hash IS NULL THEN RETURN false; END IF;
 IF p_pin ~ '^ops_[0-9a-f]{64}$' THEN
  RETURN EXISTS(
   SELECT 1 FROM partner_access_private.operator_sessions t
   JOIN public.partner_salespeople s ON s.id=t.operator_id
   JOIN auth.sessions a ON a.id::text=t.auth_session_id AND a.user_id=t.actor_id
   WHERE t.token_hash=encode(extensions.digest(p_pin,'sha256'),'hex')
    AND t.actor_id=auth.uid() AND t.auth_session_id=auth.jwt()->>'session_id'
    AND t.expires_at>now() AND s.active=true
    AND t.pin_hash=p_pin_hash AND s.pin_hash=t.pin_hash
    AND (s.user_id=auth.uid() OR s.auth_user_id=auth.uid()));
 END IF;
 RETURN extensions.crypt(p_pin,p_pin_hash)=p_pin_hash;
END; $$;
REVOKE ALL ON FUNCTION partner_access_private.verify_credential(text,text) FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA partner_access_private TO authenticated;
GRANT EXECUTE ON FUNCTION partner_access_private.verify_credential(text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.verify_partner_salesperson_pin(p_pin text,p_pin_hash text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT partner_access_private.verify_credential(p_pin,p_pin_hash);
$$;
REVOKE ALL ON FUNCTION public.verify_partner_salesperson_pin(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.verify_partner_salesperson_pin(text,text) TO authenticated;

CREATE FUNCTION partner_access_private.create_operator_session(p_salesperson_id uuid,p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op record; token text; session_id text:=auth.jwt()->>'session_id'; expiry timestamptz:=now()+interval '12 hours';
BEGIN
 IF auth.uid() IS NULL OR session_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM auth.sessions a WHERE a.id::text=session_id AND a.user_id=auth.uid())
 THEN RAISE EXCEPTION 'Sessão de login inválida.'; END IF;
 IF p_salesperson_id IS NULL OR p_pin IS NULL OR p_pin !~ '^[0-9]{4,8}$'
 THEN RAISE EXCEPTION 'Confirme o PIN do colaborador.'; END IF;
 SELECT * INTO op FROM public.resolve_partner_pdv_operator(p_salesperson_id,p_pin,NULL);
 IF op.salesperson_id IS DISTINCT FROM p_salesperson_id THEN RAISE EXCEPTION 'Operador inválido.'; END IF;
 DELETE FROM partner_access_private.operator_sessions WHERE expires_at<=now();
 token:='ops_'||encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO partner_access_private.operator_sessions(token_hash,actor_id,auth_session_id,operator_id,pin_hash,expires_at)
 SELECT encode(extensions.digest(token,'sha256'),'hex'),auth.uid(),session_id,s.id,s.pin_hash,expiry
 FROM public.partner_salespeople s WHERE s.id=op.salesperson_id AND s.active=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'Operador indisponível.'; END IF;
 RETURN jsonb_build_object('credential',token,'expires_at',expiry);
END; $$;
REVOKE ALL ON FUNCTION partner_access_private.create_operator_session(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION partner_access_private.create_operator_session(uuid,text) TO authenticated;
CREATE FUNCTION public.create_partner_operator_session(p_salesperson_id uuid,p_pin text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT partner_access_private.create_operator_session(p_salesperson_id,p_pin);
$$;
REVOKE ALL ON FUNCTION public.create_partner_operator_session(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_partner_operator_session(uuid,text) TO authenticated;

CREATE FUNCTION partner_access_private.revoke_operator_session(p_credential text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 DELETE FROM partner_access_private.operator_sessions
 WHERE token_hash=encode(extensions.digest(p_credential,'sha256'),'hex')
 AND actor_id=auth.uid() AND auth_session_id=auth.jwt()->>'session_id';
$$;
REVOKE ALL ON FUNCTION partner_access_private.revoke_operator_session(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION partner_access_private.revoke_operator_session(text) TO authenticated;
CREATE FUNCTION public.revoke_partner_operator_session(p_credential text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT partner_access_private.revoke_operator_session(p_credential);
$$;
REVOKE ALL ON FUNCTION public.revoke_partner_operator_session(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revoke_partner_operator_session(text) TO authenticated;
