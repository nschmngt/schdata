import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPeriodOpen, loadCalendar, loadRules } from "@/lib/academic-calendar.server";
import { assertTeaches, loadTeachingScope } from "@/lib/teaching.server";
import { logAudit } from "@/lib/admin.server";
import { resolveProvisionedSchool } from "@/lib/school.server";
import {
  slotIdSchema,
  timetableSlotInputSchema,
} from "@/lib/timetable.schemas";
import { checkSlotConflict } from "@/lib/timetable";
import { getSchoolClasses, getSubjectCatalog } from "@/lib/config.functions";

/** Helper to find admission record for current student user. */
async function findStudentAdmission(supabase: any, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) return null;

  const { data: admission } = await supabase
    .from("admissions")
    .select("id, class_admitted, student_name")
    .or(`id.eq.${userId},student_name.ilike.${profile.full_name}`)
    .maybeSingle();

  return admission;
}

/** Fetch timetable slots accessible to the current user. */
export const listTimetableSlots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    typeof d === "object" && d !== null
      ? (d as { className?: string; teacherId?: string; term?: string })
      : {},
  )
  .handler(async ({ data, context }) => {
    const scope = await loadTeachingScope(context.supabase, context.userId);

    let q = context.supabase
      .from("timetable_slots")
      .select("*, profiles!timetable_slots_teacher_id_fkey(id, full_name, role), exams_quizzes(id, title, pass_mark, total_marks, status)")
      .order("start_time", { ascending: true });

    if (data.term) {
      q = q.eq("term", data.term);
    }
    if (data.className) {
      q = q.eq("class_name", data.className);
    }
    if (data.teacherId) {
      q = q.eq("teacher_id", data.teacherId);
    }

    if (!scope.isAdmin) {
      if (scope.classes.length > 0) {
        // Staff member: see slots for their assigned classes or where they are assigned as teacher
        q = q.or(`class_name.in.(${scope.classes.map((c) => `"${c}"`).join(",")}),teacher_id.eq.${context.userId}`);
      } else {
        // Student/Parent: see slots for student's admitted class
        const admission = await findStudentAdmission(context.supabase, context.userId);
        if (admission?.class_admitted) {
          q = q.eq("class_name", admission.class_admitted);
        }
      }
    }

    const { data: slots, error } = await q;
    if (error) throw new Error(error.message);

    return (slots ?? []).map((s: any) => ({
      id: s.id,
      term: s.term,
      className: s.class_name,
      subject: s.subject,
      dayOfWeek: s.day_of_week,
      specificDate: s.specific_date,
      startTime: s.start_time,
      endTime: s.end_time,
      roomNumber: s.room_number,
      teacherId: s.teacher_id,
      teacherName: s.profiles?.full_name ?? "",
      eventType: s.event_type,
      quizId: s.quiz_id,
      quizTitle: s.exams_quizzes?.title ?? "",
      title: s.title,
      description: s.description,
      createdBy: s.created_by,
      createdAt: s.created_at,
    }));
  });

/** Load auto-population options for creating/editing timetable slots. */
export const getTimetableAutoPopulationData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await loadTeachingScope(context.supabase, context.userId);

    const [classes, subjectCatalog, rules, calendar, staffRes, assessmentRes] = await Promise.all([
      getSchoolClasses({ context }),
      getSubjectCatalog({ context }),
      loadRules(context.supabase),
      loadCalendar(context.supabase),
      context.supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["staff", "school_manager", "super_admin"])
        .order("full_name"),
      context.supabase
        .from("exams_quizzes")
        .select("id, title, class_name, subject, total_marks, pass_mark, status, exam_type")
        .order("created_at", { ascending: false }),
    ]);

    if (staffRes.error) throw new Error(staffRes.error.message);
    if (assessmentRes.error) throw new Error(assessmentRes.error.message);

    const assessments = assessmentRes.data ?? [];

    return {
      classes,
      subjectCatalog,
      teachers: staffRes.data ?? [],
      quizzes: assessments.filter((a: any) => a.exam_type === "quiz"),
      exams: assessments.filter((a: any) => a.exam_type === "exam"),
      assessments,
      rules,
      calendar,
      userScope: scope,
    };
  });

