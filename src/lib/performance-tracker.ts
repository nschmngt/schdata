/* ------------------------------------------------------------------ *
 * Performance Tracker Domain Models & Calculation Engine
 * Pure and browser-safe domain logic for academic intelligence,
 * cross-analytics, multi-dimension risk evaluation, and interventions.
 * ------------------------------------------------------------------ */

import { AcademicRules, assessmentWeights, categoryOf, percentOf } from "./academic-rules";
import { PerformanceRiskRules } from "./performance-tracker.schemas";

export interface ScoreItem {
  id?: string;
  admissionId: string;
  className: string;
  term: string;
  academicYear?: string;
  subject: string;
  assessmentType: string; // e.g., Exam, Homework, Quiz, Assignment, Classwork
  score: number;
  outOf: number;
  status?: "assessed" | "not_yet_assessed" | "not_submitted" | "ungraded" | "excused" | "absent";
  recordedAt?: string;
}

export interface AttendanceItem {
  admissionId: string;
  attendanceDate: string;
  status: "present" | "absent" | "late" | "excused";
}

export interface AssignmentSubmissionItem {
  assignmentId: string;
  admissionId: string;
  isLate: boolean;
  finalScore: number | null;
  dueDate?: string;
  submittedAt?: string;
}

export interface RawStudentData {
  id: string; // admission_id
  studentName: string;
  admissionNumber: string;
  className: string;
  gender: string;
  educationLevel?: string;
}

export interface RiskEvaluationResult {
  admissionId: string;
  studentName: string;
  className: string;
  gender: string;
  overallScore: number | null;
  attendanceRate: number | null;
  missingAssignmentRate: number | null;
  progressChange: number | null; // percentage change vs previous period
  riskSeverity: "none" | "low" | "medium" | "high" | "critical";
  activeDimensions: ("academic" | "attendance" | "engagement" | "progress")[];
  reasons: string[];
  dataSufficiency: {
    sufficientAssessment: boolean;
    sufficientAttendance: boolean;
    assessmentCoveragePercent: number;
    attendanceDaysRecorded: number;
    disclosures: string[];
  };
}

export interface GenderPerformanceSummary {
  gender: string;
  studentCount: number;
  disclosureRestricted: boolean;
  avgOverallScore: number | null;
  avgAttendanceRate: number | null;
  atRiskCount: number;
  atRiskPercent: number | null;
  proficiencyRate: number | null; // % of students with score >= pass mark
  subjectAverages: Record<string, number | null>;
}

export interface ClassSubjectCell {
  className: string;
  subject: string;
  avgScore: number | null;
  studentCount: number;
  passRate: number | null;
  completionRate: number | null;
}

export interface ProgressTrendPoint {
  period: string; // e.g. "2024-Term 1"
  label: string;
  avgScore: number | null;
  classAvgScore: number | null;
  attendanceRate: number | null;
}

export interface AssessmentTypeBreakdown {
  assessmentType: string;
  avgScorePercent: number | null;
  taskCount: number;
  assessedCount: number;
  ungradedCount: number;
}

/**
 * Calculates student's normalized subject total score considering weighted
 * classwork vs exam split configured in Academic Rules, strictly distinguishing
 * between unassessed, ungraded, excused, absent, and submitted records.
 */
