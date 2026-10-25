import { z } from "zod";

export const ANNOUNCEMENT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type AnnouncementPriority = (typeof ANNOUNCEMENT_PRIORITIES)[number];

export const ANNOUNCEMENT_STATUSES = ["draft", "published", "archived"] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const announcementSchema = z.object({
  id: z.string().uuid().optional(),
  title: z
    .string()
    .trim()
    .min(2, "Title must be at least 2 characters")
    .max(200, "Title cannot exceed 200 characters"),
  summary: z.string().trim().max(500, "Summary cannot exceed 500 characters").default(""),
  content: z.string().trim().min(2, "Content cannot be empty"),
  audience: z.string().trim().min(1, "Audience is required").default("Everyone"),
  targetRole: z.string().trim().default(""),
  targetClassId: z.string().uuid().nullable().optional(),
  priority: z.enum(ANNOUNCEMENT_PRIORITIES).default("normal"),
  channels: z
    .array(z.string().trim().min(1))
    .min(1, "At least one communication channel is required")
    .default(["In-app"]),
  attachmentUrl: z.string().trim().default(""),
  attachmentName: z.string().trim().default(""),
  isPinned: z.boolean().default(false),
  publishAt: z.string().default(() => new Date().toISOString()),
  expireAt: z.string().nullable().optional(),
  status: z.enum(ANNOUNCEMENT_STATUSES).default("published"),
});

export type AnnouncementInput = z.infer<typeof announcementSchema>;

export const createConversationSchema = z.object({
  participantUserIds: z.array(z.string().uuid()).min(1, "At least one recipient is required"),
  title: z.string().trim().max(120).default(""),
  isGroup: z.boolean().default(false),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const sendDirectMessageSchema = z.object({
  conversationId: z.string().uuid("Invalid conversation ID"),
  content: z.string().trim().min(1, "Message content cannot be empty"),
  attachmentUrl: z.string().trim().default(""),
  attachmentName: z.string().trim().default(""),
});

export type SendDirectMessageInput = z.infer<typeof sendDirectMessageSchema>;

export const messagingFilterSchema = z.object({
  search: z.string().trim().optional(),
  audience: z.string().trim().optional(),
  priority: z.string().trim().optional(),
  status: z.string().trim().optional(),
  channel: z.string().trim().optional(),
});

export type MessagingFilterInput = z.infer<typeof messagingFilterSchema>;
