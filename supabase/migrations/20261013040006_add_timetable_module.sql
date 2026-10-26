CREATE TABLE public.timetable_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  term text NOT NULL DEFAULT '',
  class_name text NOT NULL,
  subject text NOT NULL,
  day_of_week text NOT NULL CHECK (day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
  specific_date date,
  start_time text NOT NULL,
  end_time text NOT NULL,
  room_number text NOT NULL DEFAULT '',
  teacher_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL DEFAULT 'class' CHECK (event_type IN ('class', 'quiz', 'exam', 'upcoming_event')),
  quiz_id uuid REFERENCES public.exams_quizzes(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX timetable_slots_class_day_idx ON public.timetable_slots(class_name, day_of_week);
CREATE INDEX timetable_slots_teacher_day_idx ON public.timetable_slots(teacher_id, day_of_week);
CREATE INDEX timetable_slots_quiz_idx ON public.timetable_slots(quiz_id);
CREATE INDEX timetable_slots_term_idx ON public.timetable_slots(term);

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timetable_slots TO authenticated;
GRANT ALL ON public.timetable_slots TO service_role;

-- RLS
ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage timetable" ON public.timetable_slots FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY "staff manage timetable" ON public.timetable_slots FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'staff'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "authenticated view timetable" ON public.timetable_slots FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER set_updated_at_timetable_slots BEFORE UPDATE ON public.timetable_slots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
