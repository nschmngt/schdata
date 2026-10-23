import { z } from "zod";

export const NOTICE_LABELS = [
  "coming_soon",
  "urgent",
  "new",
  "deadline_approaching",
  "general",
] as const;
export type NoticeLabel = (typeof NOTICE_LABELS)[number];

export const PUBLICITY_STATUSES = ["draft", "published", "archived"] as const;
export type PublicityStatus = (typeof PUBLICITY_STATUSES)[number];

export const CIRCULAR_VISIBILITY = ["public", "unlisted", "restricted"] as const;
export type CircularVisibility = (typeof CIRCULAR_VISIBILITY)[number];

export const TRANSITION_EFFECTS = ["slide", "fade", "zoom"] as const;
export type TransitionEffect = (typeof TRANSITION_EFFECTS)[number];

export const TEXT_ALIGNMENTS = ["left", "center", "right"] as const;
export type TextAlignment = (typeof TEXT_ALIGNMENTS)[number];

export const TEXT_PLACEMENTS = ["top-left", "top-center", "top-right", "center", "bottom-left", "bottom-center", "bottom-right"] as const;
export type TextPlacement = (typeof TEXT_PLACEMENTS)[number];

export const FOCAL_POINTS = ["center", "top", "bottom", "left", "right"] as const;
export type FocalPoint = (typeof FOCAL_POINTS)[number];

// Individual Photo / Slide Schema
export const bannerSlideSchema = z.object({
  id: z.string().min(1),
  imageUrl: z.string().trim().min(1, "Image URL is required"),
  altText: z.string().trim().default(""),
  orderIndex: z.number().int().min(0).default(0),
  heading: z.string().trim().default(""),
  caption: z.string().trim().default(""),
  message: z.string().trim().default(""),
  buttonLabel: z.string().trim().default(""),
  buttonUrl: z.string().trim().default(""),
  textAlignment: z.enum(TEXT_ALIGNMENTS).default("center"),
  textPlacement: z.enum(TEXT_PLACEMENTS).default("center"),
  textColor: z.string().trim().default("#ffffff"),
  overlayColor: z.string().trim().default("#000000"),
  overlayOpacity: z.number().min(0).max(100).default(40),
  focalPoint: z.enum(FOCAL_POINTS).default("center"),
  cropMode: z.enum(["cover", "contain", "fill"]).default("cover"),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
});
export type BannerSlide = z.infer<typeof bannerSlideSchema>;

// Notice Schema
export const noticeSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(2, "Title is required").max(200),
  summary: z.string().trim().default(""),
  content: z.string().trim().default(""),
  label: z.enum(NOTICE_LABELS).default("new"),
  isFeatured: z.boolean().default(false),
  isPinned: z.boolean().default(false),
  imageUrl: z.string().trim().default(""),
  attachmentUrl: z.string().trim().default(""),
  attachmentName: z.string().trim().default(""),
  readMoreLink: z.string().trim().default(""),
  publishAt: z.string().default(() => new Date().toISOString()),
  expireAt: z.string().nullable().optional(),
  status: z.enum(PUBLICITY_STATUSES).default("published"),
});
export type NoticeInput = z.infer<typeof noticeSchema>;

// Circular Schema
export const circularSchema = z.object({
  id: z.string().optional(),
  referenceNumber: z.string().trim().min(1, "Reference number is required"),
  title: z.string().trim().min(2, "Title is required"),
  issuingDepartment: z.string().trim().default("Administration"),
  issueDate: z.string().min(1, "Issue date is required"),
  featuredImage: z.string().trim().default(""),
  summary: z.string().trim().default(""),
  content: z.string().trim().default(""),
  documentUrl: z.string().trim().default(""),
  documentName: z.string().trim().default(""),
  externalLink: z.string().trim().default(""),
  deepLink: z.string().trim().default(""),
  visibility: z.enum(CIRCULAR_VISIBILITY).default("public"),
  isFeatured: z.boolean().default(false),
  status: z.enum(PUBLICITY_STATUSES).default("published"),
});
export type CircularInput = z.infer<typeof circularSchema>;

// Banner Schema
export const bannerSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(2, "Title is required"),
  description: z.string().trim().default(""),
  placement: z.string().trim().default("landing_hero"),
  autoFlip: z.boolean().default(true),
  transitionEffect: z.enum(TRANSITION_EFFECTS).default("slide"),
  slideDuration: z.number().int().min(1000).max(30000).default(5000),
  showArrows: z.boolean().default(true),
  showIndicators: z.boolean().default(true),
  showPauseControls: z.boolean().default(true),
  slides: z.array(bannerSlideSchema).default([]),
  status: z.enum(PUBLICITY_STATUSES).default("published"),
});
export type BannerInput = z.infer<typeof bannerSchema>;

// Article Schema
export const articleSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(2, "Title is required"),
  slug: z.string().trim().default(""),
  headline: z.string().trim().default(""),
  shortSummary: z.string().trim().default(""),
  fullContent: z.string().trim().default(""),
  featuredImage: z.string().trim().default(""),
  galleryImages: z.array(z.string()).default([]),
  attachments: z.array(z.object({ name: z.string(), url: z.string() })).default([]),
  actionButtonLabel: z.string().trim().default(""),
  actionButtonUrl: z.string().trim().default(""),
  relevantDetailsLink: z.string().trim().default(""),
  authorName: z.string().trim().default(""),
  authorRole: z.string().trim().default(""),
  category: z.string().trim().default("General"),
  publicationDate: z.string().default(() => new Date().toISOString()),
  seoTitle: z.string().trim().default(""),
  seoKeywords: z.string().trim().default(""),
  isFeatured: z.boolean().default(false),
  isPinned: z.boolean().default(false),
  status: z.enum(PUBLICITY_STATUSES).default("published"),
});
export type ArticleInput = z.infer<typeof articleSchema>;

// Media Gallery Schema
export const mediaGallerySchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(2, "Title is required"),
  caption: z.string().trim().default(""),
  category: z.string().trim().default("Events"),
  mediaType: z.enum(["image", "video", "document"]).default("image"),
  mediaUrl: z.string().trim().min(1, "Media URL is required"),
  thumbnailUrl: z.string().trim().default(""),
  tags: z.array(z.string()).default([]),
  isFeatured: z.boolean().default(false),
  status: z.enum(PUBLICITY_STATUSES).default("published"),
});
export type MediaGalleryInput = z.infer<typeof mediaGallerySchema>;
