import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPeriodOpen, loadRules } from "@/lib/academic-calendar.server";
import { activeAssessmentTypes } from "@/lib/academic-rules";
import { assertTeaches, loadTeachingScope } from "@/lib/teaching.server";
import { calculateLatePenalty } from "@/lib/assignments";
import {
  assignmentGroupInputSchema,
  assignmentIdSchema,
  assignmentInputSchema,
  gradingInputSchema,
  regradeRequestInputSchema,
  reviewRegradeInputSchema,
  submissionInputSchema,
} from "@/lib/assignments.schemas";

/** Loads teacher teaching scope, active terms, active assessment types, and student catalog. */
export const getTeacherScopeData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await loadTeachingScope(context.supabase, context.userId);
    const rules = await loadRules(context.supabase);
    const types = activeAssessmentTypes(rules);

    let studentQuery = context.supabase
      .from("admissions")
      .select("id, admission_number, student_name, class_admitted, parent_name, parent_phone")
      .order("student_name");

    if (!scope.isAdmin && scope.classes.length > 0) {
      studentQuery = studentQuery.in("class_admitted", scope.classes);
    } else if (!scope.isAdmin && scope.classes.length === 0) {
      return { scope, types, students: [] };
    }

    const { data: students, error } = await studentQuery;
    if (error) throw new Error(error.message);

    return {
      scope,
      types,
      students: students ?? [],
    };
  });

/** List assignments scoped by user role. */
export const listAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await loadTeachingScope(context.supabase, context.userId);

    let query = context.supabase
      .from("assignments")
      .select("*, assignment_submissions(id, admission_id, group_id, submitted_at, graded_at, final_score)")
      .order("due_date", { ascending: false });

    if (!scope.isAdmin && scope.role === "staff") {
      if (scope.classes.length === 0) return [];
      query = query.in("class_name", scope.classes);
    } else if (scope.role === "student" || scope.role === "parent") {
      let studentClasses: string[] = [];
      if (scope.role === "student") {
        const { data: profile } = await context.supabase
          .from("profiles")
          .select("email, phone")
          .eq("id", context.userId)
          .maybeSingle();
        if (profile) {
          const { data: admission } = await context.supabase
            .from("admissions")
            .select("class_admitted")
            .or(`parent_phone.eq.${profile.phone || '___'},student_name.ilike.%${profile.email || '___'}%`)
            .limit(1);
          if (admission?.[0]?.class_admitted) {
            studentClasses = [admission[0].class_admitted];
          }
        }
      } else if (scope.role === "parent") {
        const { data: family } = await context.supabase
          .from("admissions")
          .select("class_admitted");
        studentClasses = [...new Set((family ?? []).map((f) => f.class_admitted))];
      }
      if (studentClasses.length > 0) {
        query = query.in("class_name", studentClasses);
      }
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      className: row.class_name,
      subject: row.subject,
      educationLevel: row.education_level,
      term: row.term,
      assessmentType: row.assessment_type,
      maxScore: Number(row.max_score),
      dueDate: row.due_date,
      submissionMode: row.submission_mode,
      submissionType: row.submission_type,
      allowLate: row.allow_late,
      lateGraceHours: Number(row.late_grace_hours),
      latePenaltyType: row.late_penalty_type,
      latePenaltyValue: Number(row.late_penalty_value),
      maxLatePenaltyPercent: Number(row.max_late_penalty_percent),
      cutoffDate: row.cutoff_date,
      createdBy: row.created_by,
      createdAt: row.created_at,
      totalSubmissions: row.assignment_submissions?.length ?? 0,
      totalGraded: row.assignment_submissions?.filter((s: { graded_at?: string | null }) => s.graded_at)?.length ?? 0,
      submissions: row.assignment_submissions ?? [],
    }));
  });

