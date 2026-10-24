import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if ((error || !data.user) && !import.meta.env.DEV) throw redirect({ to: "/" });
    return { user: data.user ?? { id: "00000000-0000-0000-0000-000000000000" } };
  },
  component: () => <Outlet />,
});
