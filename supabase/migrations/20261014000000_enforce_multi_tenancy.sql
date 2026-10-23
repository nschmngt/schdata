-- Migration 20261014000000: Enforce Multi-Tenancy Across All Core Entities, Constraints & Enterprise RLS Policies

-- 1. Add school_id column to tables lacking tenant isolation
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.admissions ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.finance_income ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.finance_expenses ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.finance_payroll ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.student_fees ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.staff_performance ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.staff_schedules ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.offer_letters ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.teaching_assignments ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.class_teachers ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.student_assessments ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.student_attendance ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.student_exeat ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.exams_quizzes ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.exam_submissions ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;

-- 2. Backfill existing records to default active school
DO $$
DECLARE
  default_school_id uuid;
BEGIN
  SELECT id INTO default_school_id FROM public.schools ORDER BY active DESC, created_at ASC LIMIT 1;
  IF default_school_id IS NOT NULL THEN
    UPDATE public.profiles SET school_id = default_school_id WHERE school_id IS NULL;
    UPDATE public.admissions SET school_id = default_school_id WHERE school_id IS NULL;
    UPDATE public.finance_income SET school_id = default_school_id WHERE school_id IS NULL;
    UPDATE public.finance_expenses SET school_id = default_school_id WHERE school_id IS NULL;
    UPDATE public.finance_payroll SET school_id = default_school_id WHERE school_id IS NULL;
    UPDATE public.student_fees SET school_id = default_school_id WHERE school_id IS NULL;
    UPDATE public.staff_performance SET school_id = default_school_id WHERE school_id IS NULL;
    UPDATE public.staff_schedules SET school_id = default_school_id WHERE school_id IS NULL;
    UPDATE public.offer_letters SET school_id = default_school_id WHERE school_id IS NULL;
    UPDATE public.teaching_assignments SET school_id = default_school_id WHERE school_id IS NULL;
    UPDATE public.class_teachers SET school_id = default_school_id WHERE school_id IS NULL;
    UPDATE public.student_assessments SET school_id = default_school_id WHERE school_id IS NULL;
    UPDATE public.student_attendance SET school_id = default_school_id WHERE school_id IS NULL;
    UPDATE public.student_exeat SET school_id = default_school_id WHERE school_id IS NULL;
    UPDATE public.exams_quizzes SET school_id = default_school_id WHERE school_id IS NULL;
    UPDATE public.exam_submissions SET school_id = default_school_id WHERE school_id IS NULL;
    UPDATE public.audit_logs SET school_id = default_school_id WHERE school_id IS NULL;
  END IF;
END $$;

-- 3. Add compound tenant constraint for class_teachers
ALTER TABLE public.class_teachers DROP CONSTRAINT IF EXISTS class_teachers_class_name_key;
ALTER TABLE public.class_teachers DROP CONSTRAINT IF EXISTS class_teachers_school_id_class_name_key;
ALTER TABLE public.class_teachers ADD CONSTRAINT class_teachers_school_id_class_name_key UNIQUE (school_id, class_name);

-- 4. Create indices for tenant lookup performance
CREATE INDEX IF NOT EXISTS profiles_school_id_idx ON public.profiles(school_id);
CREATE INDEX IF NOT EXISTS admissions_school_id_idx ON public.admissions(school_id);
CREATE INDEX IF NOT EXISTS finance_income_school_id_idx ON public.finance_income(school_id);
CREATE INDEX IF NOT EXISTS finance_expenses_school_id_idx ON public.finance_expenses(school_id);
CREATE INDEX IF NOT EXISTS finance_payroll_school_id_idx ON public.finance_payroll(school_id);
CREATE INDEX IF NOT EXISTS student_fees_school_id_idx ON public.student_fees(school_id);
CREATE INDEX IF NOT EXISTS staff_performance_school_id_idx ON public.staff_performance(school_id);
CREATE INDEX IF NOT EXISTS staff_schedules_school_id_idx ON public.staff_schedules(school_id);
CREATE INDEX IF NOT EXISTS offer_letters_school_id_idx ON public.offer_letters(school_id);
CREATE INDEX IF NOT EXISTS teaching_assignments_school_id_idx ON public.teaching_assignments(school_id);
CREATE INDEX IF NOT EXISTS class_teachers_school_id_idx ON public.class_teachers(school_id);
CREATE INDEX IF NOT EXISTS student_assessments_school_id_idx ON public.student_assessments(school_id);
CREATE INDEX IF NOT EXISTS student_attendance_school_id_idx ON public.student_attendance(school_id);
CREATE INDEX IF NOT EXISTS student_exeat_school_id_idx ON public.student_exeat(school_id);
CREATE INDEX IF NOT EXISTS exams_quizzes_school_id_idx ON public.exams_quizzes(school_id);
CREATE INDEX IF NOT EXISTS exam_submissions_school_id_idx ON public.exam_submissions(school_id);
CREATE INDEX IF NOT EXISTS audit_logs_school_id_idx ON public.audit_logs(school_id);

