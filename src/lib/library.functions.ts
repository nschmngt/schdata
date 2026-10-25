import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffOrAdmin, isStaffOrAdmin, logAudit } from "@/lib/admin.server";
import { resolveProvisionedSchool } from "@/lib/school.server";
import { OPS_FEATURE_KEY, parseOpsRules } from "@/lib/operations-rules";
import {
  calculateDueDate,
  calculateLateFine,
  checkBorrowerEligibility,
  checkRenewalEligibility,
  getLibraryPolicies,
} from "@/lib/library";
import {
  bookIdSchema,
  bookInputSchema,
  borrowerSearchSchema,
  issueLoanInputSchema,
  listBooksInputSchema,
  listLoansInputSchema,
  loanIdSchema,
  payFineInputSchema,
  renewLoanInputSchema,
  reservationIdSchema,
  reserveBookInputSchema,
  returnLoanInputSchema,
} from "@/lib/library.schemas";
import { calculatePaymentStatus } from "@/lib/finance";

export async function loadOpsRules(supabase: any) {
  const { data } = await supabase
    .from("tenant_settings")
    .select("features")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return parseOpsRules(data?.features?.[OPS_FEATURE_KEY]);
}

/** Get overall dashboard & library module metrics. */
export const getLibraryOverviewStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const school = await resolveProvisionedSchool(supabase);

    let booksQuery = supabase.from("library_books").select("id, total_copies, available_copies, status");
    let loansQuery = supabase.from("library_loans").select("id, status, fine_amount, fine_paid, due_date");
    let reservationsQuery = supabase.from("library_reservations").select("id, status").eq("status", "pending");

    if (school?.id) {
      booksQuery = booksQuery.eq("school_id", school.id);
      loansQuery = loansQuery.eq("school_id", school.id);
      reservationsQuery = reservationsQuery.eq("school_id", school.id);
    }

    const [booksRes, loansRes, reservationsRes] = await Promise.all([
      booksQuery,
      loansQuery,
      reservationsQuery,
    ]);

    if (booksRes.error) throw new Error(booksRes.error.message);
    if (loansRes.error) throw new Error(loansRes.error.message);
    if (reservationsRes.error) throw new Error(reservationsRes.error.message);

    const books = booksRes.data ?? [];
    const loans = loansRes.data ?? [];
    const reservations = reservationsRes.data ?? [];

    const totalTitles = books.length;
    const totalCopies = books.reduce((acc, b) => acc + (b.total_copies || 0), 0);
    const availableCopies = books.reduce((acc, b) => acc + (b.available_copies || 0), 0);
    const activeLoans = loans.filter((l) => l.status === "issued" || l.status === "overdue").length;
    const todayStr = new Date().toISOString().split("T")[0];
    const overdueLoans = loans.filter(
      (l) => l.status === "overdue" || (l.status === "issued" && l.due_date < todayStr),
    ).length;

    const outstandingFines = loans.reduce((acc, l) => {
      if (!l.fine_paid && l.fine_amount) {
        return acc + Number(l.fine_amount);
      }
      return acc;
    }, 0);

    const opsRules = await loadOpsRules(supabase);
    const policies = getLibraryPolicies(opsRules);

    return {
      totalTitles,
      totalCopies,
      availableCopies,
      activeLoans,
      overdueLoans,
      outstandingFines: Number(outstandingFines.toFixed(2)),
      pendingReservations: reservations.length,
      policies,
    };
  });

/** List and filter catalogue books. */
export const listLibraryBooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listBooksInputSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const school = await resolveProvisionedSchool(context.supabase);

    let q = context.supabase
      .from("library_books")
      .select("*")
      .order("title", { ascending: true });

    if (school?.id) {
      q = q.eq("school_id", school.id);
    }
    if (data.status && data.status !== "all") {
      q = q.eq("status", data.status);
    }
    if (data.category && data.category !== "all") {
      q = q.eq("category", data.category);
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let filtered = rows ?? [];
    if (data.query) {
      const term = data.query.toLowerCase().trim();
      filtered = filtered.filter(
        (b) =>
          b.title.toLowerCase().includes(term) ||
          b.author.toLowerCase().includes(term) ||
          b.isbn.toLowerCase().includes(term) ||
          b.call_number.toLowerCase().includes(term) ||
          b.category.toLowerCase().includes(term),
      );
    }

    return filtered.map((b) => ({
      id: b.id,
      isbn: b.isbn,
      title: b.title,
      author: b.author,
      category: b.category,
      publisher: b.publisher,
      publicationYear: b.publication_year,
      callNumber: b.call_number,
      totalCopies: b.total_copies,
      availableCopies: b.available_copies,
      status: b.status,
      shelfLocation: b.shelf_location,
      description: b.description,
      coverUrl: b.cover_url,
      createdAt: b.created_at,
    }));
  });

