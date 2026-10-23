import { describe, expect, it } from "vitest";
import {
  calculateBalanceSummary,
  mapStudentFeeLedger,
  resolveApplicableFees,
  computeBillingRunPreview,
  type FeeStructureItem,
  type StudentFeeRecord,
} from "../lib/fees-invoicing";
import {
  billingRunSchema,
  recordPaymentSchema,
  feeAdjustmentSchema,
  feeStructureInputSchema,
} from "../lib/fees-invoicing.schemas";

describe("Fees & Invoicing - Zod Input Schemas", () => {
  it("validates billing run schema with defaults", () => {
    const input = {
      academicYear: "2024/2025",
      period: "Term 1",
    };
    const parsed = billingRunSchema.parse(input);
    expect(parsed.academicYear).toBe("2024/2025");
    expect(parsed.period).toBe("Term 1");
    expect(parsed.targetScope).toBe("all");
  });

  it("rejects invalid payment recording with negative amount", () => {
    const input = {
      feeId: "123e4567-e89b-12d3-a456-426614174000",
      amountPaid: -100,
      entryDate: "2025-01-15",
    };
    expect(() => recordPaymentSchema.parse(input)).toThrow();
  });

  it("validates fee adjustment input schema", () => {
    const input = {
      feeId: "123e4567-e89b-12d3-a456-426614174000",
      adjustmentType: "discount",
      amount: 150,
      reason: "Scholarship discount approved",
    };
    const parsed = feeAdjustmentSchema.parse(input);
    expect(parsed.adjustmentType).toBe("discount");
    expect(parsed.amount).toBe(150);
  });

  it("validates fee structure input schema", () => {
    const input = {
      code: "TUIT-01",
      name: "Tuition Fee",
      feeCategory: "tuition",
      amount: 1200,
      scope: "active-period",
    };
    const parsed = feeStructureInputSchema.parse(input);
    expect(parsed.code).toBe("TUIT-01");
    expect(parsed.amount).toBe(1200);
  });
});

describe("Fees & Invoicing - Balance Calculations & Ledger Mapping", () => {
  const mockFeeRecords: StudentFeeRecord[] = [
    {
      id: "fee-1",
      admission_id: "adm-1",
      term: "Term 1",
      amount_due: 1000,
      amount_paid: 1000,
      status: "paid",
      due_date: "2025-01-30",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      admissions: {
        admission_number: "ADM001",
        student_name: "Kofi Mensah",
        class_admitted: "Basic 1",
      },
    },
    {
      id: "fee-2",
      admission_id: "adm-2",
      term: "Term 1",
      amount_due: 1000,
      amount_paid: 400,
      status: "partially_paid",
      due_date: "2025-01-30",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      admissions: {
        admission_number: "ADM002",
        student_name: "Ama Osei",
        class_admitted: "Basic 1",
      },
    },
    {
      id: "fee-3",
      admission_id: "adm-3",
      term: "Term 1",
      amount_due: 1000,
      amount_paid: 0,
      status: "overdue",
      due_date: "2024-12-01",
      created_at: "2024-11-01T00:00:00Z",
      updated_at: "2024-11-01T00:00:00Z",
      admissions: {
        admission_number: "ADM003",
        student_name: "Kwame Nkrumah",
        class_admitted: "JHS 1",
      },
    },
  ];

  it("calculates accurate balance summary metrics", () => {
    const summary = calculateBalanceSummary(mockFeeRecords, "2025-01-15");
    expect(summary.totalBilled).toBe(3000);
    expect(summary.totalPaid).toBe(1400);
    expect(summary.totalOutstanding).toBe(1600);
    expect(summary.totalOverdue).toBe(1000);
    expect(summary.paidCount).toBe(1);
    expect(summary.partiallyPaidCount).toBe(1);
    expect(summary.overdueCount).toBe(1);
    expect(summary.collectionRate).toBe(47); // 1400 / 3000 = 46.66% -> 47%
  });

  it("maps student fee ledger with derived fields", () => {
    const ledger = mapStudentFeeLedger(mockFeeRecords, "2025-01-15");
    expect(ledger).toHaveLength(3);
    expect(ledger[0]!.studentName).toBe("Kofi Mensah");
    expect(ledger[0]!.balance).toBe(0);
    expect(ledger[0]!.status).toBe("paid");

    expect(ledger[1]!.studentName).toBe("Ama Osei");
    expect(ledger[1]!.balance).toBe(600);
    expect(ledger[1]!.status).toBe("partially_paid");
  });
});

describe("Fees & Invoicing - Applicable Fees & Level Scoping", () => {
  const mockStructures: FeeStructureItem[] = [
    {
      code: "TUIT-BASE",
      name: "General Tuition",
      fee_category: "tuition",
      amount: 800,
      levels: {
        primary: 700,
        jhs: 900,
        shs: 1200,
      },
    },
    {
      code: "PTA-LEVY",
      name: "PTA Levy",
      fee_category: "pta",
      amount: 100,
    },
    {
      code: "JHS-LAB",
      name: "JHS Science Lab Fee",
      fee_category: "examination",
      amount: 150,
      class_name: "JHS 1",
    },
  ];

  it("applies level pricing override for Primary level class", () => {
    const resolved = resolveApplicableFees(mockStructures, "Basic 1");
    // Should get Primary tuition override (700) + PTA Levy (100) = 800
    expect(resolved.totalDue).toBe(800);
    expect(resolved.items.find((i) => i.code === "TUIT-BASE")?.amount).toBe(700);
  });

  it("applies level pricing override and class specific fee for JHS 1", () => {
    const resolved = resolveApplicableFees(mockStructures, "JHS 1");
    // Should get JHS tuition override (900) + PTA Levy (100) + JHS Science Lab (150) = 1150
    expect(resolved.totalDue).toBe(1150);
    expect(resolved.items).toHaveLength(3);
  });
});

describe("Fees & Invoicing - Billing Run Simulation", () => {
  const students = [
    { id: "s1", student_name: "Student One", class_admitted: "Basic 1" },
    { id: "s2", student_name: "Student Two", class_admitted: "Basic 2" },
    { id: "s3", student_name: "Student Three", class_admitted: "JHS 1" },
  ];

  const structures: FeeStructureItem[] = [
    {
      code: "TUIT",
      name: "Tuition",
      fee_category: "tuition",
      amount: 500,
    },
  ];

  it("computes dry-run preview for whole school scope", () => {
    const preview = computeBillingRunPreview(students, structures, "all");
    expect(preview.targetStudentCount).toBe(3);
    expect(preview.studentsPricedCount).toBe(3);
    expect(preview.estimatedTotalBilled).toBe(1500);
  });

  it("computes dry-run preview filtered by specific class", () => {
    const preview = computeBillingRunPreview(students, structures, "class", "Basic 1");
    expect(preview.targetStudentCount).toBe(1);
    expect(preview.estimatedTotalBilled).toBe(500);
  });
});
