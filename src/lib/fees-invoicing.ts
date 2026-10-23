/* ------------------------------------------------------------------ *
 * Fees & Invoicing Pure Domain Logic
 *
 * Centralized, browser-safe business rules for fee calculations,
 * fee structure resolution, billing run computations, balance summaries,
 * and cross-module governance integrations.
 * ------------------------------------------------------------------ */

import { calculatePaymentStatus, cedis, type FeeStatus } from "./finance";
import {
  parseCalendar,
  currentPeriod,
  resolveCoverage,
  coverageApplies,
  type AcademicCalendar,
} from "./academic-calendar";
import { amountForLevel, appliesToLevel } from "./education-levels";

export interface StudentFeeRecord {
  id: string;
  admission_id: string;
  term: string;
  amount_due: number | string;
  amount_paid: number | string;
  status: FeeStatus | string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  admissions?: {
    admission_number: string;
    student_name: string;
    class_admitted: string;
  } | null;
}

export interface FeeStructureItem {
  code: string;
  name: string;
  fee_category: string;
  amount: number;
  class_name?: string | null;
  scope?: string;
  period?: string;
  levels?: Record<string, number> | string;
}

export interface StudentBalanceSummary {
  totalBilled: number;
  totalPaid: number;
  totalOutstanding: number;
  totalOverdue: number;
  totalPending: number;
  totalPartiallyPaid: number;
  paidCount: number;
  partiallyPaidCount: number;
  pendingCount: number;
  overdueCount: number;
  collectionRate: number; // percentage 0-100
}

export interface StudentLedgerItem {
  id: string;
  admissionId: string;
  admissionNumber: string;
  studentName: string;
  className: string;
  term: string;
  amountDue: number;
  amountPaid: number;
  balance: number;
  status: FeeStatus;
  dueDate: string | null;
  createdAt: string;
}

/**
 * Calculates aggregated balance summary for a collection of fee records.
 */
export function calculateBalanceSummary(records: StudentFeeRecord[], todayStr = new Date().toISOString().slice(0, 10)): StudentBalanceSummary {
  let totalBilled = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;
  let totalOverdue = 0;
  let totalPending = 0;
  let totalPartiallyPaid = 0;

  let paidCount = 0;
  let partiallyPaidCount = 0;
  let pendingCount = 0;
  let overdueCount = 0;

  for (const r of records) {
    const due = Math.max(0, Number(r.amount_due) || 0);
    const paid = Math.max(0, Number(r.amount_paid) || 0);
    const balance = Math.max(0, due - paid);
    const status = calculatePaymentStatus(paid, due, r.due_date, todayStr);

    totalBilled += due;
    totalPaid += paid;
    totalOutstanding += balance;

    if (status === "paid") {
      paidCount++;
    } else if (status === "partially_paid") {
      partiallyPaidCount++;
      totalPartiallyPaid += balance;
    } else if (status === "overdue") {
      overdueCount++;
      totalOverdue += balance;
    } else {
      pendingCount++;
      totalPending += balance;
    }
  }

  const collectionRate = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 100;

  return {
    totalBilled,
    totalPaid,
    totalOutstanding,
    totalOverdue,
    totalPending,
    totalPartiallyPaid,
    paidCount,
    partiallyPaidCount,
    pendingCount,
    overdueCount,
    collectionRate,
  };
}

/**
 * Maps raw student fee rows to structured student ledger items with derived fields.
 */
export function mapStudentFeeLedger(records: StudentFeeRecord[], todayStr = new Date().toISOString().slice(0, 10)): StudentLedgerItem[] {
  return records.map((r) => {
    const due = Math.max(0, Number(r.amount_due) || 0);
    const paid = Math.max(0, Number(r.amount_paid) || 0);
    const balance = Math.max(0, due - paid);
    const status = calculatePaymentStatus(paid, due, r.due_date, todayStr);

    return {
      id: r.id,
      admissionId: r.admission_id,
      admissionNumber: r.admissions?.admission_number ?? "N/A",
      studentName: r.admissions?.student_name ?? "Unknown Student",
      className: r.admissions?.class_admitted ?? "Unassigned",
      term: r.term,
      amountDue: due,
      amountPaid: paid,
      balance,
      status,
      dueDate: r.due_date,
      createdAt: r.created_at,
    };
  });
}

