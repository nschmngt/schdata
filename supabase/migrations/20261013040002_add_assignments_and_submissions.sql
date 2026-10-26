CREATE TABLE public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  class_name text NOT NULL,
  subject text NOT NULL,
  education_level text NOT NULL DEFAULT '',
  term text NOT NULL DEFAULT '',
  assessment_type text NOT NULL DEFAULT 'Assignment',
  max_score numeric NOT NULL DEFAULT 100 CHECK (max_score > 0),
  due_date timestamptz NOT NULL,
  submission_mode text NOT NULL DEFAULT 'individual' CHECK (submission_mode IN ('individual', 'group')),
  submission_type text NOT NULL DEFAULT 'text' CHECK (submission_type IN ('text', 'file_link', 'offline')),
  allow_late boolean NOT NULL DEFAULT true,
  late_grace_hours numeric NOT NULL DEFAULT 0 CHECK (late_grace_hours >= 0),
  late_penalty_type text NOT NULL DEFAULT 'percentage_per_day' CHECK (late_penalty_type IN ('percentage_per_day', 'fixed_per_day', 'none')),
  late_penalty_value numeric NOT NULL DEFAULT 0 CHECK (late_penalty_value >= 0),
  max_late_penalty_percent numeric NOT NULL DEFAULT 100 CHECK (max_late_penalty_percent BETWEEN 0 AND 100),
  cutoff_date timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.assignment_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  group_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.assignment_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.assignment_groups(id) ON DELETE CASCADE,
  admission_id uuid NOT NULL REFERENCES public.admissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignment_group_members_group_admission_unique UNIQUE (group_id, admission_id)
);

CREATE TABLE public.assignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  admission_id uuid REFERENCES public.admissions(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.assignment_groups(id) ON DELETE CASCADE,
  submission_text text NOT NULL DEFAULT '',
  attachment_url text NOT NULL DEFAULT '',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_late boolean NOT NULL DEFAULT false,
  late_hours numeric NOT NULL DEFAULT 0,
  raw_score numeric CHECK (raw_score IS NULL OR raw_score >= 0),
  late_penalty_applied numeric DEFAULT 0,
  final_score numeric CHECK (final_score IS NULL OR final_score >= 0),
  feedback text NOT NULL DEFAULT '',
  graded_at timestamptz,
  graded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX assignments_class_subject_idx ON public.assignments(class_name, subject);
CREATE INDEX assignments_due_date_idx ON public.assignments(due_date);
CREATE INDEX assignment_groups_assignment_idx ON public.assignment_groups(assignment_id);
CREATE INDEX assignment_submissions_assignment_idx ON public.assignment_submissions(assignment_id);
CREATE INDEX assignment_submissions_admission_idx ON public.assignment_submissions(admission_id);
CREATE INDEX assignment_submissions_group_idx ON public.assignment_submissions(group_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignments TO authenticated;
GRANT ALL ON public.assignments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_groups TO authenticated;
GRANT ALL ON public.assignment_groups TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_group_members TO authenticated;
GRANT ALL ON public.assignment_group_members TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_submissions TO authenticated;
GRANT ALL ON public.assignment_submissions TO service_role;

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins and staff manage assignments" ON public.assignments FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'staff'::app_role))
  WITH CHECK (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "everyone views assignments" ON public.assignments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admins and staff manage assignment groups" ON public.assignment_groups FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'staff'::app_role))
  WITH CHECK (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "everyone views assignment groups" ON public.assignment_groups FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admins and staff manage group members" ON public.assignment_group_members FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'staff'::app_role))
  WITH CHECK (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "everyone views group members" ON public.assignment_group_members FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admins and staff manage assignment submissions" ON public.assignment_submissions FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'staff'::app_role))
  WITH CHECK (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "students submit assignments" ON public.assignment_submissions FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "family views assignment submissions" ON public.assignment_submissions FOR SELECT TO authenticated
  USING (
    private.is_admin(auth.uid())
    OR private.has_role(auth.uid(), 'staff'::app_role)
    OR (admission_id IS NOT NULL AND private.owns_admission(admission_id))
    OR submitted_by = auth.uid()
  );

CREATE TRIGGER assignments_set_updated_at
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER assignment_submissions_set_updated_at
  BEFORE UPDATE ON public.assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
