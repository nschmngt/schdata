import { describe, expect, it } from "vitest";
import {
  examInputSchema,
  questionInputSchema,
  submitExamSchema,
  gradeSubmissionSchema,
} from "../lib/exams.schemas";

describe("Exams & Quizzes validation schemas", () => {
  it("validates valid exam creation input", () => {
    const valid = examInputSchema.safeParse({
      title: "Mid-Term Mathematics Exam",
      description: "First term assessment",
      examType: "exam",
      className: "JSS 1",
      subject: "Mathematics",
      term: "First Term 2024/2025",
      durationMinutes: 45,
      totalMarks: 100,
      passMark: 50,
      shuffleQuestions: true,
      status: "published",
      questions: [
        {
          questionText: "What is 2 + 2?",
          questionType: "multiple_choice",
          points: 5,
          options: ["2", "3", "4", "5"],
          correctAnswer: "4",
          explanation: "Basic addition",
        },
      ],
    });

    expect(valid.success).toBe(true);
  });

  it("rejects empty exam title or class name", () => {
    const invalid = examInputSchema.safeParse({
      title: "",
      examType: "quiz",
      className: "",
      subject: "English",
      term: "First Term",
    });

    expect(invalid.success).toBe(false);
  });

  it("validates question input with defaults", () => {
    const question = questionInputSchema.parse({
      questionText: "Explain photosynthesis",
      questionType: "essay",
    });

    expect(question.points).toBe(1);
    expect(question.questionType).toBe("essay");
  });

  it("validates submission payload", () => {
    const validSub = submitExamSchema.safeParse({
      examId: "00000000-0000-0000-0000-000000000001",
      submissionId: "00000000-0000-0000-0000-000000000002",
      answers: [
        {
          questionId: "00000000-0000-0000-0000-000000000003",
          answerText: "4",
        },
      ],
    });

    expect(validSub.success).toBe(true);
  });

  it("validates manual grading input schema", () => {
    const validGrading = gradeSubmissionSchema.safeParse({
      submissionId: "00000000-0000-0000-0000-000000000002",
      overallFeedback: "Great effort",
      gradedAnswers: [
        {
          answerId: "00000000-0000-0000-0000-000000000004",
          pointsAwarded: 10,
          isCorrect: true,
          feedback: "Correct answer",
        },
      ],
    });

    expect(validGrading.success).toBe(true);
  });
});
