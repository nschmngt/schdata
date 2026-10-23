import { generateStrongPassword } from "./password-policy";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, logAudit } from "@/lib/admin.server";
import { resolveTenantContext } from "@/lib/school.server";
import {
  admissionIdSchema,
  classTeacherSchema,
  createAdmissionSchema,
  exeatSchema,
  studentLoginSchema,
  updateAdmissionSchema,
} from "@/lib/admissions.schemas";

const STUDENT_EMAIL_DOMAIN = "students.local";

function studentLoginEmail(admissionNumber: string) {
  return `${admissionNumber.toLowerCase().replace(/[^a-z0-9-]/g, "")}@${STUDENT_EMAIL_DOMAIN}`;
}

function tempPassword() {
  return generateStrongPassword(12);
}

type AdmissionInput = ReturnType<typeof createAdmissionSchema.parse>;

function toRow(d: AdmissionInput) {
  return {
    student_name: d.studentName,
    dob: d.dob || null,
    place_of_birth: d.placeOfBirth || null,
    class_admitted: d.classAdmitted,
    previous_school: d.previousSchool || null,
    previous_class: d.previousClass || null,
    last_attendance: d.lastAttendance || null,
    reason_for_leaving: d.reasonForLeaving || null,
    disability_status: d.disabilityStatus || "No",
    disability_type: d.disabilityType || null,
    assistance_needed: d.assistanceNeeded || null,
    gender: d.gender || "Other",
    parent_name: d.parentName,
    relationship: d.relationship || null,
    parent_phone: d.parentPhone || null,
    alt_contact: d.altContact || null,
    hometown: d.hometown || null,
    hometown_district: d.hometownDistrict || null,
    residence: d.residence || null,
    residence_district: d.residenceDistrict || null,
    parent_email: d.parentEmail.trim().toLowerCase(),
    emergency_name: d.emergencyName || null,
    emergency_phone: d.emergencyPhone || null,
    emergency_relationship: d.emergencyRelationship || null,
    emergency_residence: d.emergencyResidence || null,
    emergency_residence_district: d.emergencyResidenceDistrict || null,
    address: d.address || null,
    city: d.city || null,
    community: d.community || null,
    digital_address: d.digitalAddress || null,
  };
}

export const getAdmissionsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const [admissions, teachers, exeat] = await Promise.all([
      context.supabase.from("admissions").select("*").eq("school_id", tenant.schoolId).order("created_at", { ascending: false }),
      context.supabase.from("class_teachers").select("*").eq("school_id", tenant.schoolId).order("class_name"),
      context.supabase.from("student_exeat").select("*").eq("school_id", tenant.schoolId).order("created_at", { ascending: false }),
    ]);
    const first = admissions.error ?? teachers.error ?? exeat.error;
    if (first) throw new Error(first.message);
    return {
      admissions: admissions.data ?? [],
      classTeachers: teachers.data ?? [],
      exeat: exeat.data ?? [],
    };
  });

