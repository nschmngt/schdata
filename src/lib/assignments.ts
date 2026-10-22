/* ------------------------------------------------------------------ *
 * Pure business logic and calculation rules for assignments.
 * Handles late penalty calculations, grace periods, penalty caps,
 * submission mode/type formatting, and assignment status resolution.
 * Pure and browser-safe.
 * ------------------------------------------------------------------ */

export type SubmissionMode = "individual" | "group";
export type SubmissionType = "text" | "file_link" | "offline";
export type LatePenaltyType = "percentage_per_day" | "fixed_per_day" | "none";

export interface LatePenaltyInput {
  dueDate: Date | string;
  submittedAt: Date | string;
  allowLate: boolean;
  lateGraceHours?: number;
  latePenaltyType?: LatePenaltyType;
  latePenaltyValue?: number;
  maxLatePenaltyPercent?: number;
  maxScore: number;
  cutoffDate?: Date | string | null;
  rawScore?: number | null;
}

export interface LatePenaltyResult {
  isLate: boolean;
  totalLateHours: number;
  effectiveLateHours: number;
  daysLate: number;
  penaltyApplied: number;
  finalScore: number | null;
  isPastCutoff: boolean;
}

export function calculateLatePenalty(input: LatePenaltyInput): LatePenaltyResult {
  const due = new Date(input.dueDate).getTime();
  const submitted = new Date(input.submittedAt).getTime();
  const graceMs = (input.lateGraceHours ?? 0) * 3_600_000;
  const cutoff = input.cutoffDate ? new Date(input.cutoffDate).getTime() : null;

  const isPastCutoff =
    (cutoff !== null && submitted > cutoff) || (!input.allowLate && submitted > due);

  const diffMs = submitted - due;
  if (diffMs <= 0) {
    return {
      isLate: false,
      totalLateHours: 0,
      effectiveLateHours: 0,
      daysLate: 0,
      penaltyApplied: 0,
      finalScore: input.rawScore ?? null,
      isPastCutoff,
    };
  }

  const totalLateHours = Number((diffMs / 3_600_000).toFixed(2));
  const effectiveLateMs = Math.max(0, diffMs - graceMs);
  const effectiveLateHours = Number((effectiveLateMs / 3_600_000).toFixed(2));

  if (effectiveLateHours <= 0) {
    return {
      isLate: false,
      totalLateHours,
      effectiveLateHours: 0,
      daysLate: 0,
      penaltyApplied: 0,
      finalScore: input.rawScore ?? null,
      isPastCutoff,
    };
  }

  const daysLate = Math.ceil(effectiveLateHours / 24);
  const penaltyType = input.latePenaltyType ?? "percentage_per_day";
  const penaltyValue = input.latePenaltyValue ?? 0;
  const maxPenaltyPercent = input.maxLatePenaltyPercent ?? 100;
  const maxScore = input.maxScore;

  let rawPenalty = 0;
  if (penaltyType === "percentage_per_day") {
    rawPenalty = maxScore * (penaltyValue / 100) * daysLate;
  } else if (penaltyType === "fixed_per_day") {
    rawPenalty = penaltyValue * daysLate;
  }

  const maxPenalty = maxScore * (maxPenaltyPercent / 100);
  const penaltyApplied = Number(Math.min(rawPenalty, maxPenalty).toFixed(2));

  let finalScore: number | null = null;
  if (input.rawScore !== undefined && input.rawScore !== null) {
    finalScore = Number(Math.max(0, input.rawScore - penaltyApplied).toFixed(2));
  }

  return {
    isLate: true,
    totalLateHours,
    effectiveLateHours,
    daysLate,
    penaltyApplied,
    finalScore,
    isPastCutoff,
  };
}

export type AssignmentStatus = "graded" | "submitted" | "open" | "overdue" | "closed";

export function getAssignmentStatus(
  assignment: {
    due_date: Date | string;
    cutoff_date?: Date | string | null;
    allow_late: boolean;
  },
  now = new Date(),
  userSubmission?: { graded_at?: string | null; submitted_at?: string | null } | null,
): AssignmentStatus {
  if (userSubmission?.graded_at) return "graded";
  if (userSubmission?.submitted_at) return "submitted";

  const currentTime = now.getTime();
  const dueTime = new Date(assignment.due_date).getTime();
  const cutoffTime = assignment.cutoff_date ? new Date(assignment.cutoff_date).getTime() : null;

  if (cutoffTime !== null && currentTime > cutoffTime) return "closed";
  if (!assignment.allow_late && currentTime > dueTime) return "closed";
  if (currentTime > dueTime) return "overdue";

  return "open";
}

export function formatSubmissionMode(mode: SubmissionMode | string): string {
  return mode === "group" ? "Group Assignment" : "Individual Assignment";
}

export function formatSubmissionType(type: SubmissionType | string): string {
  switch (type) {
    case "file_link":
      return "File / URL Link";
    case "offline":
      return "Offline / Physical";
    case "text":
    default:
      return "Online Text Entry";
  }
}
