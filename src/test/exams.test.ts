import { describe, expect, it } from "vitest";
import {
  examInputSchema,
  questionInputSchema,
  submitExamSchema,
  gradeSubmissionSchema,
  calculateExamScorePercentage,
  isExamPassingScore,
  isExamActiveWindow,
  evaluateAnswerCorrectness,
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

  it("rejects when passMark exceeds totalMarks", () => {
    const invalid = examInputSchema.safeParse({
      title: "Science Quiz",
      examType: "quiz",
      className: "Basic 1",
      subject: "Basic Science",
      term: "First Term",
      totalMarks: 50,
      passMark: 60,
    });

    expect(invalid.success).toBe(false);
  });

  it("rejects when endTime is prior to startTime", () => {
    const invalid = examInputSchema.safeParse({
      title: "Science Quiz",
      examType: "quiz",
      className: "Basic 1",
      subject: "Basic Science",
      term: "First Term",
      startTime: "2025-10-10T10:00:00.000Z",
      endTime: "2025-10-10T09:00:00.000Z",
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

describe("Exams & Quizzes Pure Business Logic & Domain Helpers", () => {
  it("calculates accurate score percentage", () => {
    expect(calculateExamScorePercentage(45, 60)).toBe(75);
    expect(calculateExamScorePercentage(0, 100)).toBe(0);
    expect(calculateExamScorePercentage(10, 0)).toBe(0);
  });

  it("evaluates passing score accurately", () => {
    expect(isExamPassingScore(50, 50)).toBe(true);
    expect(isExamPassingScore(49.5, 50)).toBe(false);
  });

  it("checks exam active window correctly", () => {
    const now = new Date("2025-05-15T12:00:00Z");

    const futureStart = isExamActiveWindow("2025-05-15T13:00:00Z", "2025-05-15T14:00:00Z", now);
    expect(futureStart.isActive).toBe(false);
    expect(futureStart.reason).toBe("not_started");

    const pastEnd = isExamActiveWindow("2025-05-15T09:00:00Z", "2025-05-15T11:00:00Z", now);
    expect(pastEnd.isActive).toBe(false);
    expect(pastEnd.reason).toBe("ended");

    const activeWindow = isExamActiveWindow("2025-05-15T10:00:00Z", "2025-05-15T14:00:00Z", now);
    expect(activeWindow.isActive).toBe(true);
  });

  it("evaluates answer correctness for auto-graded types", () => {
    const mcq = evaluateAnswerCorrectness("multiple_choice", "Option A", " option a ");
    expect(mcq.isAutoGraded).toBe(true);
    expect(mcq.isCorrect).toBe(true);

    const tf = evaluateAnswerCorrectness("true_false", "True", "False");
    expect(tf.isAutoGraded).toBe(true);
    expect(tf.isCorrect).toBe(false);

    const essay = evaluateAnswerCorrectness("essay", "Key terms", "My response");
    expect(essay.isAutoGraded).toBe(false);
  });
});