export function calculateStudentSubjectScore(
  scores: ScoreItem[],
  subject: string,
  rules: AcademicRules,
): {
  totalPercent: number | null;
  classPercent: number | null;
  examPercent: number | null;
  taskCount: number;
  assessedCount: number;
  unassessedCount: number;
  excusedCount: number;
} {
  const subjectScores = scores.filter(
    (s) => s.subject.toLowerCase() === subject.toLowerCase(),
  );

  if (subjectScores.length === 0) {
    return {
      totalPercent: null,
      classPercent: null,
      examPercent: null,
      taskCount: 0,
      assessedCount: 0,
      unassessedCount: 0,
      excusedCount: 0,
    };
  }

  const { classWeight, examWeight } = assessmentWeights(rules);

  const classTasks: number[] = [];
  const examTasks: number[] = [];
  let assessedCount = 0;
  let unassessedCount = 0;
  let excusedCount = 0;

  for (const s of subjectScores) {
    if (s.status === "excused") {
      excusedCount++;
      continue;
    }

    if (s.status === "ungraded" || s.status === "not_yet_assessed") {
      unassessedCount++;
      continue; // Preserve grading policy: unassessed/ungraded items are NOT silently treated as zero
    }

    let scorePct = 0;
    if (s.status === "absent" || s.status === "not_submitted") {
      scorePct = 0; // Explicit non-submission or absent evaluation
      assessedCount++;
    } else {
      scorePct = percentOf(s.score, s.outOf);
      assessedCount++;
    }

    const cat = categoryOf(rules, s.assessmentType);
    if (cat === "class") {
      classTasks.push(scorePct);
    } else {
      examTasks.push(scorePct);
    }
  }

  const classAvg =
    classTasks.length > 0 ? classTasks.reduce((a, b) => a + b, 0) / classTasks.length : null;
  const examAvg =
    examTasks.length > 0 ? examTasks.reduce((a, b) => a + b, 0) / examTasks.length : null;

  if (classAvg === null && examAvg === null) {
    return {
      totalPercent: null,
      classPercent: null,
      examPercent: null,
      taskCount: assessedCount,
      assessedCount,
      unassessedCount,
      excusedCount,
    };
  }

  let totalPercent = 0;
  if (classAvg !== null && examAvg !== null) {
    totalPercent = (classAvg * classWeight) / 100 + (examAvg * examWeight) / 100;
  } else if (classAvg !== null) {
    totalPercent = classAvg;
  } else if (examAvg !== null) {
    totalPercent = examAvg;
  }

  return {
    totalPercent: Math.round(totalPercent * 10) / 10,
    classPercent: classAvg !== null ? Math.round(classAvg * 10) / 10 : null,
    examPercent: examAvg !== null ? Math.round(examAvg * 10) / 10 : null,
    taskCount: assessedCount,
    assessedCount,
    unassessedCount,
    excusedCount,
  };
}

/**
 * Calculates student's overall academic average across all subjects.
 */
export function calculateStudentOverallAverage(
  scores: ScoreItem[],
  subjects: string[],
  rules: AcademicRules,
): number | null {
  const percents: number[] = [];
  for (const subj of subjects) {
    const res = calculateStudentSubjectScore(scores, subj, rules);
    if (res.totalPercent !== null) {
      percents.push(res.totalPercent);
    }
  }
  if (percents.length === 0) return null;
  return Math.round((percents.reduce((a, b) => a + b, 0) / percents.length) * 10) / 10;
}

/**
 * Groups scores by assessment type (e.g. Exam, Quiz, Classwork, Homework, Assignment)
 * and calculates average performance for each assessment type.
 */
