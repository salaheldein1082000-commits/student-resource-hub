# BTEC Assessment Portal

For Unit 1, _IT Systems — Strategy, Management and Infrastructure_, at Elsewedy Technical Academy (Pearson BTEC Level 3 Extended Diploma in IT). The frontend is a standard React 19 + Vite single-page application with TanStack Router and React Query. It is configured for static hosting on Vercel; Supabase remains the Auth, Postgres, and private Storage backend.

## Portal features

- Students see assignments for their own class, download PDF briefs, upload PDF/DOCX work, follow attempt/status history, and view feedback only after publication.
- Engineers assess only students in their assigned classes. The Unit Leader has global access to classes, staff, students, assignments, submissions, and feedback.
- Assessment feedback includes criterion-level Yes/No decisions and comments, general comments, draft/publish/resubmission controls, Excel grade exports, and a print-to-PDF feedback form.
- English/Arabic language toggle with RTL layout, responsive navigation, private Supabase Storage, short-lived signed file URLs, and database-enforced row-level security.

## Authentication

Students sign in with a 6-digit student code and password. The app maps the code to Supabase Auth's internal alias format (`<student-code>@student.local`). Staff sign in using their email and password. A newly imported student account initially uses the student's code as its password and is required to set a private password of at least 12 characters before opening the portal. Importing an existing account never resets its password. Share student codes through an approved secure channel.

## First-time Unit Leader setup

The migration created 12 portal classes and assigned the currently published Unit 1 assignments to them. The supplied roster maps `Class 1-31` to `Class 31`, then `Class 1-32`–`Class 1-42` to `Class 02`–`Class 12`; Class 10 is approved for 21 students, while every other class remains capped at 20. Existing records and Engineer links are preserved. Create the actual Engineer accounts and import the real class rosters before operational use.

1. Sign in using the existing Unit Leader/staff account, then open **Classes**.
2. Create the six Engineer accounts using their real names and email addresses. Assign exactly two classes to each Engineer. The database prevents an Engineer from being assigned to a third class and prevents two Engineers from owning the same class.
3. Use **Import students** to load each class roster. CSV headers: `student_code,full_name`; codes must be exactly six digits. Import up to each class's capacity (20, or 21 for Class 10). New accounts use the student code as the initial password and must change it at first sign-in. Existing account passwords are not reset.
4. Open **Assignments** to confirm class visibility, add the real due date and approved brief PDF, and publish the assignment. Assignment 1 is seeded with A.P1, A.P2, A.P3 (Task 1) and A.M1, A.D1 (Task 2). The initial public resources/assignments marked as demo content should be replaced with academy-approved materials before relying on them for teaching.
5. Students sign in with their six-digit code and initial password (the same code), change it to a private password on first sign-in, then choose their class assignment and upload a PDF or DOCX file up to 20 MB. Engineers assess and publish feedback; only then can the student see it. An Engineer can allow another attempt after publishing feedback.

## Data, security, and local development

The Supabase migrations are `supabase/migrations/20261019192114_btec_assessment_portal.sql`, `supabase/migrations/20261019200525_portal_engineer_security_fixes.sql`, `supabase/migrations/20261019201506_optimize_rls_auth_uid.sql`, and `supabase/migrations/20261020093205_student_codes_and_initial_passwords.sql`. Class scope, student privacy, feedback publication, due dates, attempt sequencing, criterion dependencies, Engineer account creation, six-digit student codes, mandatory first-login password change, and the private 20 MB file buckets are enforced by database policies/triggers as well as the UI. Keep service-role credentials out of browser code and do not make the submission or brief buckets public.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

## Deploy to Vercel

Import this GitHub repository in Vercel and use the Vite preset. Vercel reads `vercel.json`: `pnpm build` produces static files in `dist`, and the rewrite serves the SPA for nested routes. Set these browser-safe build environment variables in the Vercel project for Production, Preview, and Development:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Use the Supabase publishable/anon key only; never set a service-role key as a `VITE_` variable. The app relies on Supabase RLS for authorization. After deployment, configure the deployed origin in Supabase Auth URL settings and test direct refreshes on `/manage/submissions/<submission-id>`.

Tests and production checks:

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

## Existing resource hub

- Shared resources are grouped by Learning Aim with filters, search, video/PDF support, and criterion-linked helpful materials.
- The Unit Leader can manage resources, announcements, and reusable feedback snippets.
- Existing resources, announcements, attempts, and legacy assessment records are retained during portal migration.

The project uses standard Vite commands and can be developed or deployed independently of Lovable.
