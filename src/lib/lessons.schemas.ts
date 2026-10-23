import { z } from "zod";
import { questionInputSchema } from "@/lib/exams.schemas";

export const lessonStatusSchema = z.enum(["draft", "published", "archived"]);

export const inlineQuizInputSchema = z.object({
  title: z.string().trim().min(1, "Quiz title is required"),
  description: z.string().trim().default(""),
  durationMinutes: z.number().int().min(1).default(15),
  totalMarks: z.number().min(0).default(100),
  passMark: z.number().min(0).default(50),
  shuffleQuestions: z.boolean().default(false),
  showResultsImmediately: z.boolean().default(true),
  questions: z.array(questionInputSchema).min(1, "Quiz must have at least one question"),
});

export const lessonInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Lesson title is required").max(200),
  description: z.string().trim().default(""),
  content: z.string().trim().default(""),
  className: z.string().trim().min(1, "Class name is required"),
  subject: z.string().trim().min(1, "Subject is required"),
  term: z.string().trim().min(1, "Academic term/period is required"),
  introVideoUrl: z.string().trim().default(""),
  quizId: z.string().uuid().nullable().optional(),
  inlineQuiz: inlineQuizInputSchema.optional(),
  status: lessonStatusSchema.default("draft"),
  orderIndex: z.number().int().default(0),
});

export const lessonIdSchema = z.object({
  id: z.string().uuid(),
});

export const completeLessonSchema = z.object({
  lessonId: z.string().uuid(),
  quizSubmissionId: z.string().uuid().optional(),
});

export type LessonStatus = z.infer<typeof lessonStatusSchema>;
export type InlineQuizInput = z.infer<typeof inlineQuizInputSchema>;
export type LessonInput = z.infer<typeof lessonInputSchema>;
export type CompleteLessonInput = z.infer<typeof completeLessonSchema>;
