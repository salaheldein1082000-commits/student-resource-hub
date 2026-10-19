BEGIN;

-- Extend the existing app without dropping legacy records or tables.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS group_name text,
  ADD COLUMN IF NOT EXISTS class_id uuid;

UPDATE public.profiles p
SET role = CASE
  WHEN lower(coalesce(p.email, '')) = '01090680@student.local' THEN 'student'
  WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'assessor') THEN 'unit_leader'
  WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'student') THEN 'student'
  ELSE 'student'
END;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_portal_role_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_portal_role_check
      CHECK (role IN ('unit_leader', 'engineer', 'student'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  unit_no integer NOT NULL DEFAULT 1,
  capacity integer NOT NULL DEFAULT 20 CHECK (capacity = 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.classes (name, capacity)
SELECT 'Class ' || lpad(n::text, 2, '0'), 20
FROM generate_series(1, 12) AS n
ON CONFLICT (name) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_class_id_fkey') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_class_id_fkey
      FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.class_engineers (
  class_id uuid PRIMARY KEY REFERENCES public.classes(id) ON DELETE CASCADE,
  engineer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engineer_id, class_id)
);
CREATE INDEX IF NOT EXISTS class_engineers_engineer_idx ON public.class_engineers(engineer_id);

CREATE TABLE IF NOT EXISTS public.assignment_classes (
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assignment_id, class_id)
);
CREATE INDEX IF NOT EXISTS assignment_classes_class_idx ON public.assignment_classes(class_id);

-- Give every current published Unit 1 assignment an initial audience; the Unit Leader can refine it later.
INSERT INTO public.assignment_classes (assignment_id, class_id)
SELECT a.id, c.id
FROM public.assignments a CROSS JOIN public.classes c
WHERE a.unit_no = 1 AND a.is_published
ON CONFLICT (assignment_id, class_id) DO NOTHING;

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS part integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_parts integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS brief_pdf_url text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_part_bounds_check') THEN
    ALTER TABLE public.assignments ADD CONSTRAINT assignments_part_bounds_check
      CHECK (part > 0 AND total_parts > 0 AND part <= total_parts);
  END IF;
END $$;

ALTER TABLE public.criteria
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS assignment_id uuid,
  ADD COLUMN IF NOT EXISTS task_no integer;

-- Preserve legacy code values while freeing the primary key for assignment-scoped criteria IDs.
ALTER TABLE public.criterion_results DROP CONSTRAINT IF EXISTS criterion_results_criterion_code_fkey;
ALTER TABLE public.feedback_snippets DROP CONSTRAINT IF EXISTS feedback_snippets_criterion_code_fkey;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.criteria'::regclass AND contype = 'p'
      AND pg_get_constraintdef(oid) <> 'PRIMARY KEY (id)'
  ) THEN
    ALTER TABLE public.criteria DROP CONSTRAINT criteria_pkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.criteria'::regclass AND contype = 'p') THEN
    ALTER TABLE public.criteria ADD CONSTRAINT criteria_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'criteria_assignment_code_key') THEN
    ALTER TABLE public.criteria ADD CONSTRAINT criteria_assignment_code_key UNIQUE (assignment_id, code);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'criteria_assignment_id_fkey') THEN
    ALTER TABLE public.criteria ADD CONSTRAINT criteria_assignment_id_fkey
      FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
DECLARE
  v_assignment_id uuid;
BEGIN
  SELECT id INTO v_assignment_id FROM public.assignments ORDER BY created_at, id LIMIT 1;
  IF v_assignment_id IS NOT NULL THEN
    UPDATE public.criteria SET assignment_id = v_assignment_id
    WHERE code IN ('A.P1', 'A.P2', 'A.P3', 'A.M1', 'A.D1') AND assignment_id IS NULL;

    INSERT INTO public.criteria (code, unit_no, learning_aim, grade, description, sort_order, assignment_id, task_no)
    VALUES
      ('A.P1', 1, 'A', 'Pass', 'Explain ways in which software can meet the needs of an organisation and its stakeholders.', 1, v_assignment_id, 1),
      ('A.P2', 1, 'A', 'Pass', 'Explain ways in which hardware can meet the needs of an organisation and its stakeholders.', 2, v_assignment_id, 1),
      ('A.P3', 1, 'A', 'Pass', 'Explain ways in which the use of data connections and networks can meet the needs of an organisation and its stakeholders.', 3, v_assignment_id, 1),
      ('A.M1', 1, 'A', 'Merit', 'Analyse how IT infrastructure can impact an organisation and its stakeholders.', 4, v_assignment_id, 2),
      ('A.D1', 1, 'A', 'Distinction', 'Evaluate how IT infrastructure can impact an organisation and its stakeholders.', 5, v_assignment_id, 2)
    ON CONFLICT (assignment_id, code) DO UPDATE SET
      unit_no = EXCLUDED.unit_no,
      learning_aim = EXCLUDED.learning_aim,
      grade = EXCLUDED.grade,
      description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order,
      task_no = EXCLUDED.task_no;

    UPDATE public.assignments a
    SET criteria_codes = ARRAY(
      SELECT DISTINCT u.code
      FROM unnest(coalesce(a.criteria_codes, '{}'::text[]) || ARRAY['A.P1','A.P2','A.P3','A.M1','A.D1']::text[]) AS u(code)
      ORDER BY u.code
    )
    WHERE a.id = v_assignment_id;
  END IF;
