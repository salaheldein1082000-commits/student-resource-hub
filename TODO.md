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

## Live data setup still required

- [ ] Create the six real Engineer accounts and assign two of the 12 classes to each; actual staff names and email addresses were not supplied.
- [ ] Import the real student roster (up to 20 per class); actual names, student codes, and class mapping were not supplied. The existing `01090680` student account is not assigned to a class yet.
- [ ] Confirm/replace demo assignments, briefs, due dates, and public demo learning resources with academy-approved materials before operational use.
