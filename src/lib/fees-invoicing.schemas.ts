import { z } from "zod";

const amount = z.number().min(0).max(1_000_000_000);
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const date = z.string().trim().min(8).max(20);

export const billingRunSchema = z.object({
  academicYear: text(4, 20),
  period: text(2, 60),
  targetScope: z.enum(["all", "education_level", "class"]).default("all"),
  targetValue: z.string().trim().max(100).optional().default(""),
  dueDate: date.nullable().optional(),
  notes: z.string().trim().max(500).optional().default(""),
  customAmount: amount.optional(),
});

export const recordPaymentSchema = z.object({
  feeId: z.string().uuid(),
  amountPaid: z.number().positive().max(1_000_000_000),
  paymentMethod: z.string().trim().min(2).max(40).default("cash"),
  reference: z.string().trim().max(100).optional().default(""),
  entryDate: date,
  notes: z.string().trim().max(300).optional().default(""),
  postToIncome: z.boolean().default(true),
});

export const feeAdjustmentSchema = z.object({
  feeId: z.string().uuid(),
  adjustmentType: z.enum(["discount", "waiver", "penalty", "manual_override"]),
  amount: amount,
  reason: text(2, 300),
  newAmountDue: amount.optional(),
});

export const feeStructureInputSchema = z.object({
  code: text(2, 40),
  name: text(2, 100),
  feeCategory: text(2, 40),
  amount: amount,
  className: z.string().trim().max(60).optional().default(""),
  scope: z.enum(["active-period", "period", "academic-year", "one-time", "all-time"]).default("active-period"),
  period: z.string().trim().max(60).optional().default(""),
  levels: z.record(z.string(), z.number()).optional(),
});

export const ledgerQuerySchema = z.object({
  search: z.string().trim().optional().default(""),
  classFilter: z.string().trim().optional().default(""),
  statusFilter: z.string().trim().optional().default(""),
  termFilter: z.string().trim().optional().default(""),
});

export type BillingRunInput = z.infer<typeof billingRunSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type FeeAdjustmentInput = z.infer<typeof feeAdjustmentSchema>;
export type FeeStructureInput = z.infer<typeof feeStructureInputSchema>;
export type LedgerQueryInput = z.infer<typeof ledgerQuerySchema>;
