import { describe, it, expect } from "vitest";
import { defaultRules } from "@/lib/academic-rules";
import {
  timetableSlotInputSchema,
  slotIdSchema,
  inlineQuizInputSchema,
} from "@/lib/timetable.schemas";
import {
  generateDailyGrid,
  timeToMinutes,
  minutesToTime,
  formatTime12h,
  checkTimeOverlap,
  checkSlotConflict,
} from "@/lib/timetable";

describe("Timetable Schemas", () => {
  it("validates valid slot input payload", () => {
    const validPayload = {
      term: "Term 1",
      className: "JHS 1",
      subject: "Mathematics",
      dayOfWeek: "monday",
      startTime: "08:00",
      endTime: "08:40",
      roomNumber: "Room 101",
      eventType: "class",
    };

    const parsed = timetableSlotInputSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
  });

  it("rejects slot when end time is before or equal to start time", () => {
    const invalidPayload = {
      className: "JHS 1",
      subject: "Mathematics",
      dayOfWeek: "monday",
      startTime: "09:00",
      endTime: "08:30",
      eventType: "class",
    };

    const parsed = timetableSlotInputSchema.safeParse(invalidPayload);
    expect(parsed.success).toBe(false);
  });

  it("rejects quiz event type without quizId or inlineQuiz", () => {
    const quizPayload = {
      className: "JHS 1",
      subject: "Mathematics",
      dayOfWeek: "monday",
      startTime: "08:00",
      endTime: "08:40",
      eventType: "quiz",
    };

    const parsed = timetableSlotInputSchema.safeParse(quizPayload);
    expect(parsed.success).toBe(false);
  });

  it("validates inline quiz creation schema", () => {
    const validQuiz = {
      title: "Pop Quiz 1",
      description: "Quick check",
      durationMinutes: 20,
      totalMarks: 10,
      passMark: 5,
      questions: [
        {
          questionText: "What is 2 + 2?",
          questionType: "multiple_choice",
          points: 5,
          options: ["2", "3", "4", "5"],
          correctAnswer: "4",
        },
      ],
    };

    const parsed = inlineQuizInputSchema.safeParse(validQuiz);
    expect(parsed.success).toBe(true);
  });

  it("validates exam and upcoming_event slot types", () => {
    const examSlot = {
      term: "Term 1",
      className: "JHS 1",
      subject: "Science",
      dayOfWeek: "wednesday",
      startTime: "10:00",
      endTime: "11:30",
      eventType: "exam",
      quizId: "33333333-3333-3333-3333-333333333333",
    };
    expect(timetableSlotInputSchema.safeParse(examSlot).success).toBe(true);

    const eventSlot = {
      term: "Term 1",
      className: "JHS 1",
      subject: "General",
      dayOfWeek: "friday",
      startTime: "14:00",
      endTime: "15:00",
      eventType: "upcoming_event",
      title: "Science Exhibition",
    };
    expect(timetableSlotInputSchema.safeParse(eventSlot).success).toBe(true);
  });
});

describe("Timetable Helpers & Academic Grid", () => {
  it("converts time to minutes and back accurately", () => {
    expect(timeToMinutes("08:30")).toBe(510);
    expect(minutesToTime(510)).toBe("08:30");
    expect(formatTime12h("14:15")).toBe("2:15 PM");
    expect(formatTime12h("09:05")).toBe("9:05 AM");
  });

  it("generates daily grid based on academic rules", () => {
    const rules = defaultRules();
    const grid = generateDailyGrid(rules, 4);

    expect(grid.length).toBe(9); // 8 lessons + 1 break
    expect(grid[0].startTime).toBe("07:30");
    expect(grid[0].endTime).toBe("08:10");
    expect(grid[4].isBreak).toBe(true);
    expect(grid[4].label).toBe("Break / Recess");
  });

  it("detects time overlap correctly", () => {
    expect(checkTimeOverlap("08:00", "09:00", "08:30", "09:30")).toBe(true);
    expect(checkTimeOverlap("08:00", "09:00", "09:00", "10:00")).toBe(false);
    expect(checkTimeOverlap("08:00", "10:00", "08:30", "09:30")).toBe(true);
  });

  it("detects class, teacher, and room scheduling conflicts", () => {
    const existingSlots = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        term: "Term 1",
        className: "Class A",
        subject: "English",
        dayOfWeek: "monday" as const,
        startTime: "08:00",
        endTime: "09:00",
        roomNumber: "Room 101",
        teacherId: "22222222-2222-2222-2222-222222222222",
        eventType: "class" as const,
      },
    ];

    // Same class conflict
    const classConflict = checkSlotConflict(
      {
        term: "Term 1",
        className: "Class A",
        subject: "Math",
        dayOfWeek: "monday",
        startTime: "08:30",
        endTime: "09:30",
        eventType: "class",
      },
      existingSlots,
    );
    expect(classConflict.hasConflict).toBe(true);
    expect(classConflict.conflictReason).toContain("Class \"Class A\" already has a scheduled slot");

    // Teacher double-booking conflict
    const teacherConflict = checkSlotConflict(
      {
        term: "Term 1",
        className: "Class B",
        subject: "Math",
        dayOfWeek: "monday",
        startTime: "08:30",
        endTime: "09:30",
        teacherId: "22222222-2222-2222-2222-222222222222",
        eventType: "class",
      },
      existingSlots,
    );
    expect(teacherConflict.hasConflict).toBe(true);
    expect(teacherConflict.conflictReason).toContain("Teacher is already assigned");

    // Room double-booking conflict
    const roomConflict = checkSlotConflict(
      {
        term: "Term 1",
        className: "Class C",
        subject: "Science",
        dayOfWeek: "monday",
        startTime: "08:30",
        endTime: "09:30",
        roomNumber: "Room 101",
        eventType: "class",
      },
      existingSlots,
    );
    expect(roomConflict.hasConflict).toBe(true);
    expect(roomConflict.conflictReason).toContain("Room \"Room 101\" is already in use");

    // No conflict (different day)
    const noConflict = checkSlotConflict(
      {
        term: "Term 1",
        className: "Class A",
        subject: "Math",
        dayOfWeek: "tuesday",
        startTime: "08:00",
        endTime: "09:00",
        eventType: "class",
      },
      existingSlots,
    );
    expect(noConflict.hasConflict).toBe(false);
  });
});
