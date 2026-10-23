CREATE TABLE public.result_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL,
  class_name text NOT NULL,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'withheld')),
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  withheld_student_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT result_publications_term_class_key UNIQUE (term, class_name)
);

CREATE INDEX result_publications_term_class_idx ON public.result_publications(term, class_name);
CREATE INDEX result_publications_created_idx ON public.result_publications(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.result_publications TO authenticated;
GRANT ALL ON public.result_publications TO service_role;

ALTER TABLE public.result_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins and staff manage publications" ON public.result_publications FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'staff'::app_role))
  WITH CHECK (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "all authenticated users read publications" ON public.result_publications FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER set_updated_at_result_publications
  BEFORE UPDATE ON public.result_publications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
