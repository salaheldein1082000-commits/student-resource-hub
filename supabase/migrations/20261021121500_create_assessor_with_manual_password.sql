BEGIN;

CREATE OR REPLACE FUNCTION public.create_assessor(
  _email text,
  _full_name text,
  _password text,
  _class_id uuid DEFAULT NULL
)
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_email text := lower(btrim(_email));
  v_name text := btrim(_full_name);
BEGIN
  IF NOT public.is_unit_leader(auth.uid()) THEN
    RAISE EXCEPTION 'Only the Unit Leader can create Assessor accounts.';
  END IF;
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid Assessor email address.';
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Enter a full name between 2 and 120 characters.';
  END IF;
  IF _password IS NULL OR length(_password) < 8 OR octet_length(_password) > 72 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters and no more than 72 bytes.';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = v_email) THEN
    RAISE EXCEPTION 'An account with this email already exists.';
  END IF;
  IF _class_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.classes c WHERE c.id = _class_id) THEN
      RAISE EXCEPTION 'Choose a valid class.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.class_engineers ce WHERE ce.class_id = _class_id) THEN
      RAISE EXCEPTION 'This class already has an Assessor assigned.';
    END IF;
  END IF;

  v_user_id := gen_random_uuid();
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
    extensions.crypt(_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', v_name), now(), now(), '', '', '', ''
  );

  UPDATE public.profiles
  SET full_name = v_name, role = 'engineer', group_name = NULL, class_id = NULL
  WHERE id = v_user_id;
  DELETE FROM public.user_roles WHERE user_id = v_user_id;

  IF _class_id IS NOT NULL THEN
    INSERT INTO public.class_engineers (class_id, engineer_id) VALUES (_class_id, v_user_id);
  END IF;

  user_id := v_user_id;
  email := v_email;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_assessor(text, text, text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_assessor(text, text, text, uuid) FROM PUBLIC, anon;

COMMIT;
