import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, logAudit } from "@/lib/admin.server";
import { assertPeriodOpen, loadCalendar, loadRules } from "@/lib/academic-calendar.server";
import { loadTeachingScope } from "@/lib/teaching.server";
import { parsePeopleRules, PEOPLE_FEATURE_KEY } from "@/lib/people-rules";
import { parseOpsRules, OPS_FEATURE_KEY } from "@/lib/operations-rules";
import { summariseAttendance } from "@/lib/student-summary";
import {
  recordStudentExeatSchema,
  studentIdSchema,
  studentQuerySchema,
  updateStudentClassSchema,
  updateStudentDetailSchema,
} from "@/lib/students.schemas";
import {
  evaluateStudentLifecycle,
  summariseStudentAcademics,
  summariseStudentFinance,
  summariseStudentOperations,
} from "@/lib/students";

/**
 * Overview query for the Students module.
 * Respects staff teaching scope (teachers see their assigned classes, admins see all).
 */
export const getStudentsOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => studentQuerySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await loadTeachingScope(supabase, userId);

    let query = supabase
      .from("admissions")
      .select("*")
      .order("student_name", { ascending: true });

    if (!scope.isAdmin && scope.role === "staff") {
      if (scope.classes.length === 0) {
        return {
          students: [],
          classes: [],
          stats: { totalStudents: 0, activeExeatCount: 0, averageAttendance: null, feeClearanceRate: 100 },
        };
      }
      query = query.in("class_admitted", scope.classes);
    }

    if (data.className) {
      query = query.eq("class_admitted", data.className);
    }
    if (data.gender) {
      query = query.eq("gender", data.gender);
    }
    if (data.status) {
      query = query.eq("status", data.status);
    }

    const [admissionsRes, teachersRes, feesRes, attendanceRes, exeatRes, tenantSettingsRes] =
      await Promise.all([
        query,
        supabase.from("class_teachers").select("*"),
        supabase.from("student_fees").select("admission_id, amount_due, amount_paid, due_date, status"),
        supabase.from("student_attendance").select("admission_id, status, attendance_date").limit(10000),
        supabase.from("student_exeat").select("admission_id, status, created_at").order("created_at", { ascending: false }),
        supabase.from("tenant_settings").select("features").maybeSingle(),
      ]);

    if (admissionsRes.error) throw new Error(admissionsRes.error.message);

    const rawStudents = admissionsRes.data ?? [];
    const teacherMap = new Map((teachersRes.data ?? []).map((t) => [t.class_name, t]));

    // Group fees by admission ID
    const feesMap = new Map<string, Array<Record<string, unknown>>>();
    for (const f of feesRes.data ?? []) {
      const list = feesMap.get(f.admission_id) ?? [];
      list.push(f);
      feesMap.set(f.admission_id, list);
    }

    // Group attendance by admission ID
    const attMap = new Map<string, Array<{ attendance_date: string; status: string }>>();
    for (const a of attendanceRes.data ?? []) {
      const list = attMap.get(a.admission_id) ?? [];
      list.push(a);
      attMap.set(a.admission_id, list);
    }

    // Exeat status per student
    const exeatMap = new Map<string, string>();
    for (const e of exeatRes.data ?? []) {
      if (!exeatMap.has(e.admission_id)) {
        exeatMap.set(e.admission_id, e.status);
      }
    }

    const calendar = await loadCalendar(supabase);

    const students = rawStudents
      .map((s) => {
        const studentFees = feesMap.get(s.id) ?? [];
        const finSummary = summariseStudentFinance(studentFees as any[]);
        const studentAtt = attMap.get(s.id) ?? [];
        const attSummary = summariseAttendance(studentAtt, calendar);
        const currentExeat = exeatMap.get(s.id) ?? "in_school";
        const teacher = teacherMap.get(s.class_admitted) ?? null;

        return {
          ...s,
          teacher,
          financials: finSummary,
          attendanceRate: attSummary.overall.rate,
          exeatStatus: currentExeat,
        };
      })
      .filter((s) => {
        if (!data.search) return true;
        const q = data.search.toLowerCase();
        return (
          s.student_name.toLowerCase().includes(q) ||
          (s.admission_number ?? "").toLowerCase().includes(q) ||
          s.parent_name.toLowerCase().includes(q) ||
          s.class_admitted.toLowerCase().includes(q)
        );
      })
      .filter((s) => {
        if (!data.feeStatus) return true;
        return s.financials.paymentStatus === data.feeStatus;
      });

    // Compute active class list
    const activeClasses = [...new Set(rawStudents.map((s) => s.class_admitted))].sort();

    // Summary statistics
    const totalStudents = students.length;
    const activeExeatCount = students.filter((s) => s.exeatStatus === "out").length;
    const attendanceRates = students
      .map((s) => s.attendanceRate)
      .filter((r): r is number => r !== null);
    const averageAttendance =
      attendanceRates.length > 0
        ? Math.round(attendanceRates.reduce((a, b) => a + b, 0) / attendanceRates.length)
        : null;
    const clearedFeesCount = students.filter(
      (s) => s.financials.paymentStatus === "paid" || s.financials.balance === 0,
    ).length;
    const feeClearanceRate = totalStudents > 0 ? Math.round((clearedFeesCount / totalStudents) * 100) : 100;

    return {
      students,
      classes: activeClasses,
      stats: {
        totalStudents,
        activeExeatCount,
        averageAttendance,
        feeClearanceRate,
      },
      userScope: {
        isAdmin: scope.isAdmin,
        role: scope.role,
        assignedClasses: scope.classes,
      },
    };
  });

