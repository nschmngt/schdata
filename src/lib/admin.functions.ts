import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { assertPeriodOpen } from "@/lib/academic-calendar.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenantContext } from "@/lib/school.server";
import {
  adminResetSchema,
  bulkImportSchema,
  changeOwnPasswordSchema,
  createAccountSchema,
  DEFAULT_LEVEL,
  deleteAccountSchema,
  resetRequestIdSchema,
  resetRequestSchema,
  resolveResetRequestSchema,
  securitySettingsSchema,
  setupSchema,
  statusSchema,
  updateAccountSchema,
} from "@/lib/admin.schemas";
import {
  ACCOUNT_COLUMNS,
  assertAdmin,
  assertSuperAdmin,
  isAdmin,
  isSuperAdmin,
  logAudit,
} from "@/lib/admin.server";

export const getSetupStatus = createServerFn({ method: "GET" }).handler(async () => {
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"] && !process.env["SERVICE_ROLE_KEY"]) {
    console.error("[setup] SUPABASE_SERVICE_ROLE_KEY is not configured.");
    return { initialised: true, hasManager: true };
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin");
  const { count: managers } = await supabaseAdmin
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role", "school_manager");
  return { initialised: (count ?? 0) > 0, hasManager: (managers ?? 0) > 0 };
});

export const runInitialSetup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => setupSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin");
    if ((count ?? 0) > 0) throw new Error("Setup has already been completed for this system.");

    const { data: primarySchool } = await supabaseAdmin
      .from("schools")
      .select("id")
      .order("active", { ascending: false })
      .order("created_at")
      .limit(1)
      .maybeSingle();

    const created: string[] = [];
    const pairs = [
      ["super_admin", data.superAdmin],
      ["school_manager", data.schoolManager],
    ] as const;

    for (const [role, account] of pairs) {
      const { data: user, error } = await supabaseAdmin.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: { full_name: account.fullName },
      });
      if (error || !user.user) throw new Error(error?.message ?? "Could not create account");

      await supabaseAdmin.from("profiles").insert({
        id: user.user.id,
        full_name: account.fullName,
        email: account.email,
        role,
        access_level: DEFAULT_LEVEL[role] as "super_administrator",
        status: "active",
        school_id: primarySchool?.id ?? null,
      });
      await supabaseAdmin.from("user_roles").insert({ user_id: user.user.id, role });
      created.push(account.email);
    }
    return { created };
  });

const RESET_REQUEST_COOLDOWN_MS = 15 * 60 * 1000;

export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => resetRequestSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();
    const note = data.note?.trim() || null;

    const { data: account } = await supabaseAdmin
      .from("profiles")
      .select("id, school_id")
      .eq("email", email)
      .maybeSingle();
    if (!account) return { ok: true };

    const { data: existing } = await supabaseAdmin
      .from("password_reset_requests")
      .select("id, created_at")
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      const age = Date.now() - new Date(existing.created_at).getTime();
      if (age < RESET_REQUEST_COOLDOWN_MS) return { ok: true };
      await supabaseAdmin
        .from("password_reset_requests")
        .update({ note, created_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin.from("password_reset_requests").insert({ email, note });
      await supabaseAdmin.from("audit_logs").insert({
        action: "reset_requested",
        description: `Password reset requested for ${email}`,
        target_email: email,
        school_id: account.school_id,
      });
    }
    return { ok: true };
  });

type AdminClient = typeof import("@/integrations/supabase/client.server")["supabaseAdmin"];