export function calculateAssessmentTypeBreakdown(
  scores: ScoreItem[],
): AssessmentTypeBreakdown[] {
  const typeMap = new Map<string, { scores: number[]; ungraded: number; total: number }>();

  for (const s of scores) {
    const typeKey = (s.assessmentType || "Classwork").trim();
    if (!typeMap.has(typeKey)) {
      typeMap.set(typeKey, { scores: [], ungraded: 0, total: 0 });
    }
    const entry = typeMap.get(typeKey)!;
    entry.total++;

    if (s.status === "excused") continue;
    if (s.status === "ungraded" || s.status === "not_yet_assessed") {
      entry.ungraded++;
      continue;
    }

    const pct = s.status === "absent" || s.status === "not_submitted" ? 0 : percentOf(s.score, s.outOf);
    entry.scores.push(pct);
  }

  const result: AssessmentTypeBreakdown[] = [];
  for (const [typeKey, data] of typeMap.entries()) {
    const avgScorePercent =
      data.scores.length > 0
        ? Math.round((data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 10) / 10
        : null;
    result.push({
      assessmentType: typeKey,
      avgScorePercent,
      taskCount: data.total,
      assessedCount: data.scores.length,
      ungradedCount: data.ungraded,
    });
  }

  return result.sort((a, b) => a.assessmentType.localeCompare(b.assessmentType));
}

/**
 * Calculates attendance rate percentage for a set of attendance records.
 * Returns null if no records exist (disclosing insufficient data rather than 0%).
 */
export function calculateAttendanceRate(records: AttendanceItem[]): {
  ratePercent: number | null;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
} {
  if (!records || records.length === 0) {
    return { ratePercent: null, totalDays: 0, presentDays: 0, absentDays: 0, lateDays: 0 };
  }

  let totalValid = 0;
  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;

  for (const r of records) {
    if (r.status === "excused") continue;
    totalValid++;
    if (r.status === "present") presentCount++;
    if (r.status === "late") {
      lateCount++;
      presentCount += 0.8; // Late counts as partial presence
    }
    if (r.status === "absent") absentCount++;
  }

  if (totalValid === 0) {
    return { ratePercent: null, totalDays: 0, presentDays: 0, absentDays: 0, lateDays: 0 };
  }

  const rate = Math.round((presentCount / totalValid) * 1000) / 10;
  return {
    ratePercent: Math.min(100, Math.max(0, rate)),
    totalDays: totalValid,
    presentDays: Math.round(presentCount),
    absentDays: absentCount,
    lateDays: lateCount,
  };
}

/**
 * Evaluates student risk across 4 dimensions: Academic, Attendance, Engagement, Progress.
 * Includes data sufficiency disclosures and traceable explanations.
 */
export function evaluateStudentRisk(
  student: RawStudentData,
  currentScores: ScoreItem[],
  previousScores: ScoreItem[] | null,
  attendanceRecords: AttendanceItem[],
  assignments: AssignmentSubmissionItem[],
  subjects: string[],
  academicRules: AcademicRules,
  riskRules: PerformanceRiskRules,
): RiskEvaluationResult {
  const overallScore = calculateStudentOverallAverage(currentScores, subjects, academicRules);
  const prevOverall = previousScores
    ? calculateStudentOverallAverage(previousScores, subjects, academicRules)
    : null;

  const attendance = calculateAttendanceRate(attendanceRecords);

  // Engagement risk: missing assignment rate
  let missingAssignmentsCount = 0;
  let totalAssigned = assignments.length;
  for (const a of assignments) {
    if (a.finalScore === null || a.submittedAt === undefined) {
      missingAssignmentsCount++;
    }
  }
  const missingAssignmentRate =
    totalAssigned > 0 ? Math.round((missingAssignmentsCount / totalAssigned) * 100) : 0;

  // Progress change percentage
  let progressChange: number | null = null;
  if (overallScore !== null && prevOverall !== null) {
    progressChange = Math.round((overallScore - prevOverall) * 10) / 10;
  }

  const activeDimensions: ("academic" | "attendance" | "engagement" | "progress")[] = [];
  const reasons: string[] = [];

  // 1. Academic Risk
  if (overallScore !== null && overallScore < riskRules.academicMinScore) {
    activeDimensions.push("academic");
    reasons.push(
      `Overall score (${overallScore}%) is below academic proficiency threshold (${riskRules.academicMinScore}%).`,
    );
  }

  // 2. Attendance Risk
  if (attendance.ratePercent !== null && attendance.ratePercent < riskRules.attendanceMinPercent) {
    activeDimensions.push("attendance");
    reasons.push(
      `Attendance rate (${attendance.ratePercent}%) is below minimum expected (${riskRules.attendanceMinPercent}%).`,
    );
  }

  // 3. Engagement Risk
  if (totalAssigned > 0 && missingAssignmentRate > riskRules.engagementMaxMissing) {
    activeDimensions.push("engagement");
    reasons.push(
      `Missing assignment rate (${missingAssignmentRate}%) exceeds max allowable missing (${riskRules.engagementMaxMissing}%).`,
    );
  }

  // 4. Progress Risk
  if (progressChange !== null && progressChange < -riskRules.progressMaxDecline) {
    activeDimensions.push("progress");
    reasons.push(
      `Academic performance declined by ${Math.abs(progressChange)}% compared to previous period (max allowed decline ${riskRules.progressMaxDecline}%).`,
    );
  }

  // Determine Severity
  let riskSeverity: "none" | "low" | "medium" | "high" | "critical" = "none";
  const count = activeDimensions.length;
  if (count === 1) riskSeverity = "low";
  else if (count === 2) riskSeverity = "medium";
  else if (count === 3) riskSeverity = "high";
  else if (count >= 4) riskSeverity = "critical";

  // Data Sufficiency Disclosures
  const disclosures: string[] = [];
  if (attendance.totalDays === 0) {
    disclosures.push("No attendance records logged for current period.");
  }
  if (currentScores.length === 0) {
    disclosures.push("No graded assessment records found.");
  }
  if (prevOverall === null) {
    disclosures.push("No previous period results available for longitudinal progress comparison.");
  }

  return {
    admissionId: student.id,
    studentName: student.studentName,
    className: student.className,
    gender: student.gender,
    overallScore,
    attendanceRate: attendance.ratePercent,
    missingAssignmentRate: totalAssigned > 0 ? missingAssignmentRate : null,
    progressChange,
    riskSeverity,
    activeDimensions,
    reasons,
    dataSufficiency: {
      sufficientAssessment: currentScores.length > 0,
      sufficientAttendance: attendance.totalDays > 0,
      assessmentCoveragePercent: currentScores.length > 0 ? 100 : 0,
      attendanceDaysRecorded: attendance.totalDays,
      disclosures,
    },
  };
}

/**
 * Applies privacy safeguards for gender-based aggregations:
 * Small-group disclosure protection masks sensitive aggregated scores if sample size < limit.
 */
export function formatGenderAggregation(
  gender: string,
  students: RawStudentData[],
  riskEvaluations: RiskEvaluationResult[],
  subjects: string[],
  minSampleSize = 3,
): GenderPerformanceSummary {
  const genderStudents = students.filter(
    (s) => s.gender.trim().toLowerCase() === gender.trim().toLowerCase(),
  );

  const studentCount = genderStudents.length;

  if (studentCount < minSampleSize) {
    return {
      gender,
      studentCount,
      disclosureRestricted: true,
      avgOverallScore: null,
      avgAttendanceRate: null,
      atRiskCount: 0,
      atRiskPercent: null,
      proficiencyRate: null,
      subjectAverages: {},
    };
  }

  const genderIds = new Set(genderStudents.map((s) => s.id));
  const genderRisks = riskEvaluations.filter((r) => genderIds.has(r.admissionId));

  const validScores = genderRisks
    .map((r) => r.overallScore)
    .filter((s): s is number => s !== null);
  const validAttendances = genderRisks
    .map((r) => r.attendanceRate)
    .filter((a): a is number => a !== null);

  const avgOverallScore =
    validScores.length > 0
      ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 10) / 10
      : null;

  const avgAttendanceRate =
    validAttendances.length > 0
      ? Math.round((validAttendances.reduce((a, b) => a + b, 0) / validAttendances.length) * 10) / 10
      : null;

  const atRiskCount = genderRisks.filter((r) => r.riskSeverity !== "none").length;
  const atRiskPercent =
    studentCount > 0 ? Math.round((atRiskCount / studentCount) * 100) : 0;

  const proficientCount = validScores.filter((s) => s >= 50).length;
  const proficiencyRate =
    validScores.length > 0 ? Math.round((proficientCount / validScores.length) * 100) : null;

  return {
    gender,
    studentCount,
    disclosureRestricted: false,
    avgOverallScore,
    avgAttendanceRate,
    atRiskCount,
    atRiskPercent,
    proficiencyRate,
    subjectAverages: {},
  };
}