/** Get detailed info for a single book including active loans and reservations. */
export const getLibraryBookDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bookIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const school = await resolveProvisionedSchool(context.supabase);

    let bookQuery = context.supabase.from("library_books").select("*").eq("id", data.id);
    let loansQuery = context.supabase
      .from("library_loans")
      .select("*")
      .eq("book_id", data.id)
      .in("status", ["issued", "overdue"])
      .order("due_date", { ascending: true });
    let reservationsQuery = context.supabase
      .from("library_reservations")
      .select("*")
      .eq("book_id", data.id)
      .eq("status", "pending")
      .order("reservation_date", { ascending: true });

    if (school?.id) {
      bookQuery = bookQuery.eq("school_id", school.id);
      loansQuery = loansQuery.eq("school_id", school.id);
      reservationsQuery = reservationsQuery.eq("school_id", school.id);
    }

    const [bookRes, loansRes, reservationsRes] = await Promise.all([
      bookQuery.single(),
      loansQuery,
      reservationsQuery,
    ]);

    if (bookRes.error || !bookRes.data) throw new Error("Book not found.");

    return {
      book: {
        id: bookRes.data.id,
        isbn: bookRes.data.isbn,
        title: bookRes.data.title,
        author: bookRes.data.author,
        category: bookRes.data.category,
        publisher: bookRes.data.publisher,
        publicationYear: bookRes.data.publication_year,
        callNumber: bookRes.data.call_number,
        totalCopies: bookRes.data.total_copies,
        availableCopies: bookRes.data.available_copies,
        status: bookRes.data.status,
        shelfLocation: bookRes.data.shelf_location,
        description: bookRes.data.description,
        coverUrl: bookRes.data.cover_url,
        createdAt: bookRes.data.created_at,
      },
      activeLoans: loansRes.data ?? [],
      pendingReservations: reservationsRes.data ?? [],
    };
  });

/** Create or update a book in the catalogue. */
export const saveLibraryBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bookInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaffOrAdmin(context.supabase, context.userId);
    const school = await resolveProvisionedSchool(context.supabase);

    const row = {
      school_id: school?.id,
      isbn: data.isbn,
      title: data.title,
      author: data.author,
      category: data.category,
      publisher: data.publisher,
      publication_year: data.publicationYear || null,
      call_number: data.callNumber,
      total_copies: data.totalCopies,
      available_copies: data.availableCopies,
      status: data.status,
      shelf_location: data.shelfLocation,
      description: data.description,
      cover_url: data.coverUrl,
    };

    let bookId = data.id;

    if (bookId) {
      const { error } = await context.supabase
        .from("library_books")
        .update(row)
        .eq("id", bookId);
      if (error) throw new Error(error.message);
    } else {
      const { data: inserted, error } = await context.supabase
        .from("library_books")
        .insert(row)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      bookId = inserted.id;
    }

    await logAudit(context.supabase, context.userId, {
      action: data.id ? "library_book_updated" : "library_book_created",
      description: `${data.id ? "Updated" : "Added"} book "${data.title}" by ${data.author}`,
      details: { bookId, isbn: data.isbn, totalCopies: data.totalCopies },
    });

    return { id: bookId, success: true };
  });

/** Delete a book from the catalogue. */
export const deleteLibraryBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bookIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaffOrAdmin(context.supabase, context.userId);
    const { data: book } = await context.supabase
      .from("library_books")
      .select("title")
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await context.supabase.from("library_books").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    await logAudit(context.supabase, context.userId, {
      action: "library_book_deleted",
      description: `Deleted book "${book?.title || data.id}" from library catalogue`,
      details: { bookId: data.id },
    });

    return { success: true };
  });

/**
 * Auto-populates borrower details on request during lending checkout.
 * Searches across admitted students and staff profiles, returns full details,
 * active loan count, fee payment status, and policy eligibility warnings.
 */