async function syncTeachingAssignments(
  client: AdminClient,
  teacherId: string,
  position: string | null | undefined,
  classes: string[] | undefined,
  subjects: string[] | undefined,
  schoolId?: string | null,
) {
  const isTeacher = (position ?? "").trim().toLowerCase() === "teacher";
  let rows: { teacher_id: string; class_name: string; subject: string; school_id?: string | null }[] = [];
  if (isTeacher && (classes?.length ?? 0) > 0) {
    const { matchTeachingPairs, teachingLevelError } = await import("@/lib/teaching-levels");
    let clsQuery = client.from("school_classes").select("name, level_code").eq("active", true);
    let subsQuery = client.from("subjects").select("name, level_code").eq("active", true);
    if (schoolId) {
      clsQuery = clsQuery.eq("school_id", schoolId);
      subsQuery = subsQuery.eq("school_id", schoolId);
    }
    const [{ data: cls }, { data: subs }] = await Promise.all([clsQuery, subsQuery]);
    const result = matchTeachingPairs(
      classes ?? [],
      subjects ?? [],
      (cls ?? []).map((c) => ({ name: c.name, levelCode: c.level_code })),
      (subs ?? []).map((s) => ({ name: s.name, levelCode: s.level_code })),
    );
    const problem = teachingLevelError(result);
    if (problem) throw new Error(problem);
    rows = result.pairs.map((p) => ({ teacher_id: teacherId, ...p, school_id: schoolId }));
  }
  await client.from("teaching_assignments").delete().eq("teacher_id", teacherId);
  if (rows.length === 0) return;
  const { error } = await client.from("teaching_assignments").insert(rows as any);
  if (error) throw new Error(error.message);
}

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ schoolId: z.string().uuid().optional() }).optional().parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const tenant = await resolveTenantContext(context.supabase, context.userId, data?.schoolId);

    let query = context.supabase
      .from("profiles")
      .select(ACCOUNT_COLUMNS)
      .order("created_at", { ascending: false });

    if (tenant.schoolId) {
      query = query.eq("school_id", tenant.schoolId);
    }

    const { data: accounts, error } = await query;
    if (error) throw new Error(error.message);
    return accounts ?? [];
  });

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createAccountSchema.extend({ schoolId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const tenant = await resolveTenantContext(context.supabase, context.userId, data.schoolId);

    if (
      (data.role === "super_admin" || data.role === "school_manager") &&
      !(await isSuperAdmin(context.supabase, context.userId))
    ) {
      throw new Error("Only a Super Admin can create administrator accounts.");
    }

    if (data.startDate) await assertPeriodOpen(context.supabase, { date: data.startDate, allowUpcoming: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: user, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error || !user.user) throw new Error(error?.message ?? "Could not create account");

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: user.user.id,
      full_name: data.fullName,
      email: data.email,
      username: data.username || null,
      role: data.role,
      access_level: (data.accessLevel ?? DEFAULT_LEVEL[data.role]) as "basic",
      status: "active",
      gender: data.gender || null,
      department: data.department || null,
      class_name: data.className || null,
      two_factor_enabled: data.twoFactorEnabled ?? false,
      permissions: data.permissions ?? [],
      phone: data.phone || null,
      position: data.position || null,
      salary: data.salary ?? null,
      start_date: data.startDate || null,
      school_id: tenant.schoolId,
    });
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(user.user.id);
      throw new Error(profileError.message);
    }
    await supabaseAdmin.from("user_roles").insert({ user_id: user.user.id, role: data.role });
    await syncTeachingAssignments(
      supabaseAdmin,
      user.user.id,
      data.position,
      data.teachingClasses,
      data.teachingSubjects,
      tenant.schoolId,
    );

    await logAudit(context.supabase, context.userId, {
      action: "user_created",
      description: `Created account for ${data.email} (${data.role})`,
      targetUserId: user.user.id,
      targetEmail: data.email,
      schoolId: tenant.schoolId,
    });
    return { id: user.user.id };
  });

export const updateAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateAccountSchema.extend({ schoolId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const tenant = await resolveTenantContext(context.supabase, context.userId, data.schoolId);
    const superAdmin = await isSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.role === "super_admin" || data.role === "school_manager") {
      await assertSuperAdmin(context.supabase, context.userId);
    }

    if (!superAdmin) {
      const { data: targetProfile } = await supabaseAdmin.from("profiles").select("school_id").eq("id", data.userId).maybeSingle();
      if (!targetProfile || targetProfile.school_id !== tenant.schoolId) {
        throw new Error("Forbidden: Cannot update an account belonging to another school.");
      }
    }

    if (data.startDate) await assertPeriodOpen(context.supabase, { date: data.startDate, allowUpcoming: true });

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.fullName,
        email: data.email,
        username: data.username || null,
        role: data.role,
        access_level: data.accessLevel,
        status: data.status,
        gender: data.gender || null,
        department: data.department || null,
        class_name: data.className || null,
        two_factor_enabled: data.twoFactorEnabled ?? false,
        permissions: data.permissions ?? [],
        phone: data.phone || null,
        position: data.position || null,
        salary: data.salary ?? null,
        start_date: data.startDate || null,
      })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.auth.admin.updateUserById(data.userId, { email: data.email });
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
    await syncTeachingAssignments(
      supabaseAdmin,
      data.userId,
      data.position,
      data.teachingClasses,
      data.teachingSubjects,
      tenant.schoolId,
    );

    await logAudit(context.supabase, context.userId, {
      action: "user_updated",
      description: `Updated account ${data.email}`,
      targetUserId: data.userId,
      targetEmail: data.email,
      schoolId: tenant.schoolId,
    });
    return { ok: true };
  });