/**
 * Calculates intervention effectiveness metrics given baseline and follow-up values.
 */
export function calculateInterventionEffectiveness(
  baselinePerf: number,
  baselineAtt: number,
  currentPerf: number | null,
  currentAtt: number | null,
  targetOutcome: string,
): {
  performanceDelta: number | null;
  attendanceDelta: number | null;
  targetAchieved: boolean;
  statusSummary: string;
} {
  const performanceDelta =
    currentPerf !== null ? Math.round((currentPerf - baselinePerf) * 10) / 10 : null;
  const attendanceDelta =
    currentAtt !== null ? Math.round((currentAtt - baselineAtt) * 10) / 10 : null;

  // Determine if target achieved based on target numeric value if present
  let targetAchieved = false;
  const targetNum = parseFloat(targetOutcome.replace(/[^0-9.]/g, ""));
  if (!isNaN(targetNum) && currentPerf !== null) {
    targetAchieved = currentPerf >= targetNum;
  } else if (performanceDelta !== null && performanceDelta > 0) {
    targetAchieved = true;
  }

  let statusSummary = "Awaiting outcome assessment.";
  if (performanceDelta !== null) {
    if (performanceDelta > 0) {
      statusSummary = `Improved by ${performanceDelta}% in overall performance.`;
    } else if (performanceDelta < 0) {
      statusSummary = `Declined by ${Math.abs(performanceDelta)}% since baseline.`;
    } else {
      statusSummary = `Performance unchanged from baseline (${baselinePerf}%).`;
    }
  }

  return {
    performanceDelta,
    attendanceDelta,
    targetAchieved,
    statusSummary,
  };
}
