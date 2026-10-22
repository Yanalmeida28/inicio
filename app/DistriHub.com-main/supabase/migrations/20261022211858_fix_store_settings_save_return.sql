-- The legacy BEFORE INSERT trigger updates a hard-coded subset of fields and
-- returns NULL. It loses service_warranty_terms/personalization on upsert and
-- suppresses RETURNING, which PostgREST reports as 406 with .single().
-- A unique index already exists in production; native ON CONFLICT now handles
-- retries atomically, preserving omitted fields and returning the saved row.
CREATE UNIQUE INDEX IF NOT EXISTS store_settings_v2_user_id_unique ON public.store_settings_v2(user_id);
DROP TRIGGER IF EXISTS store_settings_v2_before_insert ON public.store_settings_v2;