-- 5. Enable Row Level Security (RLS) on all tenant tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teaching_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_exeat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 6. Enterprise Row Level Security (RLS) policies
-- Profiles policy (prevents infinite recursion)
DROP POLICY IF EXISTS "tenant_isolation_profiles" ON public.profiles;
CREATE POLICY "tenant_isolation_profiles" ON public.profiles FOR ALL TO authenticated
  USING (
    id = auth.uid() OR
    private.is_admin(auth.uid())
  );

-- Admissions policy
DROP POLICY IF EXISTS "tenant_isolation_admissions" ON public.admissions;
CREATE POLICY "tenant_isolation_admissions" ON public.admissions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.school_id = admissions.school_id)
    )
  );

-- Class teachers & Teaching assignments policies
DROP POLICY IF EXISTS "tenant_isolation_class_teachers" ON public.class_teachers;
CREATE POLICY "tenant_isolation_class_teachers" ON public.class_teachers FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.school_id = class_teachers.school_id)
    )
  );

DROP POLICY IF EXISTS "tenant_isolation_teaching_assignments" ON public.teaching_assignments;
CREATE POLICY "tenant_isolation_teaching_assignments" ON public.teaching_assignments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.school_id = teaching_assignments.school_id)
    )
  );

-- Exams & Submissions policies
DROP POLICY IF EXISTS "tenant_isolation_exams_quizzes" ON public.exams_quizzes;
CREATE POLICY "tenant_isolation_exams_quizzes" ON public.exams_quizzes FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.school_id = exams_quizzes.school_id)
    )
  );

DROP POLICY IF EXISTS "tenant_isolation_exam_submissions" ON public.exam_submissions;
CREATE POLICY "tenant_isolation_exam_submissions" ON public.exam_submissions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.school_id = exam_submissions.school_id)
    )
  );

-- Finance policies
DROP POLICY IF EXISTS "tenant_isolation_finance_income" ON public.finance_income;
CREATE POLICY "tenant_isolation_finance_income" ON public.finance_income FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.school_id = finance_income.school_id)
    )
  );

DROP POLICY IF EXISTS "tenant_isolation_finance_expenses" ON public.finance_expenses;
CREATE POLICY "tenant_isolation_finance_expenses" ON public.finance_expenses FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.school_id = finance_expenses.school_id)
    )
  );

DROP POLICY IF EXISTS "tenant_isolation_finance_payroll" ON public.finance_payroll;
CREATE POLICY "tenant_isolation_finance_payroll" ON public.finance_payroll FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.school_id = finance_payroll.school_id)
    )
  );

DROP POLICY IF EXISTS "tenant_isolation_student_fees" ON public.student_fees;
CREATE POLICY "tenant_isolation_student_fees" ON public.student_fees FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.school_id = student_fees.school_id)
    )
  );

-- Staff policies
DROP POLICY IF EXISTS "tenant_isolation_staff_performance" ON public.staff_performance;
CREATE POLICY "tenant_isolation_staff_performance" ON public.staff_performance FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.school_id = staff_performance.school_id)
    )
  );

DROP POLICY IF EXISTS "tenant_isolation_staff_schedules" ON public.staff_schedules;
CREATE POLICY "tenant_isolation_staff_schedules" ON public.staff_schedules FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.school_id = staff_schedules.school_id)
    )
  );

DROP POLICY IF EXISTS "tenant_isolation_offer_letters" ON public.offer_letters;
CREATE POLICY "tenant_isolation_offer_letters" ON public.offer_letters FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.school_id = offer_letters.school_id)
    )
  );

-- Student records policies
DROP POLICY IF EXISTS "tenant_isolation_student_assessments" ON public.student_assessments;
CREATE POLICY "tenant_isolation_student_assessments" ON public.student_assessments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.school_id = student_assessments.school_id)
    )
  );

DROP POLICY IF EXISTS "tenant_isolation_student_attendance" ON public.student_attendance;
CREATE POLICY "tenant_isolation_student_attendance" ON public.student_attendance FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.school_id = student_attendance.school_id)
    )
  );

DROP POLICY IF EXISTS "tenant_isolation_student_exeat" ON public.student_exeat;
CREATE POLICY "tenant_isolation_student_exeat" ON public.student_exeat FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.school_id = student_exeat.school_id)
    )
  );

-- Audit logs policy
DROP POLICY IF EXISTS "tenant_isolation_audit_logs" ON public.audit_logs;
CREATE POLICY "tenant_isolation_audit_logs" ON public.audit_logs FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.school_id = audit_logs.school_id)
    )
  );
