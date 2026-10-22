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

export const examInputSchema = z.object({
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
});

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
  pointsAwarded: z.number().min(0),
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
