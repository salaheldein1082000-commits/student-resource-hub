BEGIN;

CREATE TABLE IF NOT EXISTS public.portal_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  ai_assessment_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.portal_settings (id, ai_assessment_enabled)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.portal_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.portal_settings TO authenticated;
GRANT UPDATE ON public.portal_settings TO authenticated;
CREATE POLICY "staff can read portal settings"
  ON public.portal_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'assessor'));
CREATE POLICY "unit leader can update portal settings"
  ON public.portal_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'assessor'))
  WITH CHECK (public.has_role(auth.uid(), 'assessor'));

CREATE TABLE IF NOT EXISTS public.submission_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL,
  deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  student_id uuid,
  assignment_id uuid,
  attempt_no integer,
  original_file_name text,
  storage_provider text,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.submission_deletion_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.submission_deletion_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.submission_deletion_log TO service_role;

COMMIT;
