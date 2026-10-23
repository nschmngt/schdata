import type { SupabaseClient } from "@supabase/supabase-js";

export interface TenantContext {
  schoolId: string;
  schoolName: string;
  currency: string;
  locale: string;
  userId: string;
  userRole: string;
  isSuperAdmin: boolean;
}

/**
 * Resolves the authenticated user's active tenant context.
 *
 * Mandatory Isolation Principles Enforced:
 * - Principle 2.2: Explicit Tenant Context derived from authenticated identity/roles.
 * - Principle 2.3: Deny by Default — missing/unassigned tenant context throws Error.
 * - Super Admin Multi-School Context Switching: Super Admins can explicitly target a verified schoolId.
 * - Non-Super-Admins: Strictly restricted to their assigned profile school_id.
 */
export async function resolveTenantContext(
  supabase: SupabaseClient | any,
  userId?: string | null,
  requestedSchoolId?: string | null,
): Promise<TenantContext> {
  let userRole = "guest";
  let userSchoolId: string | null = null;

  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, school_id")
      .eq("id", userId)
      .maybeSingle();

    if (profile) {
      userRole = profile.role ?? "guest";
      userSchoolId = profile.school_id ?? null;
    }
  }

  const isSuperAdmin = userRole === "super_admin";
  let targetSchoolId: string | null = null;

  if (isSuperAdmin) {
    if (requestedSchoolId) {
      const { data: requestedSchool } = await supabase
        .from("schools")
        .select("id")
        .eq("id", requestedSchoolId)
        .maybeSingle();

      if (requestedSchool) {
        targetSchoolId = requestedSchool.id;
      }
    }
    if (!targetSchoolId) {
      targetSchoolId = userSchoolId;
    }
    // Super Admin fallback to primary active school if unassigned
    if (!targetSchoolId) {
      const { data: primary } = await supabase
        .from("schools")
        .select("id")
        .order("active", { ascending: false })
        .order("created_at")
        .limit(1)
        .maybeSingle();
      targetSchoolId = primary?.id ?? null;
    }
  } else {
    // Non-super-admin: strictly restricted to assigned userSchoolId
    targetSchoolId = userSchoolId;
  }

  // Deny by default: If targetSchoolId is not established, throw Error
  if (!targetSchoolId) {
    throw new Error("Tenant Context Error: Unassigned or missing school context. Access denied by default.");
  }

  const { data: school } = await supabase
    .from("schools")
    .select("id, name, currency, locale")
    .eq("id", targetSchoolId)
    .maybeSingle();

  if (!school) {
    throw new Error("Tenant Context Error: No valid school found or unauthorized access.");
  }

  return {
    schoolId: school.id,
    schoolName: school.name,
    currency: school.currency ?? "USD",
    locale: school.locale ?? "en-US",
    userId: userId ?? "",
    userRole,
    isSuperAdmin,
  };
}

/**
 * Legacy wrapper for backward compatibility, delegates to resolveTenantContext.
 */
export async function resolveProvisionedSchool(
  supabase: SupabaseClient | any,
  userId?: string | null,
  requestedSchoolId?: string | null,
): Promise<{ id: string; name: string; currency: string; locale: string } | null> {
  try {
    const ctx = await resolveTenantContext(supabase, userId, requestedSchoolId);
    return {
      id: ctx.schoolId,
      name: ctx.schoolName,
      currency: ctx.currency,
      locale: ctx.locale,
    };
  } catch {
    return null;
  }
}
