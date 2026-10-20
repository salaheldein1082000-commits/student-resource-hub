BEGIN;

-- The requested permanent login credential is the six-digit student code.
-- Reset only six-digit student accounts; staff and non-code accounts are untouched.
UPDATE auth.users u
SET encrypted_password = extensions.crypt(split_part(u.email, '@', 1), extensions.gen_salt('bf')),
    raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) - 'must_change_password',
    updated_at = now()
FROM public.profiles p
WHERE p.id = u.id
  AND p.role = 'student'
  AND lower(u.email) ~ '^[0-9]{6}@student[.]local$';

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
      UPDATE auth.users
      SET encrypted_password = extensions.crypt(v_code, extensions.gen_salt('bf')),
          raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'must_change_password',
          updated_at = now()
      WHERE id = v_user_id;
      UPDATE public.profiles
      SET full_name = v_name, class_id = _class_id,
          group_name = (SELECT name FROM public.classes WHERE id = _class_id)
      WHERE id = v_user_id;
      temporary_password := v_code;
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
    v_password := v_code;
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
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

COMMIT;