export const autoPopulateBorrowerInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => borrowerSearchSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const school = await resolveProvisionedSchool(supabase);
    const opsRules = await loadOpsRules(supabase);
    const policies = getLibraryPolicies(opsRules);

    const term = data.query.trim().toLowerCase();
    if (!term) return { students: [], staff: [] };

    const results: {
      students: any[];
      staff: any[];
    } = { students: [], staff: [] };

    // Search students (admissions + student_fees + active library_loans)
    if (data.borrowerType === "student" || data.borrowerType === "all") {
      let admissionsQuery = supabase
        .from("admissions")
        .select("id, student_name, admission_number, class_admitted, status, parent_email, student_profile_id")
        .or(`student_name.ilike.%${term}%,admission_number.ilike.%${term}%,parent_email.ilike.%${term}%`)
        .limit(10);

      if (school?.id) {
        admissionsQuery = admissionsQuery.eq("school_id", school.id);
      }

      const { data: admissions } = await admissionsQuery;

      if (admissions && admissions.length > 0) {
        const admissionIds = admissions.map((a) => a.id);

        const [feesRes, activeLoansRes] = await Promise.all([
          supabase.from("student_fees").select("*").in("admission_id", admissionIds),
          supabase
            .from("library_loans")
            .select("id, borrower_admission_id, status")
            .in("borrower_admission_id", admissionIds)
            .in("status", ["issued", "overdue"]),
        ]);

        const feesByAdmission = new Map<string, any[]>();
        (feesRes.data ?? []).forEach((f) => {
          const list = feesByAdmission.get(f.admission_id) || [];
          list.push(f);
          feesByAdmission.set(f.admission_id, list);
        });

        const activeLoansByAdmission = new Map<string, number>();
        (activeLoansRes.data ?? []).forEach((l) => {
          const count = activeLoansByAdmission.get(l.borrower_admission_id) || 0;
          activeLoansByAdmission.set(l.borrower_admission_id, count + 1);
        });

        results.students = admissions.map((a) => {
          const studentFees = feesByAdmission.get(a.id) || [];
          const paymentStatus = studentFees.length > 0 ? calculatePaymentStatus(studentFees) : "paid";
          const activeLoanCount = activeLoansByAdmission.get(a.id) || 0;
          const eligibility = checkBorrowerEligibility(activeLoanCount, policies.maxLoans, paymentStatus);

          return {
            borrowerType: "student",
            borrowerAdmissionId: a.id,
            borrowerProfileId: a.student_profile_id,
            name: a.student_name,
            identifier: a.admission_number || "Pending",
            className: a.class_admitted,
            department: "",
            status: a.status,
            activeLoanCount,
            paymentStatus,
            eligibility,
          };
        });
      }
    }

    // Search staff (profiles where role in ['staff', 'school_manager', 'super_admin'])
    if (data.borrowerType === "staff" || data.borrowerType === "all") {
      const { data: staffProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, employee_id, department, position, role")
        .in("role", ["staff", "school_manager", "super_admin"])
        .or(`full_name.ilike.%${term}%,employee_id.ilike.%${term}%,email.ilike.%${term}%`)
        .limit(10);

      if (staffProfiles && staffProfiles.length > 0) {
        const staffIds = staffProfiles.map((s) => s.id);

        const { data: activeLoans } = await supabase
          .from("library_loans")
          .select("id, borrower_profile_id, status")
          .in("borrower_profile_id", staffIds)
          .in("status", ["issued", "overdue"]);

        const activeLoansByStaff = new Map<string, number>();
        (activeLoans ?? []).forEach((l) => {
          const count = activeLoansByStaff.get(l.borrower_profile_id) || 0;
          activeLoansByStaff.set(l.borrower_profile_id, count + 1);
        });

        results.staff = staffProfiles.map((s) => {
          const activeLoanCount = activeLoansByStaff.get(s.id) || 0;
          const eligibility = checkBorrowerEligibility(activeLoanCount, policies.maxLoans);

          return {
            borrowerType: "staff",
            borrowerAdmissionId: null,
            borrowerProfileId: s.id,
            name: s.full_name,
            identifier: s.employee_id || s.email,
            className: "",
            department: s.department || s.position || "Staff",
            status: "active",
            activeLoanCount,
            paymentStatus: "paid",
            eligibility,
          };
        });
      }
    }

    return results;
  });

