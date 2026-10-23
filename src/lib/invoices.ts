/* ------------------------------------------------------------------ *
 * Invoices Module Pure Domain Logic
 *
 * Centralized, browser-safe business logic for invoices, line items,
 * receipts generation, payment status evaluation, and financial summaries.
 * Aligned with Financial Configuration (Area 03 & Area 11).
 * ------------------------------------------------------------------ */

import { calculatePaymentStatus, type FeeStatus } from "./finance";
import { formatNumber, previewNumber } from "./numbering";
import { inferEducationLevel } from "./education-levels";
import type { StudentFeeRecord } from "./fees-invoicing";

export type InvoiceStatus = FeeStatus | "void";

export interface InvoiceLineItem {
  id: string;
  description: string;
  feeCategory: string;
  amount: number;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  admissionId: string;
  studentName: string;
  admissionNumber: string;
  className: string;
  levelCode: string;
  term: string;
  issueDate: string;
  dueDate: string | null;
  amountDue: number;
  amountPaid: number;
  balance: number;
  status: InvoiceStatus;
  lineItems: InvoiceLineItem[];
  notes?: string | null;
  createdAt: string;
}

export interface ReceiptRecord {
  id: string;
  receiptNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  studentName: string;
  admissionNumber: string;
  className: string;
  term: string;
  amountPaid: number;
  paymentMethod: string;
  reference?: string | null;
  entryDate: string;
  createdAt: string;
}

export interface InvoiceSummary {
  totalIssued: number;
  totalCollected: number;
  totalOutstanding: number;
  totalOverdue: number;
  totalInvoicesCount: number;
  paidCount: number;
  partiallyPaidCount: number;
  pendingCount: number;
  overdueCount: number;
  voidCount: number;
  collectionRate: number; // percentage 0-100
}

export interface NumberingTemplateConfig {
  format: string;
  sequenceDigits: number;
  sequenceStart: number;
  schoolCode?: string;
}

export const DEFAULT_INVOICE_NUMBERING: NumberingTemplateConfig = {
  format: "INV-{YY}-{SEQ}",
  sequenceDigits: 5,
  sequenceStart: 1,
  schoolCode: "0001",
};

export const DEFAULT_RECEIPT_NUMBERING: NumberingTemplateConfig = {
  format: "RCT-{YY}-{SEQ}",
  sequenceDigits: 5,
  sequenceStart: 1,
  schoolCode: "0001",
};

/**
 * Generates formatted invoice or receipt numbers based on configuration.
 */
export function generateDocumentNumber(
  config: NumberingTemplateConfig,
  sequence: number,
  date: Date = new Date(),
): string {
  return formatNumber({
    format: config.format || "INV-{YY}-{SEQ}",
    schoolCode: config.schoolCode || "0001",
    yearDigits: config.format.includes("{YY}") ? 2 : 0,
    sequenceDigits: config.sequenceDigits || 5,
    sequence: sequence,
    date,
  });
}

/**
 * Maps student fee database records into domain InvoiceRecords and derived ReceiptRecords.
 */
export function mapFeesToInvoices(
  feeRecords: StudentFeeRecord[],
  invoiceNumberingConfig: NumberingTemplateConfig = DEFAULT_INVOICE_NUMBERING,
  receiptNumberingConfig: NumberingTemplateConfig = DEFAULT_RECEIPT_NUMBERING,
  todayStr = new Date().toISOString().slice(0, 10),
): { invoices: InvoiceRecord[]; receipts: ReceiptRecord[] } {
  const invoices: InvoiceRecord[] = [];
  const receipts: ReceiptRecord[] = [];

  let seqCounter = invoiceNumberingConfig.sequenceStart;
  let receiptCounter = receiptNumberingConfig.sequenceStart;

  for (const r of feeRecords) {
    const due = Math.max(0, Number(r.amount_due) || 0);
    const paid = Math.max(0, Number(r.amount_paid) || 0);
    const balance = Math.max(0, due - paid);
    const rawStatus = (r.status as InvoiceStatus) || "pending";
    const status: InvoiceStatus =
      rawStatus === "void"
        ? "void"
        : calculatePaymentStatus(paid, due, r.due_date, todayStr);

    const issueDate = r.created_at ? r.created_at.slice(0, 10) : todayStr;
    const invNumber = generateDocumentNumber(invoiceNumberingConfig, seqCounter, new Date(issueDate));
    seqCounter++;

    const className = r.admissions?.class_admitted ?? "Unassigned";
    const levelCode = inferEducationLevel(className);

    const lineItems: InvoiceLineItem[] = [
      {
        id: `item-${r.id}-1`,
        description: `Tuition & Termly Fees (${r.term})`,
        feeCategory: "tuition",
        amount: due,
      },
    ];

    const invoiceObj: InvoiceRecord = {
      id: r.id,
      invoiceNumber: invNumber,
      admissionId: r.admission_id,
      studentName: r.admissions?.student_name ?? "Unknown Student",
      admissionNumber: r.admissions?.admission_number ?? "N/A",
      className,
      levelCode,
      term: r.term,
      issueDate,
      dueDate: r.due_date,
      amountDue: due,
      amountPaid: paid,
      balance,
      status,
      lineItems,
      createdAt: r.created_at,
    };

    invoices.push(invoiceObj);

    // If payment has been made, derive receipt record for ledger visibility
    if (paid > 0) {
      const receiptNumber = generateDocumentNumber(receiptNumberingConfig, receiptCounter, new Date(issueDate));
      receiptCounter++;

      receipts.push({
        id: `rcpt-${r.id}`,
        receiptNumber,
        invoiceId: r.id,
        invoiceNumber: invNumber,
        studentName: invoiceObj.studentName,
        admissionNumber: invoiceObj.admissionNumber,
        className: invoiceObj.className,
        term: r.term,
        amountPaid: paid,
        paymentMethod: "Bank/Cash/Mobile",
        reference: `PAY-${r.id.slice(0, 8)}`,
        entryDate: issueDate,
        createdAt: r.created_at,
      });
    }
  }

  return { invoices, receipts };
}

