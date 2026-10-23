import { describe, expect, it } from "vitest";
import { defaultRules } from "@/lib/academic-rules";
import {
  calculateBroadsheetMatrix,
  isResultVisibleToLearner,
  StudentScoreRecord,
} from "@/lib/results";

describe("Results Pure Business Logic & Broadsheet Calculations", () => {
  const rules = defaultRules(); // Class 50%, Exam 50%, Pass mark 50

  const students = [
    { id: "s1", student_name: "Alice Smith", admission_number: "ADM001" },
    { id: "s2", student_name: "Bob Jones", admission_number: "ADM002" },
  ];

  const subjects = ["Mathematics", "English"];

  const scores: StudentScoreRecord[] = [
    // Alice Mathematics: Homework 80/100 (class), Exam 90/100 (exam)
    {
      admissionId: "s1",
      studentName: "Alice Smith",
      admissionNumber: "ADM001",
      subject: "Mathematics",
      assessmentType: "Homework",
      score: 80,
      outOf: 100,
    },
    {
      admissionId: "s1",
      studentName: "Alice Smith",
      admissionNumber: "ADM001",
      subject: "Mathematics",
      assessmentType: "Exam",
      score: 90,
      outOf: 100,
    },
    // Alice English: Project 70/100 (class), Exam 70/100 (exam)
    {
      admissionId: "s1",
      studentName: "Alice Smith",
      admissionNumber: "ADM001",
      subject: "English",
      assessmentType: "Project",
      score: 70,
      outOf: 100,
    },
    {
      admissionId: "s1",
      studentName: "Alice Smith",
      admissionNumber: "ADM001",
      subject: "English",
      assessmentType: "Exam",
      score: 70,
      outOf: 100,
    },
    // Bob Mathematics: Homework 40/100 (class), Exam 40/100 (exam)
    {
      admissionId: "s2",
      studentName: "Bob Jones",
      admissionNumber: "ADM002",
      subject: "Mathematics",
      assessmentType: "Homework",
      score: 40,
      outOf: 100,
    },
    {
      admissionId: "s2",
      studentName: "Bob Jones",
      admissionNumber: "ADM002",
      subject: "Mathematics",
      assessmentType: "Exam",
      score: 40,
      outOf: 100,
    },
    // Bob English: Project 30/100 (class), Exam 30/100 (exam)
    {
      admissionId: "s2",
      studentName: "Bob Jones",
      admissionNumber: "ADM002",
      subject: "English",
      assessmentType: "Project",
      score: 30,
      outOf: 100,
    },
    {
      admissionId: "s2",
      studentName: "Bob Jones",
      admissionNumber: "ADM002",
      subject: "English",
      assessmentType: "Exam",
      score: 30,
      outOf: 100,
    },
  ];

  it("correctly calculates weighted classwork and exam totals for broadsheet rows", () => {
    const res = calculateBroadsheetMatrix(
      "Term 1",
      "Grade 1",
      students,
      subjects,
      scores,
      rules,
      { status: "published", withheldStudentIds: [] },
    );

    expect(res.totalStudents).toBe(2);
    expect(res.subjects).toEqual(["Mathematics", "English"]);

    const alice = res.students.find((s) => s.admissionId === "s1")!;
    expect(alice.subjects.Mathematics.classWorkScore).toBe(40); // 80 * 0.5
    expect(alice.subjects.Mathematics.examScore).toBe(45);      // 90 * 0.5
    expect(alice.subjects.Mathematics.totalScore).toBe(85);     // 40 + 45
    expect(alice.subjects.Mathematics.grade).toBe("A");          // 85 is min 80 -> A
    expect(alice.subjects.Mathematics.position).toBe(1);

    const bob = res.students.find((s) => s.admissionId === "s2")!;
    expect(bob.subjects.Mathematics.totalScore).toBe(40);
    expect(bob.subjects.Mathematics.position).toBe(2);
    expect(bob.status).toBe("Fail");
  });

  it("calculates class average and subject statistics accurately", () => {
    const res = calculateBroadsheetMatrix(
      "Term 1",
      "Grade 1",
      students,
      subjects,
      scores,
      rules,
      { status: "published", withheldStudentIds: [] },
    );

    const mathStats = res.subjectStats["Mathematics"];
    expect(mathStats.averageScore).toBe(62.5); // (85 + 40)/2
    expect(mathStats.highestScore).toBe(85);
    expect(mathStats.lowestScore).toBe(40);
    expect(mathStats.passCount).toBe(1);
    expect(mathStats.failCount).toBe(1);
    expect(mathStats.passPercentage).toBe(50);
  });

  it("correctly evaluates learner visibility according to publication state and withholding list", () => {
    // Admin always sees
    expect(isResultVisibleToLearner("draft", [], "s1", "super_admin")).toBe(true);
    expect(isResultVisibleToLearner("withheld", ["s1"], "s1", "staff")).toBe(true);

    // Student/Parent cannot see draft or withheld classes
    expect(isResultVisibleToLearner("draft", [], "s1", "student")).toBe(false);
    expect(isResultVisibleToLearner("withheld", [], "s1", "parent")).toBe(false);

    // Student can see published unless withheld individually
    expect(isResultVisibleToLearner("published", [], "s1", "student")).toBe(true);
    expect(isResultVisibleToLearner("published", ["s1"], "s1", "student")).toBe(false);
    expect(isResultVisibleToLearner("published", ["s1"], "s2", "student")).toBe(true);
  });
});