export const createAdmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createAdmissionSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const row = toRow(data);
    const parentEmail = row.parent_email;

    const { data: admission, error } = await supabaseAdmin
      .from("admissions")
      .insert({ ...row, created_by: context.userId, school_id: tenant.schoolId })
      .select("*")
      .single();
    if (error || !admission) throw new Error(error?.message ?? "Could not save the admission.");
    const admissionNumber = admission.admission_number as string;

    let parentPassword: string | null = null;
    const { data: existingParent } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", parentEmail)
      .maybeSingle();

    let parentId = existingParent?.id as string | undefined;
    if (!parentId) {
      parentPassword = tempPassword();
      const { data: created, error: parentError } = await supabaseAdmin.auth.admin.createUser({
        email: parentEmail,
        password: parentPassword,
        email_confirm: true,
        user_metadata: { full_name: row.parent_name },
      });
      if (parentError || !created.user) {
        await supabaseAdmin.from("admissions").delete().eq("id", admission.id);
        throw new Error(parentError?.message ?? "Could not create the parent login.");
      }
      parentId = created.user.id;
      await supabaseAdmin.from("profiles").insert({
        id: parentId,
        full_name: row.parent_name,
        email: parentEmail,
        role: "parent",
        access_level: "basic",
        status: "active",
        phone: row.parent_phone,
        force_password_change: true,
        school_id: tenant.schoolId,
      });
      await supabaseAdmin.from("user_roles").insert({ user_id: parentId, role: "parent" });
    }

    const loginEmail = studentLoginEmail(admissionNumber);
    const { data: student, error: studentError } = await supabaseAdmin.auth.admin.createUser({
      email: loginEmail,
      password: admissionNumber,
      email_confirm: true,
      user_metadata: { full_name: row.student_name, parent_email: parentEmail },
    });
    if (studentError || !student.user) {
      await supabaseAdmin.from("admissions").delete().eq("id", admission.id);
      throw new Error(studentError?.message ?? "Could not create the student login.");
    }
    await supabaseAdmin.from("profiles").insert({
      id: student.user.id,
      full_name: row.student_name,
      email: loginEmail,
      role: "student",
      access_level: "basic",
      status: "active",
      gender: row.gender,
      class_name: row.class_admitted,
      admission_number: admissionNumber,
      school_id: tenant.schoolId,
    });
    await supabaseAdmin.from("user_roles").insert({ user_id: student.user.id, role: "student" });

    await supabaseAdmin
      .from("admissions")
      .update({
        parent_profile_id: parentId,
        student_profile_id: student.user.id,
        student_login_email: loginEmail,
      })
      .eq("id", admission.id);

    await logAudit(context.supabase, context.userId, {
      action: "student_admitted",
      description: `Admitted ${row.student_name} (${admissionNumber}) into ${row.class_admitted}`,
      targetEmail: parentEmail,
      details: { admissionNumber, parentEmail },
      schoolId: tenant.schoolId,
    });

    return {
      id: admission.id as string,
      admissionNumber,
      parentEmail,
      parentPassword,
      studentPassword: admissionNumber,
    };
  });

export const updateAdmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateAdmissionSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = toRow(data);
    const { data: current } = await supabaseAdmin
      .from("admissions")
      .select("student_profile_id, admission_number")
      .eq("id", data.id)
      .eq("school_id", tenant.schoolId)
      .maybeSingle();

    if (!current) throw new Error("Admission record not found or access denied.");

    const { error } = await supabaseAdmin
      .from("admissions")
      .update({ ...row, status: data.status ?? "admitted" })
      .eq("id", data.id)
      .eq("school_id", tenant.schoolId);
    if (error) throw new Error(error.message);

    if (current?.student_profile_id) {
      await supabaseAdmin
        .from("profiles")
        .update({
          full_name: row.student_name,
          class_name: row.class_admitted,
          gender: row.gender,
        })
        .eq("id", current.student_profile_id);
    }

    await logAudit(context.supabase, context.userId, {
      action: "admission_updated",
      description: `Updated admission ${current?.admission_number ?? data.id}`,
      targetEmail: row.parent_email,
      schoolId: tenant.schoolId,
    });
    return { ok: true };
  });

export const deleteAdmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => admissionIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("admissions")
      .select("student_profile_id, parent_profile_id, admission_number, parent_email")
      .eq("id", data.id)
      .eq("school_id", tenant.schoolId)
      .maybeSingle();

    if (!row) throw new Error("Admission record not found or access denied.");

    await supabaseAdmin.from("admissions").delete().eq("id", data.id);
    if (row?.student_profile_id) {
      await supabaseAdmin.from("profiles").delete().eq("id", row.student_profile_id);
      await supabaseAdmin.auth.admin.deleteUser(row.student_profile_id);
    }
    if (row?.parent_profile_id) {
      const { count } = await supabaseAdmin
        .from("admissions")
        .select("id", { count: "exact", head: true })
        .eq("parent_profile_id", row.parent_profile_id);
      if ((count ?? 0) === 0) {
        await supabaseAdmin.from("profiles").delete().eq("id", row.parent_profile_id);
        await supabaseAdmin.auth.admin.deleteUser(row.parent_profile_id);
      }
    }

    await logAudit(context.supabase, context.userId, {
      action: "admission_deleted",
      description: `Deleted admission ${row?.admission_number ?? data.id}`,
      targetEmail: row?.parent_email ?? null,
      schoolId: tenant.schoolId,
    });
    return { ok: true };
  });

