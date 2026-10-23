BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_assignment_configs (
  assignment_id uuid PRIMARY KEY REFERENCES public.assignments(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  model_answer text NOT NULL DEFAULT '',
  marking_guidance text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.ai_rubric_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL REFERENCES public.criteria(id) ON DELETE CASCADE,
  max_points integer NOT NULL DEFAULT 1 CHECK (max_points > 0 AND max_points <= 100),
  guidance text NOT NULL DEFAULT '',
  model_answer text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (assignment_id, criterion_id)
);

CREATE TABLE IF NOT EXISTS public.ai_assessment_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'google_gemini',
  model text NOT NULL DEFAULT 'gemini-3.8-flash',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  result jsonb,
  error_message text,
  started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (submission_id, created_at)
);

ALTER TABLE public.ai_assignment_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_rubric_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_assessment_runs ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.ai_assignment_configs, public.ai_rubric_items, public.ai_assessment_runs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ai_assignment_configs, public.ai_rubric_items TO authenticated;
GRANT UPDATE ON public.ai_assessment_runs TO authenticated;

CREATE POLICY "staff can read AI assignment configs" ON public.ai_assignment_configs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'assessor'));
CREATE POLICY "unit leaders manage AI assignment configs" ON public.ai_assignment_configs
  FOR ALL TO authenticated USING (public.is_unit_leader(auth.uid()))
  WITH CHECK (public.is_unit_leader(auth.uid()));

CREATE POLICY "staff can read AI rubric items" ON public.ai_rubric_items
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'assessor'));
CREATE POLICY "unit leaders manage AI rubric items" ON public.ai_rubric_items
  FOR ALL TO authenticated USING (public.is_unit_leader(auth.uid()))
  WITH CHECK (public.is_unit_leader(auth.uid()));

CREATE POLICY "staff can read AI assessment runs" ON public.ai_assessment_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'assessor'));
CREATE POLICY "staff can update AI assessment runs" ON public.ai_assessment_runs
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'assessor'))
  WITH CHECK (public.has_role(auth.uid(), 'assessor'));

REVOKE INSERT, DELETE ON public.ai_assessment_runs FROM authenticated;
GRANT ALL ON public.ai_assignment_configs, public.ai_rubric_items, public.ai_assessment_runs TO service_role;

COMMIT;
