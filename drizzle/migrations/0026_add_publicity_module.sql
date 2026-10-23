-- Create Publicity Tables
CREATE TABLE public.publicity_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  label text NOT NULL DEFAULT 'new' CHECK (label IN ('coming_soon', 'urgent', 'new', 'deadline_approaching', 'general')),
  is_featured boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  image_url text NOT NULL DEFAULT '',
  attachment_url text NOT NULL DEFAULT '',
  attachment_name text NOT NULL DEFAULT '',
  read_more_link text NOT NULL DEFAULT '',
  publish_at timestamptz NOT NULL DEFAULT now(),
  expire_at timestamptz,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.publicity_circulars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  reference_number text NOT NULL DEFAULT '',
  title text NOT NULL,
  issuing_department text NOT NULL DEFAULT '',
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  featured_image text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  document_url text NOT NULL DEFAULT '',
  document_name text NOT NULL DEFAULT '',
  external_link text NOT NULL DEFAULT '',
  deep_link text NOT NULL DEFAULT '',
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'unlisted', 'restricted')),
  is_featured boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.publicity_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  placement text NOT NULL DEFAULT 'landing_hero',
  auto_flip boolean NOT NULL DEFAULT true,
  transition_effect text NOT NULL DEFAULT 'slide' CHECK (transition_effect IN ('slide', 'fade', 'zoom')),
  slide_duration integer NOT NULL DEFAULT 5000,
  show_arrows boolean NOT NULL DEFAULT true,
  show_indicators boolean NOT NULL DEFAULT true,
  show_pause_controls boolean NOT NULL DEFAULT true,
  slides jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.publicity_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL DEFAULT '',
  headline text NOT NULL DEFAULT '',
  short_summary text NOT NULL DEFAULT '',
  full_content text NOT NULL DEFAULT '',
  featured_image text NOT NULL DEFAULT '',
  gallery_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  action_button_label text NOT NULL DEFAULT '',
  action_button_url text NOT NULL DEFAULT '',
  relevant_details_link text NOT NULL DEFAULT '',
  author_name text NOT NULL DEFAULT '',
  author_role text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'General',
  publication_date timestamptz NOT NULL DEFAULT now(),
  seo_title text NOT NULL DEFAULT '',
  seo_keywords text NOT NULL DEFAULT '',
  is_featured boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  view_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.publicity_media_gallery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  caption text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'Events',
  media_type text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video', 'document')),
  media_url text NOT NULL,
  thumbnail_url text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  is_featured boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX publicity_notices_status_idx ON public.publicity_notices(status, publish_at);
CREATE INDEX publicity_circulars_status_idx ON public.publicity_circulars(status, visibility);
CREATE INDEX publicity_banners_placement_idx ON public.publicity_banners(placement, status);
CREATE INDEX publicity_articles_status_idx ON public.publicity_articles(status, publication_date DESC);
CREATE INDEX publicity_gallery_category_idx ON public.publicity_media_gallery(category, status);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publicity_notices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publicity_circulars TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publicity_banners TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publicity_articles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publicity_media_gallery TO authenticated;

GRANT ALL ON public.publicity_notices TO service_role;
GRANT ALL ON public.publicity_circulars TO service_role;
GRANT ALL ON public.publicity_banners TO service_role;
GRANT ALL ON public.publicity_articles TO service_role;
GRANT ALL ON public.publicity_media_gallery TO service_role;

-- RLS
ALTER TABLE public.publicity_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publicity_circulars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publicity_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publicity_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publicity_media_gallery ENABLE ROW LEVEL SECURITY;

-- Admins manage all
CREATE POLICY "admins manage publicity_notices" ON public.publicity_notices FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "admins manage publicity_circulars" ON public.publicity_circulars FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "admins manage publicity_banners" ON public.publicity_banners FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "admins manage publicity_articles" ON public.publicity_articles FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "admins manage publicity_media_gallery" ON public.publicity_media_gallery FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

-- Staff create/manage publicity content
CREATE POLICY "staff manage publicity_notices" ON public.publicity_notices FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'staff'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "staff manage publicity_circulars" ON public.publicity_circulars FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'staff'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "staff manage publicity_banners" ON public.publicity_banners FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'staff'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "staff manage publicity_articles" ON public.publicity_articles FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'staff'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "staff manage publicity_media_gallery" ON public.publicity_media_gallery FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'staff'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role));

-- Public / All read access for published publicity items
-- Public / All read access for published publicity items (both anonymous visitors and authenticated users)
CREATE POLICY "public read publicity_notices" ON public.publicity_notices FOR SELECT TO anon, authenticated
  USING (status = 'published');
CREATE POLICY "public read publicity_circulars" ON public.publicity_circulars FOR SELECT TO anon, authenticated
  USING (status = 'published');
CREATE POLICY "public read publicity_banners" ON public.publicity_banners FOR SELECT TO anon, authenticated
  USING (status = 'published');
CREATE POLICY "public read publicity_articles" ON public.publicity_articles FOR SELECT TO anon, authenticated
  USING (status = 'published');
CREATE POLICY "public read publicity_media_gallery" ON public.publicity_media_gallery FOR SELECT TO anon, authenticated
  USING (status = 'published');

-- Triggers for updated_at
CREATE TRIGGER set_updated_at_publicity_notices BEFORE UPDATE ON public.publicity_notices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_publicity_circulars BEFORE UPDATE ON public.publicity_circulars FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_publicity_banners BEFORE UPDATE ON public.publicity_banners FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_publicity_articles BEFORE UPDATE ON public.publicity_articles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_publicity_media_gallery BEFORE UPDATE ON public.publicity_media_gallery FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
