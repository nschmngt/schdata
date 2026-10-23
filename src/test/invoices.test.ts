import { describe, expect, it } from "vitest";
import {
  generateDocumentNumber,
  mapFeesToInvoices,
  calculateInvoiceSummary,
  filterInvoices,
  type NumberingTemplateConfig,
  type InvoiceRecord,
} from "../lib/invoices";
import {
  invoiceQuerySchema,
  recordInvoicePaymentSchema,
  issueInvoiceSchema,
  voidInvoiceSchema,
} from "../lib/invoices.schemas";
import type { StudentFeeRecord } from "../lib/fees-invoicing";

describe("Invoices Module - Pure Domain Logic & Formatting", () => {
  it("generates invoice numbers using configured numbering template", () => {
    const config: NumberingTemplateConfig = {
      format: "INV-{SCHOOL}-{YY}-{SEQ}",
      sequenceDigits: 4,
      sequenceStart: 1,
      schoolCode: "0012",
    };
    const testDate = new Date("2025-03-15");
    const num = generateDocumentNumber(config, 5, testDate);
    expect(num).toBe("INV-0012-25-0005");
  });

  it("maps raw student fee records to domain invoices and derived receipts", () => {
    const rawFees: StudentFeeRecord[] = [
      {
        id: "fee-1",
        admission_id: "adm-1",
        term: "2024/2025 - Term 1",
        amount_due: 1000,
        amount_paid: 400,
        status: "partially_paid",
        due_date: "2025-04-30",
        created_at: "2025-01-10T10:00:00Z",
        updated_at: "2025-01-10T10:00:00Z",
        admissions: {
          admission_number: "ADM-2025-001",
          student_name: "Kofi Mensah",
          class_admitted: "Primary 1",
        },
      },
      {
        id: "fee-2",
        admission_id: "adm-2",
        term: "2024/2025 - Term 1",
        amount_due: 1200,
        amount_paid: 1200,
        status: "paid",
        due_date: "2025-04-30",
        created_at: "2025-01-10T10:00:00Z",
        updated_at: "2025-01-10T10:00:00Z",
        admissions: {
          admission_number: "ADM-2025-002",
          student_name: "Ama Serwaa",
          class_admitted: "JHS 1",
        },
      },
    ];

    const { invoices, receipts } = mapFeesToInvoices(rawFees);

    expect(invoices.length).toBe(2);
    expect(invoices[0].studentName).toBe("Kofi Mensah");
    expect(invoices[0].levelCode).toBe("PRIMARY");
    expect(invoices[0].balance).toBe(600);

    expect(invoices[1].studentName).toBe("Ama Serwaa");
    expect(invoices[1].levelCode).toBe("JHS");
    expect(invoices[1].balance).toBe(0);

    expect(receipts.length).toBe(2);
    expect(receipts[0].amountPaid).toBe(400);
    expect(receipts[1].amountPaid).toBe(1200);
  });

  it("calculates accurate summary totals and collection rate", () => {
    const sampleInvoices: InvoiceRecord[] = [
      {
        id: "inv-1",
        invoiceNumber: "INV-0001-25-00001",
        admissionId: "adm-1",
        studentName: "Student A",
        admissionNumber: "ADM-001",
        className: "Primary 1",
        levelCode: "PRIMARY",
        term: "Term 1",
        issueDate: "2025-01-01",
        dueDate: "2025-02-01",
        amountDue: 1000,
        amountPaid: 1000,
        balance: 0,
        status: "paid",
        lineItems: [],
        createdAt: "2025-01-01",
      },
      {
        id: "inv-2",
        invoiceNumber: "INV-0001-25-00002",
        admissionId: "adm-2",
        studentName: "Student B",
        admissionNumber: "ADM-002",
        className: "Primary 2",
        levelCode: "PRIMARY",
        term: "Term 1",
        issueDate: "2025-01-01",
        dueDate: "2025-02-01",
        amountDue: 1000,
        amountPaid: 500,
        balance: 500,
        status: "partially_paid",
        lineItems: [],
        createdAt: "2025-01-01",
      },
    ];

    const summary = calculateInvoiceSummary(sampleInvoices, "2025-01-15");
    expect(summary.totalIssued).toBe(2000);
    expect(summary.totalCollected).toBe(1500);
    expect(summary.totalOutstanding).toBe(500);
    expect(summary.collectionRate).toBe(75);
  });

  it("filters invoices multi-dimensionally", () => {
    const sampleInvoices: InvoiceRecord[] = [
      {
        id: "inv-1",
        invoiceNumber: "INV-0001-25-00001",
        admissionId: "adm-1",
        studentName: "John Doe",
        admissionNumber: "ADM-001",
        className: "Primary 1",
        levelCode: "PRIMARY",
        term: "Term 1",
        issueDate: "2025-01-01",
        dueDate: "2025-02-01",
        amountDue: 1000,
        amountPaid: 0,
        balance: 1000,
        status: "pending",
        lineItems: [],
        createdAt: "2025-01-01",
      },
      {
        id: "inv-2",
        invoiceNumber: "INV-0001-25-00002",
        admissionId: "adm-2",
        studentName: "Jane Smith",
        admissionNumber: "ADM-002",
        className: "JHS 2",
        levelCode: "JHS",
        term: "Term 1",
        issueDate: "2025-01-01",
        dueDate: "2025-02-01",
        amountDue: 1500,
        amountPaid: 1500,
        balance: 0,
        status: "paid",
        lineItems: [],
        createdAt: "2025-01-01",
      },
    ];

    const searchResult = filterInvoices(sampleInvoices, { search: "jane" });
    expect(searchResult.length).toBe(1);
    expect(searchResult[0].studentName).toBe("Jane Smith");

    const levelResult = filterInvoices(sampleInvoices, { levelCode: "PRIMARY" });
    expect(levelResult.length).toBe(1);
    expect(levelResult[0].studentName).toBe("John Doe");
  });
});

describe("Invoices Module - Zod Schema Validations", () => {
  it("validates record payment schema", () => {
    const valid = recordInvoicePaymentSchema.safeParse({
      invoiceId: "inv-100",
      amountPaid: 250,
      paymentMethod: "bank-transfer",
      reference: "REF-12345",
    });
    expect(valid.success).toBe(true);

    const invalid = recordInvoicePaymentSchema.safeParse({
      invoiceId: "inv-100",
      amountPaid: -50,
      paymentMethod: "",
    });
    expect(invalid.success).toBe(false);
  });

  it("validates issue custom invoice schema", () => {
    const valid = issueInvoiceSchema.safeParse({
      admissionId: "adm-55",
      term: "2024/2025 - Term 1",
      lineItems: [
        { description: "Tuition Fee", feeCategory: "tuition", amount: 800 },
        { description: "ICT Lab Levy", feeCategory: "levy", amount: 150 },
      ],
    });
    expect(valid.success).toBe(true);

    const invalid = issueInvoiceSchema.safeParse({
      admissionId: "",
      term: "",
      lineItems: [],
    });
    expect(invalid.success).toBe(false);
  });

  it("validates void invoice schema", () => {
    const valid = voidInvoiceSchema.safeParse({
      invoiceId: "inv-200",
      reason: "Duplicate entry error",
    });
    expect(valid.success).toBe(true);

    const invalid = voidInvoiceSchema.safeParse({
      invoiceId: "inv-200",
      reason: "no",
    });
    expect(invalid.success).toBe(false);
  });
});