END $$;

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS attempt_no integer NOT NULL DEFAULT 1;

ALTER TABLE public.submissions ALTER COLUMN file_url SET NOT NULL;

UPDATE public.submissions
SET status = CASE status
  WHEN 'assessed' THEN 'graded'
  WHEN 'resubmission' THEN 'resubmission_allowed'
  ELSE status
END;

ALTER TABLE public.submissions DROP CONSTRAINT IF EXISTS submissions_assignment_id_student_id_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'submissions_attempt_unique') THEN
    ALTER TABLE public.submissions ADD CONSTRAINT submissions_attempt_unique
      UNIQUE (assignment_id, student_id, attempt_no);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'submissions_status_check') THEN
    ALTER TABLE public.submissions ADD CONSTRAINT submissions_status_check
      CHECK (status IN ('submitted', 'graded', 'resubmission_allowed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'submissions_attempt_no_check') THEN
    ALTER TABLE public.submissions ADD CONSTRAINT submissions_attempt_no_check CHECK (attempt_no > 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.gradings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL REFERENCES public.criteria(id) ON DELETE CASCADE,
  achieved boolean NOT NULL,
  comment text,
  assessed_at timestamptz,
  UNIQUE (submission_id, criterion_id)
);
CREATE INDEX IF NOT EXISTS gradings_submission_idx ON public.gradings(submission_id);

CREATE TABLE IF NOT EXISTS public.feedback_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL UNIQUE REFERENCES public.submissions(id) ON DELETE CASCADE,
  general_comments text,
  assessor_name text,
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz
);

CREATE OR REPLACE FUNCTION public.guard_feedback_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
DECLARE
  v_assignment_id uuid;
BEGIN
  IF NEW.published THEN
    SELECT s.assignment_id INTO v_assignment_id FROM public.submissions s WHERE s.id = NEW.submission_id;
    IF v_assignment_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.criteria c WHERE c.assignment_id = v_assignment_id
    ) THEN
      RAISE EXCEPTION 'Feedback cannot be published until the assignment has criteria.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.criteria c
      WHERE c.assignment_id = v_assignment_id
        AND NOT EXISTS (
          SELECT 1 FROM public.gradings g
          WHERE g.submission_id = NEW.submission_id AND g.criterion_id = c.id
        )
    ) THEN
      RAISE EXCEPTION 'Feedback cannot be published until every criterion has been graded.';
    END IF;
    NEW.published_at := coalesce(NEW.published_at, now());
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER feedback_summary_guard_publish
BEFORE INSERT OR UPDATE ON public.feedback_summary
FOR EACH ROW EXECUTE FUNCTION public.guard_feedback_publication();

CREATE OR REPLACE FUNCTION public.is_unit_leader(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
  SELECT _user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user_id AND p.role = 'unit_leader')
$$;

