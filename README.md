# BTEC Assessment Portal

For Unit 1, _IT Systems — Strategy, Management and Infrastructure_, at Elsewedy Technical Academy (Pearson BTEC Level 3 Extended Diploma in IT). The frontend is a React 19 + Vite single-page application with TanStack Router and React Query, suitable for static hosting on Vercel. Supabase provides Auth, Postgres, RLS, and Edge Functions; new student submission files use the Unit Leader's restricted Google Drive after one-time activation.

## Portal features

- Students see assignments for their own class, download private PDF briefs, submit PDF/DOCX files, follow attempt/status history, and view feedback only after publication.
- Assessors access submissions only for their assigned classes. The Unit Leader has global access to classes, Assessors, students, assignments, submissions, and feedback.
- Assessment feedback includes criterion-level Yes/No decisions and comments, general comments, draft/publish/resubmission controls, Excel grade exports, and a print-to-PDF feedback form.
- English/Arabic language toggle with RTL layout, responsive navigation, private file access, and database-enforced row-level security.
- New submission bytes are uploaded to a mapped private Google Drive class folder. Drive file IDs remain on the server side; the portal does not create public permissions or expose Google Drive share links.

## Authentication

Students sign in with a 6-digit student code and password. The app maps the code to Supabase Auth's internal alias format (`<student-code>@student.local`). Staff sign in using their email and password. New student accounts initially use the student's code as the password and follow the portal's first-login password-change flow. Importing an existing account does not reset its password. Share student codes through an approved secure channel.

## First-time Unit Leader setup

The portal contains 12 classes. Class 10 is approved for 21 students; the other classes are capped at 20. Existing records and Assessor links are preserved. Create the real Assessor accounts and import the real class rosters before operational use.

1. Sign in using the Unit Leader account and open **Classes**.
2. Create the six Assessor accounts with their real names and email addresses. Assign two classes to each Assessor. The database prevents an Assessor from being assigned to a third class and prevents two Assessors from owning the same class.
3. Use **Import students** to load each class roster. CSV headers are `student_code,full_name`; codes must be exactly six digits. Respect each class capacity.
4. Open **Assignments** to confirm class visibility, add the real due date and approved brief PDF, and publish the assignment. Assignment 1 is seeded with A.P1, A.P2, A.P3 (Task 1) and A.M1, A.D1 (Task 2). Replace demo content with academy-approved material before operational use.
5. Complete the one-time Drive activation below, connect the Unit Leader Google account in **Manage → Google Drive storage**, and map a restricted Drive folder to every class before accepting submissions.
6. Students sign in and upload a PDF or DOCX up to 20 MiB before the due date. An Assessor can allow a later resubmission after publishing feedback.

## Private Google Drive activation

The OAuth client secret and refresh token must never be committed, placed in a `VITE_` variable, or sent in chat. Configure the OAuth client in Google Cloud and enter the server-side values directly in the Supabase Dashboard.

### Google Cloud setup

1. Enable **Google Drive API** and **Google Picker API** in the Google Cloud project.
2. Configure the OAuth consent screen for the portal's staff account and the requested `drive.file` scope (the portal also requests basic OpenID/email identity scopes).
3. In the Web OAuth Client, add this exact **Authorized redirect URI**:

   `https://kcuawkpihnijjayywidk.supabase.co/functions/v1/drive-oauth`

4. Add the portal's deployed site URL under **Authorized JavaScript origins** (for example `https://aimwise-learning-hub.lovable.app` and the final Vercel origin once known). For local testing, add `http://localhost:5173`.
5. Create a Google API key for Google Picker, restrict it to the portal's JavaScript origins and the Picker API, and note the Google Cloud **project number**. The project number, not the project ID, is used by Picker.
6. Keep the Drive root and all class folders restricted. The portal does not alter sharing settings.

### Supabase Edge Function secrets

In the Supabase project `kcuawkpihnijjayywidk`, open **Project Settings → Edge Functions → Secrets** and add these values directly in the dashboard:

- `GOOGLE_OAUTH_CLIENT_ID` — Web OAuth Client ID.
- `GOOGLE_OAUTH_CLIENT_SECRET` — Web OAuth Client Secret.
- `DRIVE_API_KEY` — restricted Google Picker API key.
- `DRIVE_CLOUD_PROJECT_NUMBER` — numeric Google Cloud project number.
- `DRIVE_ALLOWED_ORIGINS` — comma-separated exact origins allowed to call the portal functions, such as `https://aimwise-learning-hub.lovable.app,http://localhost:5173`; add the final Vercel origin before using the Vercel deployment.

