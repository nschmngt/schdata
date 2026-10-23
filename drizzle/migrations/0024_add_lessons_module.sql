CREATE TABLE public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  class_name text NOT NULL,
  subject text NOT NULL,
  term text NOT NULL DEFAULT '',
  intro_video_url text NOT NULL DEFAULT '',
  quiz_id uuid REFERENCES public.exams_quizzes(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  order_index integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.lesson_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  admission_id uuid REFERENCES public.admissions(id) ON DELETE CASCADE,
  quiz_submission_id uuid REFERENCES public.exam_submissions(id) ON DELETE SET NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_student_unique UNIQUE (lesson_id, student_id)
);

-- Indices
CREATE INDEX lessons_class_subject_idx ON public.lessons(class_name, subject);
CREATE INDEX lessons_quiz_idx ON public.lessons(quiz_id);
CREATE INDEX lessons_created_idx ON public.lessons(created_at DESC);
CREATE INDEX lesson_completions_lesson_idx ON public.lesson_completions(lesson_id);
CREATE INDEX lesson_completions_student_idx ON public.lesson_completions(student_id);

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lessons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_completions TO authenticated;

GRANT ALL ON public.lessons TO service_role;
GRANT ALL ON public.lesson_completions TO service_role;

-- RLS
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage lessons" ON public.lessons FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "staff create and manage lessons" ON public.lessons FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'staff'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "students read published lessons" ON public.lessons FOR SELECT TO authenticated
  USING (status IN ('published', 'archived'));

CREATE POLICY "admins manage completions" ON public.lesson_completions FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "staff read completions" ON public.lesson_completions FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "students manage own completions" ON public.lesson_completions FOR ALL TO authenticated
  USING (student_id = auth.uid() OR private.owns_admission(admission_id))
  WITH CHECK (student_id = auth.uid() OR private.owns_admission(admission_id));

CREATE TRIGGER set_updated_at_lessons BEFORE UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_lesson_completions BEFORE UPDATE ON public.lesson_completions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
