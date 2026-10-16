-- Merge the existing ALL + per-command permissive policies with OR.
-- Restrictive branch/subscription policies are intentionally left in place.
DO $$
DECLARE
  v_table text;
  v_command text;
  v_using text;
  v_check text;
  v_policy record;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['partner_categories','partner_combos','partner_modifiers'] LOOP
    IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=v_table
        AND permissive='PERMISSIVE') <> 5 OR EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_table
      AND permissive='PERMISSIVE' AND roles <> ARRAY['authenticated']::name[]
    ) OR (SELECT count(DISTINCT cmd) FROM pg_policies WHERE schemaname='public'
          AND tablename=v_table AND permissive='PERMISSIVE') <> 5 THEN
      RAISE EXCEPTION 'Unexpected catalog policies for %; review before consolidation', v_table;
    END IF;
    FOREACH v_command IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      SELECT string_agg('(' || coalesce(qual,'true') || ')',' OR ' ORDER BY policyname),
             string_agg('(' || coalesce(with_check,qual,'true') || ')',' OR ' ORDER BY policyname)
      INTO v_using,v_check FROM pg_policies
      WHERE schemaname='public' AND tablename=v_table AND permissive='PERMISSIVE'
        AND cmd IN ('ALL',v_command);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO authenticated%s%s',
        'catalog_' || lower(v_command),v_table,v_command,
        CASE WHEN v_command <> 'INSERT' THEN ' USING (' || v_using || ')' ELSE '' END,
        CASE WHEN v_command IN ('INSERT','UPDATE') THEN ' WITH CHECK (' || v_check || ')' ELSE '' END);
      FOR v_policy IN SELECT policyname FROM pg_policies WHERE schemaname='public'
        AND tablename=v_table AND permissive='PERMISSIVE' AND cmd=v_command
        AND policyname <> 'catalog_' || lower(v_command) LOOP
        EXECUTE format('DROP POLICY %I ON public.%I',v_policy.policyname,v_table);
      END LOOP;
    END LOOP;
    FOR v_policy IN SELECT policyname FROM pg_policies WHERE schemaname='public'
      AND tablename=v_table AND permissive='PERMISSIVE' AND cmd='ALL' LOOP
      EXECUTE format('DROP POLICY %I ON public.%I',v_policy.policyname,v_table);
    END LOOP;
  END LOOP;
END;
$$;
