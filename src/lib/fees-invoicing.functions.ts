import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, logAudit } from "@/lib/admin.server";
import { resolveProvisionedSchool } from "@/lib/school.server";
import { assertPeriodOpen, calendarPeriodEnd } from "@/lib/academic-calendar.server";
import { parseCalendar, currentPeriod, writeBlockReason, CALENDAR_FEATURE_KEY } from "@/lib/academic-calendar";
import { calculatePaymentStatus } from "@/lib/finance";
import { resolveApplicableFees, type FeeStructureItem } from "@/lib/fees-invoicing";
import {
  billingRunSchema,
  feeAdjustmentSchema,
  recordPaymentSchema,
} from "@/lib/fees-invoicing.schemas";
import { getActiveFinanceConfig } from "@/lib/finance-config.functions";

/** Returns all data needed by the Fees & Invoicing portal module. */
export const getFeesInvoicingOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabase } = context;

    const school = await resolveProvisionedSchool(supabase);
    const schoolId = school?.id ?? null;

    const [activeConfigRes, calRow, studentsRes, classesRes, feesRes, runsRes, userRes] = await Promise.all([
      getActiveFinanceConfig(),
      supabase.from("system_settings").select("payload").eq("feature_key", CALENDAR_FEATURE_KEY).maybeSingle(),
      supabase
        .from("admissions")
        .select("id, admission_number, student_name, class_admitted, status")
        .order("student_name"),
      supabase.from("school_classes").select("id, name, code, education_level").order("name"),
      supabase
        .from("student_fees")
        .select("*, admissions(admission_number, student_name, class_admitted)")
        .order("created_at", { ascending: false }),
      schoolId
        ? supabase
            .from("finance_billing_runs")
            .select("*")
            .eq("school_id", schoolId)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("profiles").select("role").eq("id", context.userId).single(),
    ]);

    const failure = studentsRes.error ?? classesRes.error ?? feesRes.error ?? runsRes.error;
    if (failure) throw new Error(failure.message);

    const academicCalendar = parseCalendar(calRow.data?.payload);
    const activePeriod = currentPeriod(academicCalendar);

    // Extract fee structures from active reference items & settings
    const rawStructures = (activeConfigRes.items ?? []).filter((i: any) => i.list_key === "fee-structures" && i.active);
    const feeStructures: FeeStructureItem[] = rawStructures.map((s: any) => {
      const meta = (s.metadata as Record<string, unknown> | null) ?? {};
      return {
        code: s.code,
        name: s.name,
        fee_category: String(meta["fee_category"] ?? "tuition"),
        amount: Number(meta["amount"] ?? 0),
        class_name: meta["class_name"] ? String(meta["class_name"]) : null,
        scope: meta["scope"] ? String(meta["scope"]) : "active-period",
        period: meta["period"] ? String(meta["period"]) : undefined,
        levels: (meta["levels"] as Record<string, number> | undefined) ?? undefined,
      };
    });

    const categories = (activeConfigRes.items ?? [])
      .filter((i: any) => i.list_key === "fee-categories" && i.active)
      .map((i: any) => ({ code: i.code, name: i.name }));

    return {
      school,
      schoolId,
      academicCalendar,
      activePeriod,
      configSettings: activeConfigRes.settings,
      feeStructures,
      categories,
      students: studentsRes.data ?? [],
      classes: classesRes.data ?? [],
      fees: feesRes.data ?? [],
      billingRuns: runsRes.data ?? [],
      userRole: userRes.data?.role ?? "school_manager",
    };
  });

/** Executes a batch billing run for students in target scope. */
export const executeBillingRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => billingRunSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabase } = context;

    // Check academic calendar lock status
    const calRow = await supabase
      .from("system_settings")
      .select("payload")
      .eq("feature_key", CALENDAR_FEATURE_KEY)
      .maybeSingle();
    const calendar = parseCalendar(calRow.data?.payload);
    const blockReason = writeBlockReason(calendar, { period: data.period });
    if (blockReason) throw new Error(blockReason);

    const school = await resolveProvisionedSchool(supabase);
    if (!school) throw new Error("No provisioned school context found.");

    // Fetch active students
    const { data: students, error: studErr } = await supabase
      .from("admissions")
      .select("id, admission_number, student_name, class_admitted, status");
    if (studErr) throw new Error(studErr.message);

    // Fetch active fee structures
    const activeConfigRes = await getActiveFinanceConfig();
    const rawStructures = (activeConfigRes.items ?? []).filter((i: any) => i.list_key === "fee-structures" && i.active);
    const structures: FeeStructureItem[] = rawStructures.map((s: any) => {
      const meta = (s.metadata as Record<string, unknown> | null) ?? {};
      return {
        code: s.code,
        name: s.name,
        fee_category: String(meta["fee_category"] ?? "tuition"),
        amount: Number(meta["amount"] ?? 0),
        class_name: meta["class_name"] ? String(meta["class_name"]) : null,
        scope: meta["scope"] ? String(meta["scope"]) : "active-period",
        period: meta["period"] ? String(meta["period"]) : undefined,
        levels: (meta["levels"] as Record<string, number> | undefined) ?? undefined,
      };
    });

    // Filter students based on targetScope
    const targetStudents = (students ?? []).filter((s) => {
      if (!s.class_admitted) return false;
      if (data.targetScope === "class" && data.targetValue) {
        return s.class_admitted.trim().toLowerCase() === data.targetValue.trim().toLowerCase();
      }
      return true;
    });

    if (targetStudents.length === 0) {
      throw new Error("No students match the specified scope for billing run.");
    }

    const defaultDueDate = data.dueDate || (await calendarPeriodEnd(supabase, data.period)) || null;

    let totalBilled = 0;
    let studentsBilledCount = 0;
    const feeInserts: Array<{
      admission_id: string;
      term: string;
      amount_due: number;
      amount_paid: number;
      due_date: string | null;
      status: string;
    }> = [];

    for (const student of targetStudents) {
      let amountDue = 0;
      if (data.customAmount !== undefined && data.customAmount > 0) {
        amountDue = data.customAmount;
      } else {
        const resolved = resolveApplicableFees(structures, student.class_admitted, null, data.period);
        amountDue = resolved.totalDue;
      }

      if (amountDue > 0) {
        feeInserts.push({
          admission_id: student.id,
          term: data.period,
          amount_due: amountDue,
          amount_paid: 0,
          due_date: defaultDueDate,
          status: "pending",
        });
        totalBilled += amountDue;
        studentsBilledCount++;
      }
    }

    if (feeInserts.length > 0) {
      const { error: insErr } = await supabase.from("student_fees").insert(feeInserts);
      if (insErr) throw new Error(insErr.message);
    }

    // Log the billing run record
    const { error: runErr } = await supabase.from("finance_billing_runs").insert({
      school_id: school.id,
      academic_year: data.academicYear,
      period: data.period,
      target_scope: data.targetScope,
      target_value: data.targetValue || null,
      student_count: studentsBilledCount,
      total_amount_billed: totalBilled,
      created_by: context.userId,
      notes: data.notes || `Batch billing run for ${studentsBilledCount} students`,
    });
    if (runErr) throw new Error(runErr.message);

    await logAudit(supabase, context.userId, {
      action: "billing_run_executed",
      description: `Executed billing run for ${data.period} (${data.targetScope})`,
      details: { student_count: studentsBilledCount, total_billed: totalBilled },
    });

    return {
      success: true,
      studentsBilled: studentsBilledCount,
      totalBilled,
    };
  });

