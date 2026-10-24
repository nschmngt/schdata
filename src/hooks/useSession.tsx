import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AccessLevel, Role } from "@/lib/access";

export interface PortalProfile {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  access_level: AccessLevel;
  status: string;
  force_password_change: boolean;
  avatar_url?: string | null;
}

interface SessionState {
  session: Session | null;
  profile: PortalProfile | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionState>({
  session: null,
  profile: null,
  loading: true,
  refresh: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<PortalProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const DEV_PROFILE: PortalProfile = {
    id: "00000000-0000-0000-0000-000000000000",
    full_name: "School Administrator",
    email: "admin@school.edu",
    role: "super_admin",
    access_level: "super_administrator",
    status: "active",
    force_password_change: false,
  };

  const loadProfile = async (userId: string | undefined) => {
    if (!userId) {
      setProfile(import.meta.env.DEV ? DEV_PROFILE : null);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, access_level, status, force_password_change, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    setProfile((data as PortalProfile | null) ?? (import.meta.env.DEV ? DEV_PROFILE : null));
  };

  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      void loadProfile(next?.user.id);
    });

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refresh = async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await loadProfile(data.session?.user.id);
  };

  return (
    <SessionContext.Provider value={{ session, profile, loading, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