/**
 * Computes aggregated financial summaries for invoices.
 */
export function calculateInvoiceSummary(
  invoices: InvoiceRecord[],
  todayStr = new Date().toISOString().slice(0, 10),
): InvoiceSummary {
  let totalIssued = 0;
  let totalCollected = 0;
  let totalOutstanding = 0;
  let totalOverdue = 0;

  let paidCount = 0;
  let partiallyPaidCount = 0;
  let pendingCount = 0;
  let overdueCount = 0;
  let voidCount = 0;

  for (const inv of invoices) {
    if (inv.status === "void") {
      voidCount++;
      continue;
    }

    totalIssued += inv.amountDue;
    totalCollected += inv.amountPaid;
    totalOutstanding += inv.balance;

    const status = calculatePaymentStatus(inv.amountPaid, inv.amountDue, inv.dueDate, todayStr);

    if (status === "paid") {
      paidCount++;
    } else if (status === "partially_paid") {
      partiallyPaidCount++;
    } else if (status === "overdue") {
      overdueCount++;
      totalOverdue += inv.balance;
    } else {
      pendingCount++;
    }
  }

  const collectionRate = totalIssued > 0 ? Math.round((totalCollected / totalIssued) * 100) : 100;

  return {
    totalIssued,
    totalCollected,
    totalOutstanding,
    totalOverdue,
    totalInvoicesCount: invoices.length,
    paidCount,
    partiallyPaidCount,
    pendingCount,
    overdueCount,
    voidCount,
    collectionRate,
  };
}

/**
 * Multi-dimensional filter for invoices list.
 */
export function filterInvoices(
  invoices: InvoiceRecord[],
  filters: {
    search?: string;
    status?: string;
    className?: string;
    levelCode?: string;
    term?: string;
  },
): InvoiceRecord[] {
  const normSearch = (filters.search ?? "").trim().toLowerCase();
  const normStatus = (filters.status ?? "all").trim().toLowerCase();
  const normClass = (filters.className ?? "all").trim().toLowerCase();
  const normLevel = (filters.levelCode ?? "all").trim().toLowerCase();
  const normTerm = (filters.term ?? "all").trim().toLowerCase();

  return invoices.filter((inv) => {
    if (normStatus !== "all" && inv.status.toLowerCase() !== normStatus) {
      return false;
    }
    if (normClass !== "all" && inv.className.toLowerCase() !== normClass) {
      return false;
    }
    if (normLevel !== "all" && inv.levelCode.toLowerCase() !== normLevel) {
      return false;
    }
    if (normTerm !== "all" && inv.term.toLowerCase() !== normTerm) {
      return false;
    }

    if (normSearch) {
      const matchSearch =
        inv.invoiceNumber.toLowerCase().includes(normSearch) ||
        inv.studentName.toLowerCase().includes(normSearch) ||
        inv.admissionNumber.toLowerCase().includes(normSearch) ||
        inv.className.toLowerCase().includes(normSearch) ||
        inv.term.toLowerCase().includes(normSearch);
      if (!matchSearch) return false;
    }

    return true;
  });
}
