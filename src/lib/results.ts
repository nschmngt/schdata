import { AcademicRules, assessmentWeights, categoryOf, gradeFromBands, GradeBand, percentOf } from "@/lib/academic-rules";
import { rankOf } from "@/lib/reports";
import { PublicationStatus } from "./results.schemas";

export interface StudentScoreRecord {
  admissionId: string;
  studentName: string;
  admissionNumber: string;
  subject: string;
  assessmentType: string;
  score: number;
  outOf: number;
}

export interface StudentSubjectSummary {
  subject: string;
  classWorkScore: number; // weighted classwork total
  examScore: number;      // weighted exam total
  totalScore: number;     // classWorkScore + examScore
  grade: string;
  gradeLevel: string;
  position: number;
}

export interface BroadsheetStudentRow {
  admissionId: string;
  studentName: string;
  admissionNumber: string;
  subjects: Record<string, StudentSubjectSummary>;
  overallTotal: number;
  overallAverage: number;
  position: number;
  status: "Pass" | "Fail";
}

export interface SubjectStats {
  subject: string;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  passCount: number;
  failCount: number;
  passPercentage: number;
}

export interface BroadsheetResult {
  term: string;
  className: string;
  subjects: string[];
  students: BroadsheetStudentRow[];
  subjectStats: Record<string, SubjectStats>;
  classAverage: number;
  totalStudents: number;
  published: boolean;
  publicationStatus: PublicationStatus;
}

/**
 * Calculates a full broadsheet matrix for a given set of students, subjects,
 * and recorded assessment scores according to centralized academic rules.
 */
