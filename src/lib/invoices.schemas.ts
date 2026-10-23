import { z } from "zod";

export const invoiceQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional().default("all"),
  className: z.string().optional().default("all"),
  levelCode: z.string().optional().default("all"),
  term: z.string().optional().default("all"),
});

export const recordInvoicePaymentSchema = z.object({
  invoiceId: z.string().min(1, "Invoice ID is required"),
  amountPaid: z.number().positive("Payment amount must be greater than 0"),
  paymentMethod: z.string().min(1, "Payment method is required"),
  reference: z.string().optional(),
  entryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Entry date must be YYYY-MM-DD")
    .default(() => new Date().toISOString().slice(0, 10)),
  postToIncome: z.boolean().default(true),
});

export const invoiceLineItemSchema = z.object({
  description: z.string().min(1, "Line item description is required"),
  feeCategory: z.string().min(1, "Fee category is required").default("tuition"),
  amount: z.number().positive("Line item amount must be greater than 0"),
});

export const issueInvoiceSchema = z.object({
  admissionId: z.string().min(1, "Student admission ID is required"),
  term: z.string().min(1, "Term / period is required"),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be YYYY-MM-DD")
    .optional()
    .nullable(),
  lineItems: z
    .array(invoiceLineItemSchema)
    .min(1, "At least one line item is required"),
  notes: z.string().optional().nullable(),
});

export const voidInvoiceSchema = z.object({
  invoiceId: z.string().min(1, "Invoice ID is required"),
  reason: z.string().min(3, "Cancellation reason must be at least 3 characters"),
});

export type InvoiceQueryInput = z.infer<typeof invoiceQuerySchema>;
export type RecordInvoicePaymentInput = z.infer<typeof recordInvoicePaymentSchema>;
export type IssueInvoiceInput = z.infer<typeof issueInvoiceSchema>;
export type VoidInvoiceInput = z.infer<typeof voidInvoiceSchema>;
