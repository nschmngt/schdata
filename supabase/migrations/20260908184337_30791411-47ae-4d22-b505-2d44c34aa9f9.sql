CREATE TYPE public.app_role AS ENUM ('super_admin','school_manager','staff','student','parent');
CREATE TYPE public.access_level AS ENUM ('super_administrator','administrator','standard','basic');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  role public.app_role NOT NULL DEFAULT 'student',
  access_level public.access_level NOT NULL DEFAULT 'basic',
  status text NOT NULL DEFAULT 'active',
  last_login timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending',
  handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_requests TO authenticated;
GRANT ALL ON public.password_reset_requests TO service_role;
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM public, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('super_admin','school_manager')) $$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM public, anon;
REVOKE ALL ON FUNCTION private.is_admin(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated, service_role;

CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated
USING ((id = auth.uid()) OR private.is_admin(auth.uid()));
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated
USING ((id = auth.uid()) OR private.is_admin(auth.uid()))
WITH CHECK ((id = auth.uid()) OR private.is_admin(auth.uid()));
CREATE POLICY "admins insert profiles" ON public.profiles FOR INSERT TO authenticated
WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "super admins delete profiles" ON public.profiles FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated
USING ((user_id = auth.uid()) OR private.is_admin(auth.uid()));
CREATE POLICY "admins read reset requests" ON public.password_reset_requests FOR SELECT TO authenticated
USING (private.is_admin(auth.uid()));
CREATE POLICY "admins update reset requests" ON public.password_reset_requests FOR UPDATE TO authenticated
USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "admins delete reset requests" ON public.password_reset_requests
  FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS class_name text,
  ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS force_password_change boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_reset_at timestamptz,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS position text,
  ADD COLUMN IF NOT EXISTS employee_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS salary numeric(12,2),
  ADD COLUMN IF NOT EXISTS start_date date;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON public.profiles (lower(username)) WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  description text NOT NULL DEFAULT '',
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  target_user_id uuid,
  target_email text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));
CREATE POLICY "admins insert audit logs" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "admins delete audit logs" ON public.audit_logs
  FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.security_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  allowed_ips text NOT NULL DEFAULT '',
  max_login_attempts integer NOT NULL DEFAULT 5,
  lockout_duration integer NOT NULL DEFAULT 30,
  session_timeout integer NOT NULL DEFAULT 30,
  max_concurrent_sessions integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_settings TO authenticated;
GRANT ALL ON public.security_settings TO service_role;
ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read security settings" ON public.security_settings
  FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));
CREATE POLICY "admins update security settings" ON public.security_settings
  FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY "admins insert security settings" ON public.security_settings
  FOR INSERT TO authenticated WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER security_settings_updated_at BEFORE UPDATE ON public.security_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.security_settings (singleton) VALUES (true) ON CONFLICT (singleton) DO NOTHING;

CREATE POLICY "super admin full access profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "super admin full access user_roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "super admin full access audit_logs" ON public.audit_logs
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "super admin full access reset requests" ON public.password_reset_requests
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "super admin full access security_settings" ON public.security_settings
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));

CREATE SEQUENCE IF NOT EXISTS public.employee_id_seq START 1;
CREATE OR REPLACE FUNCTION public.assign_employee_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.role IN ('staff','school_manager') AND (NEW.employee_id IS NULL OR NEW.employee_id = '') THEN
    NEW.employee_id := 'EMP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.employee_id_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS profiles_employee_id ON public.profiles;
CREATE TRIGGER profiles_employee_id
BEFORE INSERT OR UPDATE OF role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.assign_employee_id();

CREATE TABLE public.staff_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  review_period text NOT NULL,
  rating text NOT NULL,
  rating_score integer NOT NULL DEFAULT 3,
  comments text NOT NULL DEFAULT '',
  reviewer_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_performance TO authenticated;
GRANT ALL ON public.staff_performance TO service_role;
ALTER TABLE public.staff_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff performance readable by self or admins" ON public.staff_performance
  FOR SELECT TO authenticated USING (staff_id = auth.uid() OR private.is_admin(auth.uid()));
CREATE POLICY "admins manage staff performance" ON public.staff_performance
  FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER staff_performance_updated_at BEFORE UPDATE ON public.staff_performance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.staff_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  schedule_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  schedule_type text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_schedules TO authenticated;
GRANT ALL ON public.staff_schedules TO service_role;
ALTER TABLE public.staff_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedules readable by self or admins" ON public.staff_schedules
  FOR SELECT TO authenticated USING (staff_id = auth.uid() OR private.is_admin(auth.uid()));
CREATE POLICY "admins manage schedules" ON public.staff_schedules
  FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER staff_schedules_updated_at BEFORE UPDATE ON public.staff_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.offer_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_name text NOT NULL,
  candidate_email text NOT NULL,
  position text NOT NULL,
  salary numeric(12,2) NOT NULL DEFAULT 0,
  start_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offer_letters TO authenticated;
GRANT ALL ON public.offer_letters TO service_role;
ALTER TABLE public.offer_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read offer letters" ON public.offer_letters
  FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));
CREATE POLICY "admins manage offer letters" ON public.offer_letters
  FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER offer_letters_updated_at BEFORE UPDATE ON public.offer_letters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();