/* Super Admin client management through password-protected RPCs. */

CREATE OR REPLACE FUNCTION public.verify_super_admin(input_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  stored_hash text;
BEGIN
  SELECT password_hash INTO stored_hash FROM public.super_admin_settings WHERE id = 1;
  RETURN stored_hash IS NOT NULL AND extensions.crypt(input_password, stored_hash) = stored_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_super_admin_clients(input_password text)
RETURNS SETOF public.admin_lojistas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_super_admin(input_password) THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM public.admin_lojistas ORDER BY created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_super_admin_client(
  input_password text,
  client_id uuid,
  new_status text DEFAULT NULL,
  new_credit_limit numeric DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_super_admin(input_password) THEN
    RETURN false;
  END IF;
  UPDATE public.admin_lojistas
  SET status = COALESCE(new_status, status),
      credit_limit = COALESCE(new_credit_limit, credit_limit)
  WHERE id = client_id;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_super_admin(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_super_admin_clients(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_super_admin_client(text, uuid, text, numeric) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_admin_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_lojistas (user_id, business_name, document, whatsapp, segment, status)
  VALUES (NEW.id, NEW.business_name, NEW.document, NEW.whatsapp, NEW.segment, 'aprovado')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_partner_profile_created_admin ON public.partner_profiles;
CREATE TRIGGER on_partner_profile_created_admin
  AFTER INSERT ON public.partner_profiles
  FOR EACH ROW EXECUTE FUNCTION public.register_admin_client();
