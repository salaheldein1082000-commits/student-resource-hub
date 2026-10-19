-- Fix the Engineer onboarding RPC, restrict internal trigger/helper functions,
-- and cover foreign keys with indexes for class-roster and assessment queries.

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
  IF NOT public.is_unit_leader(auth.uid()) THEN
    RAISE EXCEPTION 'Only the Unit Leader can create Engineer accounts.';
  END IF;

  v_email := lower(btrim(_email));
  v_name := btrim(_full_name);
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid Engineer email address.';
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Enter a full name between 2 and 120 characters.';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users AS existing_user WHERE lower(existing_user.email) = v_email) THEN
    RAISE EXCEPTION 'An account with this email already exists.';
  END IF;

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

  UPDATE public.profiles
  SET full_name = v_name, role = 'engineer', group_name = NULL, class_id = NULL
  WHERE id = v_user_id;
  DELETE FROM public.user_roles AS existing_role WHERE existing_role.user_id = v_user_id;

  user_id := v_user_id;
  email := v_email;
  temporary_password := v_password;
  RETURN NEXT;
END $$;

-- Do not allow authenticated users to probe another user's legacy role.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
  SELECT _user_id = auth.uid()
     AND EXISTS (
       SELECT 1 FROM public.user_roles AS own_role
       WHERE own_role.user_id = auth.uid() AND own_role.role = _role
     )
$$;

-- Trigger functions must only be invoked by their table triggers, not exposed
-- as callable PostgREST RPC endpoints.
REVOKE EXECUTE ON FUNCTION public.guard_class_engineer_assignment()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_feedback_publication()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_grading_rules()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_profile_scope()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_submission_record()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_class_group_name()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE INDEX IF NOT EXISTS profiles_class_id_idx ON public.profiles(class_id);
CREATE INDEX IF NOT EXISTS submissions_student_id_idx ON public.submissions(student_id);
CREATE INDEX IF NOT EXISTS gradings_criterion_id_idx ON public.gradings(criterion_id);
CREATE INDEX IF NOT EXISTS attempts_submission_id_idx ON public.attempts(submission_id);
CREATE INDEX IF NOT EXISTS resource_views_resource_id_idx ON public.resource_views(resource_id);
CREATE INDEX IF NOT EXISTS resource_views_student_id_idx ON public.resource_views(student_id);
