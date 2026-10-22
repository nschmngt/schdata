import { z } from "zod";

export const assignmentIdSchema = z.object({
  id: z.string().uuid(),
});

export const assignmentInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1, "Title is required").max(120),
    description: z.string().trim().default(""),
    className: z.string().trim().min(1, "Class is required"),
    subject: z.string().trim().min(1, "Subject is required"),
    educationLevel: z.string().trim().default(""),
    term: z.string().trim().min(1, "Term is required"),
    assessmentType: z.string().trim().min(1, "Assessment type is required"),
    maxScore: z.number().positive("Max score must be greater than 0").default(100),
    dueDate: z.string().min(1, "Due date is required"),
    submissionMode: z.enum(["individual", "group"]).default("individual"),
    submissionType: z.enum(["text", "file_link", "offline"]).default("text"),
    allowLate: z.boolean().default(true),
    lateGraceHours: z.number().min(0, "Grace hours cannot be negative").default(0),
    latePenaltyType: z.enum(["percentage_per_day", "fixed_per_day", "none"]).default("percentage_per_day"),
    latePenaltyValue: z.number().min(0, "Penalty value cannot be negative").default(0),
    maxLatePenaltyPercent: z.number().min(0).max(100, "Max penalty percent must be between 0 and 100").default(100),
    cutoffDate: z.string().optional().nullable(),
  })
  .refine(
    (data) => {
      if (!data.cutoffDate || !data.dueDate) return true;
      return new Date(data.cutoffDate).getTime() >= new Date(data.dueDate).getTime();
    },
    { message: "Cutoff date must be on or after the due date", path: ["cutoffDate"] },
  );

export type AssignmentInput = z.infer<typeof assignmentInputSchema>;

export const assignmentGroupInputSchema = z.object({
  assignmentId: z.string().uuid(),
  groupName: z.string().trim().min(1, "Group name is required").max(80),
  admissionIds: z.array(z.string().uuid()).min(1, "Select at least one student for the group"),
});

export type AssignmentGroupInput = z.infer<typeof assignmentGroupInputSchema>;

export const submissionInputSchema = z.object({
  assignmentId: z.string().uuid(),
  admissionId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  submissionText: z.string().trim().default(""),
  attachmentUrl: z.string().trim().default(""),
});

export type SubmissionInput = z.infer<typeof submissionInputSchema>;

export const gradingInputSchema = z.object({
  submissionId: z.string().uuid(),
  rawScore: z.number().min(0, "Score cannot be negative"),
  feedback: z.string().trim().default(""),
  syncToAssessment: z.boolean().default(false),
});

export type GradingInput = z.infer<typeof gradingInputSchema>;
