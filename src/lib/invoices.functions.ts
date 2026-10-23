import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, logAudit } from "@/lib/admin.server";
import { resolveProvisionedSchool } from "@/lib/school.server";
import { assertPeriodOpen, calendarPeriodEnd } from "@/lib/academic-calendar.server";
import { parseCalendar, currentPeriod, writeBlockReason, CALENDAR_FEATURE_KEY } from "@/lib/academic-calendar";
import { calculatePaymentStatus } from "@/lib/finance";
import { getActiveFinanceConfig } from "@/lib/finance-config.functions";
import {
  DEFAULT_INVOICE_NUMBERING,
  DEFAULT_RECEIPT_NUMBERING,
  mapFeesToInvoices,
  calculateInvoiceSummary,
} from "@/lib/invoices";
import {
  issueInvoiceSchema,
  recordInvoicePaymentSchema,
  voidInvoiceSchema,
} from "@/lib/invoices.schemas";

/** Returns all server-side data needed by the Invoices portal module. */
export const getInvoicesOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabase } = context;

    const school = await resolveProvisionedSchool(supabase);
    const schoolId = school?.id ?? null;

    const [activeConfigRes, calRow, studentsRes, classesRes, feesRes, userRes] = await Promise.all([
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
      supabase.from("profiles").select("role").eq("id", context.userId).single(),
    ]);

    const failure = studentsRes.error ?? classesRes.error ?? feesRes.error;
    if (failure) throw new Error(failure.message);

    const academicCalendar = parseCalendar(calRow.data?.payload);
    const activePeriod = currentPeriod(academicCalendar);

    // Extract invoice and receipt numbering templates from active configuration
    const invSection = (activeConfigRes.sections ?? []).find((s: any) => s.section_key === "invoice-numbering");
    const rcptSection = (activeConfigRes.sections ?? []).find((s: any) => s.section_key === "receipts");

    const invPayload = invSection?.payload ?? {};
    const rcptPayload = rcptSection?.payload ?? {};

    const invoiceNumberingConfig = {
      format: String(invPayload["format"] ?? "INV-{YY}-{SEQ}"),
      sequenceDigits: Number(invPayload["sequence_digits"] ?? 5) || 5,
      sequenceStart: Number(invPayload["sequence_start"] ?? 1) || 1,
      schoolCode: school?.code || "0001",
    };

    const receiptNumberingConfig = {
      format: String(rcptPayload["numbering_format"] ?? "RCT-{YY}-{SEQ}"),
      sequenceDigits: Number(rcptPayload["sequence_digits"] ?? 5) || 5,
      sequenceStart: Number(rcptPayload["sequence_start"] ?? 1) || 1,
      schoolCode: school?.code || "0001",
    };

    const feeRecords = feesRes.data ?? [];
    const { invoices, receipts } = mapFeesToInvoices(
      feeRecords,
      invoiceNumberingConfig,
      receiptNumberingConfig,
    );

    const summary = calculateInvoiceSummary(invoices);

    const categories = (activeConfigRes.items ?? [])
      .filter((i: any) => i.list_key === "fee-categories" && i.active)
      .map((i: any) => ({ code: i.code, name: i.name }));

    const paymentMethods = (activeConfigRes.items ?? [])
      .filter((i: any) => i.list_key === "payment-methods" && i.active)
      .map((i: any) => ({ code: i.code, name: i.name }));

    return {
      school,
      schoolId,
      academicCalendar,
      activePeriod,
      configSettings: activeConfigRes.settings,
      invoiceNumberingConfig,
      receiptNumberingConfig,
      categories,
      paymentMethods,
      students: studentsRes.data ?? [],
      classes: classesRes.data ?? [],
      invoices,
      receipts,
      summary,
      userRole: userRes.data?.role ?? "school_manager",
    };
  });

