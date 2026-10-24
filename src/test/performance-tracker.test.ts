import { describe, it, expect } from "vitest";
import { defaultRules } from "../lib/academic-rules";
import {
  calculateAttendanceRate,
  calculateInterventionEffectiveness,
  calculateStudentOverallAverage,
  calculateStudentSubjectScore,
  evaluateStudentRisk,
  formatGenderAggregation,
  RawStudentData,
  ScoreItem,
} from "../lib/performance-tracker";
import {
  createInterventionSchema,
  performanceRiskRulesSchema,
  trackerFilterSchema,
  updateInterventionSchema,
} from "../lib/performance-tracker.schemas";

describe("Performance Tracker - Pure Business Logic", () => {
  const academicRules = defaultRules();
  const riskRules = performanceRiskRulesSchema.parse({});

  it("calculates subject scores with weighted class work and exam split", () => {
    const scores: ScoreItem[] = [
      {
        admissionId: "stud-1",
        className: "Primary 1",
        term: "Term 1",
        subject: "Mathematics",
        assessmentType: "Homework",
        score: 80,
        outOf: 100,
        status: "assessed",
      },
      {
        admissionId: "stud-1",
        className: "Primary 1",
        term: "Term 1",
        subject: "Mathematics",
        assessmentType: "Exam",
        score: 60,
        outOf: 100,
        status: "assessed",
      },
    ];

    const result = calculateStudentSubjectScore(scores, "Mathematics", academicRules);
    // 50% class (80) + 50% exam (60) = 70%
    expect(result.totalPercent).toBe(70);
    expect(result.classPercent).toBe(80);
    expect(result.examPercent).toBe(60);
    expect(result.taskCount).toBe(2);
  });

  it("excludes excused assessments from denominator", () => {
    const scores: ScoreItem[] = [
      {
        admissionId: "stud-1",
        className: "Primary 1",
        term: "Term 1",
        subject: "Science",
        assessmentType: "Quiz",
        score: 0,
        outOf: 100,
        status: "excused",
      },
      {
        admissionId: "stud-1",
        className: "Primary 1",
        term: "Term 1",
        subject: "Science",
        assessmentType: "Exam",
        score: 90,
        outOf: 100,
        status: "assessed",
      },
    ];

    const result = calculateStudentSubjectScore(scores, "Science", academicRules);
    expect(result.totalPercent).toBe(90);
    expect(result.taskCount).toBe(1);
  });

  it("calculates overall academic average across subjects", () => {
    const scores: ScoreItem[] = [
      {
        admissionId: "stud-1",
        className: "JHS 1",
        term: "Term 1",
        subject: "Mathematics",
        assessmentType: "Exam",
        score: 80,
        outOf: 100,
      },
      {
        admissionId: "stud-1",
        className: "JHS 1",
        term: "Term 1",
        subject: "English",
        assessmentType: "Exam",
        score: 90,
        outOf: 100,
      },
    ];

    const avg = calculateStudentOverallAverage(scores, ["Mathematics", "English"], academicRules);
    expect(avg).toBe(85);
  });

  it("calculates attendance rate and returns null for empty records", () => {
    expect(calculateAttendanceRate([]).ratePercent).toBeNull();

    const records: any[] = [
      { status: "present" },
      { status: "present" },
      { status: "late" },
      { status: "absent" },
    ];
    const res = calculateAttendanceRate(records);
    // (1 + 1 + 0.8) / 4 = 2.8 / 4 = 70%
    expect(res.ratePercent).toBe(70);
    expect(res.totalDays).toBe(4);
    expect(res.absentDays).toBe(1);
  });

  it("evaluates student risk dimensions and assigns traceable explanations", () => {
    const student: RawStudentData = {
      id: "stud-100",
      studentName: "John Doe",
      admissionNumber: "ADM-001",
      className: "JHS 1",
      gender: "Male",
    };

    // Low score (40% < 50%) -> triggers Academic Risk
    const currentScores: ScoreItem[] = [
      {
        admissionId: "stud-100",
        className: "JHS 1",
        term: "Term 2",
        subject: "Math",
        assessmentType: "Exam",
        score: 40,
        outOf: 100,
      },
    ];

    const attendanceRecords: any[] = [
      { status: "absent" },
      { status: "absent" },
      { status: "present" },
    ]; // 33.3% < 75% -> triggers Attendance Risk

    const risk = evaluateStudentRisk(
      student,
      currentScores,
      null,
      attendanceRecords,
      [],
      ["Math"],
      academicRules,
      riskRules,
    );

    expect(risk.activeDimensions).toContain("academic");
    expect(risk.activeDimensions).toContain("attendance");
    expect(risk.riskSeverity).toBe("medium");
    expect(risk.reasons.length).toBe(2);
  });

  it("applies gender reporting privacy safeguards for small sample sizes", () => {
    const students: RawStudentData[] = [
      { id: "s1", studentName: "Alice", admissionNumber: "A1", className: "SHS 1", gender: "Female" },
    ];

    const summary = formatGenderAggregation("Female", students, [], ["Math"], 3);
    expect(summary.disclosureRestricted).toBe(true);
    expect(summary.avgOverallScore).toBeNull();
  });

  it("calculates intervention effectiveness and target achievement", () => {
    const eff = calculateInterventionEffectiveness(45, 60, 68, 85, "Achieve 60%");
    expect(eff.performanceDelta).toBe(23);
    expect(eff.attendanceDelta).toBe(25);
    expect(eff.targetAchieved).toBe(true);
  });
});

describe("Performance Tracker - Schema Validations", () => {
  it("validates tracker filter defaults", () => {
    const filter = trackerFilterSchema.parse({ term: "Term 1" });
    expect(filter.term).toBe("Term 1");
  });

  it("validates create intervention schema", () => {
    const valid = createInterventionSchema.parse({
      admissionId: "123e4567-e89b-12d3-a456-426614174000",
      term: "Term 1",
      academicYear: "2024/2025",
      identifiedNeed: "Remedial math support needed",
      strategy: "Individual tutoring",
      startDate: "2024-10-01",
      reviewDate: "2024-10-15",
      targetOutcome: "Pass mark >= 50%",
    });
    expect(valid.strategy).toBe("Individual tutoring");
  });

  it("rejects invalid UUID in intervention creation", () => {
    expect(() =>
      createInterventionSchema.parse({
        admissionId: "invalid-id",
        term: "Term 1",
        academicYear: "2024",
        identifiedNeed: "Need",
        strategy: "Strategy",
        startDate: "2024-10-01",
        reviewDate: "2024-10-15",
        targetOutcome: "Outcome",
      }),
    ).toThrow();
  });

  it("validates update intervention schema", () => {
    const update = updateInterventionSchema.parse({
      id: "123e4567-e89b-12d3-a456-426614174000",
      status: "closed",
      closureReason: "Target achieved",
    });
    expect(update.status).toBe("closed");
  });
});