/** List and filter library loans (active, overdue, returned, lost). */
export const listLibraryLoans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listLoansInputSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const school = await resolveProvisionedSchool(supabase);
    const opsRules = await loadOpsRules(supabase);
    const policies = getLibraryPolicies(opsRules);
    const todayStr = new Date().toISOString().split("T")[0];

    const isStaffOrAdminUser = await isStaffOrAdmin(supabase, context.userId);

    let q = supabase
      .from("library_loans")
      .select("*, library_books(id, title, author, isbn, call_number)")
      .order("created_at", { ascending: false });

    if (school?.id) {
      q = q.eq("school_id", school.id);
    }

    if (!isStaffOrAdminUser) {
      q = q.eq("borrower_profile_id", context.userId);
    }

    if (data.status && data.status !== "all") {
      q = q.eq("status", data.status);
    }

    const { data: loans, error } = await q;
    if (error) throw new Error(error.message);

    let filtered = loans ?? [];

    if (data.borrowerQuery) {
      const term = data.borrowerQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (l: any) =>
          (l.borrower_name || "").toLowerCase().includes(term) ||
          (l.borrower_identifier || "").toLowerCase().includes(term) ||
          (l.class_name || "").toLowerCase().includes(term),
      );
    }

    if (data.bookQuery) {
      const term = data.bookQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (l: any) =>
          (l.library_books?.title || "").toLowerCase().includes(term) ||
          (l.library_books?.author || "").toLowerCase().includes(term) ||
          (l.library_books?.isbn || "").toLowerCase().includes(term),
      );
    }

    return filtered.map((l: any) => {
      let isOverdue = l.status === "overdue" || (l.status === "issued" && l.due_date < todayStr);
      let fineAmount = Number(l.fine_amount || 0);

      // Auto compute fine if overdue and currently issued
      if (isOverdue && l.status === "issued") {
        const fineCalc = calculateLateFine(l.due_date, todayStr, policies.finePerDay);
        fineAmount = fineCalc.fineAmount;
      }

      return {
        id: l.id,
        bookId: l.book_id,
        bookTitle: l.library_books?.title || "Unknown Book",
        bookAuthor: l.library_books?.author || "",
        bookIsbn: l.library_books?.isbn || "",
        borrowerType: l.borrower_type,
        borrowerProfileId: l.borrower_profile_id,
        borrowerAdmissionId: l.borrower_admission_id,
        borrowerName: l.borrower_name,
        borrowerIdentifier: l.borrower_identifier,
        className: l.class_name,
        department: l.department,
        issueDate: l.issue_date,
        dueDate: l.due_date,
        returnDate: l.return_date,
        status: isOverdue && l.status === "issued" ? "overdue" : l.status,
        renewalCount: l.renewal_count,
        fineAmount,
        finePaid: l.fine_paid,
        notes: l.notes,
        issuedBy: l.issued_by,
        createdAt: l.created_at,
      };
    });
  });

