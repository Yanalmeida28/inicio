CREATE SCHEMA partner_owner_private;
REVOKE ALL ON SCHEMA partner_owner_private FROM PUBLIC, anon, authenticated;
CREATE TABLE partner_owner_private.credentials (
  company_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash text,
  failures integer NOT NULL DEFAULT 0 CHECK (failures BETWEEN 0 AND 4),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE partner_owner_private.credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON partner_owner_private.credentials FROM PUBLIC, anon, authenticated;

-- Only wrappers below can call this helper. Failed attempts return false rather
-- than raising, so the rate-limit updates are committed on an invalid password.
CREATE FUNCTION partner_owner_private.verify(p_password text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); saved partner_owner_private.credentials; expected text;
BEGIN
  IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.partner_profiles WHERE id=actor)
    OR EXISTS(SELECT 1 FROM public.partner_salespeople WHERE auth_user_id=actor) THEN RETURN false; END IF;
  INSERT INTO partner_owner_private.credentials(company_id) VALUES(actor) ON CONFLICT DO NOTHING;
  SELECT * INTO saved FROM partner_owner_private.credentials WHERE company_id=actor FOR UPDATE;
  IF saved.blocked_until > now() THEN RETURN false; END IF;
  expected := saved.password_hash;
  IF expected IS NULL THEN SELECT encrypted_password INTO expected FROM auth.users WHERE id=actor; END IF;
  IF p_password IS NOT NULL AND octet_length(p_password) BETWEEN 1 AND 72
    AND expected IS NOT NULL AND expected <> '' AND extensions.crypt(p_password,expected)=expected THEN
    UPDATE partner_owner_private.credentials SET failures=0, blocked_until=NULL WHERE company_id=actor;
    RETURN true;
  END IF;
  UPDATE partner_owner_private.credentials SET
    failures=CASE WHEN saved.failures>=4 THEN 0 ELSE saved.failures+1 END,
    blocked_until=CASE WHEN saved.failures>=4 THEN now()+interval '15 minutes' ELSE NULL END
    WHERE company_id=actor;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION partner_owner_private.verify(text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.verify_partner_owner_password(p_password text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT partner_owner_private.verify(p_password);
$$;
CREATE FUNCTION public.partner_owner_password_configured() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM partner_owner_private.credentials c
    JOIN public.partner_profiles p ON p.id=c.company_id
    WHERE c.company_id=auth.uid() AND c.password_hash IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM public.partner_salespeople WHERE auth_user_id=auth.uid()));
$$;
CREATE FUNCTION public.change_partner_owner_password(p_current_password text,p_new_password text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_new_password IS NULL OR length(p_new_password)<8 OR octet_length(p_new_password)>72 THEN RETURN false; END IF;
  IF NOT partner_owner_private.verify(p_current_password) THEN RETURN false; END IF;
  UPDATE partner_owner_private.credentials SET
    password_hash=extensions.crypt(p_new_password,extensions.gen_salt('bf',10)), updated_at=now()
    WHERE company_id=auth.uid();
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_partner_owner_password(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.partner_owner_password_configured() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.change_partner_owner_password(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verify_partner_owner_password(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_owner_password_configured() TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_partner_owner_password(text,text) TO authenticated;
