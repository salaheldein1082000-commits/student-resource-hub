BEGIN;

CREATE OR REPLACE FUNCTION public.update_assessor_account(
  _profile_id uuid,
  _email text,
  _full_name text,
  _password text DEFAULT NULL,
  _class_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_email text := lower(btrim(_email));
  v_name text := btrim(_full_name);
  v_role text;
  v_class_id uuid;
BEGIN
  IF NOT public.is_unit_leader(auth.uid()) THEN
    RAISE EXCEPTION 'Only the Unit Leader can update Assessor accounts.';
  END IF;
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = _profile_id FOR UPDATE;
  IF v_role IS DISTINCT FROM 'engineer' THEN
    RAISE EXCEPTION 'Assessor profile was not found.';
  END IF;
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid Assessor email address.';
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Enter a full name between 2 and 120 characters.';
  END IF;
  IF _password IS NOT NULL AND _password <> '' AND
    (length(_password) < 8 OR octet_length(_password) > 72) THEN
    RAISE EXCEPTION 'Password must be at least 8 characters and no more than 72 bytes.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM auth.users u
    WHERE lower(u.email) = v_email AND u.id <> _profile_id
  ) THEN
    RAISE EXCEPTION 'An account with this email already exists.';
  END IF;
  IF _class_ids IS NOT NULL AND cardinality(_class_ids) > 2 THEN
    RAISE EXCEPTION 'An Assessor can be assigned to no more than two classes.';
  END IF;
  IF _class_ids IS NOT NULL AND cardinality(_class_ids) <> cardinality(ARRAY(SELECT DISTINCT unnest(_class_ids))) THEN
    RAISE EXCEPTION 'The selected class list contains duplicates.';
  END IF;
  IF _class_ids IS NOT NULL THEN
    FOREACH v_class_id IN ARRAY _class_ids LOOP
      IF NOT EXISTS (SELECT 1 FROM public.classes c WHERE c.id = v_class_id) THEN
        RAISE EXCEPTION 'One of the selected classes is not valid.';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.class_engineers ce
        WHERE ce.class_id = v_class_id AND ce.engineer_id <> _profile_id
      ) THEN
        RAISE EXCEPTION 'One of the selected classes is already assigned to another Assessor.';
      END IF;
    END LOOP;
  END IF;

  UPDATE auth.users
  SET email = v_email,
      email_confirmed_at = now(),
      encrypted_password = CASE
        WHEN _password IS NULL OR _password = '' THEN encrypted_password
        ELSE extensions.crypt(_password, extensions.gen_salt('bf'))
      END,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', v_name),
      updated_at = now()
  WHERE id = _profile_id;
  UPDATE public.profiles SET full_name = v_name, email = v_email WHERE id = _profile_id;
  IF _class_ids IS NOT NULL THEN
    DELETE FROM public.class_engineers WHERE engineer_id = _profile_id;
    FOREACH v_class_id IN ARRAY _class_ids LOOP
      INSERT INTO public.class_engineers (class_id, engineer_id) VALUES (v_class_id, _profile_id);
    END LOOP;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_assessor_account(_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  IF NOT public.is_unit_leader(auth.uid()) THEN
    RAISE EXCEPTION 'Only the Unit Leader can delete Assessor accounts.';
  END IF;
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = _profile_id FOR UPDATE;
  IF v_role IS DISTINCT FROM 'engineer' THEN
    RAISE EXCEPTION 'Assessor profile was not found.';
  END IF;
  DELETE FROM public.class_engineers WHERE engineer_id = _profile_id;
  DELETE FROM public.user_roles WHERE user_id = _profile_id;
  DELETE FROM public.profiles WHERE id = _profile_id;
  DELETE FROM auth.users WHERE id = _profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_student_profile_and_login(
  _profile_id uuid,
  _full_name text,
  _class_id uuid,
  _student_code text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_role text;
  v_current_class uuid;
  v_name text := btrim(_full_name);
  v_email text;
  v_capacity integer;
  v_enrolled integer;
BEGIN
  IF NOT public.is_unit_leader(auth.uid()) THEN
    RAISE EXCEPTION 'Only the Unit Leader can update student accounts.';
  END IF;
  SELECT p.role, p.class_id INTO v_role, v_current_class
  FROM public.profiles p WHERE p.id = _profile_id FOR UPDATE;
  IF v_role IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION 'Student profile was not found.';
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Student name must be between 2 and 120 characters.';
  END IF;
  IF _class_id IS NOT NULL THEN
    SELECT c.capacity INTO v_capacity FROM public.classes c WHERE c.id = _class_id;
    IF v_capacity IS NULL THEN RAISE EXCEPTION 'Choose a valid class.'; END IF;
    IF _class_id IS DISTINCT FROM v_current_class THEN
      SELECT count(*) INTO v_enrolled FROM public.profiles p WHERE p.class_id = _class_id;
      IF v_enrolled >= v_capacity THEN
        RAISE EXCEPTION 'This class is full (% students).', v_capacity;
      END IF;
    END IF;
  END IF;

  IF _student_code IS NOT NULL AND _student_code <> '' THEN
    IF _student_code !~ '^[0-9]{6}$' THEN
      RAISE EXCEPTION 'Student code must contain exactly 6 digits.';
    END IF;
    v_email := _student_code || '@student.local';
    IF EXISTS (
      SELECT 1 FROM auth.users u
      WHERE lower(u.email) = lower(v_email) AND u.id <> _profile_id
    ) THEN
      RAISE EXCEPTION 'That student code is already in use.';
    END IF;
    UPDATE auth.users
    SET email = v_email,
        email_confirmed_at = now(),
        encrypted_password = extensions.crypt(_student_code, extensions.gen_salt('bf')),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('student_code', _student_code),
        updated_at = now()
    WHERE id = _profile_id;
    UPDATE public.profiles SET email = v_email WHERE id = _profile_id;
  END IF;

  UPDATE public.profiles
  SET full_name = v_name,
      class_id = _class_id,
      group_name = (SELECT c.name FROM public.classes c WHERE c.id = _class_id)
  WHERE id = _profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_assessor_account(uuid, text, text, text, uuid[]),
  public.delete_assessor_account(uuid),
  public.update_student_profile_and_login(uuid, text, uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_assessor_account(uuid, text, text, text, uuid[]),
  public.delete_assessor_account(uuid),
  public.update_student_profile_and_login(uuid, text, uuid, text) FROM PUBLIC, anon;

COMMIT;
