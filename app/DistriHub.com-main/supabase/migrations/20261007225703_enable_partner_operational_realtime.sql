-- Publish operational changes without widening any table privileges or RLS policies.
DO $migration$
DECLARE v_table text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname='supabase_realtime') THEN
    RAISE EXCEPTION 'Publication supabase_realtime is not configured';
  END IF;
  FOREACH v_table IN ARRAY ARRAY['partner_sales','partner_products','partner_invoices','stock_movements','b2b_orders','rma_requests_v2']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=v_table AND c.relrowsecurity
    ) THEN RAISE EXCEPTION 'RLS must be enabled on public.% before publishing', v_table; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=v_table
    ) THEN
      EXECUTE pg_catalog.format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',v_table);
    END IF;
  END LOOP;
END;
$migration$;
