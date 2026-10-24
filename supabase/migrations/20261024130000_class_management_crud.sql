BEGIN;

-- Replace the original fixed 20/21-seat rule with an editable, bounded capacity.
ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_capacity_check;
ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_capacity_range_check;
ALTER TABLE public.classes
  ADD CONSTRAINT classes_capacity_range_check CHECK (capacity BETWEEN 1 AND 500);

CREATE OR REPLACE FUNCTION public.guard_class_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enrolled integer;
BEGIN
  IF NEW.capacity IS NULL OR NEW.capacity < 1 OR NEW.capacity > 500 THEN
    RAISE EXCEPTION 'Class capacity must be between 1 and 500 students.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT count(*) INTO v_enrolled
    FROM public.profiles
    WHERE class_id = OLD.id AND role = 'student';
    IF NEW.capacity < v_enrolled THEN
      RAISE EXCEPTION 'Capacity cannot be lower than the current enrollment of % students.', v_enrolled;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_class_capacity() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS classes_capacity_guard ON public.classes;
CREATE TRIGGER classes_capacity_guard
BEFORE INSERT OR UPDATE OF capacity ON public.classes
FOR EACH ROW EXECUTE FUNCTION public.guard_class_capacity();

CREATE OR REPLACE FUNCTION public.create_class(_name text, _capacity integer DEFAULT 20)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_name text := btrim(coalesce(_name, ''));
  v_class_id uuid;
BEGIN
  IF NOT public.is_unit_leader(auth.uid()) THEN
    RAISE EXCEPTION 'Only the Unit Leader can create classes.';
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 80 THEN
    RAISE EXCEPTION 'Class name must be between 2 and 80 characters.';
  END IF;
  IF _capacity IS NULL OR _capacity < 1 OR _capacity > 500 THEN
    RAISE EXCEPTION 'Class capacity must be between 1 and 500 students.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.classes WHERE lower(name) = lower(v_name)) THEN
    RAISE EXCEPTION 'A class with this name already exists.';
  END IF;

  INSERT INTO public.classes (name, unit_no, capacity)
  VALUES (v_name, 1, _capacity)
  RETURNING id INTO v_class_id;
  RETURN v_class_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_class(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_class(text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_class_capacity(_class_id uuid, _capacity integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_current_capacity integer;
  v_enrolled integer;
BEGIN
  IF NOT public.is_unit_leader(auth.uid()) THEN
    RAISE EXCEPTION 'Only the Unit Leader can change class capacity.';
  END IF;
  IF _capacity IS NULL OR _capacity < 1 OR _capacity > 500 THEN
    RAISE EXCEPTION 'Class capacity must be between 1 and 500 students.';
  END IF;

  SELECT capacity INTO v_current_capacity
  FROM public.classes WHERE id = _class_id FOR UPDATE;
  IF v_current_capacity IS NULL THEN
    RAISE EXCEPTION 'Class not found.';
  END IF;
  SELECT count(*) INTO v_enrolled
  FROM public.profiles WHERE class_id = _class_id AND role = 'student';
  IF _capacity < v_enrolled THEN
    RAISE EXCEPTION 'Capacity cannot be lower than the current enrollment of % students.', v_enrolled;
  END IF;

  UPDATE public.classes SET capacity = _capacity WHERE id = _class_id;
END;
$$;
REVOKE ALL ON FUNCTION public.update_class_capacity(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_class_capacity(uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_class_with_transfer(
  _class_id uuid,
  _target_class_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_source_name text;
  v_target_name text;
  v_target_capacity integer;
  v_source_students integer;
  v_target_students integer;
  v_session_count integer;
  v_pending_sessions integer;
BEGIN
  IF NOT public.is_unit_leader(auth.uid()) THEN
    RAISE EXCEPTION 'Only the Unit Leader can delete classes.';
  END IF;

  SELECT name INTO v_source_name
  FROM public.classes WHERE id = _class_id FOR UPDATE;
  IF v_source_name IS NULL THEN
    RAISE EXCEPTION 'Class not found.';
  END IF;
  IF _target_class_id = _class_id THEN
    RAISE EXCEPTION 'Choose a different destination class.';
  END IF;

  SELECT count(*) INTO v_source_students
  FROM public.profiles WHERE class_id = _class_id AND role = 'student';
  SELECT count(*), count(*) FILTER (WHERE status = 'pending')
    INTO v_session_count, v_pending_sessions
  FROM public.drive_upload_sessions WHERE class_id = _class_id;

  IF v_pending_sessions > 0 THEN
    RAISE EXCEPTION 'This class has an active Drive upload. Wait for it to finish, then try again.';
  END IF;

  IF _target_class_id IS NULL THEN
    IF v_source_students > 0 OR v_session_count > 0 THEN
      RAISE EXCEPTION 'Choose a destination class to preserve students and Drive upload history.';
    END IF;
  ELSE
    SELECT name, capacity INTO v_target_name, v_target_capacity
    FROM public.classes WHERE id = _target_class_id FOR UPDATE;
    IF v_target_name IS NULL THEN
      RAISE EXCEPTION 'Choose a valid destination class.';
    END IF;

    SELECT count(*) INTO v_target_students
    FROM public.profiles WHERE class_id = _target_class_id AND role = 'student';
    IF v_target_students + v_source_students > v_target_capacity THEN
      RAISE EXCEPTION 'The destination class needs capacity for all % students being transferred.', v_source_students;
    END IF;

    -- Preserve assignment access for transferred students before the source class is removed.
    INSERT INTO public.assignment_classes (assignment_id, class_id)
    SELECT assignment_id, _target_class_id
    FROM public.assignment_classes
    WHERE class_id = _class_id
    ON CONFLICT (assignment_id, class_id) DO NOTHING;

    UPDATE public.profiles
    SET class_id = _target_class_id, group_name = v_target_name
    WHERE class_id = _class_id AND role = 'student';

    -- Completed/expired upload-session records stay available for audit. Pending sessions were rejected above.
    UPDATE public.drive_upload_sessions
    SET class_id = _target_class_id
    WHERE class_id = _class_id;
  END IF;

  -- Cascading references remove only the old class's Assessor/folder/assignment links.
  -- The Drive folder itself and all student accounts/submissions remain intact.
  DELETE FROM public.classes WHERE id = _class_id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_class_with_transfer(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_class_with_transfer(uuid, uuid) TO authenticated, service_role;

-- Deletion must pass through the transfer-aware RPC; direct Unit Leader DELETE is denied.
REVOKE DELETE ON TABLE public.classes FROM PUBLIC, anon, authenticated;

COMMIT;
