-- Cache auth.uid() as a statement-level init plan in RLS expressions rather
-- than reevaluating it for each row. This preserves policy logic and roles.
DO $$
DECLARE
  policy_row record;
  using_expression text;
  check_expression text;
  statement text;
  changed_count integer := 0;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual IS NOT NULL AND position('auth.uid()' IN qual) > 0 AND position('(select auth.uid())' IN qual) = 0)
        OR
        (with_check IS NOT NULL AND position('auth.uid()' IN with_check) > 0 AND position('(select auth.uid())' IN with_check) = 0)
      )
  LOOP
    using_expression := replace(policy_row.qual, 'auth.uid()', '(select auth.uid())');
    check_expression := replace(policy_row.with_check, 'auth.uid()', '(select auth.uid())');
    statement := format('ALTER POLICY %I ON %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
    IF policy_row.qual IS NOT NULL THEN
      statement := statement || format(' USING (%s)', using_expression);
    END IF;
    IF policy_row.with_check IS NOT NULL THEN
      statement := statement || format(' WITH CHECK (%s)', check_expression);
    END IF;
    EXECUTE statement;
    changed_count := changed_count + 1;
  END LOOP;
  RAISE NOTICE 'Optimized % RLS policies.', changed_count;
END $$;