/** Infer level code from class name if not directly provided. */
function inferLevelCode(className: string): string {
  const norm = className.trim().toLowerCase();
  if (norm.includes("primary") || norm.includes("basic")) return "PRIMARY";
  if (norm.includes("jhs") || norm.includes("junior")) return "JHS";
  if (norm.includes("shs") || norm.includes("senior")) return "SHS";
  if (norm.includes("kg") || norm.includes("nursery") || norm.includes("kindergarten")) return "KG";
  return "PRIMARY";
}

/** Format level scope parameter to canonical string if given as Record object. */
function normalizeLevelScope(levels: Record<string, number> | string | undefined | null): string {
  if (!levels) return "";
  if (typeof levels === "string") return levels;
  if (typeof levels === "object") {
    return Object.entries(levels)
      .map(([k, v]) => (v === null || v === undefined ? k.toUpperCase() : `${k.toUpperCase()}:${v}`))
      .join(",");
  }
  return String(levels);
}

/**
 * Resolves applicable fee items for a given student class and education level,
 * applying level-specific amount overrides and coverage filters using centralized education-levels logic.
 */
export function resolveApplicableFees(
  structures: FeeStructureItem[],
  targetClass: string,
  targetLevelCode?: string | null,
  periodName?: string,
): { items: FeeStructureItem[]; totalDue: number } {
  const normClass = targetClass.trim().toLowerCase();
  const effectiveLevel = targetLevelCode || inferLevelCode(targetClass);

  const applicable: FeeStructureItem[] = [];
  let totalDue = 0;

  for (const st of structures) {
    // Check class filter: matches if empty or matches target class
    if (st.class_name && st.class_name.trim().length > 0 && st.class_name.trim().toLowerCase() !== normClass) {
      continue;
    }

    // Check coverage filter against period if provided
    if (periodName && st.scope === "period" && st.period) {
      if (!coverageApplies(st.scope, st.period, periodName)) {
        continue;
      }
    }

    const levelScopeStr = normalizeLevelScope(st.levels);

    // Check if applicable to level
    if (!appliesToLevel(levelScopeStr, effectiveLevel)) {
      continue;
    }

    // Determine effective amount: level override vs base amount
    const metadata = {
      amount: st.amount,
      levels: levelScopeStr,
    };
    const itemAmount = amountForLevel(metadata, effectiveLevel);

    applicable.push({
      ...st,
      amount: itemAmount,
    });
    totalDue += itemAmount;
  }

  return { items: applicable, totalDue };
}

/**
 * Simulates a billing run dry-run calculation against eligible active students.
 */
export function computeBillingRunPreview(
  students: Array<{ id: string; student_name: string; class_admitted: string }>,
  structures: FeeStructureItem[],
  targetScope: "all" | "education_level" | "class",
  targetValue?: string,
  periodName?: string,
) {
  const filteredStudents = students.filter((s) => {
    if (!s.class_admitted) return false;
    if (targetScope === "class" && targetValue) {
      return s.class_admitted.trim().toLowerCase() === targetValue.trim().toLowerCase();
    }
    if (targetScope === "education_level" && targetValue) {
      const lvl = inferLevelCode(s.class_admitted);
      return lvl.toLowerCase() === targetValue.trim().toLowerCase();
    }
    return true;
  });

  let totalBilled = 0;
  let studentsPricedCount = 0;

  for (const s of filteredStudents) {
    const { totalDue } = resolveApplicableFees(structures, s.class_admitted, null, periodName);
    if (totalDue > 0) {
      studentsPricedCount++;
      totalBilled += totalDue;
    }
  }

  return {
    targetStudentCount: filteredStudents.length,
    studentsPricedCount,
    estimatedTotalBilled: totalBilled,
    sampleStudents: filteredStudents.slice(0, 5),
  };
}