/** Get detailed assignment data including groups and submissions. */
export const getAssignmentDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => assignmentIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: assignment, error: aErr } = await context.supabase
      .from("assignments")
      .select("*")
      .eq("id", data.id)
      .single();
    if (aErr || !assignment) throw new Error("Assignment not found.");

    const { data: groups } = await context.supabase
      .from("assignment_groups")
      .select("*, assignment_group_members(id, admission_id, admissions(student_name, admission_number))")
      .eq("assignment_id", data.id);

    const { data: submissions } = await context.supabase
      .from("assignment_submissions")
      .select("*, admissions(student_name, admission_number), assignment_groups(group_name), assignment_regrade_requests(*)")
      .eq("assignment_id", data.id)
      .order("submitted_at", { ascending: false });

    return {
      assignment: {
        id: assignment.id,
        title: assignment.title,
        description: assignment.description,
        className: assignment.class_name,
        subject: assignment.subject,
        educationLevel: assignment.education_level,
        term: assignment.term,
        assessmentType: assignment.assessment_type,
        maxScore: Number(assignment.max_score),
        dueDate: assignment.due_date,
        submissionMode: assignment.submission_mode,
        submissionType: assignment.submission_type,
        allowLate: assignment.allow_late,
        lateGraceHours: Number(assignment.late_grace_hours),
        latePenaltyType: assignment.late_penalty_type,
        latePenaltyValue: Number(assignment.late_penalty_value),
        maxLatePenaltyPercent: Number(assignment.max_late_penalty_percent),
        cutoffDate: assignment.cutoff_date,
        createdBy: assignment.created_by,
        createdAt: assignment.created_at,
      },
      groups: (groups ?? []).map((g) => ({
        id: g.id,
        groupName: g.group_name,
        members: (g.assignment_group_members ?? []).map((m: {
          id: string;
          admission_id: string;
          admissions?: { student_name?: string; admission_number?: string | null } | null;
        }) => ({
          memberId: m.id,
          admissionId: m.admission_id,
          studentName: m.admissions?.student_name ?? "Unknown",
          admissionNumber: m.admissions?.admission_number ?? null,
        })),
      })),
      submissions: (submissions ?? []).map((s) => ({
        id: s.id,
        assignmentId: s.assignment_id,
        admissionId: s.admission_id,
        groupId: s.group_id,
        studentName: (s as { admissions?: { student_name?: string } | null }).admissions?.student_name ?? null,
        admissionNumber: (s as { admissions?: { admission_number?: string | null } | null }).admissions?.admission_number ?? null,
        groupName: (s as { assignment_groups?: { group_name?: string } | null }).assignment_groups?.group_name ?? null,
        submissionText: s.submission_text,
        attachmentUrl: s.attachment_url,
        submittedAt: s.submitted_at,
        isLate: s.is_late,
        lateHours: Number(s.late_hours),
        rawScore: s.raw_score !== null ? Number(s.raw_score) : null,
        latePenaltyApplied: Number(s.late_penalty_applied ?? 0),
        finalScore: s.final_score !== null ? Number(s.final_score) : null,
        feedback: s.feedback,
        gradedAt: s.graded_at,
        regradeRequests: (s as { assignment_regrade_requests?: any[] }).assignment_regrade_requests ?? [],
      })),
    };
  });

/** Create or update an assignment record. */
export const saveAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => assignmentInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPeriodOpen(context.supabase, { period: data.term });
    const scope = await loadTeachingScope(context.supabase, context.userId);
    assertTeaches(scope, data.className, data.subject);

    const rules = await loadRules(context.supabase);
    const types = activeAssessmentTypes(rules);
    if (!types.some((t) => t.toLowerCase() === data.assessmentType.toLowerCase())) {
      throw new Error(`"${data.assessmentType}" is not an active assessment type in Academic Configuration.`);
    }

    const row = {
      title: data.title,
      description: data.description,
      class_name: data.className,
      subject: data.subject,
      education_level: data.educationLevel,
      term: data.term,
      assessment_type: data.assessmentType,
      max_score: data.maxScore,
      due_date: new Date(data.dueDate).toISOString(),
      submission_mode: data.submissionMode,
      submission_type: data.submissionType,
      allow_late: data.allowLate,
      late_grace_hours: data.lateGraceHours,
      late_penalty_type: data.latePenaltyType,
      late_penalty_value: data.latePenaltyValue,
      max_late_penalty_percent: data.maxLatePenaltyPercent,
      cutoff_date: data.cutoffDate ? new Date(data.cutoffDate).toISOString() : null,
      created_by: context.userId,
    };

    if (data.id) {
      const { data: existing } = await context.supabase
        .from("assignments")
        .select("class_name, subject, term")
        .eq("id", data.id)
        .maybeSingle();
      if (existing) {
        await assertPeriodOpen(context.supabase, { period: existing.term });
        assertTeaches(scope, existing.class_name, existing.subject);
      }
      const { error } = await context.supabase
        .from("assignments")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id, updated: true };
    }

    const { data: inserted, error } = await context.supabase
      .from("assignments")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id, updated: false };
  });