export const saveClassTeacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => classTeacherSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const { error } = await context.supabase.from("class_teachers").upsert(
      {
        class_name: data.className,
        teacher_name: data.teacherName,
        teacher_email: data.teacherEmail,
        teacher_phone: data.teacherPhone,
        school_id: tenant.schoolId,
      },
      { onConflict: "class_name" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recordExeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => exeatSchema.parse(d))
  .handler(async ({ data, context }) => {
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const { data: actor } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();

    const { error } = await context.supabase.from("student_exeat").insert({
      admission_id: data.admissionId,
      status: data.status,
      reason: data.reason,
      destination: data.destination,
      signed_by_name: actor?.full_name ?? "",
      signed_by_id: context.userId,
      departed_at: data.status === "out" ? new Date().toISOString() : null,
      return_at: data.returnAt || null,
      returned_at: data.status === "in_school" ? new Date().toISOString() : null,
      school_id: tenant.schoolId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resolveStudentLogin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => studentLoginSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("admissions")
      .select("student_login_email")
      .eq("parent_email", data.parentEmail.trim().toLowerCase())
      .eq("admission_number", data.admissionNumber.trim().toUpperCase())
      .maybeSingle();
    if (!row?.student_login_email) {
      throw new Error("No student matches that parent email and admission number.");
    }
    return { email: row.student_login_email as string };
  });

export const getMyChildren = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const { data: children, error } = await context.supabase
      .from("admissions")
      .select(
        "id, admission_number, student_name, class_admitted, gender, dob, status, parent_email",
      )
      .eq("school_id", tenant.schoolId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = children ?? [];

    const { data: teachers } = await context.supabase
      .from("class_teachers")
      .select("*")
      .eq("school_id", tenant.schoolId);
    const byClass = new Map((teachers ?? []).map((t) => [t.class_name, t]));

    return rows.map((c) => ({
      ...c,
      teacher: byClass.get(c.class_admitted) ?? null,
    }));
  });

export const getChildDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => admissionIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const { supabase } = context;
    const { data: admission, error } = await supabase
      .from("admissions")
      .select("*")
      .eq("id", data.id)
      .eq("school_id", tenant.schoolId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!admission) throw new Error("Record not found or access denied.");

    const [performance, attendance, fees, exeat, teacher, assessments] = await Promise.all([
      supabase
        .from("student_performance")
        .select("*")
        .eq("admission_id", data.id)
        .order("recorded_at", { ascending: false }),
      supabase
        .from("student_attendance")
        .select("*")
        .eq("admission_id", data.id)
        .order("attendance_date", { ascending: false })
        .limit(5000),
      supabase.from("student_fees").select("*").eq("admission_id", data.id).order("term"),
      supabase
        .from("student_exeat")
        .select("*")
        .eq("admission_id", data.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("class_teachers")
        .select("*")
        .eq("class_name", admission.class_admitted)
        .eq("school_id", tenant.schoolId)
        .maybeSingle(),
      supabase
        .from("student_assessments")
        .select("term, subject, assessment_type, score, out_of, remark, created_at")
        .eq("admission_id", data.id)
        .order("created_at", { ascending: false })
        .limit(5000),
    ]);

    const { loadCalendar, loadRules } = await import("@/lib/academic-calendar.server");
    const { summariseAttendance, summariseScores } = await import("@/lib/student-summary");
    const { gradeFromBands, percentOf } = await import("@/lib/academic-rules");
    const [cal, rules] = await Promise.all([loadCalendar(supabase), loadRules(supabase)]);

    const scoreRows = [
      ...(assessments.data ?? []).map((r) => ({
        term: r.term, subject: r.subject, type: r.assessment_type, score: Number(r.score), outOf: Number(r.out_of),
        remark: r.remark ?? "", date: r.created_at,
      })),
      ...(performance.data ?? []).map((r) => ({
        term: r.term, subject: r.subject, type: r.assessment_type, score: Number(r.score), outOf: 100,
        remark: r.remarks ?? "", date: r.recorded_at,
      })),
    ].map((r) => ({ ...r, grade: gradeFromBands(rules.gradeBands, percentOf(r.score, r.outOf)).grade }));
    const attendanceRows = (attendance.data ?? []) as { attendance_date: string; status: string; note: string }[];

    return {
      admission,
      teacher: teacher.data ?? null,
      performance: scoreRows,
      scores: summariseScores(scoreRows),
      attendanceSummary: summariseAttendance(attendanceRows, cal),
      attendance: attendanceRows.slice(0, 500),
      fees: fees.data ?? [],
      exeat: exeat.data ?? [],
    };
  });
