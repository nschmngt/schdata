CREATE TABLE public.interventions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id uuid NOT NULL REFERENCES public.admissions(id) ON DELETE CASCADE,
  term text NOT NULL DEFAULT '',
  academic_year text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  risk_indicators text[] NOT NULL DEFAULT '{}',
  baseline_performance numeric DEFAULT 0,
  baseline_attendance numeric DEFAULT 0,
  identified_need text NOT NULL DEFAULT '',
  strategy text NOT NULL DEFAULT 'Targeted remedial lessons',
  responsible_staff_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  responsible_staff_name text NOT NULL DEFAULT '',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  review_date date NOT NULL DEFAULT CURRENT_DATE,
  target_outcome text NOT NULL DEFAULT '',
  progress_notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  follow_up_results text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('risk_detected', 'under_review', 'active', 'escalated', 'closed')),
  closure_reason text NOT NULL DEFAULT '',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX interventions_admission_idx ON public.interventions(admission_id);
CREATE INDEX interventions_status_idx ON public.interventions(status);
CREATE INDEX interventions_created_idx ON public.interventions(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interventions TO authenticated;
GRANT ALL ON public.interventions TO service_role;

ALTER TABLE public.interventions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage interventions" ON public.interventions FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY "staff manage interventions" ON public.interventions FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'staff'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "family views own student interventions" ON public.interventions FOR SELECT TO authenticated
  USING (private.owns_admission(admission_id));

CREATE TRIGGER interventions_set_updated_at
  BEFORE UPDATE ON public.interventions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
