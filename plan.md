# BTEC Assessment Portal — Private Google Drive Submission Storage

## Goal and approved approach

Replace **new coursework file bytes** in Supabase Storage with files in the user's existing restricted Google Drive folder. Keep Supabase Auth, Postgres, RLS, feedback, and the React/Vite application; the frontend remains compatible with Vercel static hosting. Use Supabase Edge Functions as the authenticated server bridge because the project already uses Supabase Auth and the Edge runtime can use the platform-injected server key without exposing it in the browser.

The storage target must remain private. Never create `anyone` link permissions or expose a Drive `webViewLink` as a portal file URL. Google OAuth requests only the non-sensitive `drive.file` scope; a Unit Leader uses Google Picker to grant the app access to the specific class folders. Keep the OAuth client secret and Drive refresh token server-side (client secret in Edge Function secrets; refresh token in Supabase Vault), with a one-time state-checked OAuth callback at `https://kcuawkpihnijjayywidk.supabase.co/functions/v1/drive-oauth`.

Uploads remain limited to non-empty PDF/DOCX files no larger than 20 MiB and subject to the existing deadline/resubmission rules. The browser asks the authenticated Edge Function for a Drive resumable-upload session, transfers the file bytes directly from the browser to Google Drive, then asks the function to verify the uploaded Drive metadata and create the submission record. This avoids sending file bytes through Supabase Storage or a small serverless request body. New Drive files are named consistently as class, student code, assignment slug, and attempt number, and saved in that class's selected private Drive folder.

Supabase stores submission metadata and Drive file IDs, not public file URLs. Existing `supabase`-provider submissions and the private briefs bucket continue to work unchanged. Drive downloads and previews are streamed through an authenticated Edge Function after it confirms the caller can read the exact submission under existing RLS: students only their own, Assessors only their assigned classes, Unit Leader globally. Criterion grading, comments, drafts, publishing, resubmission, and feedback visibility remain unchanged.

## Required outcomes vs. configuration prerequisites

Required behavior: private class-folder mapping; Unit Leader-only Drive connection and folder setup; safe OAuth `state`; server-only secrets; direct resumable upload; server validation of file, assignment, due date, attempt, class folder and Drive object; private authenticated streaming downloads; compatibility with older Supabase Storage records; preserve all existing role and feedback protections.

Configuration prerequisite: in Google Cloud, enable Drive API and Picker API, configure an OAuth Web Client with the exact callback above, add the portal origin(s), and restrict the Picker API key to those origins and Picker API. In Supabase Edge Function Secrets, configure the OAuth Client ID/Secret, Picker API key/project number, and allowed portal origin. Do not commit credential values or put secrets in `VITE_` variables. The user could not access the Manus secure credential form, so they will enter these values directly in the Supabase Dashboard when implementation is ready.

Material constraint: Drive avoids Supabase Storage capacity use, but downloads are proxied through Supabase Edge Functions to preserve privacy; transferred download bytes still use Supabase function/network capacity. Do not claim this removes all Supabase bandwidth usage. Do not migrate, rename, delete, or make public any existing Drive or Supabase files as part of rollout.

## Project structure

- `src/routes/_authenticated/manage/drive.tsx`: Unit Leader-only Drive connection and per-class private-folder mapping UI, styled consistently with existing management pages and bilingual/RTL controls.
- `src/lib/drive.ts`: authenticated function calls, resumable direct-upload helper, and private file-blob/open helpers.
- `src/lib/portal.ts`: typed submission storage metadata and queries; retain signed URLs for briefs and legacy Supabase submissions.
- `src/routes/_authenticated/assignments.$id.tsx`: student Drive upload/finalize path and private download handling; preserve due-date, attempt, 20 MiB PDF/DOCX, and feedback behavior.
- `src/routes/_authenticated/manage/submissions.$id.tsx`: Assessor PDF/DOCX preview and download through the authorized private file endpoint; keep all grading and publication controls.
- `supabase/functions/drive-oauth/index.ts`: state-checked OAuth start/callback, Picker token, and Vault storage for the refresh token.
- `supabase/functions/drive-storage/index.ts`: JWT-verified folder setup, resumable upload initiation/finalization, metadata/authorization validation, and streamed private download.
- `supabase/migrations/`: add provider/file metadata, class-folder mapping and service-only upload session/OAuth state structures; update the submission trigger to preserve the legacy Storage path and accept only server-verified Drive submissions.
- `README.md` and `TODO.md`: exact external setup and remaining activation requirements.

