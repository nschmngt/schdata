import { z } from "zod";

export const PUBLICATION_STATUSES = ["draft", "published", "withheld"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const publicationStatusSchema = z.enum(PUBLICATION_STATUSES);

export const updatePublicationSchema = z.object({
  term: z.string().trim().min(1, "Term is required").max(60),
  className: z.string().trim().min(1, "Class name is required").max(100),
  status: publicationStatusSchema,
  withheldStudentIds: z.array(z.string().uuid()).default([]),
  notes: z.string().trim().max(500).default(""),
});

export type UpdatePublicationInput = z.infer<typeof updatePublicationSchema>;

export const broadsheetQuerySchema = z.object({
  term: z.string().trim().min(1, "Term is required"),
  className: z.string().trim().min(1, "Class name is required"),
});

export type BroadsheetQueryInput = z.infer<typeof broadsheetQuerySchema>;

export const studentTranscriptQuerySchema = z.object({
  admissionId: z.string().uuid("Invalid student admission ID"),
  term: z.string().trim().min(1, "Term is required"),
});

export type StudentTranscriptQueryInput = z.infer<typeof studentTranscriptQuerySchema>;
