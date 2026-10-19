# BTEC Assessment Portal — Implementation Checklist

## Completed features

- [x] Unit Leader has global access; Engineers are scoped to their assigned classes; students can see only their own submissions and published feedback.
- [x] Create and manage 12 class records with a capacity of 20 students each; assign one Engineer per class and enforce a maximum of two classes per Engineer.
- [x] Unit Leader can create Engineer accounts, assign classes, monitor rosters, and import students from CSV with validation and row-level results. Privileged credentials remain server-side.
- [x] Add class membership and assignment-to-class visibility while preserving existing users, assignments, announcements, resources, attempts, and legacy result/snippet values.
- [x] Seed Assignment 1 criteria A.P1, A.P2, A.P3 (Task 1), A.M1, and A.D1 (Task 2).
- [x] Students can view class assignments, download private PDF briefs, upload PDF/DOCX reports up to 20 MB before the due date, track attempts/status, and submit a new attempt after authorization.
- [x] Students see feedback only after publication, in a criteria/description/achieved/comments table followed by general comments.
- [x] Engineers can filter scoped submissions, preview private PDFs/DOCX files, grade criteria, save drafts, publish feedback, and allow resubmission. The Unit Leader can manage all classes and submissions.
- [x] Enforce M1 only when P1–P3 are all Yes, and D1 only when M1 is Yes, in the UI and database.
- [x] Export grades to Excel and print an individual feedback form to PDF.
- [x] Use RLS for role/class/student boundaries, private Storage buckets with signed URLs, server-enforced upload/type/size/deadline/attempt rules, and protection against student role/class changes.
- [x] Provide responsive English/Arabic controls and RTL layout support.
- [x] Fix the live Engineer-creation RPC's ambiguous `user_id` reference, restrict trigger functions from direct API execution, self-scope legacy role checks, and add missing foreign-key indexes.
- [x] Restore the retained `01090680` login to Student and remove its unintended Engineer-class link without changing its Auth password.
- [x] Optimize public RLS policies to evaluate `auth.uid()` as a statement-level init plan; the Supabase advisor no longer reports the prior RLS init-plan warnings.

## Live data setup still required

- [ ] Create the six real Engineer accounts and allocate two classes to each; no real Engineer identities or class assignments are currently configured.
- [ ] Import the real student roster (up to 20 per class); actual names, student codes, and class mapping were not supplied. The existing `01090680` student account is not assigned to a class yet.
- [ ] Confirm/replace demo assignments, briefs, due dates, and public demo learning resources with academy-approved materials before operational use.
- [ ] Enable Supabase Auth leaked-password protection in the project dashboard; the live security advisor currently reports this setting is disabled.