Supabase provides its project URL and server keys to Edge Functions at runtime. Do not copy the service-role key into the browser or add it as a Vercel variable. Do not add any Google credential as a `VITE_` variable.

### Connect and map folders

After the migration and both Edge Functions are deployed and the secrets are present, a Unit Leader opens **Manage → Google Drive storage**, selects **Connect Google Drive**, and authorizes the intended Drive account. Use **Select private folder** for each class to choose its restricted folder in Google Picker. Map all 12 classes and verify their mapped state before students upload. The Picker grants the app access to the selected folders; the portal does not make those folders or files public.

### Safe production rollout order

The currently deployed frontend still writes new submissions directly to Supabase Storage. The additive Drive migration intentionally preserves those old write policies so the live portal keeps working during transition. Apply the core schema migration and deploy both Edge Functions first, add the Google/Supabase secrets, then deploy the Vite frontend. Connect Drive and map the 12 private class folders; test a student upload and an authorized Assessor download before removing the old write path. Only after that test, apply `supabase/manual/disable_legacy_supabase_submission_writes.sql` as a separate cutover. It removes student INSERT policies for new Supabase-backed submissions but preserves SELECT access to all historical private files. Do not apply that manual cutover while the old frontend is still serving students.

Current project status (2026-10-23): the additive migration and both Edge Functions are deployed to the `Unit1` Supabase project. Google Cloud APIs/credentials, the final Vercel frontend deployment, class-folder mapping, and the end-to-end test remain. The manual Supabase-write cutover has **not** been applied.

New files are named using class, six-digit student code, assignment slug, and attempt number. The browser uploads file bytes directly to a Google resumable-upload session; Supabase stores only submission metadata and the private Drive file ID. Upload finalization verifies the user, class, assignment, allowed file type/size, due date, attempt number, target folder, and Drive object before recording the submission.

Existing submissions already stored in the private Supabase Storage bucket are not copied or deleted by this integration and remain accessible using the legacy signed-URL path. Assignment briefs remain in their existing private bucket. Private Drive downloads/previews are streamed through the authenticated Supabase Edge Function after it checks the submission under the caller's RLS. This saves Supabase Storage capacity, but private download traffic still uses Supabase Edge Function/network capacity.

## Data, security, and local development

The additive Drive migration is `supabase/migrations/20261022120000_private_google_drive_submissions.sql`. It adds service-only Drive folder mappings, OAuth states, upload sessions, Vault token RPCs, storage metadata, and a submission guard that preserves the old Supabase Storage path. The post-launch policy cutover is kept separately in `supabase/manual/disable_legacy_supabase_submission_writes.sql`. Drive IDs are not public URLs. The functions are in `supabase/functions/drive-oauth` and `supabase/functions/drive-storage`; `supabase/config.toml` leaves OAuth callback JWT validation off only because OAuth state is checked by the function, while the storage function requires JWT validation and verifies the caller's role or row access.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Checks:

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm build
npx deno check --no-lock supabase/functions/drive-oauth/index.ts supabase/functions/drive-storage/index.ts
```

## Deploy to Vercel

Import this GitHub repository in Vercel and use the Vite preset. `pnpm build` produces static files in `dist`, and `vercel.json` rewrites nested routes to the SPA. Set these browser-safe build environment variables for Production, Preview, and Development:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Use only the Supabase publishable/anon key in Vercel; never set a service-role key as a `VITE_` variable. After deployment, configure the deployed origin in Supabase Auth URL settings, Google OAuth **Authorized JavaScript origins**, and `DRIVE_ALLOWED_ORIGINS`. Confirm the final Drive mapping and test direct refreshes on `/manage/drive` and `/manage/submissions/<submission-id>`.

## Existing resource hub

- Shared resources are grouped by Learning Aim with filters, search, video/PDF support, and criterion-linked helpful materials.
- The Unit Leader can manage resources, announcements, and reusable feedback snippets.
- Existing resources, announcements, attempts, and legacy assessment records are retained during portal migration.
