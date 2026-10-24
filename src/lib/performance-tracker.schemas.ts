import { z } from "zod";

export const trackerFilterSchema = z.object({
  academicYear: z.string().trim().optional(),
  term: z.string().trim().optional(),
  educationLevel: z.string().trim().optional(),
  className: z.string().trim().optional(),
  subject: z.string().trim().optional(),
  gender: z.string().trim().optional(),
  assessmentType: z.string().trim().optional(),
});

export type TrackerFilter = z.infer<typeof trackerFilterSchema>;

export const PERFORMANCE_RISK_RULES_FEATURE_KEY = "__performance_risk_rules";

export const performanceRiskRulesSchema = z.object({
  academicMinScore: z.number().min(0).max(100).default(50),
  attendanceMinPercent: z.number().min(0).max(100).default(75),
  engagementMaxMissing: z.number().min(0).max(100).default(20),
  progressMaxDecline: z.number().min(0).max(100).default(10),
  smallGroupDisclosureLimit: z.number().min(1).max(20).default(3),
  version: z.number().int().min(0).default(1),
});

export type PerformanceRiskRules = z.infer<typeof performanceRiskRulesSchema>;

export const INTERVENTION_STRATEGIES = [
  "Targeted remedial lessons",
  "Small-group instruction",
  "Individual tutoring",
  "Additional practice assignments",
  "Revision exercises",
  "Attendance follow-up",
  "Parent or guardian engagement",
  "Peer-supported learning",
  "Referral to authorized student-support personnel",
] as const;

export type InterventionStrategy = (typeof INTERVENTION_STRATEGIES)[number];

export const INTERVENTION_STATUSES = [
  "risk_detected",
  "under_review",
  "active",
  "escalated",
  "closed",
] as const;

export type InterventionStatus = (typeof INTERVENTION_STATUSES)[number];

export const createInterventionSchema = z.object({
  admissionId: z.string().uuid("Invalid student ID"),
  term: z.string().trim().min(1, "Term is required"),
  academicYear: z.string().trim().min(1, "Academic year is required"),
  subject: z.string().trim().default(""),
  riskIndicators: z.array(z.string().trim()).default([]),
  baselinePerformance: z.number().min(0).max(100).optional().default(0),
  baselineAttendance: z.number().min(0).max(100).optional().default(0),
  identifiedNeed: z.string().trim().min(1, "Identified learning need is required"),
  strategy: z.string().trim().min(1, "Intervention strategy is required"),
  responsibleStaffId: z.string().uuid().optional().nullable(),
  responsibleStaffName: z.string().trim().default(""),
  startDate: z.string().trim().min(1, "Start date is required"),
  reviewDate: z.string().trim().min(1, "Review date is required"),
  targetOutcome: z.string().trim().min(1, "Target outcome is required"),
});

export type CreateInterventionInput = z.infer<typeof createInterventionSchema>;

export const updateInterventionSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(INTERVENTION_STATUSES),
  followUpResults: z.string().trim().optional().default(""),
  closureReason: z.string().trim().optional().default(""),
});

export type UpdateInterventionInput = z.infer<typeof updateInterventionSchema>;

export const addInterventionNoteSchema = z.object({
  id: z.string().uuid(),
  note: z.string().trim().min(1, "Note content cannot be empty"),
});

export type AddInterventionNoteInput = z.infer<typeof addInterventionNoteSchema>;

export const studentProfileQuerySchema = z.object({
  admissionId: z.string().uuid(),
  term: z.string().trim().optional(),
});

export type StudentProfileQuery = z.infer<typeof studentProfileQuerySchema>;
