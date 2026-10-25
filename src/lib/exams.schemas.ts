import { z } from "zod";

export const examTypeSchema = z.enum(["exam", "quiz"]);
export const examStatusSchema = z.enum(["draft", "published", "closed", "archived"]);
export const questionTypeSchema = z.enum(["multiple_choice", "true_false", "short_answer", "essay"]);

export const questionInputSchema = z.object({
  id: z.string().uuid().optional(),
  questionText: z.string().trim().min(1, "Question text is required"),
  questionType: questionTypeSchema,
  points: z.number().min(0, "Points must be non-negative").default(1),
  options: z.array(z.string().trim()).default([]),
  correctAnswer: z.string().trim().default(""),
  explanation: z.string().trim().default(""),
  orderIndex: z.number().int().default(0),
});

export const examInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1, "Title is required").max(150),
    description: z.string().trim().default(""),
    examType: examTypeSchema,
    className: z.string().trim().min(1, "Class name is required"),
    subject: z.string().trim().min(1, "Subject is required"),
    term: z.string().trim().min(1, "Academic term/period is required"),
    durationMinutes: z.number().int().min(1, "Duration must be at least 1 minute").default(60),
    totalMarks: z.number().min(0).default(100),
    passMark: z.number().min(0).default(50),
    shuffleQuestions: z.boolean().default(false),
    showResultsImmediately: z.boolean().default(true),
    status: examStatusSchema.default("draft"),
    startTime: z.string().nullable().optional(),
    endTime: z.string().nullable().optional(),
    questions: z.array(questionInputSchema).default([]),
  })
  .refine((data) => data.passMark <= data.totalMarks, {
    message: "Pass mark cannot exceed total marks",
    path: ["passMark"],
  })
  .refine(
    (data) => {
      if (data.startTime && data.endTime) {
        const start = new Date(data.startTime).getTime();
        const end = new Date(data.endTime).getTime();
        if (!isNaN(start) && !isNaN(end)) {
          return start < end;
        }
      }
      return true;
    },
    {
      message: "End time must be after start time",
      path: ["endTime"],
    },
  );

export const examIdSchema = z.object({
  id: z.string().uuid(),
});

export const submitAnswerSchema = z.object({
  questionId: z.string().uuid(),
  answerText: z.string().trim().default(""),
});

export const submitExamSchema = z.object({
  examId: z.string().uuid(),
  submissionId: z.string().uuid(),
  answers: z.array(submitAnswerSchema),
});

export const gradeAnswerSchema = z.object({
  answerId: z.string().uuid(),
  pointsAwarded: z.number().min(0, "Points awarded cannot be negative"),
  isCorrect: z.boolean(),
  feedback: z.string().trim().default(""),
});

export const gradeSubmissionSchema = z.object({
  submissionId: z.string().uuid(),
  overallFeedback: z.string().trim().default(""),
  gradedAnswers: z.array(gradeAnswerSchema),
});

export const syncToAssessmentSchema = z.object({
  submissionId: z.string().uuid(),
});

export type QuestionInput = z.infer<typeof questionInputSchema>;
export type ExamInput = z.infer<typeof examInputSchema>;
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;
export type SubmitExamInput = z.infer<typeof submitExamSchema>;
export type GradeAnswerInput = z.infer<typeof gradeAnswerSchema>;
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;

// Pure Business Logic & Domain Helpers

/** Calculate percentage score for an exam/quiz attempt. */
export function calculateExamScorePercentage(score: number, totalMarks: number): number {
  if (!totalMarks || totalMarks <= 0) return 0;
  const pct = (score / totalMarks) * 100;
  return Math.min(100, Math.max(0, Math.round(pct * 100) / 100));
}

/** Evaluate if score meets or exceeds the pass mark threshold. */
export function isExamPassingScore(score: number, passMark: number): boolean {
  return score >= passMark;
}

/** Check if current time falls within scheduled exam window. */
export function isExamActiveWindow(
  startTime?: string | null,
  endTime?: string | null,
  now = new Date(),
): { isActive: boolean; reason?: "not_started" | "ended" } {
  const currentTime = now.getTime();

  if (startTime) {
    const startMs = new Date(startTime).getTime();
    if (!isNaN(startMs) && currentTime < startMs) {
      return { isActive: false, reason: "not_started" };
    }
  }

  if (endTime) {
    const endMs = new Date(endTime).getTime();
    if (!isNaN(endMs) && currentTime > endMs) {
      return { isActive: false, reason: "ended" };
    }
  }

  return { isActive: true };
}

/** Pure evaluation of student answer for auto-graded question types. */
export function evaluateAnswerCorrectness(
  questionType: string,
  correctAnswer: string,
  answerText: string,
): { isCorrect: boolean; isAutoGraded: boolean } {
  if (questionType === "multiple_choice" || questionType === "true_false") {
    const normalizedCorrect = (correctAnswer || "").trim().toLowerCase();
    const normalizedAnswer = (answerText || "").trim().toLowerCase();
    return {
      isCorrect: normalizedCorrect !== "" && normalizedCorrect === normalizedAnswer,
      isAutoGraded: true,
    };
  }
  return { isCorrect: false, isAutoGraded: false };
}
