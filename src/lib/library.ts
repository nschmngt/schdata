import { addDays, differenceInCalendarDays, parseISO, format } from "date-fns";
import { opsValue, type OpsRules } from "@/lib/operations-rules";

export interface LibraryPolicies {
  loanDays: number;
  maxLoans: number;
  renewals: number;
  finePerDay: number;
}

/**
 * Extract active library policy rules from Operations Configuration.
 * Defaults match DEFAULT_OPS_RULES.library.
 */
export function getLibraryPolicies(opsRules: OpsRules): LibraryPolicies {
  const loanDaysVal = opsValue(opsRules, "library", "loan-days");
  const maxLoansVal = opsValue(opsRules, "library", "max-loans");
  const renewalsVal = opsValue(opsRules, "library", "renewals");
  const finePerDayVal = opsValue(opsRules, "library", "fine-per-day");

  return {
    loanDays: typeof loanDaysVal === "number" ? loanDaysVal : 14,
    maxLoans: typeof maxLoansVal === "number" ? maxLoansVal : 3,
    renewals: typeof renewalsVal === "number" ? renewalsVal : 1,
    finePerDay: typeof finePerDayVal === "number" ? finePerDayVal : 1,
  };
}

/**
 * Calculates due date given an issue date and allowed loan days.
 */
export function calculateDueDate(issueDateStr: string, loanDays: number): string {
  if (!issueDateStr) return format(new Date(), "yyyy-MM-dd");
  const issueDate = parseISO(issueDateStr);
  const dueDate = addDays(issueDate, Math.max(0, loanDays));
  return format(dueDate, "yyyy-MM-dd");
}

/**
 * Calculates days overdue and late fine based on due date, return date, and daily fine policy.
 */
export function calculateLateFine(
  dueDateStr: string,
  returnDateStr: string,
  finePerDay: number,
): { daysOverdue: number; fineAmount: number } {
  if (!dueDateStr || !returnDateStr) {
    return { daysOverdue: 0, fineAmount: 0 };
  }
  const due = parseISO(dueDateStr);
  const ret = parseISO(returnDateStr);
  const days = differenceInCalendarDays(ret, due);

  if (days <= 0) {
    return { daysOverdue: 0, fineAmount: 0 };
  }

  const fineAmount = Math.max(0, days * finePerDay);
  return {
    daysOverdue: days,
    fineAmount: Number(fineAmount.toFixed(2)),
  };
}

/**
 * Evaluates borrower eligibility for new loans based on active loans vs policy max loans and fee status.
 */
export function checkBorrowerEligibility(
  activeLoanCount: number,
  maxLoans: number,
  paymentStatus?: string,
): { eligible: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (activeLoanCount >= maxLoans) {
    warnings.push(`Borrower has reached the maximum allowed limit of ${maxLoans} active book loans.`);
  }

  if (paymentStatus === "overdue") {
    warnings.push("Borrower has overdue school fee balances on record.");
  }

  return {
    eligible: activeLoanCount < maxLoans,
    warnings,
  };
}

/**
 * Checks if a loan is eligible for renewal given current renewal count and policy maximum.
 */
export function checkRenewalEligibility(
  currentRenewals: number,
  maxRenewals: number,
): { eligible: boolean; reason?: string } {
  if (currentRenewals >= maxRenewals) {
    return {
      eligible: false,
      reason: `Maximum allowed renewals (${maxRenewals}) reached for this loan.`,
    };
  }
  return { eligible: true };
}
