/* ------------------------------------------------------------------ *
 * Pure business logic and calculation helpers for the Students module.
 * Integrates with People Configuration rules (people-rules.ts),
 * Operations rules (operations-rules.ts), Academic rules, and Finance.
 * ------------------------------------------------------------------ */

import { calculatePaymentStatus, PaymentStatus } from "@/lib/finance";
import { PeopleRules, peopleNum } from "@/lib/people-rules";
import { OpsRules, opsValue } from "@/lib/operations-rules";

export interface StudentLifecycleEvaluation {
  promotionEligible: boolean;
  promotionMinAverage: number;
  transferEligible: boolean;
  requireTransferLetter: boolean;
  withdrawalEligible: boolean;
  requireFeeClearance: boolean;
  warnings: string[];
}

/**
 * Evaluates student promotion, transfer, and withdrawal eligibility
 * against configured People Rules (studentLifecycle rules).
 */
export function evaluateStudentLifecycle(
  academicAverage: number | null,
  feeBalance: number,
  hasTransferLetter: boolean = false,
  rules: PeopleRules,
): StudentLifecycleEvaluation {
  const promotionMinAverage = peopleNum(rules, "studentLifecycle", "promotion-average") ?? 50;
  const requireTransferLetter = rules.studentLifecycle.find((r) => r.key === "transfer-letter")?.value !== false;
  const requireFeeClearance = rules.studentLifecycle.find((r) => r.key === "withdrawal-clearance")?.value !== false;

  const warnings: string[] = [];

  const promotionEligible = academicAverage !== null && academicAverage >= promotionMinAverage;
  if (academicAverage === null) {
    warnings.push("No academic performance records available for promotion evaluation.");
  } else if (!promotionEligible) {
    warnings.push(
      `Academic average (${academicAverage}%) is below the minimum required threshold (${promotionMinAverage}%) for promotion.`,
    );
  }

  const transferEligible = !requireTransferLetter || hasTransferLetter;
  if (requireTransferLetter && !hasTransferLetter) {
    warnings.push("Transfer clearance requires an official transfer letter.");
  }

  const withdrawalEligible = !requireFeeClearance || feeBalance <= 0;
  if (requireFeeClearance && feeBalance > 0) {
    warnings.push(`Withdrawal clearance requires outstanding fee balance to be cleared (Balance: ${feeBalance.toFixed(2)}).`);
  }

  return {
    promotionEligible,
    promotionMinAverage,
    transferEligible,
    requireTransferLetter,
    withdrawalEligible,
    requireFeeClearance,
    warnings,
  };
}

export interface StudentFinancialSummary {
  totalDue: number;
  totalPaid: number;
  balance: number;
  paymentStatus: PaymentStatus;
  feeCount: number;
}

/**
 * Summarises student fee obligations and computes centralized payment status.
 */
export function summariseStudentFinance(
  fees: Array<{ amount_due?: number | string | null; amount_paid?: number | string | null; due_date?: string | null }>,
): StudentFinancialSummary {
  let totalDue = 0;
  let totalPaid = 0;
  let oldestDueDate: string | null = null;

  for (const f of fees) {
    const due = Number(f.amount_due ?? 0);
    const paid = Number(f.amount_paid ?? 0);
    totalDue += due;
    totalPaid += paid;

    if (f.due_date && (!oldestDueDate || f.due_date < oldestDueDate)) {
      oldestDueDate = f.due_date;
    }
  }

  const balance = totalDue - totalPaid;
  const paymentStatus = calculatePaymentStatus(totalPaid, totalDue, oldestDueDate);

  return {
    totalDue,
    totalPaid,
    balance: Math.max(0, balance),
    paymentStatus,
    feeCount: fees.length,
  };
}

export interface StudentAcademicSummary {
  averageScore: number | null;
  totalAssessments: number;
  assignmentsSubmitted: number;
  lessonsCompleted: number;
  examsTaken: number;
}

/**
 * Summarises overall student academic engagement and performance metrics.
 */
export function summariseStudentAcademics(
  assessments: Array<{ score: number | string; out_of?: number | string | null }>,
  assignments: Array<{ id: string }>,
  lessons: Array<{ id: string }>,
  exams: Array<{ id: string }>,
): StudentAcademicSummary {
  let scoreSum = 0;
  let validScores = 0;

  for (const a of assessments) {
    const score = Number(a.score ?? 0);
    const outOf = Number(a.out_of ?? 100);
    if (outOf > 0) {
      scoreSum += (score / outOf) * 100;
      validScores++;
    }
  }

  const averageScore = validScores > 0 ? Math.round((scoreSum / validScores) * 10) / 10 : null;

  return {
    averageScore,
    totalAssessments: assessments.length,
    assignmentsSubmitted: assignments.length,
    lessonsCompleted: lessons.length,
    examsTaken: exams.length,
  };
}

export interface StudentOperationsSummary {
  currentExeatStatus: "in_school" | "out";
  totalExeats: number;
  lastExeat: Record<string, unknown> | null;
  libraryLoanDays: number;
  libraryMaxLoans: number;
  libraryFinePerDay: number;
  totalLibraryLoans: number;
  activeLibraryLoans: number;
  overdueLibraryLoans: number;
  activeLibraryReservations: number;
}

/**
 * Summarises student exeat status, library loans, reservations, and library policies from Operations Configuration.
 */
export function summariseStudentOperations(
  exeatLogs: Array<Record<string, unknown>>,
  opsRules: OpsRules,
  libraryLoans: Array<{ status?: string; fine_amount?: number | string | null }> = [],
  libraryReservations: Array<{ status?: string }> = [],
): StudentOperationsSummary {
  const lastExeat = exeatLogs[0] ?? null;
  const currentExeatStatus = lastExeat && lastExeat["status"] === "out" ? "out" : "in_school";

  const loanDays = Number(opsValue(opsRules, "library", "loan-days") ?? 14);
  const maxLoans = Number(opsValue(opsRules, "library", "max-loans") ?? 3);
  const finePerDay = Number(opsValue(opsRules, "library", "fine-per-day") ?? 1);

  let activeLibraryLoans = 0;
  let overdueLibraryLoans = 0;
  for (const loan of libraryLoans) {
    if (loan.status === "issued") {
      activeLibraryLoans++;
    } else if (loan.status === "overdue") {
      activeLibraryLoans++;
      overdueLibraryLoans++;
    }
  }

  const activeLibraryReservations = libraryReservations.filter((r) => r.status === "pending" || r.status === "approved").length;

  return {
    currentExeatStatus,
    totalExeats: exeatLogs.length,
    lastExeat,
    libraryLoanDays: loanDays,
    libraryMaxLoans: maxLoans,
    libraryFinePerDay: finePerDay,
    totalLibraryLoans: libraryLoans.length,
    activeLibraryLoans,
    overdueLibraryLoans,
    activeLibraryReservations,
  };
}
