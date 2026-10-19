# BTEC Assessment Portal — QA and Live Fixes

**Checked:** 19 October 2026

## Live Engineer creation issue

Supabase logs showed PostgreSQL error `42702: column reference "user_id" is ambiguous` during `/rpc/create_engineer`. The function returns an output column named `user_id`, which conflicted with an unqualified `user_id` in its `DELETE FROM user_roles` statement. The follow-up migration qualifies the table column (`existing_role.user_id`) and the RPC was smoke-tested successfully.

The retained `01090680@student.local` login was also found marked as an Engineer with an Engineer-class link, despite being the existing Student test account. It has been restored to the Student role, the mistaken Engineer-class link was removed, and no Auth credential/password fields were changed. Its class remains unset until the Unit Leader imports the correct roster.

## Live workflow smoke tests

Database-level tests passed for Engineer account creation, assigning two classes to an Engineer, rejecting a third class, importing 20 synthetic students into a class, rejecting the 21st student, Engineer/Student class-scope checks, and self-scoped role checks. The temporary smoke-test Engineer and student accounts were deleted afterward; no synthetic roster rows remain.

Current live setup: 12 classes, 1 Unit Leader, 0 Engineer accounts, 1 Student account, and 0 Engineer-class assignments. Real staff identities and the actual student roster/class mapping are still required before normal operation.

## Code validation

- `pnpm exec tsc --noEmit` — passed.
- `pnpm test` — passed: 4 test files, 12 tests.
- Targeted ESLint on the updated application files — passed.
- `pnpm build` — passed.
- Project-wide `pnpm lint` — still reports 595 errors and 8 warnings, primarily existing Prettier formatting violations in files outside the focused changes; ESLint reported 594 errors as auto-fixable. The full repository was not autoformatted to avoid an unrelated, broad diff.

## Supabase advisor notes

- The initial RLS initialization-plan warning set was cleared by wrapping direct `auth.uid()` calls in statement-level `SELECT`s; the advisor no longer reports that category.
- The advisor still flags 15 authenticated-callable `SECURITY DEFINER` functions. They are used by RLS or guarded management RPCs, are not executable by `anon`, and include caller-scope/Unit-Leader checks. The six trigger-only functions have had direct execution revoked from `PUBLIC`, `anon`, and `authenticated`.
- The advisor reports leaked-password protection disabled. Enable it in Supabase Auth settings when convenient: [Supabase password strength and leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- It also reports 12 multiple-permissive-policy and 6 unused-index observations. The policies separate class-scoped reads from Unit Leader management; new indexes may remain unused until the live portal accumulates assessment data.

## Applied database migrations

- `20261019192114_btec_assessment_portal.sql`
- `20261019200525_portal_engineer_security_fixes.sql`
- `20261019201506_optimize_rls_auth_uid.sql`

Supabase references: [SECURITY DEFINER function lint](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [RLS performance guidance](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select), [multiple permissive policies lint](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies), and [unused index lint](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
