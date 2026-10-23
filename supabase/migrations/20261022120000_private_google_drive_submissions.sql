BEGIN;

-- Folder IDs and OAuth state remain server-only; the browser receives only mapped labels/status.
CREATE TABLE IF NOT EXISTS public.drive_class_folders (
  class_id uuid PRIMARY KEY REFERENCES public.classes(id) ON DELETE CASCADE,
  drive_folder_id text NOT NULL UNIQUE,
  drive_folder_name text NOT NULL,
  mapped_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drive_class_folders_id_check CHECK (drive_folder_id ~ '^[A-Za-z0-9_-]{10,200}$')
);

CREATE TABLE IF NOT EXISTS public.drive_oauth_states (
  state_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  return_to text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS drive_oauth_states_expiry_idx ON public.drive_oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS public.drive_upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  drive_folder_id text NOT NULL,
  drive_file_name text NOT NULL,
  original_file_name text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes BETWEEN 1 AND 20971520),
  attempt_no integer NOT NULL CHECK (attempt_no > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  drive_file_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  CONSTRAINT drive_upload_sessions_file_id_check CHECK (drive_file_id IS NULL OR drive_file_id ~ '^[A-Za-z0-9_-]{10,200}$')
);
CREATE INDEX IF NOT EXISTS drive_upload_sessions_owner_idx ON public.drive_upload_sessions(user_id, assignment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS drive_upload_sessions_expiry_idx ON public.drive_upload_sessions(status, expires_at);

ALTER TABLE public.drive_class_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drive_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drive_upload_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.drive_class_folders, public.drive_oauth_states, public.drive_upload_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.drive_class_folders, public.drive_oauth_states, public.drive_upload_sessions TO service_role;

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'supabase',
  ADD COLUMN IF NOT EXISTS drive_file_id text,
  ADD COLUMN IF NOT EXISTS drive_upload_session_id uuid REFERENCES public.drive_upload_sessions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS original_file_name text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'submissions_storage_provider_check') THEN
    ALTER TABLE public.submissions ADD CONSTRAINT submissions_storage_provider_check
      CHECK (storage_provider IN ('supabase', 'google_drive'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'submissions_drive_metadata_check') THEN
    ALTER TABLE public.submissions ADD CONSTRAINT submissions_drive_metadata_check
      CHECK (
        (storage_provider = 'supabase' AND drive_file_id IS NULL AND drive_upload_session_id IS NULL)
        OR
        (storage_provider = 'google_drive' AND drive_file_id IS NOT NULL
          AND drive_upload_session_id IS NOT NULL AND file_url = 'drive:private')
      );
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS submissions_drive_file_id_unique
  ON public.submissions(drive_file_id) WHERE drive_file_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS submissions_drive_upload_session_unique
  ON public.submissions(drive_upload_session_id) WHERE drive_upload_session_id IS NOT NULL;

-- This server-only equivalent deliberately omits auth.uid() equality because the caller is the
-- authenticated Edge Function using service_role; the caller's identity is checked before use.
CREATE OR REPLACE FUNCTION public.drive_can_student_submit_for_upload(_user_id uuid, _assignment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT coalesce(auth.role() = 'service_role', false) AND EXISTS (
    SELECT 1
    FROM public.profiles s
    JOIN public.assignment_classes ac ON ac.class_id = s.class_id AND ac.assignment_id = _assignment_id
    JOIN public.assignments a ON a.id = ac.assignment_id AND a.is_published
    WHERE s.id = _user_id AND s.role = 'student'
      AND (
        a.due_date IS NULL
        OR a.due_date >= (now() AT TIME ZONE 'Africa/Cairo')::date
        OR EXISTS (
          SELECT 1 FROM public.submissions latest
          WHERE latest.assignment_id = a.id AND latest.student_id = s.id
            AND latest.status = 'resubmission_allowed'
            AND latest.attempt_no = (
              SELECT max(previous.attempt_no)
              FROM public.submissions previous
              WHERE previous.assignment_id = a.id AND previous.student_id = s.id
            )
        )
      )
  )
$$;
REVOKE ALL ON FUNCTION public.drive_can_student_submit_for_upload(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.drive_can_student_submit_for_upload(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.drive_store_refresh_token(_refresh_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, auth, pg_temp
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Drive token storage is restricted to the server.';
  END IF;
  IF _refresh_token IS NULL OR length(_refresh_token) < 20 THEN
    RAISE EXCEPTION 'A valid Google refresh token is required.';
  END IF;

  SELECT id INTO v_secret_id
  FROM vault.secrets
  WHERE name = 'btec-drive-refresh-token'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_secret_id IS NULL THEN
    PERFORM vault.create_secret(
      _refresh_token,
      'btec-drive-refresh-token',
      'Private Google Drive refresh token for the BTEC Assessment Portal',
      NULL::uuid
    );
  ELSE
    PERFORM vault.update_secret(
      v_secret_id,
      _refresh_token,
      'btec-drive-refresh-token',
      'Private Google Drive refresh token for the BTEC Assessment Portal',
      NULL::uuid
    );
  END IF;
END
$$;
REVOKE ALL ON FUNCTION public.drive_store_refresh_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.drive_store_refresh_token(text) TO service_role;

CREATE OR REPLACE FUNCTION public.drive_get_refresh_token()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, vault, auth, pg_temp
AS $$
DECLARE
  v_token text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Drive token retrieval is restricted to the server.';
  END IF;
  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE name = 'btec-drive-refresh-token'
  ORDER BY created_at DESC
  LIMIT 1;
  RETURN v_token;
END
$$;
REVOKE ALL ON FUNCTION public.drive_get_refresh_token() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.drive_get_refresh_token() TO service_role;

CREATE OR REPLACE FUNCTION public.drive_complete_upload(_upload_session_id uuid, _drive_file_id text)
RETURNS TABLE(submission_id uuid, attempt_no integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_session public.drive_upload_sessions%ROWTYPE;
  v_expected_attempt integer;
  v_submission_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Drive upload finalization is restricted to the server.';
  END IF;

  SELECT * INTO v_session
  FROM public.drive_upload_sessions
  WHERE id = _upload_session_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Drive upload session not found.';
  END IF;

  IF v_session.status = 'completed' AND v_session.drive_file_id = _drive_file_id THEN
    SELECT s.id INTO v_submission_id
    FROM public.submissions s
    WHERE s.drive_upload_session_id = _upload_session_id;
    IF v_submission_id IS NOT NULL THEN
      RETURN QUERY SELECT v_submission_id, v_session.attempt_no;
      RETURN;
    END IF;
  END IF;

  IF v_session.status <> 'pending' OR v_session.expires_at <= now() THEN
    RAISE EXCEPTION 'Drive upload session is expired or already used.';
  END IF;
  IF _drive_file_id IS NULL OR _drive_file_id !~ '^[A-Za-z0-9_-]{10,200}$' THEN
    RAISE EXCEPTION 'Invalid Google Drive file identifier.';
  END IF;
  IF NOT public.drive_can_student_submit_for_upload(v_session.user_id, v_session.assignment_id) THEN
    RAISE EXCEPTION 'The assignment is not open for submission.';
  END IF;

  SELECT coalesce(max(s.attempt_no), 0) + 1 INTO v_expected_attempt
  FROM public.submissions s
  WHERE s.assignment_id = v_session.assignment_id AND s.student_id = v_session.user_id;
  IF v_session.attempt_no <> v_expected_attempt THEN
    RAISE EXCEPTION 'The attempt number changed. Start a new upload session.';
  END IF;

  INSERT INTO public.submissions (
    assignment_id, student_id, file_url, submitted_at, attempt_no, status,
    storage_provider, drive_file_id, drive_upload_session_id,
    original_file_name, mime_type, file_size_bytes
  ) VALUES (
    v_session.assignment_id,
    v_session.user_id,
    'drive:private',
    now(),
    v_session.attempt_no,
    'submitted',
    'google_drive',
    _drive_file_id,
    v_session.id,
    v_session.original_file_name,
    v_session.mime_type,
    v_session.file_size_bytes
  ) RETURNING id INTO v_submission_id;

  UPDATE public.drive_upload_sessions
  SET status = 'completed', drive_file_id = _drive_file_id, completed_at = now()
  WHERE id = v_session.id;

  RETURN QUERY SELECT v_submission_id, v_session.attempt_no;
END
$$;
REVOKE ALL ON FUNCTION public.drive_complete_upload(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.drive_complete_upload(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_submission_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage, pg_temp
AS $$
DECLARE
  v_next_attempt integer;
  v_parts text[];
  v_drive_session public.drive_upload_sessions%ROWTYPE;
  v_profile_class_id uuid;
  v_mapped_folder_id text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.student_id IS NULL OR NEW.status <> 'submitted' OR NEW.file_url IS NULL OR NEW.file_url = '' THEN
      RAISE EXCEPTION 'A submission must be a file-backed submitted attempt.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.student_id AND p.role = 'student') THEN
      RAISE EXCEPTION 'Only a student account can submit work.';
    END IF;

    SELECT coalesce(max(s.attempt_no), 0) + 1 INTO v_next_attempt
    FROM public.submissions s
    WHERE s.assignment_id = NEW.assignment_id AND s.student_id = NEW.student_id;
    IF NEW.attempt_no <> v_next_attempt THEN
      RAISE EXCEPTION 'The attempt number must be the next sequential attempt.';
    END IF;
    NEW.submitted_at := now();

    IF NEW.storage_provider = 'google_drive' THEN
      IF coalesce(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Drive submissions must be finalized by the authenticated server.';
      END IF;
      IF NEW.drive_file_id IS NULL OR NEW.drive_file_id !~ '^[A-Za-z0-9_-]{10,200}$'
         OR NEW.file_url IS DISTINCT FROM 'drive:private'
         OR NEW.drive_upload_session_id IS NULL THEN
        RAISE EXCEPTION 'Invalid private Drive submission metadata.';
      END IF;
      IF NOT public.drive_can_student_submit_for_upload(NEW.student_id, NEW.assignment_id) THEN
        RAISE EXCEPTION 'This assignment is not open for submission.';
      END IF;

      SELECT * INTO v_drive_session
      FROM public.drive_upload_sessions s
      WHERE s.id = NEW.drive_upload_session_id
      FOR UPDATE;
      IF NOT FOUND OR v_drive_session.status <> 'pending' OR v_drive_session.expires_at <= now()
         OR v_drive_session.user_id <> NEW.student_id
         OR v_drive_session.assignment_id <> NEW.assignment_id
         OR v_drive_session.attempt_no <> NEW.attempt_no
         OR v_drive_session.original_file_name IS DISTINCT FROM NEW.original_file_name
         OR v_drive_session.mime_type IS DISTINCT FROM NEW.mime_type
         OR v_drive_session.file_size_bytes IS DISTINCT FROM NEW.file_size_bytes THEN
        RAISE EXCEPTION 'The Drive upload does not match a valid server-created upload session.';
      END IF;

      SELECT p.class_id INTO v_profile_class_id
      FROM public.profiles p WHERE p.id = NEW.student_id;
      SELECT f.drive_folder_id INTO v_mapped_folder_id
      FROM public.drive_class_folders f WHERE f.class_id = v_profile_class_id;
      IF v_drive_session.class_id IS DISTINCT FROM v_profile_class_id
         OR v_drive_session.drive_folder_id IS DISTINCT FROM v_mapped_folder_id THEN
        RAISE EXCEPTION 'The Drive upload is not in this student''s mapped class folder.';
      END IF;
      IF (v_drive_session.mime_type = 'application/pdf' AND lower(v_drive_session.original_file_name) NOT LIKE '%.pdf')
         OR (v_drive_session.mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
           AND lower(v_drive_session.original_file_name) NOT LIKE '%.docx') THEN
        RAISE EXCEPTION 'Only PDF and DOCX submissions are accepted.';
      END IF;
      RETURN NEW;
    END IF;

    IF NEW.storage_provider <> 'supabase' OR NEW.drive_file_id IS NOT NULL OR NEW.drive_upload_session_id IS NOT NULL THEN
      RAISE EXCEPTION 'Unsupported submission storage metadata.';
    END IF;
    IF NEW.student_id <> auth.uid() THEN
      RAISE EXCEPTION 'Students can create only their own file-backed submitted attempt.';
    END IF;
    IF NOT public.can_student_submit(NEW.student_id, NEW.assignment_id) THEN
      RAISE EXCEPTION 'This assignment is not open for submission.';
    END IF;

    v_parts := storage.foldername(NEW.file_url);
    IF coalesce(array_length(v_parts, 1), 0) < 2
       OR v_parts[1] !~* '^[0-9a-f-]{36}$' OR v_parts[2] !~* '^[0-9a-f-]{36}$'
       OR v_parts[1]::uuid <> NEW.student_id OR v_parts[2]::uuid <> NEW.assignment_id
       OR (lower(NEW.file_url) NOT LIKE '%.pdf' AND lower(NEW.file_url) NOT LIKE '%.docx') THEN
      RAISE EXCEPTION 'The uploaded file path must match this student and assignment.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'submissions' AND o.name = NEW.file_url) THEN
      RAISE EXCEPTION 'Upload the submission file before creating the submission record.';
    END IF;
  ELSE
    IF NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
       OR NEW.student_id IS DISTINCT FROM OLD.student_id
       OR NEW.attempt_no IS DISTINCT FROM OLD.attempt_no
       OR NEW.file_url IS DISTINCT FROM OLD.file_url
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       OR NEW.storage_provider IS DISTINCT FROM OLD.storage_provider
       OR NEW.drive_file_id IS DISTINCT FROM OLD.drive_file_id
       OR NEW.drive_upload_session_id IS DISTINCT FROM OLD.drive_upload_session_id
       OR NEW.original_file_name IS DISTINCT FROM OLD.original_file_name
       OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
       OR NEW.file_size_bytes IS DISTINCT FROM OLD.file_size_bytes THEN
      RAISE EXCEPTION 'Submission ownership, attempt number, file, provider, and timestamp are immutable.';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'graded' AND OLD.status IN ('submitted', 'resubmission_allowed')
         AND public.submission_feedback_is_published(OLD.id) THEN
        NULL;
      ELSIF NEW.status = 'resubmission_allowed' AND OLD.status = 'graded'
         AND public.submission_feedback_is_published(OLD.id) THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'Invalid submission status transition.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END
$$;

COMMIT;