/** Records a payment against an invoice and updates underlying fee status. */
export const recordInvoicePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recordInvoicePaymentSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabase } = context;

    // Fetch student fee row tied to invoice
    const { data: fee, error: fetchErr } = await supabase
      .from("student_fees")
      .select("*, admissions(student_name, admission_number)")
      .eq("id", data.invoiceId)
      .single();

    if (fetchErr || !fee) throw new Error("Invoice record not found.");

    if (fee.status === "void") {
      throw new Error("Cannot record payment against a voided invoice.");
    }

    // Check academic calendar lock
    const calRow = await supabase
      .from("system_settings")
      .select("payload")
      .eq("feature_key", CALENDAR_FEATURE_KEY)
      .maybeSingle();
    const calendar = parseCalendar(calRow.data?.payload);
    const blockReason = writeBlockReason(calendar, { period: fee.term });
    if (blockReason) throw new Error(blockReason);

    const existingPaid = Number(fee.amount_paid ?? 0);
    const newTotalPaid = existingPaid + data.amountPaid;
    const amountDue = Number(fee.amount_due ?? 0);
    const nextStatus = calculatePaymentStatus(newTotalPaid, amountDue, fee.due_date, data.entryDate);

    const { error: updateErr } = await supabase
      .from("student_fees")
      .update({
        amount_paid: newTotalPaid,
        status: nextStatus,
      })
      .eq("id", data.invoiceId);

    if (updateErr) throw new Error(updateErr.message);

    // Optionally post entry to finance_income
    if (data.postToIncome) {
      const studentInfo = fee.admissions
        ? `${fee.admissions.student_name} (${fee.admissions.admission_number})`
        : "Student";
      const paymentDesc = `Invoice payment [${data.paymentMethod.toUpperCase()}] for ${studentInfo} — ${fee.term}`;

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
      action: "invoice_payment_recorded",
      description: `Recorded invoice payment of ${data.amountPaid} for invoice ${data.invoiceId}`,
      details: {
        invoice_id: data.invoiceId,
        amount_paid: data.amountPaid,
        method: data.paymentMethod,
        reference: data.reference,
        new_total_paid: newTotalPaid,
        next_status: nextStatus,
      },
    });

    return { ok: true, newTotalPaid, nextStatus };
  });

/** Issues a new custom invoice for a student. */
export const issueInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => issueInvoiceSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabase } = context;

    // Check academic calendar lock
    const calRow = await supabase
      .from("system_settings")
      .select("payload")
      .eq("feature_key", CALENDAR_FEATURE_KEY)
      .maybeSingle();
    const calendar = parseCalendar(calRow.data?.payload);
    const blockReason = writeBlockReason(calendar, { period: data.term });
    if (blockReason) throw new Error(blockReason);

    const defaultDueDate = data.dueDate || (await calendarPeriodEnd(supabase, data.term)) || null;

    const totalAmount = data.lineItems.reduce((sum, item) => sum + item.amount, 0);

    const { data: newFee, error: insErr } = await supabase
      .from("student_fees")
      .insert({
        admission_id: data.admissionId,
        term: data.term,
        amount_due: totalAmount,
        amount_paid: 0,
        due_date: defaultDueDate,
        status: "pending",
      })
      .select()
      .single();

    if (insErr) throw new Error(insErr.message);

    await logAudit(supabase, context.userId, {
      action: "invoice_issued",
      description: `Issued invoice of ${totalAmount} for student admission ${data.admissionId}`,
      details: {
        fee_id: newFee.id,
        term: data.term,
        total_amount: totalAmount,
        line_items_count: data.lineItems.length,
      },
    });

    return { ok: true, feeId: newFee.id, totalAmount };
  });

/** Voids/cancels an existing invoice. */
export const voidInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => voidInvoiceSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabase } = context;

    const { data: fee, error: fetchErr } = await supabase
      .from("student_fees")
      .select("*")
      .eq("id", data.invoiceId)
      .single();

    if (fetchErr || !fee) throw new Error("Invoice record not found.");

    if (Number(fee.amount_paid ?? 0) > 0) {
      throw new Error("Cannot void an invoice that already has recorded payments. Reverse or refund payments first.");
    }

    const { error: updateErr } = await supabase
      .from("student_fees")
      .update({ status: "void" })
      .eq("id", data.invoiceId);

    if (updateErr) throw new Error(updateErr.message);

    await logAudit(supabase, context.userId, {
      action: "invoice_voided",
      description: `Voided invoice ${data.invoiceId}. Reason: ${data.reason}`,
      details: { invoice_id: data.invoiceId, reason: data.reason },
    });

    return { ok: true };
  });
