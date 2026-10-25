import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPeriodOpen } from "@/lib/academic-calendar.server";
import { assertTeaches, loadTeachingScope } from "@/lib/teaching.server";
import {
  examIdSchema,
  examInputSchema,
  gradeSubmissionSchema,
  submitExamSchema,
  syncToAssessmentSchema,
  isExamActiveWindow,
  evaluateAnswerCorrectness,
} from "@/lib/exams.schemas";

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

/** List exams accessible to current user (admins see all, teachers see scope, students see class exams). */
export const listExams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await loadTeachingScope(context.supabase, context.userId);
    let q = context.supabase
      .from("exams_quizzes")
      .select("*, exam_questions(count), exam_submissions(id, student_id, status, total_score)")
      .order("created_at", { ascending: false });

    if (!scope.isAdmin) {
      if (scope.classes.length > 0) {
        q = q.in("class_name", scope.classes);
      } else {
        const admission = await findStudentAdmission(context.supabase, context.userId);
        if (admission?.class_admitted) {
          q = q.eq("class_name", admission.class_admitted).in("status", ["published", "closed", "archived"]);
        } else {
          // Fallback for students: allow viewing all published/closed exams
          q = q.in("status", ["published", "closed", "archived"]);
        }
      }
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Fetch full details of an exam, including questions and existing submission if any. */
export const getExamDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => examIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const scope = await loadTeachingScope(context.supabase, context.userId);

    const { data: exam, error } = await context.supabase
      .from("exams_quizzes")
      .select("*, exam_questions(*)")
      .eq("id", data.id)
      .single();

    if (error || !exam) throw new Error("Exam not found.");

    if (!scope.isAdmin) {
      if (scope.classes.length > 0) {
        assertTeaches(scope, exam.class_name, exam.subject);
      }
    }

    // Sort questions by orderIndex
    const rawQuestions = ((exam.exam_questions as any[]) || []).sort(
      (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
    );

    // Fetch existing submission
    const { data: submission } = await context.supabase
      .from("exam_submissions")
      .select("*, exam_answers(*)")
      .eq("exam_id", exam.id)
      .eq("student_id", context.userId)
      .maybeSingle();

    const isStudent = !scope.isAdmin && scope.classes.length === 0;

    // Map questions to camelCase for UI compatibility and sanitize for students
    const questions = rawQuestions.map((q) => {
      const questionObj = {
        id: q.id,
        questionText: q.question_text || "",
        questionType: q.question_type || "multiple_choice",
        points: Number(q.points ?? 1),
        options: Array.isArray(q.options) ? q.options : [],
        correctAnswer: q.correct_answer || "",
        explanation: q.explanation || "",
        orderIndex: q.order_index ?? 0,
      };

      if (isStudent && exam.status === "published" && submission?.status !== "graded") {
        questionObj.correctAnswer = "";
        questionObj.explanation = "";
      }
      return questionObj;
    });

    return {
      ...exam,
      questions,
      userSubmission: submission ?? null,
    };
  });

/** Create or update an exam and its questions. */
export const saveExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => examInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPeriodOpen(context.supabase, { period: data.term });
    const scope = await loadTeachingScope(context.supabase, context.userId);
    assertTeaches(scope, data.className, data.subject);

    const examRow = {
      title: data.title,
      description: data.description,
      exam_type: data.examType,
      class_name: data.className,
      subject: data.subject,
      term: data.term,
      duration_minutes: data.durationMinutes,
      total_marks: data.totalMarks,
      pass_mark: data.passMark,
      shuffle_questions: data.shuffleQuestions,
      show_results_immediately: data.showResultsImmediately,
      status: data.status,
      start_time: data.startTime ? new Date(data.startTime).toISOString() : null,
      end_time: data.endTime ? new Date(data.endTime).toISOString() : null,
      created_by: context.userId,
    };

    let examId = data.id;

    if (examId) {
      const { error } = await context.supabase
        .from("exams_quizzes")
        .update(examRow)
        .eq("id", examId);
      if (error) throw new Error(error.message);
    } else {
      const { data: inserted, error } = await context.supabase
        .from("exams_quizzes")
        .insert(examRow)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      examId = inserted.id;
    }

    // Save questions
    if (data.questions && data.questions.length > 0) {
      if (data.id) {
        await context.supabase.from("exam_questions").delete().eq("exam_id", examId);
      }

      const questionRows = data.questions.map((q, idx) => ({
        exam_id: examId,
        question_text: q.questionText,
        question_type: q.questionType,
        points: q.points,
        options: q.options,
        correct_answer: q.correctAnswer,
        explanation: q.explanation,
        order_index: idx,
      }));

      const { error: qErr } = await context.supabase.from("exam_questions").insert(questionRows);
      if (qErr) throw new Error(qErr.message);
    }

    return { id: examId, success: true };
  });