CREATE OR REPLACE FUNCTION public.engineer_has_class(_user_id uuid, _class_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_engineers ce
    JOIN public.profiles e ON e.id = ce.engineer_id AND e.role = 'engineer'
    WHERE _user_id = auth.uid() AND ce.engineer_id = _user_id AND ce.class_id = _class_id
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_class(_user_id uuid, _class_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
  SELECT _user_id = auth.uid() AND (
    public.is_unit_leader(_user_id)
    OR public.engineer_has_class(_user_id, _class_id)
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user_id AND p.role = 'student' AND p.class_id = _class_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_student(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
  SELECT _user_id = auth.uid() AND (
    _user_id = _student_id
    OR public.is_unit_leader(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles s
      JOIN public.class_engineers ce ON ce.class_id = s.class_id
      JOIN public.profiles e ON e.id = ce.engineer_id AND e.role = 'engineer'
      WHERE s.id = _student_id AND e.id = _user_id
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_assignment(_user_id uuid, _assignment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
  SELECT _user_id = auth.uid() AND (
    public.is_unit_leader(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.assignment_classes ac
      JOIN public.assignments a ON a.id = ac.assignment_id AND a.is_published
      JOIN public.profiles s ON s.id = _user_id AND s.role = 'student' AND s.class_id = ac.class_id
      WHERE ac.assignment_id = _assignment_id
    )
    OR EXISTS (
      SELECT 1 FROM public.assignment_classes ac
      JOIN public.class_engineers ce ON ce.class_id = ac.class_id AND ce.engineer_id = _user_id
      JOIN public.profiles e ON e.id = ce.engineer_id AND e.role = 'engineer'
      WHERE ac.assignment_id = _assignment_id
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_student_submit(_user_id uuid, _assignment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.profiles s
    JOIN public.assignment_classes ac ON ac.class_id = s.class_id AND ac.assignment_id = _assignment_id
    JOIN public.assignments a ON a.id = ac.assignment_id AND a.is_published
    WHERE s.id = _user_id AND s.role = 'student'
      AND (a.due_date IS NULL OR a.due_date >= (now() AT TIME ZONE 'Africa/Cairo')::date OR EXISTS (
        SELECT 1 FROM public.submissions latest
        WHERE latest.assignment_id = a.id AND latest.student_id = s.id
          AND latest.status = 'resubmission_allowed'
          AND latest.attempt_no = (
            SELECT max(prev.attempt_no) FROM public.submissions prev
            WHERE prev.assignment_id = a.id AND prev.student_id = s.id
          )
      ))
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_submission(_user_id uuid, _submission_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.id = _submission_id AND public.can_access_student(_user_id, s.student_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.submission_feedback_is_published(_submission_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.feedback_summary f
    JOIN public.submissions s ON s.id = f.submission_id
    WHERE f.submission_id = _submission_id AND f.published
      AND public.can_access_student(auth.uid(), s.student_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.guard_submission_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, storage, pg_temp AS $$
DECLARE
  v_next_attempt integer;
  v_parts text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.student_id <> auth.uid() OR NEW.status <> 'submitted' OR NEW.file_url IS NULL OR NEW.file_url = '' THEN
      RAISE EXCEPTION 'Students can create only their own file-backed submitted attempt.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.student_id AND p.role = 'student') THEN
      RAISE EXCEPTION 'Only a student account can submit work.';
    END IF;
    SELECT coalesce(max(s.attempt_no), 0) + 1 INTO v_next_attempt
    FROM public.submissions s WHERE s.assignment_id = NEW.assignment_id AND s.student_id = NEW.student_id;
    IF NEW.attempt_no <> v_next_attempt THEN
      RAISE EXCEPTION 'The attempt number must be the next sequential attempt.';
    END IF;
    NEW.submitted_at := now();
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
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION 'Submission ownership, attempt number, file, and timestamp are immutable.';
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
END $$;
CREATE OR REPLACE TRIGGER submissions_guard_record BEFORE INSERT OR UPDATE ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.guard_submission_record();

CREATE OR REPLACE FUNCTION public.storage_can_upload_submission(_user_id uuid, _object_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth, storage, pg_temp AS $$
DECLARE
  parts text[];
BEGIN
  IF _user_id <> auth.uid() THEN RETURN false; END IF;
  parts := storage.foldername(_object_name);
  IF coalesce(array_length(parts, 1), 0) < 2 OR parts[1] <> _user_id::text
     OR (lower(_object_name) NOT LIKE '%.pdf' AND lower(_object_name) NOT LIKE '%.docx') THEN RETURN false; END IF;
  RETURN parts[2] ~* '^[0-9a-f-]{36}$' AND public.can_student_submit(_user_id, parts[2]::uuid);
EXCEPTION WHEN others THEN
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.storage_can_read_submission(_user_id uuid, _object_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth, storage, pg_temp AS $$
BEGIN
  IF _user_id <> auth.uid() THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.file_url = _object_name AND public.can_access_student(_user_id, s.student_id)
  );
END $$;

CREATE OR REPLACE FUNCTION public.storage_can_read_brief(_user_id uuid, _object_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth, storage, pg_temp AS $$
DECLARE
  parts text[];
BEGIN
  IF _user_id <> auth.uid() THEN RETURN false; END IF;
  parts := storage.foldername(_object_name);
  IF coalesce(array_length(parts, 1), 0) < 1 OR parts[1] !~* '^[0-9a-f-]{36}$' THEN RETURN false; END IF;
  RETURN public.can_access_assignment(_user_id, parts[1]::uuid);
EXCEPTION WHEN others THEN
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.guard_profile_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
DECLARE
  v_capacity integer;
  v_enrolled integer;
BEGIN
  IF auth.uid() = OLD.id AND NOT public.is_unit_leader(auth.uid())
     AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.class_id IS DISTINCT FROM OLD.class_id OR NEW.group_name IS DISTINCT FROM OLD.group_name) THEN
    RAISE EXCEPTION 'Only the Unit Leader can change a user's role or class.';
  END IF;
  IF NEW.role <> 'student' AND NEW.class_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only student profiles can be assigned to a class.';
  END IF;
  IF NEW.class_id IS NOT NULL THEN
    SELECT capacity INTO v_capacity FROM public.classes WHERE id = NEW.class_id FOR UPDATE;
    SELECT count(*) INTO v_enrolled FROM public.profiles WHERE class_id = NEW.class_id AND id <> NEW.id;
    IF v_capacity IS NULL OR v_enrolled >= v_capacity THEN
      RAISE EXCEPTION 'This class is at capacity or does not exist.';
    END IF;
  END IF;
  IF NEW.class_id IS NOT NULL THEN
    SELECT name INTO NEW.group_name FROM public.classes WHERE id = NEW.class_id;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER profiles_guard_scope BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_scope();

CREATE OR REPLACE FUNCTION public.guard_class_engineer_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
DECLARE
  v_role text;
  v_count integer;
BEGIN
  PERFORM 1 FROM public.profiles WHERE id = NEW.engineer_id FOR UPDATE;
  SELECT role INTO v_role FROM public.profiles WHERE id = NEW.engineer_id;
  IF v_role IS DISTINCT FROM 'engineer' THEN
    RAISE EXCEPTION 'Only an Engineer account can be assigned to a class.';
  END IF;
  SELECT count(*) INTO v_count FROM public.class_engineers
    WHERE engineer_id = NEW.engineer_id AND class_id <> NEW.class_id;
  IF v_count >= 2 THEN
    RAISE EXCEPTION 'Each Engineer can be assigned to no more than two classes.';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER class_engineers_guard BEFORE INSERT OR UPDATE ON public.class_engineers
FOR EACH ROW EXECUTE FUNCTION public.guard_class_engineer_assignment();

CREATE OR REPLACE FUNCTION public.guard_grading_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
DECLARE
  v_assignment_id uuid;
  v_code text;
  v_required integer;
  v_achieved integer;
BEGIN
  SELECT s.assignment_id INTO v_assignment_id FROM public.submissions s WHERE s.id = NEW.submission_id;
  SELECT c.code INTO v_code FROM public.criteria c WHERE c.id = NEW.criterion_id AND c.assignment_id = v_assignment_id;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'The criterion does not belong to this assignment.';
  END IF;
  IF NEW.achieved AND v_code = 'A.M1' THEN
    SELECT count(*), count(*) FILTER (WHERE g.achieved)
    INTO v_required, v_achieved
    FROM public.criteria c
    LEFT JOIN public.gradings g ON g.criterion_id = c.id AND g.submission_id = NEW.submission_id
    WHERE c.assignment_id = v_assignment_id AND c.code IN ('A.P1', 'A.P2', 'A.P3');
    IF v_required < 3 OR v_achieved < 3 THEN
      RAISE EXCEPTION 'A.M1 can be achieved only after A.P1, A.P2 and A.P3 are achieved.';
    END IF;
  END IF;
  IF NEW.achieved AND v_code = 'A.D1' AND NOT EXISTS (
    SELECT 1 FROM public.criteria c JOIN public.gradings g ON g.criterion_id = c.id
    WHERE c.assignment_id = v_assignment_id AND c.code = 'A.M1'
      AND g.submission_id = NEW.submission_id AND g.achieved
  ) THEN
    RAISE EXCEPTION 'A.D1 can be achieved only after A.M1 is achieved.';
  END IF;
  IF NOT NEW.achieved AND v_code IN ('A.P1', 'A.P2', 'A.P3') AND EXISTS (
    SELECT 1 FROM public.criteria c JOIN public.gradings g ON g.criterion_id = c.id
    WHERE c.assignment_id = v_assignment_id AND c.code = 'A.M1'
      AND g.submission_id = NEW.submission_id AND g.achieved
  ) THEN
    RAISE EXCEPTION 'Clear A.M1 before changing an achieved A.P1, A.P2 or A.P3 to No.';
  END IF;
  IF NOT NEW.achieved AND v_code = 'A.M1' AND EXISTS (
    SELECT 1 FROM public.criteria c JOIN public.gradings g ON g.criterion_id = c.id
    WHERE c.assignment_id = v_assignment_id AND c.code = 'A.D1'
      AND g.submission_id = NEW.submission_id AND g.achieved
  ) THEN
    RAISE EXCEPTION 'Clear A.D1 before changing A.M1 to No.';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER gradings_guard_rules BEFORE INSERT OR UPDATE ON public.gradings
FOR EACH ROW EXECUTE FUNCTION public.guard_grading_rules();

CREATE OR REPLACE FUNCTION public.import_students(_class_id uuid, _students jsonb)
RETURNS TABLE(student_code text, full_name text, temporary_password text, created boolean, error text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp AS $$
DECLARE
  v_item jsonb;
  v_code text;
  v_name text;
  v_email text;
  v_password text;
  v_user_id uuid;
  v_existing_role text;
  v_created boolean;
  v_capacity integer;
  v_enrolled integer;
BEGIN
  IF NOT public.is_unit_leader(auth.uid()) THEN RAISE EXCEPTION 'Only the Unit Leader can import students.'; END IF;
  IF jsonb_typeof(_students) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Student data must be a CSV-derived JSON array.'; END IF;
  SELECT capacity INTO v_capacity FROM public.classes WHERE id = _class_id FOR UPDATE;
  IF v_capacity IS NULL THEN RAISE EXCEPTION 'Choose a valid class.'; END IF;
  IF jsonb_array_length(_students) > v_capacity THEN RAISE EXCEPTION 'Import no more than 20 students at a time.'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_students) LOOP
    v_code := btrim(coalesce(v_item->>'student_code', ''));
    v_name := btrim(coalesce(v_item->>'full_name', ''));
    student_code := v_code;
    full_name := v_name;
    temporary_password := NULL;
    created := false;
    error := NULL;

    IF v_code !~ '^\d{8}$' THEN
      error := 'Student code must contain exactly 8 digits.';
      RETURN NEXT;
      CONTINUE;
    END IF;
    IF length(v_name) < 2 OR length(v_name) > 120 THEN
      error := 'Enter a full name between 2 and 120 characters.';
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_code || '@student.local');
    IF v_user_id IS NOT NULL THEN
      SELECT role INTO v_existing_role FROM public.profiles WHERE id = v_user_id;
      IF v_existing_role IS DISTINCT FROM 'student' THEN
        error := 'This student code belongs to a privileged account and cannot be imported as a student.';
        RETURN NEXT;
        CONTINUE;
      END IF;
      SELECT count(*) INTO v_enrolled FROM public.profiles WHERE class_id = _class_id AND id <> v_user_id;
      IF v_enrolled >= v_capacity AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND class_id = _class_id) THEN
        error := 'This class already has 20 students.';
        RETURN NEXT;
        CONTINUE;
      END IF;
      UPDATE public.profiles SET full_name = v_name, class_id = _class_id, group_name = (SELECT name FROM public.classes WHERE id = _class_id) WHERE id = v_user_id;
      temporary_password := NULL;
      created := false;
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT count(*) INTO v_enrolled FROM public.profiles WHERE class_id = _class_id;
    IF v_enrolled >= v_capacity THEN
      error := 'This class already has 20 students.';
      RETURN NEXT;
      CONTINUE;
    END IF;

    v_email := v_code || '@student.local';
    v_password := encode(extensions.gen_random_bytes(12), 'hex');
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_name, 'student_code', v_code), now(), now(), '', '', '', ''
    );
    UPDATE public.profiles SET full_name = v_name, role = 'student', class_id = _class_id, group_name = (SELECT name FROM public.classes WHERE id = _class_id) WHERE id = v_user_id;
    DELETE FROM public.user_roles WHERE user_id = v_user_id;
    INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'student') ON CONFLICT (user_id, role) DO NOTHING;
    temporary_password := v_password;
    created := true;
    RETURN NEXT;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_engineer(_email text, _full_name text)
RETURNS TABLE(user_id uuid, email text, temporary_password text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp AS $$
DECLARE
  v_password text;
  v_user_id uuid;
  v_name text;
  v_email text;
BEGIN
  IF NOT public.is_unit_leader(auth.uid()) THEN RAISE EXCEPTION 'Only the Unit Leader can create Engineer accounts.'; END IF;
  v_email := lower(btrim(_email));
  v_name := btrim(_full_name);
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Enter a valid Engineer email address.'; END IF;
  IF length(v_name) < 2 OR length(v_name) > 120 THEN RAISE EXCEPTION 'Enter a full name between 2 and 120 characters.'; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(auth.users.email) = v_email) THEN RAISE EXCEPTION 'An account with this email already exists.'; END IF;
  v_password := encode(extensions.gen_random_bytes(12), 'hex');
  v_user_id := gen_random_uuid();
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
    extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', v_name), now(), now(), '', '', '', ''
  );
  UPDATE public.profiles SET full_name = v_name, role = 'engineer', group_name = NULL, class_id = NULL WHERE id = v_user_id;
  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  user_id := v_user_id;
  email := v_email;
  temporary_password := v_password;
  RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.set_portal_role(_profile_id uuid, _role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
DECLARE
  v_old_role text;
  v_leader_count integer;
BEGIN
  IF NOT public.is_unit_leader(auth.uid()) THEN RAISE EXCEPTION 'Only the Unit Leader can change portal roles.'; END IF;
  IF _role NOT IN ('unit_leader', 'engineer', 'student') THEN RAISE EXCEPTION 'Invalid portal role.'; END IF;
  IF _profile_id = auth.uid() AND _role <> 'unit_leader' THEN RAISE EXCEPTION 'You cannot remove your own Unit Leader access.'; END IF;
  SELECT role INTO v_old_role FROM public.profiles WHERE id = _profile_id FOR UPDATE;
  IF v_old_role IS NULL THEN RAISE EXCEPTION 'Profile not found.'; END IF;
  IF v_old_role = 'unit_leader' AND _role <> 'unit_leader' THEN
    SELECT count(*) INTO v_leader_count FROM public.profiles WHERE role = 'unit_leader' AND id <> _profile_id;
    IF v_leader_count = 0 THEN RAISE EXCEPTION 'At least one Unit Leader must remain.'; END IF;
  END IF;
  IF _role <> 'engineer' AND EXISTS (SELECT 1 FROM public.class_engineers WHERE engineer_id = _profile_id) THEN
    RAISE EXCEPTION 'Remove this Engineer from assigned classes before changing their role.';
  END IF;
  UPDATE public.profiles SET role = _role, class_id = CASE WHEN _role = 'student' THEN class_id ELSE NULL END,
    group_name = CASE WHEN _role = 'student' THEN group_name ELSE NULL END WHERE id = _profile_id;
  DELETE FROM public.user_roles WHERE user_id = _profile_id;
  IF _role = 'unit_leader' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_profile_id, 'assessor') ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF _role = 'student' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_profile_id, 'student') ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
BEGIN
  INSERT INTO public.profiles(id, full_name, email, avatar_url, role, group_name)
  VALUES (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    'student',
    NEW.raw_user_meta_data->>'group_name'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'student') ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sync_class_group_name()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.profiles SET group_name = NEW.name WHERE class_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER classes_sync_group_name AFTER UPDATE OF name ON public.classes
FOR EACH ROW EXECUTE FUNCTION public.sync_class_group_name();
CREATE OR REPLACE TRIGGER classes_updated_at BEFORE UPDATE ON public.classes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Restrict the legacy student account to the student role. The non-student assessor account remains Unit Leader.
DELETE FROM public.user_roles
WHERE user_id IN (SELECT id FROM auth.users WHERE lower(email) = '01090680@student.local') AND role = 'assessor';
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'student' FROM auth.users WHERE lower(email) = '01090680@student.local'
ON CONFLICT (user_id, role) DO NOTHING;
UPDATE public.profiles p SET role = 'student'
WHERE lower(coalesce(p.email, '')) = '01090680@student.local';

-- RLS helpers and portal tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes, public.class_engineers, public.assignment_classes,
  public.gradings, public.feedback_summary TO authenticated;
GRANT ALL ON public.classes, public.class_engineers, public.assignment_classes,
  public.gradings, public.feedback_summary TO service_role;
GRANT EXECUTE ON FUNCTION public.is_unit_leader(uuid), public.engineer_has_class(uuid, uuid),
  public.can_access_class(uuid, uuid), public.can_access_student(uuid, uuid),
  public.can_access_assignment(uuid, uuid), public.can_student_submit(uuid, uuid),
  public.can_access_submission(uuid, uuid), public.submission_feedback_is_published(uuid),
  public.storage_can_upload_submission(uuid, text), public.storage_can_read_submission(uuid, text),
  public.storage_can_read_brief(uuid, text), public.import_students(uuid, jsonb),
  public.create_engineer(text, text), public.set_portal_role(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_unit_leader(uuid), public.engineer_has_class(uuid, uuid),
  public.can_access_class(uuid, uuid), public.can_access_student(uuid, uuid),
  public.can_access_assignment(uuid, uuid), public.can_student_submit(uuid, uuid),
  public.can_access_submission(uuid, uuid), public.submission_feedback_is_published(uuid),
  public.storage_can_upload_submission(uuid, text), public.storage_can_read_submission(uuid, text),
  public.storage_can_read_brief(uuid, text), public.import_students(uuid, jsonb),
  public.create_engineer(text, text), public.set_portal_role(uuid, text) FROM PUBLIC, anon;

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_engineers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gradings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own or assessor read profiles" ON public.profiles;
DROP POLICY IF EXISTS "update own profile" ON public.profiles;
CREATE POLICY profiles_scoped_read ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_unit_leader(auth.uid()) OR public.can_access_student(auth.uid(), id));
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update_unit_leader ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_unit_leader(auth.uid())) WITH CHECK (public.is_unit_leader(auth.uid()));

DROP POLICY IF EXISTS "read criteria" ON public.criteria;
DROP POLICY IF EXISTS "assessor manage criteria" ON public.criteria;
CREATE POLICY criteria_scoped_read ON public.criteria FOR SELECT TO authenticated
  USING (public.is_unit_leader(auth.uid()) OR public.can_access_assignment(auth.uid(), assignment_id));
CREATE POLICY criteria_unit_leader_manage ON public.criteria FOR ALL TO authenticated
  USING (public.is_unit_leader(auth.uid())) WITH CHECK (public.is_unit_leader(auth.uid()));

DROP POLICY IF EXISTS "read published assignments" ON public.assignments;
DROP POLICY IF EXISTS "assessor manage assignments" ON public.assignments;
CREATE POLICY assignments_scoped_read ON public.assignments FOR SELECT TO authenticated
  USING (public.can_access_assignment(auth.uid(), id));
CREATE POLICY assignments_unit_leader_manage ON public.assignments FOR ALL TO authenticated
  USING (public.is_unit_leader(auth.uid())) WITH CHECK (public.is_unit_leader(auth.uid()));

DROP POLICY IF EXISTS "student read own subs" ON public.submissions;
DROP POLICY IF EXISTS "student create own subs" ON public.submissions;
DROP POLICY IF EXISTS "student/assessor update subs" ON public.submissions;
DROP POLICY IF EXISTS "assessor delete subs" ON public.submissions;
CREATE POLICY submissions_scoped_read ON public.submissions FOR SELECT TO authenticated
  USING (public.can_access_student(auth.uid(), student_id));
CREATE POLICY submissions_student_insert ON public.submissions FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid() AND status = 'submitted' AND file_url IS NOT NULL AND public.can_student_submit(auth.uid(), assignment_id));
CREATE POLICY submissions_engineer_update ON public.submissions FOR UPDATE TO authenticated
  USING (public.is_unit_leader(auth.uid()) OR (public.can_access_student(auth.uid(), student_id) AND student_id <> auth.uid()))
  WITH CHECK (public.is_unit_leader(auth.uid()) OR (public.can_access_student(auth.uid(), student_id) AND student_id <> auth.uid()));
CREATE POLICY submissions_unit_leader_delete ON public.submissions FOR DELETE TO authenticated
  USING (public.is_unit_leader(auth.uid()));

DROP POLICY IF EXISTS "read attempts" ON public.attempts;
DROP POLICY IF EXISTS "student add attempt" ON public.attempts;
DROP POLICY IF EXISTS "assessor update attempt" ON public.attempts;
CREATE POLICY attempts_scoped_read ON public.attempts FOR SELECT TO authenticated
  USING (
    public.is_unit_leader(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = submission_id AND s.student_id <> auth.uid()
        AND public.can_access_student(auth.uid(), s.student_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = submission_id AND s.student_id = auth.uid()
        AND public.submission_feedback_is_published(s.id)
    )
  );
CREATE POLICY attempts_unit_leader_manage ON public.attempts FOR ALL TO authenticated
  USING (public.is_unit_leader(auth.uid())) WITH CHECK (public.is_unit_leader(auth.uid()));

DROP POLICY IF EXISTS "read results" ON public.criterion_results;
DROP POLICY IF EXISTS "assessor manage results" ON public.criterion_results;
CREATE POLICY legacy_results_scoped_read ON public.criterion_results FOR SELECT TO authenticated
  USING (
    public.is_unit_leader(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.attempts a JOIN public.submissions s ON s.id = a.submission_id
      WHERE a.id = attempt_id AND s.student_id <> auth.uid()
        AND public.can_access_student(auth.uid(), s.student_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.attempts a JOIN public.submissions s ON s.id = a.submission_id
      WHERE a.id = attempt_id AND s.student_id = auth.uid()
        AND public.submission_feedback_is_published(s.id)
    )
  );
CREATE POLICY legacy_results_staff_manage ON public.criterion_results FOR ALL TO authenticated
  USING (public.is_unit_leader(auth.uid())) WITH CHECK (public.is_unit_leader(auth.uid()));

CREATE POLICY classes_scoped_read ON public.classes FOR SELECT TO authenticated
  USING (public.can_access_class(auth.uid(), id));
CREATE POLICY classes_unit_leader_manage ON public.classes FOR ALL TO authenticated
  USING (public.is_unit_leader(auth.uid())) WITH CHECK (public.is_unit_leader(auth.uid()));
CREATE POLICY class_engineers_scoped_read ON public.class_engineers FOR SELECT TO authenticated
  USING (public.is_unit_leader(auth.uid()) OR engineer_id = auth.uid());
CREATE POLICY class_engineers_unit_leader_manage ON public.class_engineers FOR ALL TO authenticated
  USING (public.is_unit_leader(auth.uid())) WITH CHECK (public.is_unit_leader(auth.uid()));
CREATE POLICY assignment_classes_scoped_read ON public.assignment_classes FOR SELECT TO authenticated
  USING (public.can_access_class(auth.uid(), class_id));
CREATE POLICY assignment_classes_unit_leader_manage ON public.assignment_classes FOR ALL TO authenticated
  USING (public.is_unit_leader(auth.uid())) WITH CHECK (public.is_unit_leader(auth.uid()));

CREATE POLICY gradings_scoped_read ON public.gradings FOR SELECT TO authenticated
  USING (
    public.is_unit_leader(auth.uid())
    OR EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.student_id <> auth.uid() AND public.can_access_student(auth.uid(), s.student_id))
    OR EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.student_id = auth.uid() AND public.submission_feedback_is_published(s.id))
  );
CREATE POLICY gradings_staff_manage ON public.gradings FOR ALL TO authenticated
  USING (public.is_unit_leader(auth.uid()) OR EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.student_id <> auth.uid() AND public.can_access_student(auth.uid(), s.student_id)))
  WITH CHECK (public.is_unit_leader(auth.uid()) OR EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.student_id <> auth.uid() AND public.can_access_student(auth.uid(), s.student_id)));
CREATE POLICY feedback_summary_scoped_read ON public.feedback_summary FOR SELECT TO authenticated
  USING (
    public.is_unit_leader(auth.uid())
    OR EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.student_id <> auth.uid() AND public.can_access_student(auth.uid(), s.student_id))
    OR EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.student_id = auth.uid() AND published)
  );
CREATE POLICY feedback_summary_staff_manage ON public.feedback_summary FOR ALL TO authenticated
  USING (public.is_unit_leader(auth.uid()) OR EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.student_id <> auth.uid() AND public.can_access_student(auth.uid(), s.student_id)))
  WITH CHECK (public.is_unit_leader(auth.uid()) OR EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.student_id <> auth.uid() AND public.can_access_student(auth.uid(), s.student_id)));

