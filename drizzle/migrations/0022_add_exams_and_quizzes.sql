CREATE TABLE public.exams_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  exam_type text NOT NULL DEFAULT 'exam' CHECK (exam_type IN ('exam', 'quiz')),
  class_name text NOT NULL DEFAULT '',
  subject text NOT NULL,
  term text NOT NULL DEFAULT '',
  duration_minutes integer NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  total_marks numeric NOT NULL DEFAULT 100 CHECK (total_marks >= 0),
  pass_mark numeric NOT NULL DEFAULT 50 CHECK (pass_mark >= 0),
  shuffle_questions boolean NOT NULL DEFAULT false,
  show_results_immediately boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed', 'archived')),
  start_time timestamptz,
  end_time timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.exam_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams_quizzes(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type text NOT NULL DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice', 'true_false', 'short_answer', 'essay')),
  points numeric NOT NULL DEFAULT 1 CHECK (points >= 0),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_answer text NOT NULL DEFAULT '',
  explanation text NOT NULL DEFAULT '',
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.exam_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams_quizzes(id) ON DELETE CASCADE,
  admission_id uuid REFERENCES public.admissions(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'graded')),
  total_score numeric NOT NULL DEFAULT 0,
  feedback text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.exam_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.exam_submissions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  answer_text text NOT NULL DEFAULT '',
  is_correct boolean,
  points_awarded numeric NOT NULL DEFAULT 0,
  feedback text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX exams_quizzes_class_subject_idx ON public.exams_quizzes(class_name, subject);
CREATE INDEX exams_quizzes_created_idx ON public.exams_quizzes(created_at DESC);
CREATE INDEX exam_questions_exam_idx ON public.exam_questions(exam_id, order_index);
CREATE INDEX exam_submissions_exam_idx ON public.exam_submissions(exam_id);
CREATE INDEX exam_submissions_student_idx ON public.exam_submissions(student_id);
CREATE INDEX exam_submissions_admission_idx ON public.exam_submissions(admission_id);
CREATE INDEX exam_answers_submission_idx ON public.exam_answers(submission_id);

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exams_quizzes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_submissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_answers TO authenticated;

GRANT ALL ON public.exams_quizzes TO service_role;
GRANT ALL ON public.exam_questions TO service_role;
GRANT ALL ON public.exam_submissions TO service_role;
GRANT ALL ON public.exam_answers TO service_role;

-- RLS
ALTER TABLE public.exams_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage exams" ON public.exams_quizzes FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "staff create and read exams" ON public.exams_quizzes FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'staff'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "students read published exams" ON public.exams_quizzes FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'student'::app_role) AND status IN ('published', 'closed', 'archived'));

CREATE POLICY "admins and staff manage exam questions" ON public.exam_questions FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'staff'::app_role))
  WITH CHECK (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "admins manage submissions" ON public.exam_submissions FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "staff read and update submissions" ON public.exam_submissions FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'staff'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "students manage own submissions" ON public.exam_submissions FOR ALL TO authenticated
  USING (student_id = auth.uid() OR private.owns_admission(admission_id))
  WITH CHECK (student_id = auth.uid() OR private.owns_admission(admission_id));

CREATE POLICY "admins manage answers" ON public.exam_answers FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "staff manage answers" ON public.exam_answers FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'staff'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "students manage answers via submission" ON public.exam_answers FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.exam_submissions s WHERE s.id = submission_id AND (s.student_id = auth.uid() OR private.owns_admission(s.admission_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.exam_submissions s WHERE s.id = submission_id AND (s.student_id = auth.uid() OR private.owns_admission(s.admission_id))
  ));

CREATE TRIGGER set_updated_at_exams_quizzes BEFORE UPDATE ON public.exams_quizzes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_exam_questions BEFORE UPDATE ON public.exam_questions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_exam_submissions BEFORE UPDATE ON public.exam_submissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_exam_answers BEFORE UPDATE ON public.exam_answers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
