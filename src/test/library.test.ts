import { describe, expect, it } from "vitest";
import {
  bookInputSchema,
  issueLoanInputSchema,
  returnLoanInputSchema,
  renewLoanInputSchema,
  borrowerSearchSchema,
  reserveBookInputSchema,
  listBooksInputSchema,
  listLoansInputSchema,
} from "../lib/library.schemas";
import {
  calculateDueDate,
  calculateLateFine,
  checkBorrowerEligibility,
  checkRenewalEligibility,
  getLibraryPolicies,
} from "../lib/library";
import { defaultOpsRules } from "../lib/operations-rules";

describe("Library Module - Schema Validations", () => {
  it("validates book creation input payload", () => {
    const valid = bookInputSchema.parse({
      title: "Advanced Physics",
      author: "H. O. David",
      isbn: "978-3-16-148410-0",
      totalCopies: 5,
      availableCopies: 5,
    });

    expect(valid.title).toBe("Advanced Physics");
    expect(valid.category).toBe("General");
    expect(valid.status).toBe("available");
  });

  it("rejects book input with empty title or author", () => {
    expect(() =>
      bookInputSchema.parse({
        title: "",
        author: "H. O. David",
      }),
    ).toThrow();

    expect(() =>
      bookInputSchema.parse({
        title: "Advanced Physics",
        author: "   ",
      }),
    ).toThrow();
  });

  it("rejects book input when available copies exceed total copies", () => {
    expect(() =>
      bookInputSchema.parse({
        title: "Advanced Physics",
        author: "H. O. David",
        totalCopies: 3,
        availableCopies: 5,
      }),
    ).toThrow("Available copies cannot exceed total copies");
  });

  it("validates list books input schema defaults", () => {
    const valid = listBooksInputSchema.parse({});
    expect(valid.query).toBe("");
    expect(valid.category).toBe("all");
    expect(valid.status).toBe("all");
  });

  it("validates list loans input schema defaults", () => {
    const valid = listLoansInputSchema.parse({});
    expect(valid.status).toBe("all");
    expect(valid.borrowerQuery).toBe("");
    expect(valid.bookQuery).toBe("");
  });

  it("validates borrower search schema defaults", () => {
    const valid = borrowerSearchSchema.parse({ query: "John" });
    expect(valid.query).toBe("John");
    expect(valid.borrowerType).toBe("all");
  });

  it("validates loan issue input schema", () => {
    const valid = issueLoanInputSchema.parse({
      bookId: "11111111-2222-3333-4444-555555555555",
      borrowerType: "student",
      borrowerName: "John Doe",
      borrowerIdentifier: "ADM-2025-001",
      className: "Basic 7",
      issueDate: "2025-03-01",
      dueDate: "2025-03-15",
    });

    expect(valid.borrowerType).toBe("student");
    expect(valid.className).toBe("Basic 7");
  });

  it("rejects loan issue when due date is prior to issue date", () => {
    expect(() =>
      issueLoanInputSchema.parse({
        bookId: "11111111-2222-3333-4444-555555555555",
        borrowerType: "student",
        borrowerName: "John Doe",
        issueDate: "2025-03-15",
        dueDate: "2025-03-01",
      }),
    ).toThrow("Due date cannot be prior to issue date");
  });

  it("validates return loan input schema", () => {
    const valid = returnLoanInputSchema.parse({
      loanId: "11111111-2222-3333-4444-555555555555",
      returnDate: "2025-03-18",
      fineAmount: 3,
    });

    expect(valid.fineAmount).toBe(3);
  });

  it("validates renew loan input schema", () => {
    const valid = renewLoanInputSchema.parse({
      loanId: "11111111-2222-3333-4444-555555555555",
      extendedDueDate: "2025-03-29",
    });

    expect(valid.extendedDueDate).toBe("2025-03-29");
  });
});

describe("Library Module - Pure Business Logic & Policy Extraction", () => {
  it("extracts active library policies from Operations Configuration defaults", () => {
    const opsRules = defaultOpsRules();
    const policies = getLibraryPolicies(opsRules);

    expect(policies.loanDays).toBe(14);
    expect(policies.maxLoans).toBe(3);
    expect(policies.renewals).toBe(1);
    expect(policies.finePerDay).toBe(1);
  });

  it("calculates accurate due date based on issue date and loan days policy", () => {
    const dueDate = calculateDueDate("2025-03-01", 14);
    expect(dueDate).toBe("2025-03-15");
  });

  it("calculates zero fine for on-time book returns", () => {
    const res = calculateLateFine("2025-03-15", "2025-03-15", 2);
    expect(res.daysOverdue).toBe(0);
    expect(res.fineAmount).toBe(0);
  });

  it("calculates accurate late fine for overdue returns", () => {
    // 5 days overdue at $1.50 per day
    const res = calculateLateFine("2025-03-10", "2025-03-15", 1.5);
    expect(res.daysOverdue).toBe(5);
    expect(res.fineAmount).toBe(7.5);
  });

  it("evaluates borrower eligibility against max loans policy and fee status", () => {
    const eligibleRes = checkBorrowerEligibility(1, 3, "paid");
    expect(eligibleRes.eligible).toBe(true);
    expect(eligibleRes.warnings.length).toBe(0);

    const maxReachedRes = checkBorrowerEligibility(3, 3, "paid");
    expect(maxReachedRes.eligible).toBe(false);
    expect(maxReachedRes.warnings[0]).toContain("maximum allowed limit of 3");

    const overdueFeeRes = checkBorrowerEligibility(1, 3, "overdue");
    expect(overdueFeeRes.eligible).toBe(true);
    expect(overdueFeeRes.warnings[0]).toContain("overdue school fee balances");
  });

  it("evaluates loan renewal eligibility against max renewals policy", () => {
    const eligibleRenewal = checkRenewalEligibility(0, 1);
    expect(eligibleRenewal.eligible).toBe(true);

    const blockedRenewal = checkRenewalEligibility(1, 1);
    expect(blockedRenewal.eligible).toBe(false);
    expect(blockedRenewal.reason).toContain("Maximum allowed renewals (1) reached");
  });
});
