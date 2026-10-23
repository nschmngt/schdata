import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPeriodOpen, loadRules } from "@/lib/academic-calendar.server";
import { activeAssessmentTypes, num } from "@/lib/academic-rules";
import { assertTeaches, loadTeachingScope } from "@/lib/teaching.server";
import { assessmentIdSchema, assessmentInputSchema } from "@/lib/assessment.schemas";
import { resolveTenantContext } from "@/lib/school.server";

export const getAssessmentStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const scope = await loadTeachingScope(context.supabase, context.userId);
    if (!scope.isAdmin && scope.classes.length === 0) return [];
    let q = context.supabase
      .from("admissions")
      .select("id, admission_number, student_name, class_admitted, parent_name, parent_phone")
      .eq("school_id", tenant.schoolId)
      .order("student_name");
    if (!scope.isAdmin) q = q.in("class_admitted", scope.classes);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listAssessments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const scope = await loadTeachingScope(context.supabase, context.userId);
    if (!scope.isAdmin && scope.pairs.length === 0) return [];
    let q = context.supabase
      .from("student_assessments")
      .select(
        "id, admission_id, class_name, term, subject, assessment_type, score, out_of, remark, created_at, admissions(student_name, admission_number)",
      )
      .eq("school_id", tenant.schoolId)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (!scope.isAdmin) q = q.in("class_name", scope.classes).in("subject", scope.subjects);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const allowed = (r: { class_name: string; subject: string }) =>
      scope.isAdmin || scope.pairs.some((p) => p.class_name === r.class_name && p.subject === r.subject);

    return (data ?? []).filter(allowed).map((row) => {
      const student = (row as { admissions?: { student_name?: string; admission_number?: string | null } | null })
        .admissions;
      return {
        id: row.id,
        admissionId: row.admission_id,
        studentName: student?.student_name ?? "Unknown student",
        admissionNumber: student?.admission_number ?? null,
        className: row.class_name,
        term: row.term,
        subject: row.subject,
        assessmentType: row.assessment_type,
        score: Number(row.score),
        outOf: Number(row.out_of),
        remark: row.remark,
        createdAt: row.created_at,
      };
    });
  });

export const saveAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => assessmentInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    await assertPeriodOpen(context.supabase, { period: data.term });
    const scope = await loadTeachingScope(context.supabase, context.userId);
    assertTeaches(scope, data.className, data.subject);
    const rules = await loadRules(context.supabase);
    const types = activeAssessmentTypes(rules);
    if (!types.some((t) => t.toLowerCase() === data.assessmentType.toLowerCase())) {
      throw new Error(`"${data.assessmentType}" is not an active assessment type in Academic Configuration.`);
    }
    const resolvedOutOf = data.outOf ?? num(rules, "assessment", "default-out-of") ?? 100;
    if (data.score > resolvedOutOf) {
      throw new Error(`Score (${data.score}) cannot exceed out of mark (${resolvedOutOf}).`);
    }

    if (data.id) {
      const { data: existing } = await context.supabase
        .from("student_assessments")
        .select("class_name, subject")
        .eq("id", data.id)
        .eq("school_id", tenant.schoolId)
        .maybeSingle();
      if (!existing) throw new Error("Assessment record not found or access denied.");
      assertTeaches(scope, existing.class_name, existing.subject);
    }
    const row = {
      admission_id: data.admissionId,
      class_name: data.className,
      term: data.term,
      subject: data.subject,
      assessment_type: data.assessmentType,
      score: data.score,
      out_of: resolvedOutOf,
      remark: data.remark,
      school_id: tenant.schoolId,
    };

    if (data.id) {
      const { error } = await context.supabase
        .from("student_assessments")
        .update(row)
        .eq("id", data.id)
        .eq("school_id", tenant.schoolId);
      if (error) throw new Error(error.message);
      return { id: data.id, updated: true };
    }

    const { data: inserted, error } = await context.supabase
      .from("student_assessments")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id, updated: false };
  });

export const deleteAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => assessmentIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const scope = await loadTeachingScope(context.supabase, context.userId);
    const { data: existing } = await context.supabase
      .from("student_assessments")
      .select("class_name, subject, term")
      .eq("id", data.id)
      .eq("school_id", tenant.schoolId)
      .maybeSingle();
    if (!existing) throw new Error("Record not found or access denied.");
    await assertPeriodOpen(context.supabase, { period: existing.term });
    assertTeaches(scope, existing.class_name, existing.subject);
    const { error } = await context.supabase
      .from("student_assessments")
      .delete()
      .eq("id", data.id)
      .eq("school_id", tenant.schoolId);
    if (error) throw new Error(error.message);
    return { deleted: true };
  });