## Design

Reuse the portal's established BTEC interface: dark teal navigation, light warm canvas, clear card/table hierarchy, accessible form states, and existing English/Arabic RTL controls. The new Unit Leader integration screen should be utilitarian and explicit: a Drive connection status, a private-folder picker per class, a visible mapped/not-mapped state, and no decorative assets. Copy should explain that files remain private and that storage is Drive while access checks remain in the portal.


## Implementation and rollout status (2026-10-23)

The Drive OAuth/storage functions, Unit Leader mapping page, student upload path, private assessor/student file access, bilingual labels, and documentation are implemented in the repository. Local validation passed: changed-file ESLint, TypeScript, 18 unit tests, Vite production build, and Deno checks for both Edge Functions.

The database rollout is intentionally staged. Both additive migrations and both Edge Functions are deployed, while existing Supabase submission writes remain enabled. The Unit Leader confirmed the production portal origin as `https://unit1-offecial-portal.vercel.app`. Add the missing browser build variables and Google Picker settings, connect Drive, map all 12 folders, and verify one student upload plus an authorized Assessor download before applying `supabase/manual/disable_legacy_supabase_submission_writes.sql`.


Production status (2026-10-23): the Drive schema migration and follow-up indexes/student-reimport-safety migration are applied to project `Unit1` (`kcuawkpihnijjayywidk`). Both `drive-oauth` (manual state/auth checks; `verify_jwt=false`) and `drive-storage` (gateway JWT validation enabled) are active. Existing student Supabase INSERT policies remain present. The OAuth Client ID/Secret are configured; the Picker API key, Cloud project number, exact portal origin, folder mapping, and end-to-end test remain. Apply the separately staged manual write-policy cutover only after the Drive-backed portal has been tested.


Vercel status (2026-10-23): the linked project reported a production deployment marked READY; the Unit Leader confirmed its production origin as `https://unit1-offecial-portal.vercel.app`. At the last environment check, the Vercel project had no variables, and the Vercel environment write endpoint rejected the project lookup, so no variables were changed. If not already added, set `VITE_SUPABASE_URL=https://kcuawkpihnijjayywidk.supabase.co` and the browser-safe `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel Project Settings → Environment Variables, then redeploy.


Security/performance follow-up (2026-10-23): applied `20261023120000_drive_indexes_and_student_reimport_safety.sql`. Verified existing CSV imports no longer update `auth.users` or return an existing student's password, new student accounts receive `must_change_password=true`, intended grants remain (`anon=false`, `authenticated=true`, `service_role=true`), and all three Drive foreign-key indexes exist. The Supabase security advisor still reports leaked-password protection disabled; enable it manually in Auth password-security settings. Its 20 authenticated `SECURITY DEFINER` warnings are understood: RLS helpers bind the supplied user ID to `auth.uid()`, management RPCs check Unit Leader authorization, and the Drive Vault/session RPCs are service-role-only. The three private Drive tables intentionally have RLS enabled with no user policies and no direct grants; only the service role accesses them. Performance advisor no longer reports unindexed foreign keys; it still notes unused Drive indexes before traffic and existing multiple-permissive-policy patterns.


## Unit Leader class lifecycle extension (2026-10-24)

The existing **Manage → Classes** screen now supports creating uniquely named classes, renaming them, and setting capacity from 1 to 500 while preventing a limit below current enrollment. The database replaces the prior fixed 20/21 capacity rule and enforces the same bounds independently of the UI.

Deletion is routed through a Unit Leader-only RPC; authenticated clients cannot delete class rows directly. If students or Drive upload-session history exist, the Unit Leader must choose a destination with enough capacity. Student membership, assignment visibility, and completed/expired upload-session metadata are transferred before the source class is removed. Active uploads block deletion. Student accounts, submissions, Drive objects, and the physical Drive folder are preserved. The migration was applied to the Unit1 Supabase project without changing the existing 12 class records or enrollments.
