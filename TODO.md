# BTEC Assessment Portal — Implementation Checklist

## Completed features

- [x] Unit Leader has global access; Assessors are scoped to their assigned classes; students can see only their own submissions and published feedback.
- [x] Create and manage 12 class records with a capacity of 20 students each, except the approved Class 10 capacity of 21; assign one Assessor per class and enforce a maximum of two classes per Assessor.
- [x] Unit Leader can create Assessor accounts, assign classes, monitor rosters, and import students from CSV with validation and row-level results. Privileged credentials remain server-side.
- [x] Import the supplied 217-student roster into its 12 mapped classes while preserving existing account and class relationships.
- [x] Add class membership and assignment-to-class visibility while preserving existing users, assignments, announcements, resources, attempts, and legacy assessment values.
- [x] Seed Assignment 1 criteria A.P1, A.P2, A.P3 (Task 1), A.M1, and A.D1 (Task 2).
- [x] Students can view class assignments, download private PDF briefs, submit PDF/DOCX reports up to 20 MiB before the due date, track attempts/status, and submit a new attempt after authorization.
- [x] Students see feedback only after publication, in a criteria/description/achieved/comments table followed by general comments.
- [x] Assessors can filter scoped submissions, preview private PDF/DOCX files, grade criteria, save drafts, publish feedback, and allow resubmission. The Unit Leader can manage all classes and submissions.
- [x] Enforce M1 only when P1–P3 are all Yes, and D1 only when M1 is Yes, in the UI and database.
- [x] Export grades to Excel and print an individual feedback form to PDF.
- [x] Use RLS for role/class/student boundaries, private Storage buckets with signed URLs, server-enforced upload/type/size/deadline/attempt rules, and protection against student role/class changes.
- [x] Provide responsive English/Arabic controls and RTL layout support.
- [x] Accept exactly six numeric digits for student sign-in and CSV import; newly created accounts initially use the student code as the password and must change it before portal access; never reset existing account passwords.
- [x] Fix the live Assessor-creation RPC's ambiguous `user_id` reference, restrict trigger functions from direct API execution, self-scope legacy role checks, and add missing foreign-key indexes.
- [x] Restore the retained `01090680` login to Student and remove its unintended Assessor-class link without changing its Auth password.
- [x] Optimize public RLS policies to evaluate `auth.uid()` as a statement-level init plan.

## Live setup still required

- [ ] Create/confirm the six real Assessor accounts and allocate two classes to each.
- [ ] Confirm/replace demo assignments, briefs, due dates, and public demo learning resources with academy-approved materials before operational use.
- [ ] Enable Supabase Auth leaked-password protection in the project dashboard.
- [ ] Deploy the updated static frontend to Vercel; the previous deployment attempt was blocked by a 403 on the user's Vercel account.

## Private Google Drive submission storage

- [x] Implement Unit Leader Drive connection and per-class folder mapping with state-checked OAuth, Google Picker, and Vault-backed refresh-token storage; never create public links.
- [x] Implement direct browser-to-Drive resumable uploads with server-side user, class, assignment, file type/size, due-date, attempt, folder, and Drive-object validation.
- [x] Implement RLS-authorized private file streaming and assessor PDF/DOCX previews while retaining access to existing private Supabase files and briefs.
- [x] Add bilingual/RTL Drive settings UI and setup instructions; store neither Google credentials nor Drive file IDs in browser build variables or public links.
- [x] Keep the initial schema migration backward-compatible with the currently live frontend; stage the disabling of old student Supabase write policies separately.
- [x] Apply the additive migration `supabase/migrations/20261022120000_private_google_drive_submissions.sql` and deploy both Supabase Edge Functions to the `Unit1` project. The old write policies remain active.
- [x] Local checks passed: changed-file ESLint, TypeScript, 18 Vitest tests, Vite production build, and Deno checks for both Edge Functions.
- [ ] In Google Cloud, enable Drive API and Picker API, configure OAuth redirect URI `https://kcuawkpihnijjayywidk.supabase.co/functions/v1/drive-oauth` and browser origins, then add the OAuth Client ID/Secret, restricted Picker API key/project number, and `DRIVE_ALLOWED_ORIGINS` to Supabase Edge Function Secrets.
- [ ] Deploy the new frontend, connect the Unit Leader Google account, and map all 12 restricted class folders.
- [ ] Test a student upload and an authorized Assessor download/preview end to end.
- [ ] Only after the new portal is live and tested, apply `supabase/manual/disable_legacy_supabase_submission_writes.sql`; it blocks new Supabase-backed student uploads but retains read access to old private submissions.
- [ ] Review Drive download/function bandwidth after rollout; file storage leaves Supabase Storage, but private download traffic still uses Edge Function/network capacity.