/** Delete an assignment. */
export const deleteAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => assignmentIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const scope = await loadTeachingScope(context.supabase, context.userId);
    const { data: existing } = await context.supabase
      .from("assignments")
      .select("class_name, subject, term")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("Assignment not found.");

    await assertPeriodOpen(context.supabase, { period: existing.term });
    assertTeaches(scope, existing.class_name, existing.subject);

    const { error } = await context.supabase
      .from("assignments")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { deleted: true };
  });

/** Manage groups for a group assignment. */
export const manageAssignmentGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => assignmentGroupInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const scope = await loadTeachingScope(context.supabase, context.userId);
    const { data: assignment } = await context.supabase
      .from("assignments")
      .select("class_name, subject, term")
      .eq("id", data.assignmentId)
      .maybeSingle();

    if (!assignment) throw new Error("Assignment not found.");
    await assertPeriodOpen(context.supabase, { period: assignment.term });
    assertTeaches(scope, assignment.class_name, assignment.subject);

    const { data: group, error: gErr } = await context.supabase
      .from("assignment_groups")
      .insert({
        assignment_id: data.assignmentId,
        group_name: data.groupName,
      })
      .select("id")
      .single();

    if (gErr) throw new Error(gErr.message);

    const memberRows = data.admissionIds.map((admissionId) => ({
      group_id: group.id,
      admission_id: admissionId,
    }));

    const { error: mErr } = await context.supabase
      .from("assignment_group_members")
      .insert(memberRows);

    if (mErr) throw new Error(mErr.message);

    return { id: group.id, created: true };
  });

/** Student or group member submits work. */
export const submitAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submissionInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: assignment, error: aErr } = await context.supabase
      .from("assignments")
      .select("*")
      .eq("id", data.assignmentId)
      .single();

    if (aErr || !assignment) throw new Error("Assignment not found.");

    const submittedAt = new Date().toISOString();
    const penaltyCalc = calculateLatePenalty({
      dueDate: assignment.due_date,
      submittedAt,
      allowLate: assignment.allow_late,
      lateGraceHours: Number(assignment.late_grace_hours),
      latePenaltyType: assignment.late_penalty_type,
      latePenaltyValue: Number(assignment.late_penalty_value),
      maxLatePenaltyPercent: Number(assignment.max_late_penalty_percent),
      cutoffDate: assignment.cutoff_date,
      maxScore: Number(assignment.max_score),
    });

    if (penaltyCalc.isPastCutoff) {
      throw new Error("Submissions for this assignment are closed as the deadline or cutoff period has passed.");
    }

    let resolvedAdmissionId = data.admissionId ?? null;
    if (!resolvedAdmissionId && !data.groupId) {
      const { data: profile } = await context.supabase
        .from("profiles")
        .select("email, phone")
        .eq("id", context.userId)
        .maybeSingle();

      if (profile) {
        const { data: studentRecord } = await context.supabase
          .from("admissions")
          .select("id")
          .or(`parent_phone.eq.${profile.phone || '___'},student_name.ilike.%${profile.email || '___'}%`)
          .limit(1)
          .maybeSingle();
        if (studentRecord) resolvedAdmissionId = studentRecord.id;
      }
    }

    const submissionRow = {
      assignment_id: data.assignmentId,
      admission_id: resolvedAdmissionId,
      group_id: data.groupId ?? null,
      submission_text: data.submissionText,
      attachment_url: data.attachmentUrl,
      submitted_at: submittedAt,
      submitted_by: context.userId,
      is_late: penaltyCalc.isLate,
      late_hours: penaltyCalc.totalLateHours,
    };

    const { data: inserted, error } = await context.supabase
      .from("assignment_submissions")
      .insert(submissionRow)
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: inserted.id, submitted: true };
  });

