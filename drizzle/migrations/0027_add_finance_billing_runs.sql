CREATE TABLE IF NOT EXISTS public.finance_billing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year text NOT NULL,
  period text NOT NULL,
  target_scope text NOT NULL DEFAULT 'all',
  target_value text,
  student_count integer NOT NULL DEFAULT 0,
  total_amount_billed numeric(14,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_billing_runs TO authenticated;
GRANT ALL ON public.finance_billing_runs TO service_role;

ALTER TABLE public.finance_billing_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_billing_runs_admin" ON public.finance_billing_runs FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS finance_billing_runs_school_period_idx ON public.finance_billing_runs (school_id, period);

CREATE TRIGGER finance_billing_runs_updated_at BEFORE UPDATE ON public.finance_billing_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
