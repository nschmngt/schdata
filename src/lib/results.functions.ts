import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RULES_FEATURE_KEY, parseRules } from "@/lib/academic-rules";
import { loadTeachingScope } from "@/lib/teaching.server";
import {
  broadsheetQuerySchema,
  studentTranscriptQuerySchema,
  updatePublicationSchema,
} from "./results.schemas";
import { calculateBroadsheetMatrix, isResultVisibleToLearner, StudentScoreRecord } from "./results";

/**
 * Retrieves the publication state and student withholding list for a class and term.
 */
export const getResultsPublicationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => broadsheetQuerySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: pub, error } = await supabase
      .from("result_publications")
      .select("status, withheld_student_ids, published_at, notes")
      .eq("term", data.term)
      .eq("class_name", data.className)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      throw new Error(error.message);
    }

    return {
      term: data.term,
      className: data.className,
      status: (pub?.status as "draft" | "published" | "withheld") ?? "published",
      withheldStudentIds: (pub?.withheld_student_ids as string[]) ?? [],
      publishedAt: pub?.published_at ?? null,
      notes: pub?.notes ?? "",
    };
  });

/**
 * Creates or updates publication status and withheld student list.
 * Restricted to super_admin, school_manager, or staff assigned to the class.
 */
export const updateResultPublication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updatePublicationSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await loadTeachingScope(supabase, userId);

    if (!scope.isAdmin) {
      if (!scope.classes.some((c) => c.toLowerCase() === data.className.toLowerCase())) {
        throw new Error("You do not have permission to manage results publication for this class.");
      }
    }

    const payload = {
      term: data.term,
      class_name: data.className,
      status: data.status,
      published_by: userId,
      published_at: new Date().toISOString(),
      withheld_student_ids: data.withheldStudentIds,
      notes: data.notes,
    };

    const { error } = await supabase
      .from("result_publications")
      .upsert(payload, { onConflict: "term,class_name" });

    if (error) throw new Error(error.message);

    return { success: true };
  });

/**
 * Retrieves student list, subjects, assessment scores, academic rules, and publication
 * settings, returning the full broadsheet matrix and class summary statistics.
 */
export const getBroadsheetData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => broadsheetQuerySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load caller role and teaching scope
    const scope = await loadTeachingScope(supabase, userId);

    if (!scope.isAdmin && scope.role !== "staff") {
      throw new Error("Access denied: Broadsheet data is restricted to staff and administrators.");
    }

    if (!scope.isAdmin && scope.role === "staff") {
      if (!scope.classes.some((c) => c.toLowerCase() === data.className.toLowerCase())) {
        throw new Error("Access denied: You are not assigned to teach this class.");
      }
    }

    // Fetch class students, active subjects for this class, and score records
    const [studentsRes, subjectsRes, scoresRes, pubRes, settingsRes] = await Promise.all([
      supabase
        .from("admissions")
        .select("id, student_name, admission_number, class_admitted")
        .eq("class_admitted", data.className)
        .order("student_name"),
      supabase
        .from("subjects")
        .select("name, class_name")
        .or(`class_name.eq.${data.className},class_name.eq.`),
      supabase
        .from("student_assessments")
        .select("admission_id, subject, assessment_type, score, out_of")
        .eq("class_name", data.className)
        .eq("term", data.term),
      supabase
        .from("result_publications")
        .select("status, withheld_student_ids")
        .eq("term", data.term)
        .eq("class_name", data.className)
        .maybeSingle(),
      supabase
        .from("tenant_settings")
        .select("features")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    if (studentsRes.error) throw new Error(studentsRes.error.message);
    if (subjectsRes.error) throw new Error(subjectsRes.error.message);
    if (scoresRes.error) throw new Error(scoresRes.error.message);

    const rules = parseRules((settingsRes.data?.features as Record<string, unknown> | null)?.[RULES_FEATURE_KEY]);

    // Extract subjects recorded in scores as well as subjects defined in subject master list
    const subjectsSet = new Set<string>();
    (subjectsRes.data ?? []).forEach((s) => subjectsSet.add(s.name));
    (scoresRes.data ?? []).forEach((s) => subjectsSet.add(s.subject));
    const subjectList = [...subjectsSet].sort();

    // Transform scores into StudentScoreRecord format
    const studentMap = new Map((studentsRes.data ?? []).map((s) => [s.id, s]));
    const scores: StudentScoreRecord[] = (scoresRes.data ?? [])
      .map((sc) => {
        const student = studentMap.get(sc.admission_id);
        if (!student) return null;
        return {
          admissionId: sc.admission_id,
          studentName: student.student_name,
          admissionNumber: student.admission_number,
          subject: sc.subject,
          assessmentType: sc.assessment_type,
          score: Number(sc.score),
          outOf: Number(sc.out_of || 100),
        };
      })
      .filter((s): s is StudentScoreRecord => s !== null);

    const publication = pubRes.data
      ? {
          status: pubRes.data.status as any,
          withheldStudentIds: (pubRes.data.withheld_student_ids as string[]) ?? [],
        }
      : null;

    const broadsheet = calculateBroadsheetMatrix(
      data.term,
      data.className,
      studentsRes.data ?? [],
      subjectList,
      scores,
      rules,
      publication,
    );

    // If caller is staff and not admin, restrict broadsheet rows if needed or pass through scope info
    return {
      broadsheet,
      teachingScope: {
        isAdmin: scope.isAdmin,
        userRole: scope.role,
      },
    };
  });

