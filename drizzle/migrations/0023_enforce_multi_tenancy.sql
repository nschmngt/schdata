-- Migration 0023: Enforce Multi-Tenancy Across All Core Entities & Tables

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

-- 3. Create indices for tenant lookup performance
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
