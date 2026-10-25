import { describe, expect, it } from "vitest";
import {
  recordStudentExeatSchema,
  studentQuerySchema,
  updateStudentClassSchema,
  updateStudentDetailSchema,
} from "@/lib/students.schemas";
import {
  evaluateStudentLifecycle,
  summariseStudentAcademics,
  summariseStudentFinance,
  summariseStudentOperations,
} from "@/lib/students";
import { defaultPeopleRules } from "@/lib/people-rules";
import { defaultOpsRules } from "@/lib/operations-rules";

describe("Students Module - Schema Validations", () => {
  it("validates student search query defaults", () => {
    const res = studentQuerySchema.parse({});
    expect(res.search).toBe("");
    expect(res.className).toBe("");
    expect(res.gender).toBe("");
    expect(res.feeStatus).toBe("");
    expect(res.status).toBe("");
  });

  it("validates update student detail schema", () => {
    const valid = {
      id: "adm-101",
      studentName: "John Kwesi Doe",
      gender: "Male",
      classAdmitted: "Basic 5",
      parentName: "Mary Doe",
      parentEmail: "mary.doe@example.com",
      status: "admitted",
    };
    const parsed = updateStudentDetailSchema.parse(valid);
    expect(parsed.studentName).toBe("John Kwesi Doe");
    expect(parsed.parentEmail).toBe("mary.doe@example.com");
  });

  it("rejects invalid update student detail when required fields are missing", () => {
    const invalid = {
      id: "adm-101",
      studentName: "J", // too short
      gender: "",
      classAdmitted: "",
      parentName: "",
      parentEmail: "not-an-email",
    };
    expect(() => updateStudentDetailSchema.parse(invalid)).toThrow();
  });

  it("validates class update schema", () => {
    const res = updateStudentClassSchema.parse({ id: "adm-101", className: "JHS 1" });
    expect(res.className).toBe("JHS 1");
  });

  it("validates exeat recording schema", () => {
    const res = recordStudentExeatSchema.parse({
      admissionId: "adm-101",
      status: "out",
      reason: "Medical Checkup",
    });
    expect(res.status).toBe("out");
    expect(res.reason).toBe("Medical Checkup");
  });
});

describe("Students Module - Pure Business Logic & Lifecycle Evaluation", () => {
  it("evaluates promotion eligibility correctly against People Configuration rules", () => {
    const rules = defaultPeopleRules();
    // Default promotion-average is 50%

    const eligible = evaluateStudentLifecycle(65.5, 0, true, rules);
    expect(eligible.promotionEligible).toBe(true);
    expect(eligible.warnings).toHaveLength(0);

    const ineligible = evaluateStudentLifecycle(42.0, 0, true, rules);
    expect(ineligible.promotionEligible).toBe(false);
    expect(ineligible.warnings.some((w) => w.toLowerCase().includes("minimum required threshold"))).toBe(true);
  });

  it("evaluates transfer and withdrawal clearance requirements", () => {
    const rules = defaultPeopleRules();
    // transfer-letter = true, withdrawal-clearance = true by default

    const withBalance = evaluateStudentLifecycle(70, 150, false, rules);
    expect(withBalance.withdrawalEligible).toBe(false);
    expect(withBalance.warnings.some((w) => w.toLowerCase().includes("fee balance"))).toBe(true);

    const clearedBalance = evaluateStudentLifecycle(70, 0, true, rules);
    expect(clearedBalance.withdrawalEligible).toBe(true);
    expect(clearedBalance.transferEligible).toBe(true);
  });

  it("summarises financial obligations and payment status", () => {
    const fees = [
      { amount_due: 500, amount_paid: 500, due_date: "2025-01-10" },
      { amount_due: 300, amount_paid: 100, due_date: "2025-02-10" },
    ];
    const fin = summariseStudentFinance(fees);
    expect(fin.totalDue).toBe(800);
    expect(fin.totalPaid).toBe(600);
    expect(fin.balance).toBe(200);
    expect(fin.paymentStatus).toBe("partially_paid");
  });

  it("summarises student academic averages and engagement counts", () => {
    const assessments = [
      { score: 80, out_of: 100 },
      { score: 40, out_of: 50 }, // 80%
      { score: 30, out_of: 50 }, // 60%
    ];
    const assignments = [{ id: "a1" }, { id: "a2" }];
    const lessons = [{ id: "l1" }];
    const exams = [{ id: "e1" }];

    const summary = summariseStudentAcademics(assessments, assignments, lessons, exams);
    expect(summary.totalAssessments).toBe(3);
    expect(summary.averageScore).toBe(73.3); // (80 + 80 + 60) / 3 = 73.333
    expect(summary.assignmentsSubmitted).toBe(2);
    expect(summary.lessonsCompleted).toBe(1);
    expect(summary.examsTaken).toBe(1);
  });

  it("summarises student exeat operations, library loans, and active reservations", () => {
    const exeatLogs = [{ status: "out", reason: "Medical" }];
    const opsRules = defaultOpsRules();
    const libraryLoans = [
      { status: "issued", fine_amount: 0 },
      { status: "overdue", fine_amount: 5 },
      { status: "returned", fine_amount: 0 },
    ];
    const libraryReservations = [
      { status: "pending" },
      { status: "approved" },
      { status: "cancelled" },
    ];

    const ops = summariseStudentOperations(exeatLogs, opsRules, libraryLoans, libraryReservations);
    expect(ops.currentExeatStatus).toBe("out");
    expect(ops.totalExeats).toBe(1);
    expect(ops.libraryLoanDays).toBe(14);
    expect(ops.libraryMaxLoans).toBe(3);
    expect(ops.totalLibraryLoans).toBe(3);
    expect(ops.activeLibraryLoans).toBe(2);
    expect(ops.overdueLibraryLoans).toBe(1);
    expect(ops.activeLibraryReservations).toBe(2);
  });
});
