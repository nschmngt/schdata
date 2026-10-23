import { z } from "zod";

export const DAYS_OF_WEEK = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export const EVENT_TYPES = ["class", "quiz", "exam", "upcoming_event"] as const;
export type TimetableEventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<TimetableEventType, string> = {
  class: "Regular Class",
  quiz: "Quiz",
  exam: "Examination",
  upcoming_event: "Upcoming Event",
};

export const slotIdSchema = z.object({
  id: z.string().uuid("Invalid timetable slot ID."),
});

export const questionTypeEnum = z.enum([
  "multiple_choice",
  "true_false",
  "short_answer",
  "essay",
]);

export const inlineQuizQuestionSchema = z.object({
  questionText: z.string().trim().min(1, "Question text is required."),
  questionType: questionTypeEnum.default("multiple_choice"),
  points: z.number().min(0.5, "Points must be at least 0.5").default(1),
  options: z.array(z.string()).default([]),
  correctAnswer: z.string().default(""),
  explanation: z.string().optional().default(""),
});

export const inlineQuizInputSchema = z.object({
  title: z.string().trim().min(1, "Quiz title is required.").max(120),
  description: z.string().optional().default(""),
  durationMinutes: z.number().int().min(1).max(300).default(30),
  totalMarks: z.number().min(1).max(500).default(100),
  passMark: z.number().min(0).max(500).default(50),
  shuffleQuestions: z.boolean().default(false),
  showResultsImmediately: z.boolean().default(true),
  questions: z.array(inlineQuizQuestionSchema).min(1, "At least one question is required."),
});

export const timetableSlotInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    term: z.string().default(""),
    className: z.string().trim().min(1, "Class is required."),
    subject: z.string().trim().min(1, "Subject is required."),
    dayOfWeek: z.enum(DAYS_OF_WEEK, {
      required_error: "Day of week is required.",
    }),
    specificDate: z.string().optional().nullable(),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Start time must be HH:MM format."),
    endTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "End time must be HH:MM format."),
    roomNumber: z.string().optional().default(""),
    teacherId: z.string().uuid().optional().nullable(),
    eventType: z.enum(EVENT_TYPES).default("class"),
    quizId: z.string().uuid().optional().nullable(),
    inlineQuiz: inlineQuizInputSchema.optional().nullable(),
    title: z.string().optional().default(""),
    description: z.string().optional().default(""),
  })
  .refine(
    (data) => {
      const [startH, startM] = data.startTime.split(":").map(Number);
      const [endH, endM] = data.endTime.split(":").map(Number);
      const startTotal = startH * 60 + startM;
      const endTotal = endH * 60 + endM;
      return endTotal > startTotal;
    },
    {
      message: "End time must be strictly after start time.",
      path: ["endTime"],
    },
  )
  .refine(
    (data) => {
      if (data.eventType === "quiz") {
        return !!data.quizId || !!data.inlineQuiz;
      }
      return true;
    },
    {
      message: "Quizzes must either reference an existing quiz or create one inline.",
      path: ["quizId"],
    },
  );

export type TimetableSlotInput = z.infer<typeof timetableSlotInputSchema>;