-- Private assignment briefs and submission uploads. The existing submissions bucket was confirmed private.
UPDATE storage.buckets SET public = false, file_size_limit = 20971520,
  allowed_mime_types = ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
WHERE id = 'submissions';
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('briefs', 'briefs', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 20971520, allowed_mime_types = ARRAY['application/pdf'];

DROP POLICY IF EXISTS "student upload own files" ON storage.objects;
DROP POLICY IF EXISTS "read own or assessor files" ON storage.objects;
CREATE POLICY submissions_student_upload_scoped ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'submissions' AND public.storage_can_upload_submission(auth.uid(), name));
CREATE POLICY submissions_files_scoped_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'submissions' AND public.storage_can_read_submission(auth.uid(), name));
CREATE POLICY briefs_unit_leader_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'briefs' AND public.is_unit_leader(auth.uid()));
CREATE POLICY briefs_scoped_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'briefs' AND public.storage_can_read_brief(auth.uid(), name));
CREATE POLICY briefs_unit_leader_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'briefs' AND public.is_unit_leader(auth.uid()))
  WITH CHECK (bucket_id = 'briefs' AND public.is_unit_leader(auth.uid()));
CREATE POLICY briefs_unit_leader_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'briefs' AND public.is_unit_leader(auth.uid()));

COMMIT;
