# BTEC Assessment Portal

For Unit 1, *IT Systems — Strategy, Management and Infrastructure*, at Elsewedy Technical Academy (Pearson BTEC Level 3 Extended Diploma in IT). This project is connected to Lovable; commits pushed to `main` sync back to the editor.

## Portal features

- Students see assignments for their own class, download PDF briefs, upload PDF/DOCX work, follow attempt/status history, and view feedback only after publication.
- Engineers assess only students in their assigned classes. The Unit Leader has global access to classes, staff, students, assignments, submissions, and feedback.
- Assessment feedback includes criterion-level Yes/No decisions and comments, general comments, draft/publish/resubmission controls, Excel grade exports, and a print-to-PDF feedback form.
- English/Arabic language toggle with RTL layout, responsive navigation, private Supabase Storage, short-lived signed file URLs, and database-enforced row-level security.

## Authentication

Students sign in with an 8-digit student code and password. The app maps the code to Supabase Auth's internal alias format (`<student-code>@student.local`). Staff sign in using their email and password. The existing `01090680` student-code account is retained; its class must be set by the Unit Leader before it sees class assignments. Include that code once in the CSV for its actual class, with the student's correct name; the importer will place the existing account and keep its password. Do not share or reuse development credentials for real students.

## First-time Unit Leader setup

The migration has created 12 classes (`Class 01`–`Class 12`), each with a capacity of 20, and assigned the currently published Unit 1 assignments to those classes. It preserved existing records. No real Engineer identities, student roster, or class mapping were supplied, so none were invented. The existing `01090680` account is retained as a Student, with its password unchanged, but is not assigned to a class yet. Create the actual Engineer accounts and import the real class rosters before operational use.

1. Sign in using the existing Unit Leader/staff account, then open **Classes**.
2. Create the six Engineer accounts using their real names and email addresses. Assign exactly two classes to each Engineer. The database prevents an Engineer from being assigned to a third class and prevents two Engineers from owning the same class.
3. Use **Import students** to load each class roster. CSV headers: `student_code,full_name`. Import up to 20 students per class. Review row-level validation results; any newly generated temporary passwords are shown only in the import result and must be distributed privately.
4. Open **Assignments** to confirm class visibility, add the real due date and approved brief PDF, and publish the assignment. Assignment 1 is seeded with A.P1, A.P2, A.P3 (Task 1) and A.M1, A.D1 (Task 2). The initial public resources/assignments marked as demo content should be replaced with academy-approved materials before relying on them for teaching.
5. Students sign in with their code and password, choose their class assignment, and upload a PDF or DOCX file up to 20 MB. Engineers assess and publish feedback; only then can the student see it. An Engineer can allow another attempt after publishing feedback.

## Data, security, and local development

The Supabase migrations are `supabase/migrations/20261019192114_btec_assessment_portal.sql`, `supabase/migrations/20261019200525_portal_engineer_security_fixes.sql`, and `supabase/migrations/20261019201506_optimize_rls_auth_uid.sql`. Class scope, student privacy, feedback publication, due dates, attempt sequencing, criterion dependencies, Engineer account creation, and the private 20 MB file buckets are enforced by database policies/triggers as well as the UI. Keep service-role credentials out of browser code and do not make the submission or brief buckets public.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

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

This project was built with [Lovable](https://lovable.dev). Continue developing in the connected Lovable project; push tested commits to `main` and never rewrite published history.
