import { describe, expect, it } from "vitest";
import { calculatePaymentStatus, FEE_STATUSES } from "@/lib/finance";
import { feeSchema, feeUpdateSchema } from "@/lib/finance.schemas";

describe("Financial Management payment status automation", () => {
  it("includes partially_paid in FEE_STATUSES", () => {
    expect(FEE_STATUSES).toContain("partially_paid");
  });

  it("calculates 'paid' when amount due is zero or amount paid >= amount due", () => {
    expect(calculatePaymentStatus(0, 0)).toBe("paid");
    expect(calculatePaymentStatus(500, 500)).toBe("paid");
    expect(calculatePaymentStatus(600, 500)).toBe("paid");
  });

  it("calculates 'partially_paid' when amount paid > 0 but < amount due", () => {
    expect(calculatePaymentStatus(1, 500)).toBe("partially_paid");
    expect(calculatePaymentStatus(250, 500)).toBe("partially_paid");
    expect(calculatePaymentStatus(499.99, 500)).toBe("partially_paid");
  });

  it("calculates 'pending' when amount paid is 0 and due date is in the future or today", () => {
    const today = "2025-05-15";
    expect(calculatePaymentStatus(0, 500, "2025-05-15", today)).toBe("pending");
    expect(calculatePaymentStatus(0, 500, "2025-05-20", today)).toBe("pending");
  });

  it("calculates 'overdue' when amount paid is 0 and current date is past due date", () => {
    const today = "2025-05-15";
    expect(calculatePaymentStatus(0, 500, "2025-05-10", today)).toBe("overdue");
  });

  it("calculates 'partially_paid' even if past due date if a partial payment has been made", () => {
    const today = "2025-05-15";
    expect(calculatePaymentStatus(100, 500, "2025-05-10", today)).toBe("partially_paid");
  });

  it("validates feeSchema and feeUpdateSchema with partially_paid status", () => {
    const validInsert = feeSchema.parse({
      admissionId: "123e4567-e89b-12d3-a456-426614174000",
      term: "Term 1",
      amountDue: 1000,
      amountPaid: 250,
      status: "partially_paid",
    });
    expect(validInsert.status).toBe("partially_paid");

    const validUpdate = feeUpdateSchema.parse({
      id: "123e4567-e89b-12d3-a456-426614174000",
      amountPaid: 500,
      status: "partially_paid",
    });
    expect(validUpdate.amountPaid).toBe(500);
    expect(validUpdate.status).toBe("partially_paid");
  });
});
