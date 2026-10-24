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

The portal starts with 12 classes: Class 10 is currently set to 21 students and the others to 20. As Unit Leader, you can add or rename classes and set each capacity from 1 to 500; a capacity cannot be reduced below current enrollment. You can delete a class with no student or Drive-upload history, or choose a destination to transfer students, assignment access, and upload-session history first. Student accounts, submissions, and Drive files are never deleted by this action; active uploads must finish, and the deleted class's Assessor/folder mapping is removed (the Drive folder itself remains in Drive).

1. Sign in using the Unit Leader account and open **Classes**.
2. Create the six Assessor accounts with their real names and email addresses. Assign two classes to each Assessor. The database prevents an Assessor from being assigned to a third class and prevents two Assessors from owning the same class.
3. Use **Import students** to load each class roster. CSV headers are `student_code,full_name`; codes must be exactly six digits. Respect each class capacity.
4. Open **Assignments** to confirm class visibility, add the real due date and approved brief PDF, and publish the assignment. Assignment 1 is seeded with A.P1, A.P2, A.P3 (Task 1) and A.M1, A.D1 (Task 2). Replace demo content with academy-approved material before operational use.
5. Complete the one-time Drive activation below, connect the Unit Leader Google account in **Manage → Google Drive storage**, and map a restricted Drive folder to every class before accepting submissions.
6. Students sign in and upload a PDF or DOCX up to 20 MiB before the due date. An Assessor can allow a later resubmission after publishing feedback.

## Private Google Drive activation

The OAuth client secret and refresh token must never be committed, placed in a `VITE_` variable, or sent in chat. Configure the OAuth client in Google Cloud and enter server-side values directly in the Supabase Dashboard.

### Google Cloud setup

1. Enable **Google Drive API** and **Google Picker API** in the Google Cloud project.
2. Configure the OAuth consent screen for the portal's staff account and the requested `drive.file` scope (the portal also requests basic OpenID/email identity scopes).
3. In the Web OAuth Client, add this exact **Authorized redirect URI**:

   `https://kcuawkpihnijjayywidk.supabase.co/functions/v1/drive-oauth`

4. Add this exact **Authorized JavaScript origin**: `https://unit1-offecial-portal.vercel.app`. For local testing, also add `http://localhost:5173`.
5. Create a separate Google **API key** for Picker (this is not the OAuth Client ID or Client Secret). Restrict the key to the Google Picker API and the portal's website/referrer, including `https://unit1-offecial-portal.vercel.app/*`. Create it in the same Google Cloud project as the OAuth client.
6. Find that Cloud project's numeric **Project number** in Google Cloud project information. Use the number, not the project ID or project name.
7. Keep the Drive root and all class folders restricted. The portal does not alter sharing settings.

### Supabase Edge Function secrets

In the Supabase project `kcuawkpihnijjayywidk`, open **Project Settings → Edge Functions → Secrets**. The OAuth Client ID and Client Secret are already configured by the Unit Leader. Add the following remaining settings:

- `DRIVE_API_KEY` — the restricted Google Picker API key created above. The server supplies it to the authenticated Unit Leader's Picker session; it must be restricted by website/referrer and API.
- `DRIVE_CLOUD_PROJECT_NUMBER` — the numeric Google Cloud project number for the same project as the OAuth client and API key. Google Picker calls this `appId`; it is not a secret.
- `DRIVE_ALLOWED_ORIGINS` — an exact, comma-separated allowlist of portal browser origins accepted by the Edge Functions for CORS and the OAuth return URL. Set it to `https://unit1-offecial-portal.vercel.app`. If using the local Vite app too, set it to `https://unit1-offecial-portal.vercel.app,http://localhost:5173`. Do not add a path or trailing slash. This is configuration, not a credential.

Supabase provides its project URL and server keys to Edge Functions at runtime. Do not copy the service-role key into the browser or add it as a Vercel variable. Do not add any Google credential as a `VITE_` variable.

### Connect and map folders

After the migration and both Edge Functions are deployed and the required secrets/configuration are present, a Unit Leader opens **Manage → Google Drive storage**, selects **Connect Google Drive**, and authorizes the intended Drive account. Use **Select private folder** for each class to choose its restricted folder in Google Picker. Map all 12 classes and verify their mapped state before students upload. The Picker grants the app access to the selected folders; the portal does not make those folders or files public.

### Safe production rollout order

