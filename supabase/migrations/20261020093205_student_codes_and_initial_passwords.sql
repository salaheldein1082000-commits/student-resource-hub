BEGIN;

-- Class 1-40 maps to the existing portal's Class 10. It is the only class
-- approved to hold 21 students; all other classes remain capped at 20.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.classes WHERE name = 'Class 10') THEN
    RAISE EXCEPTION 'Expected portal class Class 10 was not found; no capacity was changed.';
  END IF;
END $$;

ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_capacity_check;
UPDATE public.classes
SET capacity = CASE WHEN name = 'Class 10' THEN 21 ELSE 20 END;
ALTER TABLE public.classes
  ADD CONSTRAINT classes_capacity_check
  CHECK ((name = 'Class 10' AND capacity = 21) OR (name <> 'Class 10' AND capacity = 20));

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
  v_capacity integer;
  v_enrolled integer;
BEGIN
  IF NOT public.is_unit_leader(auth.uid()) THEN
    RAISE EXCEPTION 'Only the Unit Leader can import students.';
  END IF;
  IF jsonb_typeof(_students) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Student data must be a CSV-derived JSON array.';
  END IF;
  SELECT capacity INTO v_capacity FROM public.classes WHERE id = _class_id FOR UPDATE;
  IF v_capacity IS NULL THEN RAISE EXCEPTION 'Choose a valid class.'; END IF;
  IF jsonb_array_length(_students) > v_capacity THEN
    RAISE EXCEPTION 'Import no more than % students at a time.', v_capacity;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_students) LOOP
    v_code := btrim(coalesce(v_item->>'student_code', ''));
    v_name := btrim(coalesce(v_item->>'full_name', ''));
    student_code := v_code;
    full_name := v_name;
    temporary_password := NULL;
    created := false;
    error := NULL;

    IF v_code !~ '^[0-9]{6}$' THEN
      error := 'Student code must contain exactly 6 digits.';
      RETURN NEXT;
      CONTINUE;
    END IF;
    IF length(v_name) < 2 OR length(v_name) > 120 THEN
      error := 'Enter a full name between 2 and 120 characters.';
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT id INTO v_user_id
    FROM auth.users
    WHERE lower(email) = lower(v_code || '@student.local');
    IF v_user_id IS NOT NULL THEN
      SELECT role INTO v_existing_role FROM public.profiles WHERE id = v_user_id;
      IF v_existing_role IS DISTINCT FROM 'student' THEN
        error := 'This student code belongs to a privileged account and cannot be imported as a student.';
        RETURN NEXT;
        CONTINUE;
      END IF;
      SELECT count(*) INTO v_enrolled
      FROM public.profiles
      WHERE class_id = _class_id AND id <> v_user_id;
      IF v_enrolled >= v_capacity
         AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND class_id = _class_id) THEN
        error := format('This class already has %s students.', v_capacity);
        RETURN NEXT;
        CONTINUE;
      END IF;
      UPDATE public.profiles
      SET full_name = v_name, class_id = _class_id,
          group_name = (SELECT name FROM public.classes WHERE id = _class_id)
      WHERE id = v_user_id;
      -- Existing accounts retain their password and password-change state.
      temporary_password := NULL;
      created := false;
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT count(*) INTO v_enrolled FROM public.profiles WHERE class_id = _class_id;
    IF v_enrolled >= v_capacity THEN
      error := format('This class already has %s students.', v_capacity);
      RETURN NEXT;
      CONTINUE;
    END IF;

    v_email := v_code || '@student.local';
    -- The approved initial password is the student's six-digit code.
    -- Require a private replacement before allowing normal portal navigation.
    v_password := v_code;
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'must_change_password', true),
      jsonb_build_object('full_name', v_name, 'student_code', v_code), now(), now(), '', '', '', ''
    );
    UPDATE public.profiles
    SET full_name = v_name, role = 'student', class_id = _class_id,
        group_name = (SELECT name FROM public.classes WHERE id = _class_id)
    WHERE id = v_user_id;
    DELETE FROM public.user_roles WHERE user_id = v_user_id;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'student') ON CONFLICT (user_id, role) DO NOTHING;

    temporary_password := v_code;
    created := true;
    RETURN NEXT;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.complete_initial_password_change()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_password_hash text;
  v_code text;
  v_app_metadata jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Sign in before changing your password.'; END IF;
  SELECT email, encrypted_password, raw_app_meta_data
  INTO v_email, v_password_hash, v_app_metadata
  FROM auth.users WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Student account was not found.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND role = 'student') THEN
    RAISE EXCEPTION 'Only students can complete this initial password change.';
  END IF;

  IF coalesce(v_app_metadata->>'must_change_password', 'false') <> 'true' THEN
    RETURN true;
  END IF;

  v_code := substring(coalesce(v_email, '') FROM '^([0-9]{6})@student[.]local$');
  IF v_code IS NULL THEN RAISE EXCEPTION 'This account does not use a six-digit student code.'; END IF;
  IF v_password_hash IS NULL OR extensions.crypt(v_code, v_password_hash) = v_password_hash THEN
    RAISE EXCEPTION 'Choose a new password different from your student code.';
  END IF;

  UPDATE auth.users
  SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'must_change_password',
      updated_at = now()
  WHERE id = v_user_id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.complete_initial_password_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_initial_password_change() TO authenticated;

COMMIT;
