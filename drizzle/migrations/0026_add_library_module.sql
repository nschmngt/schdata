CREATE TABLE public.library_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  isbn text NOT NULL DEFAULT '',
  title text NOT NULL,
  author text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  publisher text NOT NULL DEFAULT '',
  publication_year integer,
  call_number text NOT NULL DEFAULT '',
  total_copies integer NOT NULL DEFAULT 1,
  available_copies integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'maintenance', 'archived')),
  shelf_location text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  cover_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.library_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.library_books(id) ON DELETE CASCADE,
  borrower_type text NOT NULL CHECK (borrower_type IN ('student', 'staff')),
  borrower_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  borrower_admission_id uuid REFERENCES public.admissions(id) ON DELETE SET NULL,
  borrower_name text NOT NULL,
  borrower_identifier text NOT NULL DEFAULT '',
  class_name text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  return_date date,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'returned', 'overdue', 'lost')),
  renewal_count integer NOT NULL DEFAULT 0,
  fine_amount numeric(10, 2) NOT NULL DEFAULT 0.00,
  fine_paid boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  issued_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.library_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.library_books(id) ON DELETE CASCADE,
  borrower_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  borrower_admission_id uuid REFERENCES public.admissions(id) ON DELETE CASCADE,
  borrower_name text NOT NULL,
  reservation_date timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'cancelled', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX library_books_title_author_idx ON public.library_books(title, author);
CREATE INDEX library_books_category_idx ON public.library_books(category);
CREATE INDEX library_books_isbn_idx ON public.library_books(isbn);

CREATE INDEX library_loans_book_id_idx ON public.library_loans(book_id);
CREATE INDEX library_loans_borrower_profile_idx ON public.library_loans(borrower_profile_id);
CREATE INDEX library_loans_borrower_admission_idx ON public.library_loans(borrower_admission_id);
CREATE INDEX library_loans_status_idx ON public.library_loans(status);

CREATE INDEX library_reservations_book_id_idx ON public.library_reservations(book_id);
CREATE INDEX library_reservations_status_idx ON public.library_reservations(status);

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_books TO authenticated;
GRANT ALL ON public.library_books TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_loans TO authenticated;
GRANT ALL ON public.library_loans TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_reservations TO authenticated;
GRANT ALL ON public.library_reservations TO service_role;

-- RLS
ALTER TABLE public.library_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_reservations ENABLE ROW LEVEL SECURITY;

-- Policies for library_books
CREATE POLICY "admins manage library_books" ON public.library_books FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY "staff manage library_books" ON public.library_books FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'staff'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "authenticated view library_books" ON public.library_books FOR SELECT TO authenticated
  USING (true);

-- Policies for library_loans
CREATE POLICY "admins manage library_loans" ON public.library_loans FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY "staff manage library_loans" ON public.library_loans FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'staff'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "users view own library_loans" ON public.library_loans FOR SELECT TO authenticated
  USING (
    private.is_admin(auth.uid()) OR
    private.has_role(auth.uid(), 'staff'::app_role) OR
    borrower_profile_id = auth.uid()
  );

-- Policies for library_reservations
CREATE POLICY "admins manage library_reservations" ON public.library_reservations FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY "staff manage library_reservations" ON public.library_reservations FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'staff'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "users manage own library_reservations" ON public.library_reservations FOR ALL TO authenticated
  USING (
    private.is_admin(auth.uid()) OR
    private.has_role(auth.uid(), 'staff'::app_role) OR
    borrower_profile_id = auth.uid()
  );

-- Triggers
CREATE TRIGGER set_updated_at_library_books BEFORE UPDATE ON public.library_books FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_library_loans BEFORE UPDATE ON public.library_loans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_library_reservations BEFORE UPDATE ON public.library_reservations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