Both additive migrations and both Edge Functions are deployed. Existing Supabase submission write policies intentionally remain enabled during the transition. Add the browser build variables and Google Picker settings, connect Drive and map all 12 folders, then test a student upload and an authorized Assessor download before removing the old write path. Only after that test, apply `supabase/manual/disable_legacy_supabase_submission_writes.sql` as a separate cutover. It removes student INSERT policies for new Supabase-backed submissions but preserves SELECT access to historical private files. Do not apply that manual cutover while students may still be using the old submission flow.

Current status (2026-10-23): the production portal origin confirmed by the Unit Leader is `https://unit1-offecial-portal.vercel.app`. The linked Vercel project reported a **Ready** production build. At the last Vercel environment check, no browser variables were configured, so add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` if they are not already present and redeploy. The OAuth Client ID/Secret are configured in Supabase; Picker key, Cloud project number, allowed origin, folder mapping, and end-to-end testing remain. The manual Supabase-write cutover has not been applied.

New files are named using class, six-digit student code, assignment slug, and attempt number. The browser uploads file bytes directly to a Google resumable-upload session; Supabase stores only submission metadata and the private Drive file ID. Upload finalization verifies the user, class, assignment, allowed file type/size, due date, attempt number, target folder, and Drive object before recording the submission.

Existing submissions already stored in the private Supabase Storage bucket are not copied or deleted by this integration and remain accessible using the legacy signed-URL path. Assignment briefs remain in their existing private bucket. Private Drive downloads/previews are streamed through the authenticated Supabase Edge Function after it checks the submission under the caller's RLS. This saves Supabase Storage capacity, but private download traffic still uses Supabase Edge Function/network capacity.

## Data, security, and local development

The core Drive migration is `supabase/migrations/20261022120000_private_google_drive_submissions.sql`; the follow-up migration `supabase/migrations/20261023120000_drive_indexes_and_student_reimport_safety.sql` adds indexes and prevents CSV reimports from resetting existing student passwords. The post-launch policy cutover is kept separately in `supabase/manual/disable_legacy_supabase_submission_writes.sql`. Drive IDs are not public URLs. The functions are in `supabase/functions/drive-oauth` and `supabase/functions/drive-storage`; `supabase/config.toml` leaves OAuth callback JWT validation off only because OAuth state is checked by the function, while the storage function requires JWT validation and verifies the caller's role or row access.

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

Use only the Supabase publishable/anon key in Vercel; never set a service-role key as a `VITE_` variable. After deployment, configure `https://unit1-offecial-portal.vercel.app` in Supabase Auth URL settings, Google OAuth **Authorized JavaScript origins**, and `DRIVE_ALLOWED_ORIGINS`. Confirm the final Drive mapping and test direct refreshes on `/manage/drive` and `/manage/submissions/<submission-id>`.

## Existing resource hub

- Shared resources are grouped by Learning Aim with filters, search, video/PDF support, and criterion-linked helpful materials.
- The Unit Leader can manage resources, announcements, and reusable feedback snippets.
- Existing resources, announcements, attempts, and legacy assessment records are retained during portal migration.

## Final launch steps

1. In Vercel Project Settings → Environment Variables, set `VITE_SUPABASE_URL` to `https://kcuawkpihnijjayywidk.supabase.co` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the active `sb_publishable_...` key from Supabase Project Settings → API Keys. Apply both to Production, Preview, and Development, then redeploy. Never use a Supabase service-role key in a `VITE_` variable.
2. In Supabase Edge Function Secrets, add `DRIVE_API_KEY` and `DRIVE_CLOUD_PROJECT_NUMBER`; the OAuth Client ID/Secret are already configured. Set `DRIVE_ALLOWED_ORIGINS=https://unit1-offecial-portal.vercel.app` (append `,http://localhost:5173` only if needed for local development). The required Google OAuth redirect URI is `https://kcuawkpihnijjayywidk.supabase.co/functions/v1/drive-oauth`.
3. Enable Supabase leaked-password protection in the Authentication password-security settings; it is currently disabled. See [Supabase leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
4. Sign in as Unit Leader, connect the Google account, and map the 12 restricted class folders. Test one student upload and an authorized Assessor preview/download.
5. Only after that test, apply `supabase/manual/disable_legacy_supabase_submission_writes.sql` to stop new Supabase Storage submissions. Historical private submissions remain readable.
