import { z } from "zod";

export const bookIdSchema = z.object({
  id: z.string().uuid(),
});

export const listBooksInputSchema = z.object({
  query: z.string().trim().default(""),
  category: z.string().trim().default("all"),
  status: z.string().trim().default("all"),
});

export type ListBooksInput = z.infer<typeof listBooksInputSchema>;

export const bookInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    isbn: z.string().trim().default(""),
    title: z.string().trim().min(1, "Title is required").max(200),
    author: z.string().trim().min(1, "Author is required").max(150),
    category: z.string().trim().default("General"),
    publisher: z.string().trim().default(""),
    publicationYear: z.number().int().min(1000).max(2100).optional().nullable(),
    callNumber: z.string().trim().default(""),
    totalCopies: z.number().int().min(1, "Total copies must be at least 1").default(1),
    availableCopies: z.number().int().min(0, "Available copies cannot be negative").default(1),
    status: z.enum(["available", "maintenance", "archived"]).default("available"),
    shelfLocation: z.string().trim().default(""),
    description: z.string().trim().default(""),
    coverUrl: z.string().trim().default(""),
  })
  .refine((data) => data.availableCopies <= data.totalCopies, {
    message: "Available copies cannot exceed total copies",
    path: ["availableCopies"],
  });

export type BookInput = z.infer<typeof bookInputSchema>;

export const borrowerSearchSchema = z.object({
  query: z.string().trim().default(""),
  borrowerType: z.enum(["student", "staff", "all"]).default("all"),
});

export type BorrowerSearchInput = z.infer<typeof borrowerSearchSchema>;

export const listLoansInputSchema = z.object({
  status: z.string().trim().default("all"),
  borrowerQuery: z.string().trim().default(""),
  bookQuery: z.string().trim().default(""),
});

export type ListLoansInput = z.infer<typeof listLoansInputSchema>;

export const issueLoanInputSchema = z
  .object({
    bookId: z.string().uuid("Invalid book selection"),
    borrowerType: z.enum(["student", "staff"]),
    borrowerProfileId: z.string().uuid().optional().nullable(),
    borrowerAdmissionId: z.string().uuid().optional().nullable(),
    borrowerName: z.string().trim().min(1, "Borrower name is required"),
    borrowerIdentifier: z.string().trim().default(""),
    className: z.string().trim().default(""),
    department: z.string().trim().default(""),
    issueDate: z.string().min(1, "Issue date is required"),
    dueDate: z.string().min(1, "Due date is required"),
    notes: z.string().trim().default(""),
  })
  .refine((data) => data.dueDate >= data.issueDate, {
    message: "Due date cannot be prior to issue date",
    path: ["dueDate"],
  });

export type IssueLoanInput = z.infer<typeof issueLoanInputSchema>;

export const loanIdSchema = z.object({
  id: z.string().uuid(),
});

export const returnLoanInputSchema = z.object({
  loanId: z.string().uuid(),
  returnDate: z.string().min(1, "Return date is required"),
  fineAmount: z.number().min(0).default(0),
  notes: z.string().trim().default(""),
});

export type ReturnLoanInput = z.infer<typeof returnLoanInputSchema>;

export const renewLoanInputSchema = z.object({
  loanId: z.string().uuid(),
  extendedDueDate: z.string().min(1, "New due date is required"),
});

export type RenewLoanInput = z.infer<typeof renewLoanInputSchema>;

export const payFineInputSchema = z.object({
  loanId: z.string().uuid(),
});

export type PayFineInput = z.infer<typeof payFineInputSchema>;

export const reserveBookInputSchema = z.object({
  bookId: z.string().uuid(),
  borrowerProfileId: z.string().uuid().optional().nullable(),
  borrowerAdmissionId: z.string().uuid().optional().nullable(),
  borrowerName: z.string().trim().min(1, "Borrower name is required"),
});

export type ReserveBookInput = z.infer<typeof reserveBookInputSchema>;

export const reservationIdSchema = z.object({
  id: z.string().uuid(),
});
