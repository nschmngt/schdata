import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPeriodOpen } from "@/lib/academic-calendar.server";
import { assertTeaches, loadTeachingScope } from "@/lib/teaching.server";
import {
  completeLessonSchema,
  lessonIdSchema,
  lessonInputSchema,
} from "@/lib/lessons.schemas";
import { parseVideoUrl } from "@/lib/lessons";

/** Helper to find student admission record. */
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

/** List accessible lessons filtered by teaching scope for staff/admin or class enrollment for students. */
export const listLessons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await loadTeachingScope(context.supabase, context.userId);

    let q = context.supabase
      .from("lessons")
      .select("*, exams_quizzes(id, title, pass_mark, total_marks, status), lesson_completions(*)")
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: false });

    if (!scope.isAdmin) {
      if (scope.classes.length > 0) {
        q = q.in("class_name", scope.classes);
      } else {
        const admission = await findStudentAdmission(context.supabase, context.userId);
        if (admission?.class_admitted) {
          q = q.eq("class_name", admission.class_admitted).in("status", ["published", "archived"]);
        } else {
          q = q.in("status", ["published", "archived"]);
        }
      }
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    return (data ?? []).map((lesson: any) => {
      const completions = lesson.lesson_completions || [];
      const userCompletion = completions.find((c: any) => c.student_id === context.userId);
      return {
        ...lesson,
        videoMeta: parseVideoUrl(lesson.intro_video_url),
        isCompleted: !!userCompletion,
        userCompletion: userCompletion ?? null,
      };
    });
  });

/** List available quizzes for a subject & class to allow selecting an existing quiz for a lesson. */
export const listAvailableQuizzes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    typeof d === "object" && d !== null
      ? (d as { className?: string; subject?: string })
      : {},
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("exams_quizzes")
      .select("id, title, description, class_name, subject, total_marks, pass_mark, status")
      .eq("exam_type", "quiz")
      .order("created_at", { ascending: false });

    if (data.className) {
      q = q.eq("class_name", data.className);
    }
    if (data.subject) {
      q = q.eq("subject", data.subject);
    }

    const { data: quizzes, error } = await q;
    if (error) throw new Error(error.message);
    return quizzes ?? [];
  });

/** Fetch full details of a specific lesson, including attached quiz details. */
export const getLessonDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => lessonIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const scope = await loadTeachingScope(context.supabase, context.userId);

    const { data: lesson, error } = await context.supabase
      .from("lessons")
      .select("*, exams_quizzes(*, exam_questions(*))")
      .eq("id", data.id)
      .single();

    if (error || !lesson) throw new Error("Lesson not found.");

    if (!scope.isAdmin && scope.classes.length > 0) {
      assertTeaches(scope, lesson.class_name, lesson.subject);
    }

    // Fetch student completion status
    const { data: completion } = await context.supabase
      .from("lesson_completions")
      .select("*")
      .eq("lesson_id", lesson.id)
      .eq("student_id", context.userId)
      .maybeSingle();

    // Fetch student quiz submission if attached
    let quizSubmission = null;
    if (lesson.quiz_id) {
      const { data: sub } = await context.supabase
        .from("exam_submissions")
        .select("*, exam_answers(*)")
        .eq("exam_id", lesson.quiz_id)
        .eq("student_id", context.userId)
        .maybeSingle();
      quizSubmission = sub ?? null;
    }

    return {
      ...lesson,
      videoMeta: parseVideoUrl(lesson.intro_video_url),
      isCompleted: !!completion,
      userCompletion: completion ?? null,
      userQuizSubmission: quizSubmission,
    };
  });

/** Save (create or update) a lesson with support for inline quiz creation or existing quiz attachment. */
export const saveLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => lessonInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPeriodOpen(context.supabase, { period: data.term });
    const scope = await loadTeachingScope(context.supabase, context.userId);
    assertTeaches(scope, data.className, data.subject);

    let assignedQuizId = data.quizId ?? null;

    // Handle inline quiz creation if requested
    if (data.inlineQuiz) {
      const quizRow = {
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

      // Insert quiz questions
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

    const lessonRow = {
      title: data.title,
      description: data.description,
      content: data.content,
      class_name: data.className,
      subject: data.subject,
      term: data.term,
      intro_video_url: data.introVideoUrl,
      quiz_id: assignedQuizId,
      status: data.status,
      order_index: data.orderIndex,
      created_by: context.userId,
    };

    let lessonId = data.id;

    if (lessonId) {
      const { error } = await context.supabase
        .from("lessons")
        .update(lessonRow)
        .eq("id", lessonId);
      if (error) throw new Error(error.message);
    } else {
      const { data: inserted, error } = await context.supabase
        .from("lessons")
        .insert(lessonRow)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      lessonId = inserted.id;
    }

    return { id: lessonId, quizId: assignedQuizId, success: true };
  });

/** Delete a lesson. */
export const deleteLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => lessonIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const scope = await loadTeachingScope(context.supabase, context.userId);
    const { data: existing } = await context.supabase
      .from("lessons")
      .select("class_name, subject, term")
      .eq("id", data.id)
      .maybeSingle();

    if (!existing) throw new Error("Lesson not found.");
    await assertPeriodOpen(context.supabase, { period: existing.term });
    assertTeaches(scope, existing.class_name, existing.subject);

    const { error } = await context.supabase.from("lessons").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    return { success: true };
  });

/** Mark a lesson as completed for the authenticated student. */
export const completeLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => completeLessonSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: lesson, error } = await context.supabase
      .from("lessons")
      .select("*, exams_quizzes(pass_mark)")
      .eq("id", data.lessonId)
      .single();

    if (error || !lesson) throw new Error("Lesson not found.");

    // If lesson requires a completion quiz, check quiz submission & score
    if (lesson.quiz_id) {
      const { data: submission } = await context.supabase
        .from("exam_submissions")
        .select("id, status, total_score")
        .eq("exam_id", lesson.quiz_id)
        .eq("student_id", context.userId)
        .maybeSingle();

      if (!submission || submission.status !== "graded") {
        throw new Error("You must complete and pass the lesson quiz before marking this lesson as finished.");
      }

      const passMark = Number(lesson.exams_quizzes?.pass_mark ?? 50);
      if (Number(submission.total_score) < passMark) {
        throw new Error(`Your quiz score (${submission.total_score}) is below the pass mark (${passMark}). Please retake the quiz.`);
      }
    }

    const admission = await findStudentAdmission(context.supabase, context.userId);

    const { error: compErr } = await context.supabase
      .from("lesson_completions")
      .upsert({
        lesson_id: data.lessonId,
        student_id: context.userId,
        admission_id: admission?.id ?? null,
        quiz_submission_id: data.quizSubmissionId ?? null,
        completed_at: new Date().toISOString(),
      }, { onConflict: "lesson_id,student_id" });

    if (compErr) throw new Error(compErr.message);

    return { success: true };
  });
