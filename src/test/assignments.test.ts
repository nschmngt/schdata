import { describe, expect, it } from "vitest";
import {
  calculateLatePenalty,
  formatSubmissionMode,
  formatSubmissionType,
  getAssignmentStatus,
} from "@/lib/assignments";
import {
  assignmentInputSchema,
  gradingInputSchema,
} from "@/lib/assignments.schemas";

describe("Assignments Pure Business Logic & Late Penalties", () => {
  it("calculates no penalty for on-time submission", () => {
    const res = calculateLatePenalty({
      dueDate: "2025-05-10T12:00:00Z",
      submittedAt: "2025-05-10T11:30:00Z",
      allowLate: true,
      maxScore: 100,
      rawScore: 90,
    });

    expect(res.isLate).toBe(false);
    expect(res.penaltyApplied).toBe(0);
    expect(res.finalScore).toBe(90);
    expect(res.isPastCutoff).toBe(false);
  });

  it("calculates no penalty when late submission is within the grace period", () => {
    const res = calculateLatePenalty({
      dueDate: "2025-05-10T12:00:00Z",
      submittedAt: "2025-05-10T13:30:00Z", // 1.5 hours late
      allowLate: true,
      lateGraceHours: 2, // 2 hours grace period
      latePenaltyType: "percentage_per_day",
      latePenaltyValue: 10,
      maxScore: 100,
      rawScore: 85,
    });

    expect(res.isLate).toBe(false);
    expect(res.penaltyApplied).toBe(0);
    expect(res.finalScore).toBe(85);
  });

  it("calculates percentage penalty per day after grace period", () => {
    const res = calculateLatePenalty({
      dueDate: "2025-05-10T12:00:00Z",
      submittedAt: "2025-05-11T14:00:00Z", // 26 hours late
      allowLate: true,
      lateGraceHours: 0,
      latePenaltyType: "percentage_per_day",
      latePenaltyValue: 10, // 10% per day
      maxScore: 100,
      rawScore: 80,
    });

    // 26 hours late = 2 days (Math.ceil(26/24))
    // Penalty = 2 days * 10% * 100 maxScore = 20 points
    expect(res.isLate).toBe(true);
    expect(res.daysLate).toBe(2);
    expect(res.penaltyApplied).toBe(20);
    expect(res.finalScore).toBe(60);
  });

  it("calculates fixed points penalty per day", () => {
    const res = calculateLatePenalty({
      dueDate: "2025-05-10T12:00:00Z",
      submittedAt: "2025-05-12T12:00:00Z", // 48 hours = 2 days late
      allowLate: true,
      lateGraceHours: 0,
      latePenaltyType: "fixed_per_day",
      latePenaltyValue: 5, // 5 points per day
      maxScore: 50,
      rawScore: 45,
    });

    expect(res.isLate).toBe(true);
    expect(res.daysLate).toBe(2);
    expect(res.penaltyApplied).toBe(10);
    expect(res.finalScore).toBe(35);
  });

  it("caps penalty at maxLatePenaltyPercent", () => {
    const res = calculateLatePenalty({
      dueDate: "2025-05-10T12:00:00Z",
      submittedAt: "2025-05-20T12:00:00Z", // 10 days late
      allowLate: true,
      lateGraceHours: 0,
      latePenaltyType: "percentage_per_day",
      latePenaltyValue: 20, // 10 days * 20% = 200% uncapped
      maxLatePenaltyPercent: 40, // capped at 40%
      maxScore: 100,
      rawScore: 90,
    });

    expect(res.isLate).toBe(true);
    expect(res.penaltyApplied).toBe(40); // 40% of 100
    expect(res.finalScore).toBe(50);
  });

  it("flags past cutoff date when submitted after cutoff date", () => {
    const res = calculateLatePenalty({
      dueDate: "2025-05-10T12:00:00Z",
      cutoffDate: "2025-05-12T12:00:00Z",
      submittedAt: "2025-05-13T12:00:00Z", // past cutoff
      allowLate: true,
      maxScore: 100,
    });

    expect(res.isPastCutoff).toBe(true);
  });
});

describe("Assignment Schema Validation", () => {
  it("accepts valid assignment input", () => {
    const parsed = assignmentInputSchema.safeParse({
      title: "Midterm Homework",
      description: "Solve all problems",
      className: "JHS 1",
      subject: "Mathematics",
      term: "Term 1 - 2025",
      assessmentType: "Assignment",
      maxScore: 100,
      dueDate: "2025-06-01T23:59:00Z",
      submissionMode: "individual",
      submissionType: "text",
      allowLate: true,
      lateGraceHours: 1,
      latePenaltyType: "percentage_per_day",
      latePenaltyValue: 5,
      maxLatePenaltyPercent: 50,
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects cutoff date prior to due date", () => {
    const parsed = assignmentInputSchema.safeParse({
      title: "Invalid Dates",
      className: "JHS 1",
      subject: "Mathematics",
      term: "Term 1 - 2025",
      assessmentType: "Assignment",
      dueDate: "2025-06-10T23:59:00Z",
      cutoffDate: "2025-06-05T23:59:00Z", // before due date
    });

    expect(parsed.success).toBe(false);
  });

  it("validates grading input schema", () => {
    const valid = gradingInputSchema.safeParse({
      submissionId: "11111111-1111-1111-1111-111111111111",
      rawScore: 88,
      feedback: "Great effort",
      syncToAssessment: true,
    });
    expect(valid.success).toBe(true);

    const negative = gradingInputSchema.safeParse({
      submissionId: "11111111-1111-1111-1111-111111111111",
      rawScore: -10,
    });
    expect(negative.success).toBe(false);
  });
});

describe("Assignment Status & Formatters", () => {
  it("determines status correctly", () => {
    const past = new Date("2020-01-01").toISOString();
    const future = new Date("2030-01-01").toISOString();

    expect(getAssignmentStatus({ due_date: future, allow_late: true })).toBe("open");
    expect(getAssignmentStatus({ due_date: past, allow_late: false })).toBe("closed");
    expect(getAssignmentStatus({ due_date: past, allow_late: true })).toBe("overdue");
    expect(
      getAssignmentStatus({ due_date: future, allow_late: true }, new Date(), {
        graded_at: "2025-01-01",
      })
    ).toBe("graded");
  });

  it("formats mode and type", () => {
    expect(formatSubmissionMode("individual")).toBe("Individual Assignment");
    expect(formatSubmissionMode("group")).toBe("Group Assignment");
    expect(formatSubmissionType("text")).toBe("Online Text Entry");
    expect(formatSubmissionType("file_link")).toBe("File / URL Link");
    expect(formatSubmissionType("offline")).toBe("Offline / Physical");
  });
});
