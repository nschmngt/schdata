import type { AcademicRules } from "@/lib/academic-rules";
import { num, findRule } from "@/lib/academic-rules";
import type { DayOfWeek, TimetableSlotInput } from "@/lib/timetable.schemas";

export interface PeriodSlot {
  periodNumber: number;
  startTime: string; // "08:00"
  endTime: string;   // "08:40"
  isBreak: boolean;
  label: string;
}

export function timeToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(":")) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatTime12h(timeStr: string): string {
  if (!timeStr) return "";
  const [hStr, mStr] = timeStr.split(":");
  let h = parseInt(hStr, 10);
  if (isNaN(h)) return timeStr;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mStr} ${ampm}`;
}

/**
 * Generates a standard daily period schedule grid according to central academic rules:
 * - `day-start`: e.g., "07:30" or "08:00"
 * - `lesson-length`: e.g., 40 minutes
 * - `lessons-per-day`: e.g., 8 lessons
 * - `break-length`: e.g., 30 minutes
 */
export function generateDailyGrid(
  rules: AcademicRules,
  breakAfterPeriod = 4,
): PeriodSlot[] {
  const dayStartRule = findRule(rules, "timetable", "day-start")?.value;
  const dayStartStr = typeof dayStartRule === "string" ? dayStartRule : "08:00";

  const lessonLength = num(rules, "timetable", "lesson-length") ?? 40;
  const lessonsPerDay = num(rules, "timetable", "lessons-per-day") ?? 8;
  const breakLength = num(rules, "timetable", "break-length") ?? 30;

  let currentMin = timeToMinutes(dayStartStr);
  const grid: PeriodSlot[] = [];

  for (let p = 1; p <= lessonsPerDay; p++) {
    const periodStart = minutesToTime(currentMin);
    const periodEnd = minutesToTime(currentMin + lessonLength);

    grid.push({
      periodNumber: p,
      startTime: periodStart,
      endTime: periodEnd,
      isBreak: false,
      label: `Period ${p}`,
    });

    currentMin += lessonLength;

    if (p === breakAfterPeriod) {
      const breakStart = minutesToTime(currentMin);
      const breakEnd = minutesToTime(currentMin + breakLength);
      grid.push({
        periodNumber: 0,
        startTime: breakStart,
        endTime: breakEnd,
        isBreak: true,
        label: "Break / Recess",
      });
      currentMin += breakLength;
    }
  }

  return grid;
}

export function checkTimeOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string,
): boolean {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);

  return Math.max(s1, s2) < Math.min(e1, e2);
}

export interface ConflictResult {
  hasConflict: boolean;
  conflictReason?: string;
  conflictingSlot?: TimetableSlotInput;
}

/**
 * Checks for scheduling conflicts against existing slots:
 * 1. Same class scheduled at the same day/time range.
 * 2. Same teacher double-booked at the same day/time range.
 * 3. Same room double-booked at the same day/time range.
 */
export function checkSlotConflict(
  newSlot: TimetableSlotInput,
  existingSlots: (TimetableSlotInput & { id?: string })[],
): ConflictResult {
  for (const slot of existingSlots) {
    if (newSlot.id && slot.id && newSlot.id === slot.id) {
      continue;
    }

    if (newSlot.dayOfWeek !== slot.dayOfWeek) {
      continue;
    }

    const overlap = checkTimeOverlap(
      newSlot.startTime,
      newSlot.endTime,
      slot.startTime,
      slot.endTime,
    );

    if (!overlap) {
      continue;
    }

    // 1. Class conflict
    if (
      newSlot.className.trim().toLowerCase() === slot.className.trim().toLowerCase()
    ) {
      return {
        hasConflict: true,
        conflictReason: `Class "${slot.className}" already has a scheduled slot (${slot.subject || slot.title || "event"}) from ${formatTime12h(slot.startTime)} to ${formatTime12h(slot.endTime)}.`,
        conflictingSlot: slot,
      };
    }

    // 2. Teacher conflict
    if (
      newSlot.teacherId &&
      slot.teacherId &&
      newSlot.teacherId === slot.teacherId
    ) {
      return {
        hasConflict: true,
        conflictReason: `Teacher is already assigned to class "${slot.className}" (${slot.subject}) from ${formatTime12h(slot.startTime)} to ${formatTime12h(slot.endTime)}.`,
        conflictingSlot: slot,
      };
    }

    // 3. Room conflict
    if (
      newSlot.roomNumber &&
      slot.roomNumber &&
      newSlot.roomNumber.trim().toLowerCase() === slot.roomNumber.trim().toLowerCase()
    ) {
      return {
        hasConflict: true,
        conflictReason: `Room "${slot.roomNumber}" is already in use by class "${slot.className}" from ${formatTime12h(slot.startTime)} to ${formatTime12h(slot.endTime)}.`,
        conflictingSlot: slot,
      };
    }
  }

  return { hasConflict: false };
}
