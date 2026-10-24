BEGIN;

CREATE OR REPLACE FUNCTION public.create_student(
  _class_id uuid,
  _student_code text,
  _full_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_name text := btrim(coalesce(_full_name, ''));
  v_code text := btrim(coalesce(_student_code, ''));
  v_class_name text;
  v_capacity integer;
  v_enrolled integer;
  v_user_id uuid;
BEGIN
  IF NOT public.is_unit_leader(auth.uid()) THEN
    RAISE EXCEPTION 'Only the Unit Leader can create student accounts.';
  END IF;
  IF v_code !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'Student code must contain exactly 6 digits.';
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Enter a full name between 2 and 120 characters.';
  END IF;

  SELECT name, capacity INTO v_class_name, v_capacity
  FROM public.classes
  WHERE id = _class_id
  FOR UPDATE;
  IF v_capacity IS NULL THEN
    RAISE EXCEPTION 'Choose a valid class.';
  END IF;

  SELECT count(*) INTO v_enrolled
  FROM public.profiles
  WHERE class_id = _class_id;
  IF v_enrolled >= v_capacity THEN
    RAISE EXCEPTION 'This class is full (% students).', v_capacity;
  END IF;

  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE lower(email) = lower(v_code || '@student.local')
  ) THEN
    RAISE EXCEPTION 'This student code already exists. Choose a different code.';
  END IF;

  v_user_id := gen_random_uuid();
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_code || '@student.local',
    extensions.crypt(v_code, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object(
      'provider', 'email',
      'providers', jsonb_build_array('email'),
      'must_change_password', true
    ),
    jsonb_build_object('full_name', v_name, 'student_code', v_code),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  UPDATE public.profiles
  SET full_name = v_name,
      role = 'student',
      class_id = _class_id,
      group_name = v_class_name
  WHERE id = v_user_id;

  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'student')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_student(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_student(uuid, text, text) TO authenticated, service_role;

COMMIT;