/** Issue a library loan (checkout). */
export const issueLibraryLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => issueLoanInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertStaffOrAdmin(supabase, context.userId);
    const school = await resolveProvisionedSchool(supabase);
    const opsRules = await loadOpsRules(supabase);
    const policies = getLibraryPolicies(opsRules);

    // 1. Verify book availability
    const { data: book, error: bookErr } = await supabase
      .from("library_books")
      .select("id, title, available_copies, status")
      .eq("id", data.bookId)
      .single();

    if (bookErr || !book) throw new Error("Book not found in catalogue.");
    if (book.status !== "available" || book.available_copies < 1) {
      throw new Error(`Book "${book.title}" is currently out of stock or unavailable.`);
    }

    // 2. Verify borrower loan limit
    let activeLoanQuery = supabase
      .from("library_loans")
      .select("id", { count: "exact", head: true })
      .in("status", ["issued", "overdue"]);

    if (data.borrowerAdmissionId) {
      activeLoanQuery = activeLoanQuery.eq("borrower_admission_id", data.borrowerAdmissionId);
    } else if (data.borrowerProfileId) {
      activeLoanQuery = activeLoanQuery.eq("borrower_profile_id", data.borrowerProfileId);
    }

    const { count: currentLoansCount } = await activeLoanQuery;
    if ((currentLoansCount ?? 0) >= policies.maxLoans) {
      throw new Error(
        `Borrower ${data.borrowerName} has reached the maximum borrowing limit of ${policies.maxLoans} books.`,
      );
    }

    // 3. Insert loan record
    const loanRow = {
      school_id: school?.id,
      book_id: data.bookId,
      borrower_type: data.borrowerType,
      borrower_profile_id: data.borrowerProfileId || null,
      borrower_admission_id: data.borrowerAdmissionId || null,
      borrower_name: data.borrowerName,
      borrower_identifier: data.borrowerIdentifier,
      class_name: data.className,
      department: data.department,
      issue_date: data.issueDate,
      due_date: data.dueDate,
      status: "issued",
      notes: data.notes,
      issued_by: context.userId,
    };

    const { data: insertedLoan, error: loanErr } = await supabase
      .from("library_loans")
      .insert(loanRow)
      .select("id")
      .single();

    if (loanErr) throw new Error(loanErr.message);

    // 4. Decrement available copies
    const { error: decrErr } = await supabase
      .from("library_books")
      .update({ available_copies: Math.max(0, book.available_copies - 1) })
      .eq("id", data.bookId);

    if (decrErr) throw new Error(decrErr.message);

    await logAudit(supabase, context.userId, {
      action: "library_loan_issued",
      description: `Issued "${book.title}" to ${data.borrowerName} (${data.borrowerIdentifier || data.borrowerType})`,
      details: { loanId: insertedLoan.id, bookId: data.bookId, dueDate: data.dueDate },
    });

    return { id: insertedLoan.id, success: true };
  });

/** Process a book return. */
export const returnLibraryLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => returnLoanInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertStaffOrAdmin(supabase, context.userId);
    const opsRules = await loadOpsRules(supabase);
    const policies = getLibraryPolicies(opsRules);

    const { data: loan, error: loanErr } = await supabase
      .from("library_loans")
      .select("*, library_books(id, title, available_copies)")
      .eq("id", data.loanId)
      .single();

    if (loanErr || !loan) throw new Error("Loan record not found.");

    // Calculate final fine
    const fineCalc = calculateLateFine(loan.due_date, data.returnDate, policies.finePerDay);
    const finalFine = data.fineAmount > 0 ? data.fineAmount : fineCalc.fineAmount;

    // 1. Update loan status to returned
    const { error: updateErr } = await supabase
      .from("library_loans")
      .update({
        status: "returned",
        return_date: data.returnDate,
        fine_amount: finalFine,
        fine_paid: finalFine <= 0,
        notes: data.notes ? `${loan.notes}\n${data.notes}`.trim() : loan.notes,
      })
      .eq("id", data.loanId);

    if (updateErr) throw new Error(updateErr.message);

    // 2. Increment book available copies
    if (loan.book_id && loan.library_books) {
      await supabase
        .from("library_books")
        .update({ available_copies: loan.library_books.available_copies + 1 })
        .eq("id", loan.book_id);
    }

    await logAudit(supabase, context.userId, {
      action: "library_loan_returned",
      description: `Returned book "${loan.library_books?.title || loan.book_id}" from ${loan.borrower_name}`,
      details: { loanId: data.loanId, fineAmount: finalFine },
    });

    return { success: true, fineAmount: finalFine };
  });

/** Renew an active loan. */
export const renewLibraryLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => renewLoanInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const opsRules = await loadOpsRules(supabase);
    const policies = getLibraryPolicies(opsRules);

    const { data: loan, error: loanErr } = await supabase
      .from("library_loans")
      .select("*, library_books(title)")
      .eq("id", data.loanId)
      .single();

    if (loanErr || !loan) throw new Error("Loan record not found.");

    const eligibility = checkRenewalEligibility(loan.renewal_count || 0, policies.renewals);
    if (!eligibility.eligible) {
      throw new Error(eligibility.reason || "Loan cannot be renewed.");
    }

    const { error: updateErr } = await supabase
      .from("library_loans")
      .update({
        due_date: data.extendedDueDate,
        renewal_count: (loan.renewal_count || 0) + 1,
        status: "issued",
      })
      .eq("id", data.loanId);

    if (updateErr) throw new Error(updateErr.message);

    await logAudit(supabase, context.userId, {
      action: "library_loan_renewed",
      description: `Renewed loan for "${loan.library_books?.title || loan.book_id}" for ${loan.borrower_name}`,
      details: { loanId: data.loanId, newDueDate: data.extendedDueDate, renewalCount: loan.renewal_count + 1 },
    });

    return { success: true };
  });

