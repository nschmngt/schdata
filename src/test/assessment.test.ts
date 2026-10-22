import { describe, expect, it } from "vitest";
import { assessmentInputSchema } from "@/lib/assessment.schemas";
import { activeAssessmentTypes, defaultRules } from "@/lib/academic-rules";
import { assertTeaches, type TeachingScope } from "@/lib/teaching.server";

describe("assessment schema validation", () => {
  const validPayload = {
    admissionId: "11111111-1111-1111-1111-111111111111",
    className: "Grade 1A",
    term: "Term 1 2026",
    subject: "Mathematics",
    assessmentType: "Mid-Term Test",
    score: 85,
    outOf: 100,
    remark: "Good progress",
  };

  it("accepts valid assessment input", () => {
    const parsed = assessmentInputSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
  });

  it("rejects score exceeding outOf", () => {
    const parsed = assessmentInputSchema.safeParse({ ...validPayload, score: 105, outOf: 100 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe("Score cannot exceed out of mark.");
    }
  });

  it("rejects negative scores", () => {
    const parsed = assessmentInputSchema.safeParse({ ...validPayload, score: -5 });
    expect(parsed.success).toBe(false);
  });

  it("allows omitting outOf in schema when defaulting server-side", () => {
    const { outOf, ...withoutOutOf } = validPayload;
    const parsed = assessmentInputSchema.safeParse(withoutOutOf);
    expect(parsed.success).toBe(true);
  });
});

describe("academic rules assessment types", () => {
  it("extracts active assessment types from default rules", () => {
    const rules = defaultRules();
    const active = activeAssessmentTypes(rules);
    expect(active.length).toBeGreaterThan(0);
    expect(active).toContain("Exam");
  });
});

describe("teaching scope enforcement for assessments", () => {
  const staffScope: TeachingScope = {
    isAdmin: false,
    role: "staff",
    pairs: [
      { class_name: "Grade 1A", subject: "Mathematics" },
      { class_name: "Grade 1B", subject: "Science" },
    ],
    classes: ["Grade 1A", "Grade 1B"],
    subjects: ["Mathematics", "Science"],
  };

  it("allows staff to edit within assigned scope", () => {
    expect(() => assertTeaches(staffScope, "Grade 1A", "Mathematics")).not.toThrow();
  });

  it("blocks staff from editing outside assigned scope", () => {
    expect(() => assertTeaches(staffScope, "Grade 1A", "Science")).toThrow(
      "You are not assigned to teach Science in Grade 1A.",
    );
  });

  it("allows admin scope anywhere", () => {
    const adminScope: TeachingScope = {
      isAdmin: true,
      role: "school_manager",
      pairs: [],
      classes: [],
      subjects: [],
    };
    expect(() => assertTeaches(adminScope, "Grade 10", "Quantum Mechanics")).not.toThrow();
  });
});