export const setAccountStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => statusSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const superAdmin = await isSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!superAdmin) {
      const { data: targetProfile } = await supabaseAdmin.from("profiles").select("school_id").eq("id", data.userId).maybeSingle();
      if (!targetProfile || targetProfile.school_id !== tenant.schoolId) {
        throw new Error("Forbidden: Cannot modify status for an account belonging to another school.");
      }
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ status: data.status })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    await logAudit(context.supabase, context.userId, {
      action: "status_changed",
      description: `Account status set to ${data.status}`,
      targetUserId: data.userId,
      schoolId: tenant.schoolId,
    });
    return { ok: true };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteAccountSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You cannot delete your own account.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("email, school_id")
      .eq("id", data.userId)
      .maybeSingle();

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);

    await logAudit(context.supabase, context.userId, {
      action: "user_deleted",
      description: `Deleted account ${target?.email ?? data.userId}`,
      targetEmail: target?.email ?? null,
      schoolId: target?.school_id,
    });
    return { ok: true };
  });

export const bulkImportAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bulkImportSchema.extend({ schoolId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const tenant = await resolveTenantContext(context.supabase, context.userId, data.schoolId);
    const superAdmin = await isSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let created = 0;
    const failed: string[] = [];
    for (const row of data.users) {
      if (!superAdmin && (row.role === "super_admin" || row.role === "school_manager")) {
        failed.push(`${row.email}: only a Super Admin can create administrator accounts`);
        continue;
      }
      const { data: user, error } = await supabaseAdmin.auth.admin.createUser({
        email: row.email,
        password: row.password,
        email_confirm: true,
        user_metadata: { full_name: row.fullName },
      });
      if (error || !user.user) {
        failed.push(`${row.email}: ${error?.message ?? "could not be created"}`);
        continue;
      }
      await supabaseAdmin.from("profiles").insert({
        id: user.user.id,
        full_name: row.fullName,
        email: row.email,
        username: row.username || null,
        role: row.role,
        access_level: DEFAULT_LEVEL[row.role] as "basic",
        status: "active",
        department: row.department || null,
        class_name: row.className || null,
        school_id: tenant.schoolId,
      });
      await supabaseAdmin.from("user_roles").insert({ user_id: user.user.id, role: row.role });
      created += 1;
    }

    await logAudit(context.supabase, context.userId, {
      action: "bulk_import",
      description: `Bulk import: ${created} created, ${failed.length} failed`,
      schoolId: tenant.schoolId,
    });
    return { created, failed };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => adminResetSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const superAdmin = await isSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!superAdmin) {
      const { data: targetProfile } = await supabaseAdmin.from("profiles").select("school_id").eq("id", data.userId).maybeSingle();
      if (!targetProfile || targetProfile.school_id !== tenant.schoolId) {
        throw new Error("Forbidden: Cannot reset password for an account belonging to another school.");
      }
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("profiles")
      .update({ force_password_change: true, password_reset_at: new Date().toISOString() })
      .eq("id", data.userId);

    const target = await supabaseAdmin
      .from("profiles")
      .select("email, school_id")
      .eq("id", data.userId)
      .maybeSingle();
    if (target.data?.email) {
      await supabaseAdmin
        .from("password_reset_requests")
        .update({
          status: "completed",
          handled_by: context.userId,
          handled_at: new Date().toISOString(),
        })
        .eq("status", "pending")
        .eq("email", target.data.email.toLowerCase());
    }

    await logAudit(context.supabase, context.userId, {
      action: "password_reset",
      description: `Password reset for ${target.data?.email ?? data.userId}`,
      targetUserId: data.userId,
      targetEmail: target.data?.email ?? null,
      schoolId: target.data?.school_id ?? tenant.schoolId,
    });
    return { ok: true };
  });

