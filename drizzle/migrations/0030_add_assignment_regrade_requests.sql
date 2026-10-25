CREATE TABLE public.assignment_regrade_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.assignment_submissions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  teacher_response text NOT NULL DEFAULT '',
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignment_regrade_requests_submission_student_unique UNIQUE (submission_id, student_id)
);

CREATE INDEX assignment_regrade_requests_submission_idx ON public.assignment_regrade_requests(submission_id);
CREATE INDEX assignment_regrade_requests_student_idx ON public.assignment_regrade_requests(student_id);
CREATE INDEX assignment_regrade_requests_status_idx ON public.assignment_regrade_requests(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_regrade_requests TO authenticated;
GRANT ALL ON public.assignment_regrade_requests TO service_role;

ALTER TABLE public.assignment_regrade_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins and staff manage regrade requests" ON public.assignment_regrade_requests FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'staff'::app_role))
  WITH CHECK (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "students submit own regrade requests" ON public.assignment_regrade_requests FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "students view own regrade requests" ON public.assignment_regrade_requests FOR SELECT TO authenticated
  USING (
    private.is_admin(auth.uid())
    OR private.has_role(auth.uid(), 'staff'::app_role)
    OR student_id = auth.uid()
  );

CREATE TRIGGER assignment_regrade_requests_set_updated_at
  BEFORE UPDATE ON public.assignment_regrade_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