/**
 * Retrieves official transcript / result card for a single student in a given term,
 * checking publication rules for student and parent callers.
 */
export const getStudentTranscript = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => studentTranscriptQuerySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load profile to check role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    const userRole = profile?.role ?? "student";

    // Fetch target student admission record
    const { data: student, error: studentErr } = await supabase
      .from("admissions")
      .select("id, student_name, admission_number, class_admitted, profile_id")
      .eq("id", data.admissionId)
      .single();

    if (studentErr || !student) throw new Error(studentErr?.message || "Student record not found.");

    // Ownership check for non-staff/non-admin roles (students and parents)
    if (userRole !== "super_admin" && userRole !== "school_manager" && userRole !== "staff") {
      if (userRole === "student") {
        if (student.profile_id !== userId) {
          throw new Error("Forbidden: You can only view your own result transcript.");
        }
      } else if (userRole === "parent") {
        // Verify parent-child relationship via admissions / guardian check
        const { data: isParent } = await supabase
          .from("admissions")
          .select("id")
          .eq("id", data.admissionId)
          .or(`guardian_profile_id.eq.${userId},profile_id.eq.${userId}`)
          .maybeSingle();

        if (!isParent) {
          throw new Error("Forbidden: You can only view results for your children.");
        }
      } else {
        throw new Error("Forbidden");
      }
    }

    // Check publication state
    const { data: pub } = await supabase
      .from("result_publications")
      .select("status, withheld_student_ids")
      .eq("term", data.term)
      .eq("class_name", student.class_admitted)
      .maybeSingle();

    const publicationStatus = (pub?.status as any) ?? "published";
    const withheldStudentIds = (pub?.withheld_student_ids as string[]) ?? [];

    const isVisible = isResultVisibleToLearner(
      publicationStatus,
      withheldStudentIds,
      student.id,
      userRole,
    );

    if (!isVisible) {
      return {
        accessible: false,
        reason:
          publicationStatus !== "published"
            ? "Results for this term have not yet been published by the administration."
            : "Your result for this term is currently withheld. Please contact the administration.",
        student: {
          studentName: student.student_name,
          admissionNumber: student.admission_number,
          className: student.class_admitted,
        },
      };
    }

    // Fetch full broadsheet data for the student's class to derive transcript context
    const broadsheetResult = await getBroadsheetData({
      data: { term: data.term, className: student.class_admitted },
      context,
    });

    const studentRow = broadsheetResult.broadsheet.students.find(
      (s) => s.admissionId === student.id,
    );

    return {
      accessible: true,
      reason: null,
      term: data.term,
      className: student.class_admitted,
      student: {
        id: student.id,
        studentName: student.student_name,
        admissionNumber: student.admission_number,
        className: student.class_admitted,
      },
      result: studentRow ?? null,
      subjectStats: broadsheetResult.broadsheet.subjectStats,
      classAverage: broadsheetResult.broadsheet.classAverage,
      totalStudents: broadsheetResult.broadsheet.totalStudents,
      publicationStatus,
    };
  });