/** Delete an exam. */
export const deleteExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => examIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const scope = await loadTeachingScope(context.supabase, context.userId);
    const { data: existing } = await context.supabase
      .from("exams_quizzes")
      .select("class_name, subject, term")
      .eq("id", data.id)
      .maybeSingle();

    if (!existing) throw new Error("Exam not found.");
    await assertPeriodOpen(context.supabase, { period: existing.term });
    assertTeaches(scope, existing.class_name, existing.subject);

    const { error } = await context.supabase.from("exams_quizzes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

/** Start an exam attempt for a student. */
export const startExamAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => examIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: exam, error } = await context.supabase
      .from("exams_quizzes")
      .select("status, term, start_time, end_time")
      .eq("id", data.id)
      .single();

    if (error || !exam) throw new Error("Exam not found.");
    if (exam.status !== "published") throw new Error("This exam is not active.");

    await assertPeriodOpen(context.supabase, { period: exam.term });

    const timeWindow = isExamActiveWindow(exam.start_time, exam.end_time);
    if (!timeWindow.isActive) {
      if (timeWindow.reason === "not_started") {
        throw new Error("This exam has not opened yet.");
      }
      if (timeWindow.reason === "ended") {
        throw new Error("This exam window has closed.");
      }
    }

    // Check for existing attempt
    const { data: existing } = await context.supabase
      .from("exam_submissions")
      .select("id, status")
      .eq("exam_id", data.id)
      .eq("student_id", context.userId)
      .maybeSingle();

    if (existing) {
      return { submissionId: existing.id, status: existing.status };
    }

    const admission = await findStudentAdmission(context.supabase, context.userId);

    const { data: inserted, error: subErr } = await context.supabase
      .from("exam_submissions")
      .insert({
        exam_id: data.id,
        student_id: context.userId,
        admission_id: admission?.id ?? null,
        started_at: new Date().toISOString(),
        status: "in_progress",
      })
      .select("id")
      .single();

    if (subErr) throw new Error(subErr.message);
    return { submissionId: inserted.id, status: "in_progress" };
  });

/** Submit student answers for auto-grading (MCQ / True-False) and manual grading queue. */
export const submitExamAnswers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitExamSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: questions } = await context.supabase
      .from("exam_questions")
      .select("*")
      .eq("exam_id", data.examId);

    if (!questions) throw new Error("Questions not found.");

    let calculatedTotalScore = 0;
    let requiresManualGrading = false;

    const answerRows = data.answers
      .map((ans) => {
        const q = questions.find((item) => item.id === ans.questionId);
        if (!q) return null;

        const evalResult = evaluateAnswerCorrectness(
          q.question_type,
          q.correct_answer,
          ans.answerText,
        );

        let isCorrect: boolean | null = null;
        let pointsAwarded = 0;

        if (evalResult.isAutoGraded) {
          isCorrect = evalResult.isCorrect;
          pointsAwarded = isCorrect ? Number(q.points) : 0;
          calculatedTotalScore += pointsAwarded;
        } else {
          requiresManualGrading = true;
        }

        return {
          submission_id: data.submissionId,
          question_id: ans.questionId,
          answer_text: ans.answerText,
          is_correct: isCorrect,
          points_awarded: pointsAwarded,
        };
      })
      .filter(Boolean);

    await context.supabase.from("exam_answers").delete().eq("submission_id", data.submissionId);
    const { error: ansErr } = await context.supabase.from("exam_answers").insert(answerRows as any[]);
    if (ansErr) throw new Error(ansErr.message);

    const submissionStatus = requiresManualGrading ? "submitted" : "graded";

    const { error: subErr } = await context.supabase
      .from("exam_submissions")
      .update({
        submitted_at: new Date().toISOString(),
        status: submissionStatus,
        total_score: calculatedTotalScore,
      })
      .eq("id", data.submissionId);

    if (subErr) throw new Error(subErr.message);

    return { success: true, status: submissionStatus, score: calculatedTotalScore };
  });