export const listResetRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ schoolId: z.string().uuid().optional() }).optional().parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const tenant = await resolveTenantContext(context.supabase, context.userId, data?.schoolId);
    const superAdmin = await isSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("password_reset_requests")
      .select("id, email, note, status, created_at, handled_at, handled_by")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!superAdmin && tenant.schoolId) {
      const { data: schoolProfiles } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("school_id", tenant.schoolId);
      const validEmails = (schoolProfiles ?? []).map((p) => p.email.toLowerCase());
      if (validEmails.length > 0) {
        query = query.in("email", validEmails);
      } else {
        return [];
      }
    }

    const { data: requests, error } = await query;
    if (error) throw new Error(error.message);
    return requests ?? [];
  });

export const resolveResetRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => resolveResetRequestSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const superAdmin = await isSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: request, error: readError } = await supabaseAdmin
      .from("password_reset_requests")
      .select("id, email, status")
      .eq("id", data.requestId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!request) throw new Error("That reset request no longer exists.");
    if (request.status !== "pending") throw new Error("This request has already been handled.");

    const now = new Date().toISOString();

    if (data.action === "reject") {
      const { error } = await supabaseAdmin
        .from("password_reset_requests")
        .update({ status: "rejected", handled_by: context.userId, handled_at: now })
        .eq("id", request.id);
      if (error) throw new Error(error.message);

      await logAudit(context.supabase, context.userId, {
        action: "reset_rejected",
        description: `Rejected password reset request for ${request.email}`,
        targetEmail: request.email,
        schoolId: tenant.schoolId,
      });
      return { ok: true, status: "rejected" as const };
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, email, school_id")
      .ilike("email", request.email)
      .maybeSingle();
    if (!profile) throw new Error("No account exists for that email address.");

    if (!superAdmin && (!profile || profile.school_id !== tenant.schoolId)) {
      throw new Error("Forbidden: Cannot resolve password reset request for an account belonging to another school.");
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
      password: data.password!,
    });
    if (authError) throw new Error(authError.message);

    await supabaseAdmin
      .from("profiles")
      .update({ force_password_change: true, password_reset_at: now })
      .eq("id", profile.id);

    const { error } = await supabaseAdmin
      .from("password_reset_requests")
      .update({ status: "completed", handled_by: context.userId, handled_at: now })
      .eq("id", request.id);
    if (error) throw new Error(error.message);

    await logAudit(context.supabase, context.userId, {
      action: "reset_approved",
      description: `Approved password reset for ${profile.email}`,
      targetUserId: profile.id,
      targetEmail: profile.email,
      schoolId: profile.school_id,
    });
    return { ok: true, status: "completed" as const };
  });

export const deleteResetRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => resetRequestIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("password_reset_requests")
      .delete()
      .eq("id", data.requestId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ schoolId: z.string().uuid().optional() }).optional().parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const tenant = await resolveTenantContext(context.supabase, context.userId, data?.schoolId);

    let query = context.supabase
      .from("audit_logs")
      .select("id, action, description, actor_id, actor_email, target_email, created_at, school_id")
      .order("created_at", { ascending: false })
      .limit(200);

    if (tenant.schoolId) {
      query = query.eq("school_id", tenant.schoolId);
    }

    const { data: logs, error } = await query;
    if (error) throw new Error(error.message);
    return logs ?? [];
  });

export const clearAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ schoolId: z.string().uuid().optional() }).optional().parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const tenant = await resolveTenantContext(context.supabase, context.userId, data?.schoolId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let deleteQuery = supabaseAdmin.from("audit_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (tenant.schoolId) {
      deleteQuery = deleteQuery.eq("school_id", tenant.schoolId);
    }
    const { error } = await deleteQuery;
    if (error) throw new Error(error.message);

    await logAudit(context.supabase, context.userId, {
      action: "audit_cleared",
      description: "Audit logs cleared",
      schoolId: tenant.schoolId,
    });
    return { ok: true };
  });