/** Mark late fine as paid. */
export const payLoanFine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => payFineInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertStaffOrAdmin(supabase, context.userId);

    const { data: loan, error: loanErr } = await supabase
      .from("library_loans")
      .select("id, borrower_name, fine_amount")
      .eq("id", data.loanId)
      .single();

    if (loanErr || !loan) throw new Error("Loan record not found.");

    const { error: updateErr } = await supabase
      .from("library_loans")
      .update({ fine_paid: true })
      .eq("id", data.loanId);

    if (updateErr) throw new Error(updateErr.message);

    await logAudit(supabase, context.userId, {
      action: "library_fine_paid",
      description: `Marked fine of ${loan.fine_amount} as paid for ${loan.borrower_name}`,
      details: { loanId: data.loanId, fineAmount: loan.fine_amount },
    });

    return { success: true };
  });

/** List book reservations. */
export const listLibraryReservations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const school = await resolveProvisionedSchool(supabase);
    const isStaffOrAdminUser = await isStaffOrAdmin(supabase, context.userId);

    let q = supabase
      .from("library_reservations")
      .select("*, library_books(id, title, author, available_copies)")
      .order("reservation_date", { ascending: true });

    if (school?.id) {
      q = q.eq("school_id", school.id);
    }

    if (!isStaffOrAdminUser) {
      q = q.eq("borrower_profile_id", context.userId);
    }

    const { data, error } = await q;

    if (error) throw new Error(error.message);

    return (data ?? []).map((r: any) => ({
      id: r.id,
      bookId: r.book_id,
      bookTitle: r.library_books?.title || "Unknown Book",
      bookAuthor: r.library_books?.author || "",
      availableCopies: r.library_books?.available_copies || 0,
      borrowerProfileId: r.borrower_profile_id,
      borrowerAdmissionId: r.borrower_admission_id,
      borrowerName: r.borrower_name,
      reservationDate: r.reservation_date,
      status: r.status,
    }));
  });

/** Reserve a book that is currently out of stock. */
export const reserveLibraryBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reserveBookInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const school = await resolveProvisionedSchool(supabase);
    const isStaffOrAdminUser = await isStaffOrAdmin(supabase, context.userId);

    const { data: book, error: bookErr } = await supabase
      .from("library_books")
      .select("id, title")
      .eq("id", data.bookId)
      .single();

    if (bookErr || !book) throw new Error("Book not found.");

    const borrowerProfileId = isStaffOrAdminUser
      ? data.borrowerProfileId || context.userId
      : context.userId;

    const row = {
      school_id: school?.id,
      book_id: data.bookId,
      borrower_profile_id: borrowerProfileId,
      borrower_admission_id: isStaffOrAdminUser ? data.borrowerAdmissionId || null : null,
      borrower_name: data.borrowerName,
      status: "pending",
    };

    const { data: inserted, error } = await supabase
      .from("library_reservations")
      .insert(row)
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    await logAudit(supabase, context.userId, {
      action: "library_book_reserved",
      description: `Reserved book "${book.title}" for ${data.borrowerName}`,
      details: { reservationId: inserted.id, bookId: data.bookId },
    });

    return { id: inserted.id, success: true };
  });

/** Cancel a book reservation. */
export const cancelLibraryReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reservationIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const isStaffOrAdminUser = await isStaffOrAdmin(supabase, context.userId);

    const { data: reservation, error: resErr } = await supabase
      .from("library_reservations")
      .select("id, borrower_profile_id")
      .eq("id", data.id)
      .single();

    if (resErr || !reservation) throw new Error("Reservation not found.");

    if (!isStaffOrAdminUser && reservation.borrower_profile_id !== context.userId) {
      throw new Error("Forbidden: you cannot cancel reservations belonging to another user.");
    }

    const { error } = await supabase
      .from("library_reservations")
      .update({ status: "cancelled" })
      .eq("id", data.id);

    if (error) throw new Error(error.message);

    await logAudit(supabase, context.userId, {
      action: "library_reservation_cancelled",
      description: `Cancelled library reservation ${data.id}`,
      details: { reservationId: data.id },
    });

    return { success: true };
  });
