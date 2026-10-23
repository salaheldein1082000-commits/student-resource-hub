-- Apply this only after the Drive-enabled frontend is live and an end-to-end Drive upload/download has succeeded.
-- It blocks new browser writes to Supabase but intentionally keeps all existing private-file SELECT policies.
BEGIN;
DROP POLICY IF EXISTS submissions_student_insert ON public.submissions;
DROP POLICY IF EXISTS submissions_student_upload_scoped ON storage.objects;
COMMIT;