export const getSecuritySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("security_settings")
      .select(
        "id, allowed_ips, max_login_attempts, lockout_duration, session_timeout, max_concurrent_sessions, updated_at",
      )
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const saveSecuritySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => securitySettingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("security_settings")
      .update({
        allowed_ips: data.allowedIps,
        max_login_attempts: data.maxLoginAttempts,
        lockout_duration: data.lockoutDuration,
        session_timeout: data.sessionTimeout,
        max_concurrent_sessions: data.maxConcurrentSessions,
      })
      .eq("singleton", true);
    if (error) throw new Error(error.message);

    await logAudit(context.supabase, context.userId, {
      action: "security_settings_saved",
      description: "Security settings updated",
      details: { ...data },
    });
    return { ok: true };
  });

export const forcePasswordChangeAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error, count } = await supabaseAdmin
      .from("profiles")
      .update({ force_password_change: true }, { count: "exact" })
      .neq("id", context.userId);
    if (error) throw new Error(error.message);
    await logAudit(context.supabase, context.userId, {
      action: "force_password_change",
      description: `Forced password change for ${count ?? 0} accounts`,
    });
    return { affected: count ?? 0 };
  });

export const lockAllAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error, count } = await supabaseAdmin
      .from("profiles")
      .update({ status: "suspended" }, { count: "exact" })
      .neq("id", context.userId);
    if (error) throw new Error(error.message);
    await logAudit(context.supabase, context.userId, {
      action: "lock_all_accounts",
      description: `Suspended ${count ?? 0} accounts`,
    });
    return { affected: count ?? 0 };
  });

export const recordLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .update({ last_login: now })
      .eq("id", context.userId)
      .select("email, role, school_id")
      .maybeSingle();

    await supabaseAdmin.from("audit_logs").insert({
      action: "login",
      description: `${profile?.email ?? context.userId} signed in as ${profile?.role ?? "user"}`,
      actor_id: context.userId,
      actor_email: profile?.email ?? null,
      target_user_id: context.userId,
      target_email: profile?.email ?? null,
      school_id: profile?.school_id,
    });
    return { ok: true };
  });

export const changeOwnPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => changeOwnPasswordSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .update({ force_password_change: false, password_reset_at: new Date().toISOString() })
      .eq("id", context.userId)
      .select("email, school_id")
      .maybeSingle();

    await supabaseAdmin.from("audit_logs").insert({
      action: "password_changed",
      description: `${profile?.email ?? context.userId} changed their own password`,
      actor_id: context.userId,
      actor_email: profile?.email ?? null,
      target_user_id: context.userId,
      target_email: profile?.email ?? null,
      school_id: profile?.school_id,
    });
    return { ok: true };
  });

export const getPortalOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ schoolId: z.string().uuid().optional() }).optional().parse(d))
  .handler(async ({ data, context }) => {
    const tenant = await resolveTenantContext(context.supabase, context.userId, data?.schoolId);
    const admin = await isAdmin(context.supabase, context.userId);

    let query = context.supabase
      .from("audit_logs")
      .select("id, action, description, actor_email, created_at, school_id")
      .order("created_at", { ascending: false })
      .limit(8);

    if (!admin) query = query.eq("actor_id", context.userId);
    if (tenant.schoolId) query = query.eq("school_id", tenant.schoolId);

    const { data: activity } = await query;

    let pendingResets = 0;
    if (admin) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { count } = await supabaseAdmin
        .from("password_reset_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      pendingResets = count ?? 0;
    }

    const { data: settings } = await context.supabase.from("security_settings").select("session_timeout").maybeSingle();

    return {
      isAdmin: admin,
      activity: activity ?? [],
      pendingResets,
      sessionTimeout: settings?.session_timeout ?? 30,
      activeSchoolId: tenant.schoolId,
      activeSchoolName: tenant.schoolName,
      isSuperAdmin: tenant.isSuperAdmin,
    };
  });

export const getUserVerificationData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const [accounts, roles] = await Promise.all([
      context.supabase.from("profiles").select(ACCOUNT_COLUMNS).order("created_at", { ascending: false }),
      context.supabase.from("user_roles").select("user_id, role"),
    ]);
    if (accounts.error) throw new Error(accounts.error.message);
    return {
      accounts: accounts.data ?? [],
      roles: (roles.data ?? []) as { user_id: string; role: string }[],
      rolesReadable: !roles.error,
    };
  });

export const setMyAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      avatarUrl: z.string().max(600_000).regex(/^data:image\/(png|jpeg|webp|gif);base64,/, "Upload an image file.").nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").update({ avatar_url: data.avatarUrl }).eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