/**
 * Auto-populates complete, detailed information for a selected student.
 */
export const getStudentFullDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => studentIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await loadTeachingScope(supabase, userId);

    const { data: admission, error: admError } = await supabase
      .from("admissions")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();

    if (admError || !admission) {
      throw new Error("Student record not found.");
    }

    if (!scope.isAdmin && scope.role === "staff") {
      if (!scope.classes.includes(admission.class_admitted)) {
        throw new Error("Access denied: Student is not in your assigned teaching scope.");
      }
    }

    const [
      studentProfileRes,
      parentProfileRes,
      teacherRes,
      assessmentsRes,
      performanceRes,
      attendanceRes,
      feesRes,
      exeatRes,
      libraryLoansRes,
      libraryReservationsRes,
      assignmentsRes,
      lessonsRes,
      examsRes,
      tenantSettingsRes,
    ] = await Promise.all([
      admission.student_profile_id
        ? supabase.from("profiles").select("*").eq("id", admission.student_profile_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      admission.parent_profile_id
        ? supabase.from("profiles").select("*").eq("id", admission.parent_profile_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.from("class_teachers").select("*").eq("class_name", admission.class_admitted).maybeSingle(),
      supabase.from("student_assessments").select("*").eq("admission_id", data.id).order("created_at", { ascending: false }),
      supabase.from("student_performance").select("*").eq("admission_id", data.id).order("recorded_at", { ascending: false }),
      supabase.from("student_attendance").select("*").eq("admission_id", data.id).order("attendance_date", { ascending: false }).limit(5000),
      supabase.from("student_fees").select("*").eq("admission_id", data.id).order("due_date", { ascending: false }),
      supabase.from("student_exeat").select("*").eq("admission_id", data.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("library_loans").select("*, library_books(title, accession_number, author)").eq("borrower_admission_id", data.id).order("issued_at", { ascending: false }),
      supabase.from("library_reservations").select("*, library_books(title, author)").eq("borrower_admission_id", data.id).order("reserved_at", { ascending: false }),
      supabase.from("assignment_submissions").select("id, assignment_id, final_score, submitted_at, graded_at").eq("admission_id", data.id),
      admission.student_profile_id
        ? supabase.from("lesson_completions").select("id, lesson_id, quiz_score, completed_at").eq("student_id", admission.student_profile_id)
        : Promise.resolve({ data: [] }),
      admission.student_profile_id
        ? supabase.from("exam_submissions").select("id, exam_id, total_score, submitted_at").eq("student_id", admission.student_profile_id)
        : Promise.resolve({ data: [] }),
      supabase.from("tenant_settings").select("features").maybeSingle(),
    ]);

    const features = tenantSettingsRes.data?.features as Record<string, unknown> | null;
    const peopleRules = parsePeopleRules(features?.[PEOPLE_FEATURE_KEY]);
    const opsRules = parseOpsRules(features?.[OPS_FEATURE_KEY]);
    const calendar = await loadCalendar(supabase);

    const assessmentsList = assessmentsRes.data ?? [];
    const performanceList = performanceRes.data ?? [];

    const unifiedScores = [
      ...assessmentsList.map((a) => ({
        term: a.term,
        subject: a.subject,
        type: a.assessment_type,
        score: Number(a.score),
        outOf: Number(a.out_of ?? 100),
        remark: a.remark ?? "",
        date: a.created_at,
      })),
      ...performanceList.map((p) => ({
        term: p.term,
        subject: p.subject,
        type: p.assessment_type,
        score: Number(p.score),
        outOf: 100,
        remark: p.remarks ?? "",
        date: p.recorded_at,
      })),
    ];

    const academicSummary = summariseStudentAcademics(
      unifiedScores,
      assignmentsRes.data ?? [],
      lessonsRes.data ?? [],
      examsRes.data ?? [],
    );

    const attendanceList = (attendanceRes.data ?? []) as Array<{ attendance_date: string; status: string; note: string }>;
    const attendanceSummary = summariseAttendance(attendanceList, calendar);

    const feesList = feesRes.data ?? [];
    const financialSummary = summariseStudentFinance(feesList as any[]);

    const exeatList = (exeatRes.data ?? []) as Array<Record<string, unknown>>;
    const libraryLoansList = (libraryLoansRes.data ?? []) as Array<Record<string, unknown>>;
    const libraryReservationsList = (libraryReservationsRes.data ?? []) as Array<Record<string, unknown>>;

    const operationsSummary = summariseStudentOperations(
      exeatList,
      opsRules,
      libraryLoansList as any,
      libraryReservationsList as any,
    );

    const lifecycle = evaluateStudentLifecycle(
      academicSummary.averageScore,
      financialSummary.balance,
      false,
      peopleRules,
    );

    return {
      admission,
      studentProfile: studentProfileRes.data ?? null,
      parentProfile: parentProfileRes.data ?? null,
      teacher: teacherRes.data ?? null,
      scores: unifiedScores,
      academicSummary,
      attendanceSummary,
      attendanceList: attendanceList.slice(0, 300),
      fees: feesList,
      financialSummary,
      exeatLogs: exeatList,
      libraryLoans: libraryLoansList,
      libraryReservations: libraryReservationsList,
      operationsSummary,
      lifecycle,
      assignments: assignmentsRes.data ?? [],
      lessons: lessonsRes.data ?? [],
      exams: examsRes.data ?? [],
    };
  });

/**
 * Updates a student's detail biodata and parent info.
 */
export const updateStudentDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateStudentDetailSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: current, error: curError } = await supabaseAdmin
      .from("admissions")
      .select("student_profile_id, parent_profile_id, admission_number")
      .eq("id", data.id)
      .single();

    if (curError || !current) {
      throw new Error("Student admission record not found.");
    }

    const { error: updateError } = await supabaseAdmin
      .from("admissions")
      .update({
        student_name: data.studentName,
        gender: data.gender,
        dob: data.dob || null,
        place_of_birth: data.placeOfBirth || null,
        class_admitted: data.classAdmitted,
        previous_school: data.previousSchool || null,
        previous_class: data.previousClass || null,
        last_attendance: data.lastAttendance || null,
        reason_for_leaving: data.reasonForLeaving || null,
        disability_status: data.disabilityStatus,
        disability_type: data.disabilityType || null,
        assistance_needed: data.assistanceNeeded || null,
        parent_name: data.parentName,
        relationship: data.relationship || null,
        parent_phone: data.parentPhone || null,
        alt_contact: data.altContact || null,
        parent_email: data.parentEmail.trim().toLowerCase(),
        emergency_name: data.emergencyName || null,
        emergency_phone: data.emergencyPhone || null,
        emergency_relationship: data.emergencyRelationship || null,
        emergency_residence: data.emergencyResidence || null,
        emergency_residence_district: data.emergencyResidenceDistrict || null,
        address: data.address || null,
        city: data.city || null,
        community: data.community || null,
        digital_address: data.digitalAddress || null,
        hometown: data.hometown || null,
        hometown_district: data.hometownDistrict || null,
        residence: data.residence || null,
        residence_district: data.residenceDistrict || null,
        status: data.status,
      })
      .eq("id", data.id);

    if (updateError) throw new Error(updateError.message);

    // Sync changes to student profile account
    if (current.student_profile_id) {
      await supabaseAdmin
        .from("profiles")
        .update({
          full_name: data.studentName,
          class_name: data.classAdmitted,
          gender: data.gender,
        })
        .eq("id", current.student_profile_id);
    }

    // Sync changes to parent profile account
    if (current.parent_profile_id) {
      await supabaseAdmin
        .from("profiles")
        .update({
          full_name: data.parentName,
          email: data.parentEmail.trim().toLowerCase(),
          phone: data.parentPhone,
        })
        .eq("id", current.parent_profile_id);
    }

    await logAudit(supabase, userId, {
      action: "student_profile_updated",
      description: `Updated student details for ${data.studentName} (${current.admission_number})`,
      targetEmail: data.parentEmail,
    });

    return { success: true };
  });