/** Teacher grades a submission and optionally syncs grade to assessment records. */
export const gradeSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => gradingInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: submission, error: sErr } = await context.supabase
      .from("assignment_submissions")
      .select("*, assignments(*)")
      .eq("id", data.submissionId)
      .single();

    if (sErr || !submission || !submission.assignments) throw new Error("Submission not found.");

    const assignment = submission.assignments;
    const scope = await loadTeachingScope(context.supabase, context.userId);
    assertTeaches(scope, assignment.class_name, assignment.subject);
    await assertPeriodOpen(context.supabase, { period: assignment.term });

    const penaltyCalc = calculateLatePenalty({
      dueDate: assignment.due_date,
      submittedAt: submission.submitted_at,
      allowLate: assignment.allow_late,
      lateGraceHours: Number(assignment.late_grace_hours),
      latePenaltyType: assignment.late_penalty_type,
      latePenaltyValue: Number(assignment.late_penalty_value),
      maxLatePenaltyPercent: Number(assignment.max_late_penalty_percent),
      cutoffDate: assignment.cutoff_date,
      maxScore: Number(assignment.max_score),
      rawScore: data.rawScore,
    });

    const finalScore = penaltyCalc.finalScore ?? data.rawScore;

    const { error: uErr } = await context.supabase
      .from("assignment_submissions")
      .update({
        raw_score: data.rawScore,
        late_penalty_applied: penaltyCalc.penaltyApplied,
        final_score: finalScore,
        feedback: data.feedback,
        graded_at: new Date().toISOString(),
        graded_by: context.userId,
      })
      .eq("id", data.submissionId);

    if (uErr) throw new Error(uErr.message);

    // Sync grade to student_assessments if requested
    if (data.syncToAssessment && finalScore !== null) {
      let admissionIds: string[] = [];
      if (submission.admission_id) {
        admissionIds = [submission.admission_id];
      } else if (submission.group_id) {
        const { data: members } = await context.supabase
          .from("assignment_group_members")
          .select("admission_id")
          .eq("group_id", submission.group_id);
        admissionIds = (members ?? []).map((m) => m.admission_id);
      }

      for (const admissionId of admissionIds) {
        await context.supabase.from("student_assessments").insert({
          admission_id: admissionId,
          class_name: assignment.class_name,
          term: assignment.term,
          subject: assignment.subject,
          assessment_type: assignment.assessment_type,
          score: finalScore,
          out_of: Number(assignment.max_score),
          remark: `${assignment.title}${data.feedback ? `: ${data.feedback}` : ""}`,
        });
      }
    }

    return { graded: true, finalScore, penaltyApplied: penaltyCalc.penaltyApplied };
  });

/** Student submits a regrade request for a graded submission. */
export const requestRegrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => regradeRequestInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: submission, error: sErr } = await context.supabase
      .from("assignment_submissions")
      .select("id, graded_at, submitted_by, admission_id, group_id")
      .eq("id", data.submissionId)
      .single();

    if (sErr || !submission) throw new Error("Submission not found.");
    if (!submission.graded_at) throw new Error("Cannot request a regrade on an ungraded submission.");

    // Enforce ownership: verify user submitted work or belongs to the group / admission
    const isOwner = submission.submitted_by === context.userId;
    let isMember = false;

    if (!isOwner && submission.group_id) {
      const { data: groupMember } = await context.supabase
        .from("assignment_group_members")
        .select("id, admissions(id)")
        .eq("group_id", submission.group_id);

      if (groupMember && groupMember.length > 0) {
        const { data: profile } = await context.supabase
          .from("profiles")
          .select("email, phone")
          .eq("id", context.userId)
          .maybeSingle();

        if (profile) {
          const { data: studentRecord } = await context.supabase
            .from("admissions")
            .select("id")
            .or(`parent_phone.eq.${profile.phone || "___"},student_name.ilike.%${profile.email || "___"}%`)
            .maybeSingle();

          if (studentRecord) {
            isMember = groupMember.some((m: any) => m.admissions?.id === studentRecord.id);
          }
        }
      }
    }

    if (!isOwner && !isMember) {
      throw new Error("Unauthorized: You can only request a regrade on your own assignment submission.");
    }

    const { data: inserted, error } = await context.supabase
      .from("assignment_regrade_requests")
      .insert({
        submission_id: data.submissionId,
        student_id: context.userId,
        reason: data.reason,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new Error("You have already submitted a regrade request for this submission.");
      }
      throw new Error(error.message);
    }

    return { id: inserted.id, requested: true };
  });