/** Records a payment on a student fee record and optionally posts to income. */
export const recordFeePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recordPaymentSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabase } = context;

    // Fetch existing fee record
    const { data: fee, error: fetchErr } = await supabase
      .from("student_fees")
      .select("*, admissions(student_name, admission_number)")
      .eq("id", data.feeId)
      .single();

    if (fetchErr || !fee) throw new Error("Student fee record not found.");

    const existingPaid = Number(fee.amount_paid ?? 0);
    const newTotalPaid = existingPaid + data.amountPaid;
    const amountDue = Number(fee.amount_due ?? 0);
    const nextStatus = calculatePaymentStatus(newTotalPaid, amountDue, fee.due_date, data.entryDate);

    // Update fee record
    const { error: updateErr } = await supabase
      .from("student_fees")
      .update({
        amount_paid: newTotalPaid,
        status: nextStatus,
      })
      .eq("id", data.feeId);

    if (updateErr) throw new Error(updateErr.message);

    // Post to finance_income if requested
    if (data.postToIncome) {
      const studentInfo = fee.admissions
        ? `${fee.admissions.student_name} (${fee.admissions.admission_number})`
        : "Student";
      const paymentDesc = `Fee payment [${data.paymentMethod.toUpperCase()}] for ${studentInfo} — ${fee.term}`;

      await supabase.from("finance_income").insert({
        entry_date: data.entryDate,
        description: paymentDesc,
        category: "tuition",
        amount: data.amountPaid,
        status: "received",
        created_by: context.userId,
      });
    }

    await logAudit(supabase, context.userId, {
      action: "fee_payment_recorded",
      description: `Recorded fee payment of ${data.amountPaid} for fee record ${data.feeId}`,
      details: {
        fee_id: data.feeId,
        amount_paid: data.amountPaid,
        method: data.paymentMethod,
        reference: data.reference,
        new_total_paid: newTotalTotalPaid(newTotalPaid),
      },
    });

    return { ok: true, newTotalPaid, nextStatus };
  });

function newTotalTotalPaid(val: number) {
  return val;
}

/** Applies a fee discount, waiver, penalty, or amount override to a student fee record. */
export const applyFeeAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => feeAdjustmentSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabase } = context;

    const { data: fee, error: fetchErr } = await supabase
      .from("student_fees")
      .select("*")
      .eq("id", data.feeId)
      .single();

    if (fetchErr || !fee) throw new Error("Student fee record not found.");

    let currentDue = Number(fee.amount_due ?? 0);
    let nextDue = currentDue;

    if (data.adjustmentType === "discount" || data.adjustmentType === "waiver") {
      nextDue = Math.max(0, currentDue - data.amount);
    } else if (data.adjustmentType === "penalty") {
      nextDue = currentDue + data.amount;
    } else if (data.adjustmentType === "manual_override" && data.newAmountDue !== undefined) {
      nextDue = data.newAmountDue;
    }

    const amountPaid = Number(fee.amount_paid ?? 0);
    const nextStatus = calculatePaymentStatus(amountPaid, nextDue, fee.due_date);

    const { error: updateErr } = await supabase
      .from("student_fees")
      .update({
        amount_due: nextDue,
        status: nextStatus,
      })
      .eq("id", data.feeId);

    if (updateErr) throw new Error(updateErr.message);

    await logAudit(supabase, context.userId, {
      action: "fee_adjustment_applied",
      description: `Applied ${data.adjustmentType} of ${data.amount} to fee record ${data.feeId}`,
      details: {
        fee_id: data.feeId,
        adjustment_type: data.adjustmentType,
        amount: data.amount,
        reason: data.reason,
        previous_due: currentDue,
        new_due: nextDue,
      },
    });

    return { ok: true, previousDue: currentDue, newDue: nextDue, nextStatus };
  });