/**
 * Updates student class assignment.
 */
export const updateStudentClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateStudentClassSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: current } = await supabaseAdmin
      .from("admissions")
      .select("student_name, admission_number, student_profile_id, class_admitted")
      .eq("id", data.id)
      .single();

    if (!current) throw new Error("Student not found.");

    const { error } = await supabaseAdmin
      .from("admissions")
      .update({ class_admitted: data.className })
      .eq("id", data.id);

    if (error) throw new Error(error.message);

    if (current.student_profile_id) {
      await supabaseAdmin
        .from("profiles")
        .update({ class_name: data.className })
        .eq("id", current.student_profile_id);
    }

    await logAudit(supabase, userId, {
      action: "student_class_changed",
      description: `Changed class for ${current.student_name} (${current.admission_number}) from ${current.class_admitted} to ${data.className}`,
    });

    return { success: true };
  });

/**
 * Records an exeat for a student from the Students module.
 */
export const recordStudentExeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recordStudentExeatSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: actor } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();

    const { error } = await supabase.from("student_exeat").insert({
      admission_id: data.admissionId,
      status: data.status,
      reason: data.reason,
      destination: data.destination || null,
      signed_by_name: actor?.full_name ?? "",
      signed_by_id: userId,
      departed_at: data.status === "out" ? new Date().toISOString() : null,
      return_at: data.returnAt || null,
      returned_at: data.status === "in_school" ? new Date().toISOString() : null,
    });

    if (error) throw new Error(error.message);

    await logAudit(supabase, userId, {
      action: "student_exeat_recorded",
      description: `Recorded exeat status (${data.status}) for admission ${data.admissionId}`,
    });

    return { success: true };
  });
