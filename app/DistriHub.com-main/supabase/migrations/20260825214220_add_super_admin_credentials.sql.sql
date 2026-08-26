/*
# Super Admin Master Authentication

1. New Tables
- `super_admin_settings` — singleton table (id = 1) storing the master password hash,
  recovery email, and recovery code state.
  - `password_hash` (text, not null) — bcrypt hash via pgcrypto `crypt()`
  - `recovery_email` (text, not null) — email used for password recovery verification
  - `recovery_code` (text, nullable) — one-time recovery code
  - `recovery_code_expires_at` (timestamptz, nullable) — code expiry (15 min)
  - `updated_at` (timestamptz, default now())

2. Security
- RLS enabled on `super_admin_settings` with NO policies — the table is completely
  inaccessible to anon/authenticated roles directly. All access is mediated through
  SECURITY DEFINER functions that run with elevated (owner) privileges.
- Four SECURITY DEFINER functions exposed to anon + authenticated:
  - `verify_super_admin_password(input_password)` → boolean
  - `change_super_admin_password(current_password, new_password)` → boolean
  - `request_super_admin_recovery(input_email)` → text (recovery code) or NULL
  - `reset_super_admin_password(recovery_code, new_password)` → boolean
- Functions expose only boolean or code values — never the stored password hash.

3. Seed Data
- Inserts a singleton row (id = 1) with default password `admin123` (bcrypt-hashed)
  and recovery email `admin@distrihub.com`.

4. Important Notes
- The default password should be changed immediately after first login via the
  "Segurança / Alterar Senha Master" settings tab.
- Recovery codes are valid for 15 minutes and are single-use (cleared on reset).
- Since this environment cannot send emails, the recovery code is returned to the
  caller. In production, it would be sent via email instead.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS super_admin_settings (
  id int PRIMARY KEY DEFAULT 1,
  password_hash text NOT NULL,
  recovery_email text NOT NULL DEFAULT 'admin@distrihub.com',
  recovery_code text,
  recovery_code_expires_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO super_admin_settings (id, password_hash, recovery_email)
VALUES (1, extensions.crypt('admin123', extensions.gen_salt('bf')), 'admin@distrihub.com')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE super_admin_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION verify_super_admin_password(input_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  stored_hash text;
BEGIN
  SELECT password_hash INTO stored_hash FROM super_admin_settings WHERE id = 1;
  IF stored_hash IS NULL THEN
    RETURN false;
  END IF;
  RETURN extensions.crypt(input_password, stored_hash) = stored_hash;
END;
$$;

CREATE OR REPLACE FUNCTION change_super_admin_password(current_password text, new_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  stored_hash text;
BEGIN
  SELECT password_hash INTO stored_hash FROM super_admin_settings WHERE id = 1;
  IF stored_hash IS NULL OR extensions.crypt(current_password, stored_hash) != stored_hash THEN
    RETURN false;
  END IF;
  UPDATE super_admin_settings
  SET password_hash = extensions.crypt(new_password, extensions.gen_salt('bf')), updated_at = now()
  WHERE id = 1;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION request_super_admin_recovery(input_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  stored_email text;
  new_code text;
BEGIN
  SELECT recovery_email INTO stored_email FROM super_admin_settings WHERE id = 1;
  IF stored_email IS NULL OR lower(trim(input_email)) != lower(trim(stored_email)) THEN
    RETURN NULL;
  END IF;
  new_code := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
  UPDATE super_admin_settings
  SET recovery_code = new_code, recovery_code_expires_at = now() + interval '15 minutes'
  WHERE id = 1;
  RETURN new_code;
END;
$$;

CREATE OR REPLACE FUNCTION reset_super_admin_password(recovery_code_input text, new_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  stored_code text;
  expires_at timestamptz;
BEGIN
  SELECT recovery_code, recovery_code_expires_at INTO stored_code, expires_at
  FROM super_admin_settings WHERE id = 1;
  IF stored_code IS NULL OR upper(trim(recovery_code_input)) != stored_code THEN
    RETURN false;
  END IF;
  IF expires_at IS NULL OR expires_at < now() THEN
    RETURN false;
  END IF;
  UPDATE super_admin_settings
  SET password_hash = extensions.crypt(new_password, extensions.gen_salt('bf')),
      recovery_code = NULL,
      recovery_code_expires_at = NULL,
      updated_at = now()
  WHERE id = 1;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION verify_super_admin_password(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION change_super_admin_password(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION request_super_admin_recovery(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reset_super_admin_password(text, text) TO anon, authenticated;