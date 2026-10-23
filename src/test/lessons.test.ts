import { describe, expect, it } from "vitest";
import { parseVideoUrl, calculateLessonProgress } from "@/lib/lessons";
import {
  lessonInputSchema,
  lessonStatusSchema,
  completeLessonSchema,
  inlineQuizInputSchema,
} from "@/lib/lessons.schemas";

describe("Lessons Module - Video URL Parser", () => {
  it("correctly parses YouTube standard and short URLs", () => {
    const std = parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(std.isValid).toBe(true);
    expect(std.type).toBe("youtube");
    expect(std.embedUrl).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&autoplay=0");

    const short = parseVideoUrl("https://youtu.be/dQw4w9WgXcQ");
    expect(short.isValid).toBe(true);
    expect(short.type).toBe("youtube");
    expect(short.embedUrl).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&autoplay=0");
  });

  it("correctly parses Vimeo video URLs", () => {
    const vimeo = parseVideoUrl("https://vimeo.com/123456789");
    expect(vimeo.isValid).toBe(true);
    expect(vimeo.type).toBe("vimeo");
    expect(vimeo.embedUrl).toBe("https://player.vimeo.com/video/123456789");
  });

  it("handles direct video files and direct HTTP URLs", () => {
    const mp4 = parseVideoUrl("https://cdn.example.com/videos/lesson1.mp4");
    expect(mp4.isValid).toBe(true);
    expect(mp4.type).toBe("direct");
    expect(mp4.embedUrl).toBe("https://cdn.example.com/videos/lesson1.mp4");

    const web = parseVideoUrl("https://example.com/lesson-stream");
    expect(web.isValid).toBe(true);
    expect(web.type).toBe("unknown");
    expect(web.embedUrl).toBe("https://example.com/lesson-stream");
  });

  it("returns invalid metadata for empty or malformed input", () => {
    const empty = parseVideoUrl("");
    expect(empty.isValid).toBe(false);
    expect(empty.type).toBe("unknown");
    expect(empty.embedUrl).toBeNull();
  });
});

describe("Lessons Module - Progress Metrics Calculation", () => {
  it("calculates 100% completion for empty lesson lists", () => {
    const res = calculateLessonProgress([], []);
    expect(res.total).toBe(0);
    expect(res.completed).toBe(0);
    expect(res.percent).toBe(100);
  });

  it("calculates accurate percentage for partial student completions", () => {
    const lessons = [{ id: "l1" }, { id: "l2" }, { id: "l3" }, { id: "l4" }];
    const completions = [{ lesson_id: "l1" }, { lesson_id: "l3" }];

    const res = calculateLessonProgress(lessons, completions);
    expect(res.total).toBe(4);
    expect(res.completed).toBe(2);
    expect(res.percent).toBe(50);
  });
});

describe("Lessons Module - Zod Input Schema Validation", () => {
  it("accepts valid lesson input payload", () => {
    const valid = lessonInputSchema.safeParse({
      title: "Algebraic Expressions",
      description: "Learn terms and variables",
      content: "Detailed text content...",
      className: "Primary 5",
      subject: "Mathematics",
      term: "Term 1",
      introVideoUrl: "https://youtu.be/dQw4w9WgXcQ",
      status: "published",
    });

    expect(valid.success).toBe(true);
  });

  it("rejects lesson creation when title, className or subject are missing", () => {
    const invalid = lessonInputSchema.safeParse({
      title: "",
      className: "",
      subject: "Mathematics",
      term: "Term 1",
    });

    expect(invalid.success).toBe(false);
  });

  it("validates inline quiz input schema", () => {
    const validQuiz = inlineQuizInputSchema.safeParse({
      title: "Quick Check Quiz",
      description: "5 minute check",
      durationMinutes: 10,
      totalMarks: 20,
      passMark: 10,
      questions: [
        {
          questionText: "What is 2 + 2?",
          questionType: "multiple_choice",
          points: 10,
          options: ["3", "4", "5"],
          correctAnswer: "4",
        },
      ],
    });

    expect(validQuiz.success).toBe(true);
  });

  it("validates complete lesson schema", () => {
    const valid = completeLessonSchema.safeParse({
      lessonId: "123e4567-e89b-12d3-a456-426614174000",
    });

    expect(valid.success).toBe(true);
  });
});