/** Save (create or update) a timetable slot with conflict checking & inline quiz support. */
export const saveTimetableSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => timetableSlotInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (data.term) {
      await assertPeriodOpen(context.supabase, { period: data.term });
    }

    const school = await resolveProvisionedSchool(context.supabase);
    const scope = await loadTeachingScope(context.supabase, context.userId);
    if (data.subject && data.className) {
      assertTeaches(scope, data.className, data.subject);
    }

    // Check scheduling conflicts
    let qExisting = context.supabase
      .from("timetable_slots")
      .select("id, class_name, subject, day_of_week, start_time, end_time, room_number, teacher_id, title")
      .eq("day_of_week", data.dayOfWeek);

    if (data.term) {
      qExisting = qExisting.eq("term", data.term);
    }

    const { data: existingRows } = await qExisting;
    const existingSlots = (existingRows ?? []).map((r: any) => ({
      id: r.id,
      className: r.class_name,
      subject: r.subject,
      dayOfWeek: r.day_of_week,
      startTime: r.start_time,
      endTime: r.end_time,
      roomNumber: r.room_number,
      teacherId: r.teacher_id,
      title: r.title,
    }));

    const conflict = checkSlotConflict(data, existingSlots as any);
    if (conflict.hasConflict) {
      throw new Error(conflict.conflictReason || "Scheduling conflict detected.");
    }

    let assignedQuizId = data.quizId ?? null;

    // Handle inline quiz creation if provided
    if (data.inlineQuiz) {
      const quizRow = {
        school_id: school?.id,
        title: data.inlineQuiz.title,
        description: data.inlineQuiz.description,
        exam_type: "quiz",
        class_name: data.className,
        subject: data.subject,
        term: data.term,
        duration_minutes: data.inlineQuiz.durationMinutes,
        total_marks: data.inlineQuiz.totalMarks,
        pass_mark: data.inlineQuiz.passMark,
        shuffle_questions: data.inlineQuiz.shuffleQuestions,
        show_results_immediately: data.inlineQuiz.showResultsImmediately,
        status: "published",
        created_by: context.userId,
      };

      const { data: insertedQuiz, error: qErr } = await context.supabase
        .from("exams_quizzes")
        .insert(quizRow)
        .select("id")
        .single();

      if (qErr) throw new Error(qErr.message);
      assignedQuizId = insertedQuiz.id;

      const questionRows = data.inlineQuiz.questions.map((q, idx) => ({
        exam_id: assignedQuizId,
        question_text: q.questionText,
        question_type: q.questionType,
        points: q.points,
        options: q.options,
        correct_answer: q.correctAnswer,
        explanation: q.explanation,
        order_index: idx,
      }));

      const { error: questErr } = await context.supabase.from("exam_questions").insert(questionRows);
      if (questErr) throw new Error(questErr.message);
    }

    const slotRow = {
      school_id: school?.id,
      term: data.term,
      class_name: data.className,
      subject: data.subject,
      day_of_week: data.dayOfWeek,
      specific_date: data.specificDate || null,
      start_time: data.startTime,
      end_time: data.endTime,
      room_number: data.roomNumber || "",
      teacher_id: data.teacherId || null,
      event_type: data.eventType,
      quiz_id: assignedQuizId,
      title: data.title || "",
      description: data.description || "",
      created_by: context.userId,
    };

    let slotId = data.id;

    if (slotId) {
      const { error } = await context.supabase
        .from("timetable_slots")
        .update(slotRow)
        .eq("id", slotId);
      if (error) throw new Error(error.message);
    } else {
      const { data: inserted, error } = await context.supabase
        .from("timetable_slots")
        .insert(slotRow)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      slotId = inserted.id;
    }

    await logAudit(context.supabase, context.userId, {
      action: slotId ? "timetable_slot_updated" : "timetable_slot_created",
      description: `${data.eventType} scheduled for ${data.className} (${data.subject}) on ${data.dayOfWeek} ${data.startTime}-${data.endTime}`,
      details: { slotId, className: data.className, subject: data.subject },
    });

    return { id: slotId, quizId: assignedQuizId, success: true };
  });

/** Delete a timetable slot. */
export const deleteTimetableSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => slotIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const scope = await loadTeachingScope(context.supabase, context.userId);

    const { data: existing, error: findErr } = await context.supabase
      .from("timetable_slots")
      .select("class_name, subject, term")
      .eq("id", data.id)
      .single();

    if (findErr || !existing) throw new Error("Timetable slot not found.");

    if (existing.term) {
      await assertPeriodOpen(context.supabase, { period: existing.term });
    }

    if (existing.class_name && existing.subject) {
      assertTeaches(scope, existing.class_name, existing.subject);
    }

    const { error } = await context.supabase.from("timetable_slots").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    await logAudit(context.supabase, context.userId, {
      action: "timetable_slot_deleted",
      description: `Deleted timetable slot for ${existing.class_name} (${existing.subject})`,
      details: { slotId: data.id },
    });

    return { success: true };
  });
