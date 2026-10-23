import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenantContext } from "@/lib/school.server";

export const listTeachingAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("teaching_assignments")
      .select("id, teacher_id, class_name, subject")
      .eq("school_id", tenant.schoolId)
      .order("class_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getTeachingAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ teacherId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("teaching_assignments")
      .select("id, teacher_id, class_name, subject")
      .eq("teacher_id", data.teacherId)
      .eq("school_id", tenant.schoolId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getMyTeachingScope = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadTeachingScope } = await import("@/lib/teaching.server");
    return loadTeachingScope(context.supabase, context.userId);
  });