/** Teacher or Admin reviews, approves/rejects a regrade request, and optionally updates score. */
export const reviewRegradeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reviewRegradeInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: request, error: rErr } = await context.supabase
      .from("assignment_regrade_requests")
      .select("*, assignment_submissions(*, assignments(*))")
      .eq("id", data.regradeRequestId)
      .single();

    if (rErr || !request || !request.assignment_submissions || !request.assignment_submissions.assignments) {
      throw new Error("Regrade request not found.");
    }

    const submission = request.assignment_submissions;
    const assignment = submission.assignments;
    const scope = await loadTeachingScope(context.supabase, context.userId);
    assertTeaches(scope, assignment.class_name, assignment.subject);
    await assertPeriodOpen(context.supabase, { period: assignment.term });

    const now = new Date().toISOString();

    const { error: uReqErr } = await context.supabase
      .from("assignment_regrade_requests")
      .update({
        status: data.status,
        teacher_response: data.teacherResponse,
        reviewed_by: context.userId,
        reviewed_at: now,
      })
      .eq("id", data.regradeRequestId);

    if (uReqErr) throw new Error(uReqErr.message);

    let updatedFinalScore: number | null = null;

    if (data.status === "approved" && data.newRawScore !== undefined && data.newRawScore !== null) {
      const penaltyCalc = calculateLatePenalty({
        dueDate: assignment.due_date,
        submittedAt: submission.submitted_at,
        allowLate: assignment.allow_late,
        lateGraceHours: Number(assignment.late_grace_hours),
        latePenaltyType: assignment.late_penalty_type,
        latePenaltyValue: Number(assignment.late_penalty_value),
        maxLatePenaltyPercent: Number(assignment.max_late_penalty_percent),
        cutoffDate: assignment.cutoff_date,
        maxScore: Number(assignment.max_score),
        rawScore: data.newRawScore,
      });

      updatedFinalScore = penaltyCalc.finalScore ?? data.newRawScore;

      const { error: uSubErr } = await context.supabase
        .from("assignment_submissions")
        .update({
          raw_score: data.newRawScore,
          late_penalty_applied: penaltyCalc.penaltyApplied,
          final_score: updatedFinalScore,
          feedback: data.teacherResponse ? `${submission.feedback}\n[Regrade Note]: ${data.teacherResponse}` : submission.feedback,
          graded_at: now,
          graded_by: context.userId,
        })
        .eq("id", submission.id);

      if (uSubErr) throw new Error(uSubErr.message);

      if (data.syncToAssessment && updatedFinalScore !== null) {
        let admissionIds: string[] = [];
        if (submission.admission_id) {
          admissionIds = [submission.admission_id];
        } else if (submission.group_id) {
          const { data: members } = await context.supabase
            .from("assignment_group_members")
            .select("admission_id")
            .eq("group_id", submission.group_id);
          admissionIds = (members ?? []).map((m) => m.admission_id);
        }

        for (const admissionId of admissionIds) {
          await context.supabase.from("student_assessments").insert({
            admission_id: admissionId,
            class_name: assignment.class_name,
            term: assignment.term,
            subject: assignment.subject,
            assessment_type: assignment.assessment_type,
            score: updatedFinalScore,
            out_of: Number(assignment.max_score),
            remark: `${assignment.title} (Regrade Approved)${data.teacherResponse ? `: ${data.teacherResponse}` : ""}`,
          });
        }
      }
    }

    return { reviewed: true, status: data.status, updatedFinalScore };
  });