/** Grade subjective answers and finalize total submission score. */
export const gradeSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => gradeSubmissionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const scope = await loadTeachingScope(context.supabase, context.userId);

    const { data: sub } = await context.supabase
      .from("exam_submissions")
      .select("*, exams_quizzes(class_name, subject)")
      .eq("id", data.submissionId)
      .single();

    if (!sub) throw new Error("Submission not found.");

    const examInfo = sub.exams_quizzes as any;
    assertTeaches(scope, examInfo.class_name, examInfo.subject);

    for (const g of data.gradedAnswers) {
      await context.supabase
        .from("exam_answers")
        .update({
          points_awarded: g.pointsAwarded,
          is_correct: g.isCorrect,
          feedback: g.feedback,
        })
        .eq("id", g.answerId);
    }

    const { data: allAnswers } = await context.supabase
      .from("exam_answers")
      .select("points_awarded")
      .eq("submission_id", data.submissionId);

    const totalScore = (allAnswers || []).reduce((acc, curr) => acc + Number(curr.points_awarded), 0);

    const { error } = await context.supabase
      .from("exam_submissions")
      .update({
        status: "graded",
        total_score: totalScore,
        feedback: data.overallFeedback,
      })
      .eq("id", data.submissionId);

    if (error) throw new Error(error.message);

    return { success: true, totalScore };
  });

/** Sync exam score directly into central student_assessments table. */
export const syncExamToAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => syncToAssessmentSchema.parse(d))
  .handler(async ({ data, context }) => {
    const scope = await loadTeachingScope(context.supabase, context.userId);

    const { data: sub } = await context.supabase
      .from("exam_submissions")
      .select("*, exams_quizzes(*)")
      .eq("id", data.submissionId)
      .single();

    if (!sub || !sub.admission_id) throw new Error("Valid student admission required for sync.");

    const exam = sub.exams_quizzes as any;
    assertTeaches(scope, exam.class_name, exam.subject);
    await assertPeriodOpen(context.supabase, { period: exam.term });

    const assessmentType = exam.exam_type === "quiz" ? "Quiz" : "Exam";

    const { error } = await context.supabase.from("student_assessments").insert({
      admission_id: sub.admission_id,
      class_name: exam.class_name,
      term: exam.term,
      subject: exam.subject,
      assessment_type: assessmentType,
      score: sub.total_score,
      out_of: exam.total_marks,
      remark: `${exam.title} (${assessmentType})`,
    });

    if (error) throw new Error(error.message);
    return { success: true };
  });

/** List all student submissions for an exam. */
export const listSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => examIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const scope = await loadTeachingScope(context.supabase, context.userId);

    const { data: exam } = await context.supabase
      .from("exams_quizzes")
      .select("class_name, subject")
      .eq("id", data.id)
      .single();

    if (!exam) throw new Error("Exam not found.");
    assertTeaches(scope, exam.class_name, exam.subject);

    const { data: submissions, error } = await context.supabase
      .from("exam_submissions")
      .select("*, admissions(student_name, admission_number), profiles(full_name), exam_answers(*, exam_questions(*))")
      .eq("exam_id", data.id)
      .order("submitted_at", { ascending: false });

    if (error) throw new Error(error.message);
    return submissions ?? [];
  });