export function calculateBroadsheetMatrix(
  term: string,
  className: string,
  students: { id: string; student_name: string; admission_number: string }[],
  subjectList: string[],
  scores: StudentScoreRecord[],
  rules: AcademicRules,
  publication: { status: PublicationStatus; withheldStudentIds: string[] } | null,
): BroadsheetResult {
  const { classWeight, examWeight } = assessmentWeights(rules);
  const passMark = rules.assessment.find((r) => r.key === "pass-mark")?.value;
  const numericPassMark = typeof passMark === "number" ? passMark : 50;

  // Group scores by student -> subject -> { classScores: [], examScores: [] }
  const studentSubjectMap = new Map<
    string,
    Map<string, { c: number[]; e: number[] }>
  >();

  for (const s of scores) {
    const pct = percentOf(s.score, s.outOf);
    const cat = categoryOf(rules, s.assessmentType);
    let subMap = studentSubjectMap.get(s.admissionId);
    if (!subMap) {
      subMap = new Map();
      studentSubjectMap.set(s.admissionId, subMap);
    }
    let cell = subMap.get(s.subject);
    if (!cell) {
      cell = { c: [], e: [] };
      subMap.set(s.subject, cell);
    }
    if (cat === "exam") {
      cell.e.push(pct);
    } else {
      cell.c.push(pct);
    }
  }

  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((acc, x) => acc + x, 0) / arr.length : 0;

  // Calculate subject summaries for each student
  const studentSummariesMap = new Map<string, Record<string, StudentSubjectSummary>>();
  const subjectTotalsMap = new Map<string, number[]>(); // subject -> array of totals for position ranking

  for (const student of students) {
    const subMap = studentSubjectMap.get(student.id) ?? new Map();
    const studentSubjects: Record<string, StudentSubjectSummary> = {};

    for (const sub of subjectList) {
      const cell = subMap.get(sub) ?? { c: [], e: [] };
      const cAvg = avg(cell.c);
      const eAvg = avg(cell.e);

      const classWorkScore = (cAvg * classWeight) / 100;
      const examScore = (eAvg * examWeight) / 100;
      const totalScore = classWorkScore + examScore;

      const g = gradeFromBands(rules.gradeBands, totalScore);

      studentSubjects[sub] = {
        subject: sub,
        classWorkScore: Math.round(classWorkScore * 10) / 10,
        examScore: Math.round(examScore * 10) / 10,
        totalScore: Math.round(totalScore * 10) / 10,
        grade: g.grade,
        gradeLevel: g.level,
        position: 0, // set later after subject totals are collected
      };

      const existingTotals = subjectTotalsMap.get(sub) ?? [];
      existingTotals.push(totalScore);
      subjectTotalsMap.set(sub, existingTotals);
    }

    studentSummariesMap.set(student.id, studentSubjects);
  }

  // Set position per subject per student
  for (const student of students) {
    const studentSubjects = studentSummariesMap.get(student.id)!;
    for (const sub of subjectList) {
      const subTotal = studentSubjects[sub].totalScore;
      const allTotals = subjectTotalsMap.get(sub) ?? [];
      studentSubjects[sub].position = rankOf(subTotal, allTotals);
    }
  }

  // Compute overall totals and student rankings
  const overallTotals = students.map((st) => {
    const subs = studentSummariesMap.get(st.id)!;
    return Object.values(subs).reduce((acc, item) => acc + item.totalScore, 0);
  });

  const studentRows: BroadsheetStudentRow[] = students.map((st, idx) => {
    const subs = studentSummariesMap.get(st.id)!;
    const studentSubValues = Object.values(subs);
    const overallTotal = overallTotals[idx];
    const count = studentSubValues.length || 1;
    const overallAverage = Math.round((overallTotal / count) * 10) / 10;
    const pos = rankOf(overallTotal, overallTotals);
    const status = overallAverage >= numericPassMark ? "Pass" : "Fail";

    return {
      admissionId: st.id,
      studentName: st.student_name,
      admissionNumber: st.admission_number,
      subjects: subs,
      overallTotal: Math.round(overallTotal * 10) / 10,
      overallAverage,
      position: pos,
      status,
    };
  });

  // Calculate subject level statistics across the class
  const subjectStats: Record<string, SubjectStats> = {};
  for (const sub of subjectList) {
    const totals = subjectTotalsMap.get(sub) ?? [];
    if (totals.length === 0) {
      subjectStats[sub] = {
        subject: sub,
        averageScore: 0,
        highestScore: 0,
        lowestScore: 0,
        passCount: 0,
        failCount: 0,
        passPercentage: 0,
      };
      continue;
    }

    const sum = totals.reduce((a, b) => a + b, 0);
    const averageScore = Math.round((sum / totals.length) * 10) / 10;
    const highestScore = Math.round(Math.max(...totals) * 10) / 10;
    const lowestScore = Math.round(Math.min(...totals) * 10) / 10;
    const passCount = totals.filter((t) => t >= numericPassMark).length;
    const failCount = totals.length - passCount;
    const passPercentage = Math.round((passCount / totals.length) * 100);

    subjectStats[sub] = {
      subject: sub,
      averageScore,
      highestScore,
      lowestScore,
      passCount,
      failCount,
      passPercentage,
    };
  }

  const classAvgSum = studentRows.reduce((a, r) => a + r.overallAverage, 0);
  const classAverage =
    studentRows.length > 0 ? Math.round((classAvgSum / studentRows.length) * 10) / 10 : 0;

  const pubStatus: PublicationStatus = publication?.status ?? "published";
  const isPublished = pubStatus === "published";

  return {
    term,
    className,
    subjects: subjectList,
    students: studentRows,
    subjectStats,
    classAverage,
    totalStudents: studentRows.length,
    published: isPublished,
    publicationStatus: pubStatus,
  };
}

/**
 * Determines whether a student or parent can view a specific result card / broadsheet row based on publication state.
 */
export function isResultVisibleToLearner(
  publicationStatus: PublicationStatus | null,
  withheldStudentIds: string[],
  studentAdmissionId: string,
  userRole: string,
): boolean {
  if (userRole === "super_admin" || userRole === "school_manager" || userRole === "staff") {
    return true;
  }
  if (!publicationStatus || publicationStatus !== "published") {
    return false;
  }
  if (withheldStudentIds.includes(studentAdmissionId)) {
    return false;
  }
  return true;
}
