import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  Library,
  Search,
  Plus,
  ArrowRightLeft,
  Clock,
  AlertCircle,
  CheckCircle2,
  Calendar,
  UserCheck,
  RotateCcw,
  DollarSign,
  Bookmark,
  ShieldAlert,
  Sliders,
  Trash2,
  Edit,
  Info,
  Loader2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

import { useFinanceConfig } from "@/hooks/useFinanceConfig";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  getLibraryOverviewStats,
  listLibraryBooks,
  getLibraryBookDetails,
  saveLibraryBook,
  deleteLibraryBook,
  autoPopulateBorrowerInfo,
  listLibraryLoans,
  issueLibraryLoan,
  returnLibraryLoan,
  renewLibraryLoan,
  payLoanFine,
  listLibraryReservations,
  reserveLibraryBook,
  cancelLibraryReservation,
} from "@/lib/library.functions";
import { calculateDueDate } from "@/lib/library";

export function LibraryManagement() {
  const { profile } = useSession();
  const financeConfig = useFinanceConfig();
  const isAdminOrStaff = profile?.role === "super_admin" || profile?.role === "school_manager" || profile?.role === "staff";

  // Global State & Stats
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState("catalogue");

  // Catalogue State
  const [books, setBooks] = useState<any[]>([]);
  const [bookQuery, setBookQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedBook, setSelectedBook] = useState<any | null>(null);
  const [bookDetails, setBookDetails] = useState<any | null>(null);
  const [loadingBookDetails, setLoadingBookDetails] = useState(false);
  const [isAddBookOpen, setIsAddBookOpen] = useState(false);
  const [isEditingBook, setIsEditingBook] = useState(false);

  // Book Form State
  const [bookForm, setBookForm] = useState({
    id: "",
    title: "",
    author: "",
    isbn: "",
    category: "General",
    publisher: "",
    publicationYear: new Date().getFullYear(),
    callNumber: "",
    totalCopies: 1,
    availableCopies: 1,
    status: "available",
    shelfLocation: "",
    description: "",
    coverUrl: "",
  });

  // Lending & Checkout State
  const [borrowerSearchQuery, setBorrowerSearchQuery] = useState("");
  const [borrowerTypeFilter, setBorrowerTypeFilter] = useState<"all" | "student" | "staff">("all");
  const [candidateBorrowers, setCandidateBorrowers] = useState<{ students: any[]; staff: any[] }>({
    students: [],
    staff: [],
  });
  const [searchingBorrower, setSearchingBorrower] = useState(false);
  const [selectedBorrower, setSelectedBorrower] = useState<any | null>(null);
  const [checkoutBookId, setCheckoutBookId] = useState("");
  const [checkoutIssueDate, setCheckoutIssueDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [checkoutDueDate, setCheckoutDueDate] = useState("");
  const [checkoutNotes, setCheckoutNotes] = useState("");
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);

  // Loans & Returns State
  const [loans, setLoans] = useState<any[]>([]);
  const [loanStatusFilter, setLoanStatusFilter] = useState("all");
  const [selectedLoanForReturn, setSelectedLoanForReturn] = useState<any | null>(null);
  const [returnDate, setReturnDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [customFineAmount, setCustomFineAmount] = useState<number>(0);
  const [returnNotes, setReturnNotes] = useState("");
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  // Reservations State
  const [reservations, setReservations] = useState<any[]>([]);

  // Load Overview Data
  async function refreshData() {
    try {
      setLoading(true);
      const [statsData, booksData, loansData, reservationsData] = await Promise.all([
        getLibraryOverviewStats(),
        listLibraryBooks({ data: { query: bookQuery, category: categoryFilter, status: statusFilter } }),
        listLibraryLoans({ data: { status: loanStatusFilter } }),
        listLibraryReservations(),
      ]);

      setStats(statsData);
      setBooks(booksData);
      setLoans(loansData);
      setReservations(reservationsData);

      // Auto update checkout due date based on ops policies
      if (statsData?.policies?.loanDays) {
        setCheckoutDueDate(calculateDueDate(checkoutIssueDate, statsData.policies.loanDays));
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load library data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshData();
  }, []);

  // Recalculate due date when issue date changes
  useEffect(() => {
    if (stats?.policies?.loanDays) {
      setCheckoutDueDate(calculateDueDate(checkoutIssueDate, stats.policies.loanDays));
    }
  }, [checkoutIssueDate, stats?.policies?.loanDays]);

  // Handle Borrower Auto-population Search
  useEffect(() => {
    if (!borrowerSearchQuery.trim()) {
      setCandidateBorrowers({ students: [], staff: [] });
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearchingBorrower(true);
        const res = await autoPopulateBorrowerInfo({
          data: { query: borrowerSearchQuery, borrowerType: borrowerTypeFilter },
        });
        setCandidateBorrowers(res);
      } catch (err: any) {
        console.error("Auto-populate error:", err);
      } finally {
        setSearchingBorrower(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [borrowerSearchQuery, borrowerTypeFilter]);

  // Handle Book Filter Change
  useEffect(() => {
    async function filterBooks() {
      try {
        const booksData = await listLibraryBooks({
          data: { query: bookQuery, category: categoryFilter, status: statusFilter },
        });
        setBooks(booksData);
      } catch (err: any) {
        toast.error("Failed to filter books");
      }
    }
    filterBooks();
  }, [bookQuery, categoryFilter, statusFilter]);

  // Handle Loans Filter Change
  useEffect(() => {
    async function filterLoans() {
      try {
        const loansData = await listLibraryLoans({
          data: { status: loanStatusFilter },
        });
        setLoans(loansData);
      } catch (err: any) {
        toast.error("Failed to filter loans");
      }
    }
    filterLoans();
  }, [loanStatusFilter]);

  // Book Form Handler
  function handleOpenAddBook() {
    setBookForm({
      id: "",
      title: "",
      author: "",
      isbn: "",
      category: "General",
      publisher: "",
      publicationYear: new Date().getFullYear(),
      callNumber: "",
      totalCopies: 1,
      availableCopies: 1,
      status: "available",
      shelfLocation: "",
      description: "",
      coverUrl: "",
    });
    setIsEditingBook(false);
    setIsAddBookOpen(true);
  }

  function handleOpenEditBook(b: any) {
    setBookForm({
      id: b.id,
      title: b.title,
      author: b.author,
      isbn: b.isbn || "",
      category: b.category || "General",
      publisher: b.publisher || "",
      publicationYear: b.publicationYear || new Date().getFullYear(),
      callNumber: b.callNumber || "",
      totalCopies: b.totalCopies || 1,
      availableCopies: b.availableCopies || 1,
      status: b.status || "available",
      shelfLocation: b.shelfLocation || "",
      description: b.description || "",
      coverUrl: b.coverUrl || "",
    });
    setIsEditingBook(true);
    setIsAddBookOpen(true);
  }

  async function handleSaveBook(e: React.FormEvent) {
    e.preventDefault();
    try {
      await saveLibraryBook({ data: bookForm });
      toast.success(isEditingBook ? "Book updated successfully" : "Book added to catalogue");
      setIsAddBookOpen(false);
      refreshData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save book");
    }
  }

  async function handleDeleteBook(id: string) {
    if (!confirm("Are you sure you want to delete this book from the catalogue?")) return;
    try {
      await deleteLibraryBook({ data: { id } });
      toast.success("Book deleted");
      refreshData();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete book");
    }
  }

  // Handle Loan Checkout
  async function handleIssueLoan() {
    if (!selectedBorrower) {
      toast.error("Please select a borrower first.");
      return;
    }
    if (!checkoutBookId) {
      toast.error("Please select a book to issue.");
      return;
    }

    try {
      setCheckoutSubmitting(true);
      await issueLibraryLoan({
        data: {
          bookId: checkoutBookId,
          borrowerType: selectedBorrower.borrowerType,
          borrowerProfileId: selectedBorrower.borrowerProfileId,
          borrowerAdmissionId: selectedBorrower.borrowerAdmissionId,
          borrowerName: selectedBorrower.name,
          borrowerIdentifier: selectedBorrower.identifier,
          className: selectedBorrower.className || "",
          department: selectedBorrower.department || "",
          issueDate: checkoutIssueDate,
          dueDate: checkoutDueDate,
          notes: checkoutNotes,
        },
      });

      toast.success(`Book issued successfully to ${selectedBorrower.name}`);
      setSelectedBorrower(null);
      setCheckoutBookId("");
      setCheckoutNotes("");
      setBorrowerSearchQuery("");
      refreshData();
    } catch (err: any) {
      toast.error(err.message || "Failed to issue book loan");
    } finally {
      setCheckoutSubmitting(false);
    }
  }

  // Handle Return Loan
  async function handleReturnLoanSubmit() {
    if (!selectedLoanForReturn) return;

    try {
      setReturnSubmitting(true);
      await returnLibraryLoan({
        data: {
          loanId: selectedLoanForReturn.id,
          returnDate,
          fineAmount: customFineAmount,
          notes: returnNotes,
        },
      });

      toast.success("Book returned successfully");
      setSelectedLoanForReturn(null);
      refreshData();
    } catch (err: any) {
      toast.error(err.message || "Failed to process return");
    } finally {
      setReturnSubmitting(false);
    }
  }

  // Handle Renewal
  async function handleRenewLoan(loan: any) {
    if (!stats?.policies) return;
    const newDueDate = calculateDueDate(format(new Date(), "yyyy-MM-dd"), stats.policies.loanDays);

    try {
      await renewLibraryLoan({
        data: {
          loanId: loan.id,
          extendedDueDate: newDueDate,
        },
      });
      toast.success(`Loan renewed until ${newDueDate}`);
      refreshData();
    } catch (err: any) {
      toast.error(err.message || "Failed to renew loan");
    }
  }

  // Handle Fine Payment
  async function handlePayFine(loanId: string) {
    try {
      await payLoanFine({ data: { loanId } });
      toast.success("Late fine marked as paid");
      refreshData();
    } catch (err: any) {
      toast.error(err.message || "Failed to pay fine");
    }
  }

  // Handle Reserve Book
  async function handleReserveBook(book: any) {
    if (!profile) return;
    try {
      await reserveLibraryBook({
        data: {
          bookId: book.id,
          borrowerProfileId: profile.id,
          borrowerName: profile.full_name,
        },
      });
      toast.success(`Reserved "${book.title}". You will be notified when a copy is available.`);
      refreshData();
    } catch (err: any) {
      toast.error(err.message || "Failed to reserve book");
    }
  }

  // Handle Cancel Reservation
  async function handleCancelReservation(id: string) {
    try {
      await cancelLibraryReservation({ data: { id } });
      toast.success("Reservation cancelled");
      refreshData();
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel reservation");
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Metrics Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="surface">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Total Titles & Copies
            </CardTitle>
            <BookOpen className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.totalTitles || 0} <span className="text-sm font-normal text-muted-foreground">({stats?.totalCopies || 0} copies)</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats?.availableCopies || 0} copies available on shelf
            </p>
          </CardContent>
        </Card>

        <Card className="surface">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Active Loans
            </CardTitle>
            <ArrowRightLeft className="size-4 text-info" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeLoans || 0}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Books currently checked out
            </p>
          </CardContent>
        </Card>

        <Card className="surface">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Overdue & Fines
            </CardTitle>
            <AlertCircle className="size-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {stats?.overdueLoans || 0} overdue
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Outstanding fines: <span className="font-semibold text-foreground">{financeConfig.money(stats?.outstandingFines || 0)}</span>
            </p>
          </CardContent>
        </Card>

        <Card className="surface">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pending Reservations
            </CardTitle>
            <Bookmark className="size-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pendingReservations || 0}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Holds queued for out-of-stock items
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="bg-muted/60 p-1">
            <TabsTrigger value="catalogue" className="gap-2">
              <BookOpen className="size-4" /> Catalogue
            </TabsTrigger>
            {isAdminOrStaff && (
              <TabsTrigger value="lending" className="gap-2">
                <UserCheck className="size-4" /> Quick Checkout
              </TabsTrigger>
            )}
            <TabsTrigger value="loans" className="gap-2">
              <ArrowRightLeft className="size-4" /> Loans & Returns
            </TabsTrigger>
            <TabsTrigger value="fines" className="gap-2">
              <DollarSign className="size-4" /> Overdue & Fines
            </TabsTrigger>
            <TabsTrigger value="reservations" className="gap-2">
              <Bookmark className="size-4" /> Reservations
            </TabsTrigger>
            <TabsTrigger value="policy" className="gap-2">
              <Sliders className="size-4" /> Policies
            </TabsTrigger>
          </TabsList>

          {isAdminOrStaff && activeTab === "catalogue" && (
            <Button onClick={handleOpenAddBook} className="gap-2">
              <Plus className="size-4" /> Add Book
            </Button>
          )}
        </div>

        {/* 1. CATALOGUE TAB */}
        <TabsContent value="catalogue" className="space-y-4">
          <Card className="surface">
            <CardHeader className="pb-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Library Catalogue</CardTitle>
                  <CardDescription>Browse, search, and manage books in the library inventory.</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[220px]">
                    <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                    <Input
                      placeholder="Search title, author, ISBN..."
                      value={bookQuery}
                      onChange={(e) => setBookQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="General">General</SelectItem>
                      <SelectItem value="Science">Science</SelectItem>
                      <SelectItem value="Mathematics">Mathematics</SelectItem>
                      <SelectItem value="Literature">Literature</SelectItem>
                      <SelectItem value="History">History</SelectItem>
                      <SelectItem value="Technology">Technology</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="available">Available</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="mr-2 size-5 animate-spin" /> Loading catalogue...
                </div>
              ) : books.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <BookOpen className="mx-auto size-12 opacity-30" />
                  <p className="mt-2 text-sm">No books found matching your criteria.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {books.map((book) => (
                    <div
                      key={book.id}
                      className="flex flex-col justify-between rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-sm"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold leading-tight line-clamp-1">{book.title}</h3>
                          <Badge
                            variant={
                              book.availableCopies > 0 && book.status === "available"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {book.status === "available"
                              ? `${book.availableCopies} available`
                              : book.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">by <span className="font-medium text-foreground">{book.author}</span></p>
                        <div className="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                          {book.category && <Badge variant="outline">{book.category}</Badge>}
                          {book.isbn && <span className="rounded bg-muted px-1.5 py-0.5">ISBN: {book.isbn}</span>}
                          {book.callNumber && <span className="rounded bg-muted px-1.5 py-0.5">Call: {book.callNumber}</span>}
                        </div>
                        {book.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{book.description}</p>
                        )}
                        {book.shelfLocation && (
                          <p className="text-xs font-medium text-primary">
                            Shelf Location: {book.shelfLocation}
                          </p>
                        )}
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              setLoadingBookDetails(true);
                              setSelectedBook(book);
                              const details = await getLibraryBookDetails({ data: { id: book.id } });
                              setBookDetails(details);
                            } catch (err: any) {
                              toast.error(err.message || "Failed to load book details");
                            } finally {
                              setLoadingBookDetails(false);
                            }
                          }}
                          className="h-7 text-xs gap-1"
                        >
                          <Info className="size-3" /> View Details
                        </Button>
                        <div className="flex items-center gap-1">
                          {book.availableCopies === 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReserveBook(book)}
                              className="h-7 text-xs"
                            >
                              Reserve
                            </Button>
                          )}
                          {isAdminOrStaff && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                onClick={() => handleOpenEditBook(book)}
                              >
                                <Edit className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteBook(book.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. LENDING (QUICK CHECKOUT) TAB */}
        {isAdminOrStaff && (
          <TabsContent value="lending" className="space-y-6">
            <Card className="surface">
              <CardHeader>
                <CardTitle>Issue Book Loan (Quick Checkout)</CardTitle>
                <CardDescription>
                  Search borrower (student or staff) to auto-populate full profile, loan limits, and fee clearance details.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Borrower Auto-Population Search */}
                <div className="space-y-2">
                  <Label>Search Borrower</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                      <Input
                        placeholder="Type student name, admission number, staff name, or employee ID..."
                        value={borrowerSearchQuery}
                        onChange={(e) => {
                          setBorrowerSearchQuery(e.target.value);
                          setSelectedBorrower(null);
                        }}
                        className="pl-9"
                      />
                    </div>
                    <Select
                      value={borrowerTypeFilter}
                      onValueChange={(val: any) => setBorrowerTypeFilter(val)}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Borrower Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="student">Students</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Search Candidates Dropdown list */}
                {!selectedBorrower && (candidateBorrowers.students.length > 0 || candidateBorrowers.staff.length > 0) && (
                  <div className="rounded-md border border-border bg-card p-3 space-y-2 max-h-[250px] overflow-y-auto">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Select Borrower ({candidateBorrowers.students.length + candidateBorrowers.staff.length} matches)
                    </p>
                    {candidateBorrowers.students.map((s) => (
                      <div
                        key={s.borrowerAdmissionId}
                        onClick={() => setSelectedBorrower(s)}
                        className="flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer text-sm"
                      >
                        <div>
                          <p className="font-medium">{s.name} <Badge variant="outline" className="ml-1 text-[10px]">Student</Badge></p>
                          <p className="text-xs text-muted-foreground">
                            Admission No: {s.identifier} · Class: {s.className}
                          </p>
                        </div>
                        <div className="text-right text-xs">
                          <p className="text-muted-foreground">Active Loans: {s.activeLoanCount}/{stats?.policies?.maxLoans || 3}</p>
                          <Badge variant={s.paymentStatus === "overdue" ? "destructive" : "secondary"}>
                            Fee: {s.paymentStatus}
                          </Badge>
                        </div>
                      </div>
                    ))}
                    {candidateBorrowers.staff.map((s) => (
                      <div
                        key={s.borrowerProfileId}
                        onClick={() => setSelectedBorrower(s)}
                        className="flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer text-sm"
                      >
                        <div>
                          <p className="font-medium">{s.name} <Badge variant="outline" className="ml-1 text-[10px]">Staff</Badge></p>
                          <p className="text-xs text-muted-foreground">
                            Employee ID/Email: {s.identifier} · Dept: {s.department}
                          </p>
                        </div>
                        <div className="text-right text-xs">
                          <p className="text-muted-foreground">Active Loans: {s.activeLoanCount}/{stats?.policies?.maxLoans || 3}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Selected Borrower Details Card */}
                {selectedBorrower && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-base">{selectedBorrower.name}</h4>
                          <Badge variant="default" className="capitalize">
                            {selectedBorrower.borrowerType}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          ID / Number: <span className="font-medium text-foreground">{selectedBorrower.identifier}</span>
                          {selectedBorrower.className && ` · Class: ${selectedBorrower.className}`}
                          {selectedBorrower.department && ` · Dept: ${selectedBorrower.department}`}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedBorrower(null)}>
                        Change Borrower
                      </Button>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 pt-2 border-t border-border/50 text-xs">
                      <div>
                        <span className="text-muted-foreground">Active Loans: </span>
                        <span className="font-semibold">{selectedBorrower.activeLoanCount} of {stats?.policies?.maxLoans || 3} allowed</span>
                      </div>
                      {selectedBorrower.borrowerType === "student" && (
                        <div>
                          <span className="text-muted-foreground">Fee Payment Status: </span>
                          <span className={`font-semibold capitalize ${selectedBorrower.paymentStatus === "overdue" ? "text-destructive" : "text-emerald-600"}`}>
                            {selectedBorrower.paymentStatus}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Eligibility Warnings */}
                    {selectedBorrower.eligibility?.warnings?.length > 0 && (
                      <div className="rounded border border-warning/50 bg-warning/10 p-2 text-xs text-warning-foreground flex items-start gap-2">
                        <ShieldAlert className="size-4 shrink-0 mt-0.5 text-warning" />
                        <div>
                          {selectedBorrower.eligibility.warnings.map((w: string, idx: number) => (
                            <p key={idx}>{w}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Checkout Form */}
                {selectedBorrower && (
                  <div className="grid gap-4 sm:grid-cols-2 pt-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Select Book to Issue</Label>
                      <Select value={checkoutBookId} onValueChange={setCheckoutBookId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose available book title..." />
                        </SelectTrigger>
                        <SelectContent>
                          {books
                            .filter((b) => b.availableCopies > 0 && b.status === "available")
                            .map((b) => (
                              <SelectItem key={b.id} value={b.id}>
                                {b.title} by {b.author} ({b.availableCopies} available)
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Issue Date</Label>
                      <Input
                        type="date"
                        value={checkoutIssueDate}
                        onChange={(e) => setCheckoutIssueDate(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Due Date (Auto-calculated: {stats?.policies?.loanDays || 14} days)</Label>
                      <Input
                        type="date"
                        value={checkoutDueDate}
                        onChange={(e) => setCheckoutDueDate(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <Label>Notes / Conditions (Optional)</Label>
                      <Textarea
                        placeholder="Add remarks or notes regarding book condition at issuance..."
                        value={checkoutNotes}
                        onChange={(e) => setCheckoutNotes(e.target.value)}
                        rows={2}
                      />
                    </div>

                    <div className="sm:col-span-2 pt-2">
                      <Button
                        onClick={handleIssueLoan}
                        disabled={checkoutSubmitting || !selectedBorrower?.eligibility?.eligible}
                        className="w-full sm:w-auto"
                      >
                        {checkoutSubmitting ? "Issuing Loan..." : "Confirm & Issue Book Loan"}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* 3. LOANS & RETURNS TAB */}
        <TabsContent value="loans" className="space-y-4">
          <Card className="surface">
            <CardHeader className="pb-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Library Loans & Returns</CardTitle>
                  <CardDescription>Track active borrowings, processed returns, and calculate late fees.</CardDescription>
                </div>
                <Select value={loanStatusFilter} onValueChange={setLoanStatusFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Filter Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="issued">Issued / Active</SelectItem>
                    <SelectItem value="overdue">Overdue Only</SelectItem>
                    <SelectItem value="returned">Returned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loans.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <ArrowRightLeft className="mx-auto size-12 opacity-30" />
                  <p className="mt-2 text-sm">No loan records match the filter.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                      <tr>
                        <th className="p-3">Book Title</th>
                        <th className="p-3">Borrower</th>
                        <th className="p-3">Issue Date</th>
                        <th className="p-3">Due Date</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Fine</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {loans.map((loan) => (
                        <tr key={loan.id} className="hover:bg-muted/30">
                          <td className="p-3 font-medium">
                            {loan.bookTitle}
                            <span className="block text-xs font-normal text-muted-foreground">by {loan.bookAuthor}</span>
                          </td>
                          <td className="p-3">
                            {loan.borrowerName}
                            <span className="block text-xs text-muted-foreground">
                              {loan.borrowerType} · {loan.borrowerIdentifier}
                            </span>
                          </td>
                          <td className="p-3 text-xs">{loan.issueDate}</td>
                          <td className="p-3 text-xs font-medium">{loan.dueDate}</td>
                          <td className="p-3">
                            <Badge
                              variant={
                                loan.status === "returned"
                                  ? "secondary"
                                  : loan.status === "overdue"
                                    ? "destructive"
                                    : "default"
                              }
                            >
                              {loan.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-xs">
                            {loan.fineAmount > 0 ? (
                              <span className={loan.finePaid ? "text-muted-foreground line-through" : "font-bold text-destructive"}>
                                {financeConfig.money(loan.fineAmount)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-3 text-right space-x-1">
                            {isAdminOrStaff && loan.status !== "returned" && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedLoanForReturn(loan);
                                    setCustomFineAmount(loan.fineAmount);
                                  }}
                                  className="h-8 text-xs"
                                >
                                  Return Book
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRenewLoan(loan)}
                                  className="h-8 text-xs gap-1"
                                >
                                  <RotateCcw className="size-3" /> Renew
                                </Button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. OVERDUE & FINES TAB */}
        <TabsContent value="fines" className="space-y-4">
          <Card className="surface">
            <CardHeader>
              <CardTitle>Overdue Items & Fine Management</CardTitle>
              <CardDescription>
                View late returns, outstanding fine assessments, and record fine payments.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loans.filter((l) => l.fineAmount > 0 || l.status === "overdue").length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <CheckCircle2 className="mx-auto size-12 text-emerald-500 opacity-80" />
                  <p className="mt-2 text-sm">No overdue loans or outstanding fines on record.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                      <tr>
                        <th className="p-3">Borrower</th>
                        <th className="p-3">Book Title</th>
                        <th className="p-3">Due Date</th>
                        <th className="p-3">Calculated Fine</th>
                        <th className="p-3">Payment Status</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {loans
                        .filter((l) => l.fineAmount > 0 || l.status === "overdue")
                        .map((l) => (
                          <tr key={l.id} className="hover:bg-muted/30">
                            <td className="p-3 font-medium">
                              {l.borrowerName}
                              <span className="block text-xs text-muted-foreground">{l.borrowerIdentifier}</span>
                            </td>
                            <td className="p-3">{l.bookTitle}</td>
                            <td className="p-3 text-xs">{l.dueDate}</td>
                            <td className="p-3 font-bold text-destructive">
                              {financeConfig.money(l.fineAmount)}
                            </td>
                            <td className="p-3">
                              <Badge variant={l.finePaid ? "default" : "destructive"}>
                                {l.finePaid ? "Paid" : "Unpaid Fine"}
                              </Badge>
                            </td>
                            <td className="p-3 text-right">
                              {isAdminOrStaff && !l.finePaid && l.fineAmount > 0 && (
                                <Button
                                  size="sm"
                                  onClick={() => handlePayFine(l.id)}
                                  className="h-8 text-xs gap-1"
                                >
                                  <DollarSign className="size-3.5" /> Mark Paid
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 5. RESERVATIONS TAB */}
        <TabsContent value="reservations" className="space-y-4">
          <Card className="surface">
            <CardHeader>
              <CardTitle>Book Holds & Reservations</CardTitle>
              <CardDescription>
                Reservations for books that are currently checked out.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reservations.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Bookmark className="mx-auto size-12 opacity-30" />
                  <p className="mt-2 text-sm">No pending reservations.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                      <tr>
                        <th className="p-3">Book Title</th>
                        <th className="p-3">Reserved By</th>
                        <th className="p-3">Available Copies</th>
                        <th className="p-3">Reservation Date</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {reservations.map((r) => (
                        <tr key={r.id} className="hover:bg-muted/30">
                          <td className="p-3 font-medium">{r.bookTitle}</td>
                          <td className="p-3">{r.borrowerName}</td>
                          <td className="p-3 text-xs font-semibold">
                            {r.availableCopies > 0 ? (
                              <span className="text-emerald-600 font-bold">{r.availableCopies} available now</span>
                            ) : (
                              <span className="text-muted-foreground">0 (Checked out)</span>
                            )}
                          </td>
                          <td className="p-3 text-xs">
                            {format(parseISO(r.reservationDate), "yyyy-MM-dd HH:mm")}
                          </td>
                          <td className="p-3">
                            <Badge variant="outline">{r.status}</Badge>
                          </td>
                          <td className="p-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancelReservation(r.id)}
                              className="h-8 text-xs text-destructive hover:text-destructive"
                            >
                              Cancel
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 6. POLICY CONTEXT TAB */}
        <TabsContent value="policy" className="space-y-4">
          <Card className="surface">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Active Library Policies & Integration</CardTitle>
                  <CardDescription>
                    Governed centrally under Operations Configuration (`__operations_rules`).
                  </CardDescription>
                </div>
                {isAdminOrStaff && (
                  <Button variant="outline" size="sm" asChild className="gap-2">
                    <Link to="/portal/operations-configuration">
                      <Sliders className="size-4" /> Edit Rules in Configuration
                    </Link>
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Standard Loan Period</p>
                  <p className="text-2xl font-bold mt-1">{stats?.policies?.loanDays || 14} days</p>
                  <p className="text-xs text-muted-foreground mt-1">Default borrowing window per checkout</p>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Max Books Per Borrower</p>
                  <p className="text-2xl font-bold mt-1">{stats?.policies?.maxLoans || 3} books</p>
                  <p className="text-xs text-muted-foreground mt-1">Maximum active loans enforced at checkout</p>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Renewals Allowed</p>
                  <p className="text-2xl font-bold mt-1">{stats?.policies?.renewals || 1} renewal</p>
                  <p className="text-xs text-muted-foreground mt-1">Max times a borrower can extend a loan</p>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Daily Late Fine</p>
                  <p className="text-2xl font-bold mt-1 text-destructive">
                    {financeConfig.money(stats?.policies?.finePerDay || 1)} / day
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Automatic overdue penalty per calendar day</p>
                </div>
              </div>

              <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4 space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <Info className="size-4 text-primary" /> Centralized System Dependencies & Integration Rules
                </h4>
                <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
                  <li><strong>Operations Configuration:</strong> Governs loan duration, max limits, fine rates, and renewal allowances.</li>
                  <li><strong>People Configuration & Admissions:</strong> Automatically checks active student enrolment status and staff employment scopes during borrower lookup.</li>
                  <li><strong>Financial Configuration:</strong> Formats currency through central financial settings and audits unpaid fine balances against student financial profiles.</li>
                  <li><strong>System Audit Logging:</strong> Every book checkout, return, renewal, fine payment, and catalogue mutation is immutably logged.</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ADD / EDIT BOOK DIALOG */}
      <Dialog open={isAddBookOpen} onOpenChange={setIsAddBookOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEditingBook ? "Edit Book Entry" : "Add Book to Library Catalogue"}</DialogTitle>
            <DialogDescription>Fill in title, author, copies, and location information.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveBook} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Book Title *</Label>
                <Input
                  required
                  value={bookForm.title}
                  onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })}
                  placeholder="e.g. Pure Mathematics for Secondary Schools"
                />
              </div>

              <div className="space-y-2">
                <Label>Author(s) *</Label>
                <Input
                  required
                  value={bookForm.author}
                  onChange={(e) => setBookForm({ ...bookForm, author: e.target.value })}
                  placeholder="e.g. J. K. Lawson"
                />
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                <Input
                  value={bookForm.category}
                  onChange={(e) => setBookForm({ ...bookForm, category: e.target.value })}
                  placeholder="e.g. Science, Mathematics"
                />
              </div>

              <div className="space-y-2">
                <Label>ISBN</Label>
                <Input
                  value={bookForm.isbn}
                  onChange={(e) => setBookForm({ ...bookForm, isbn: e.target.value })}
                  placeholder="e.g. 978-0-123456-78-9"
                />
              </div>

              <div className="space-y-2">
                <Label>Call Number / Shelf Code</Label>
                <Input
                  value={bookForm.callNumber}
                  onChange={(e) => setBookForm({ ...bookForm, callNumber: e.target.value })}
                  placeholder="e.g. 510 LAW 2022"
                />
              </div>

              <div className="space-y-2">
                <Label>Total Copies</Label>
                <Input
                  type="number"
                  min={1}
                  required
                  value={bookForm.totalCopies}
                  onChange={(e) => {
                    const total = parseInt(e.target.value) || 1;
                    setBookForm({
                      ...bookForm,
                      totalCopies: total,
                      availableCopies: isEditingBook ? Math.min(bookForm.availableCopies, total) : total,
                    });
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label>Available Copies</Label>
                <Input
                  type="number"
                  min={0}
                  required
                  value={bookForm.availableCopies}
                  onChange={(e) => setBookForm({ ...bookForm, availableCopies: parseInt(e.target.value) || 0 })}
                />
              </div>

              <div className="space-y-2">
                <Label>Shelf Location</Label>
                <Input
                  value={bookForm.shelfLocation}
                  onChange={(e) => setBookForm({ ...bookForm, shelfLocation: e.target.value })}
                  placeholder="e.g. Section B - Rack 4"
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={bookForm.status}
                  onValueChange={(val) => setBookForm({ ...bookForm, status: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>Description / Summary</Label>
                <Textarea
                  value={bookForm.description}
                  onChange={(e) => setBookForm({ ...bookForm, description: e.target.value })}
                  placeholder="Brief synopsis or details..."
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddBookOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {isEditingBook ? "Save Changes" : "Add Book"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* BOOK DETAILS DIALOG */}
      <Dialog
        open={!!selectedBook}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedBook(null);
            setBookDetails(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedBook?.title}</DialogTitle>
            <DialogDescription>by {selectedBook?.author}</DialogDescription>
          </DialogHeader>

          {loadingBookDetails ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 size-5 animate-spin" /> Loading details...
            </div>
          ) : bookDetails ? (
            <div className="space-y-4 text-xs">
              <div className="grid gap-2 sm:grid-cols-2 rounded-md bg-muted p-3">
                <div>
                  <span className="text-muted-foreground">Category: </span>
                  <span className="font-semibold">{bookDetails.book.category}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">ISBN: </span>
                  <span className="font-semibold">{bookDetails.book.isbn || "N/A"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Call Number: </span>
                  <span className="font-semibold">{bookDetails.book.callNumber || "N/A"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Shelf Location: </span>
                  <span className="font-semibold">{bookDetails.book.shelfLocation || "N/A"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Copies: </span>
                  <span className="font-semibold">{bookDetails.book.totalCopies}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Available On Shelf: </span>
                  <span className="font-bold text-emerald-600">{bookDetails.book.availableCopies}</span>
                </div>
              </div>

              {bookDetails.book.description && (
                <div>
                  <p className="font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Synopsis / Description</p>
                  <p className="rounded bg-muted/50 p-2 text-foreground">{bookDetails.book.description}</p>
                </div>
              )}

              <div>
                <p className="font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">
                  Active Loans ({bookDetails.activeLoans.length})
                </p>
                {bookDetails.activeLoans.length === 0 ? (
                  <p className="text-muted-foreground italic">No active loans for this book.</p>
                ) : (
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {bookDetails.activeLoans.map((l: any) => (
                      <div key={l.id} className="flex justify-between p-2 rounded bg-muted/40 text-xs">
                        <span>{l.borrower_name} ({l.borrower_identifier || l.borrower_type})</span>
                        <span className="font-medium text-destructive">Due: {l.due_date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">
                  Pending Reservations ({bookDetails.pendingReservations.length})
                </p>
                {bookDetails.pendingReservations.length === 0 ? (
                  <p className="text-muted-foreground italic">No pending hold requests.</p>
                ) : (
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {bookDetails.pendingReservations.map((r: any) => (
                      <div key={r.id} className="flex justify-between p-2 rounded bg-muted/40 text-xs">
                        <span>{r.borrower_name}</span>
                        <Badge variant="outline" className="text-[10px]">Queue</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedBook(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RETURN BOOK DIALOG */}
      <Dialog open={!!selectedLoanForReturn} onOpenChange={(open) => !open && setSelectedLoanForReturn(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Return Book Loan</DialogTitle>
            <DialogDescription>
              Confirm return details for "{selectedLoanForReturn?.bookTitle}".
            </DialogDescription>
          </DialogHeader>

          {selectedLoanForReturn && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted p-3 text-xs space-y-1">
                <p><strong>Borrower:</strong> {selectedLoanForReturn.borrowerName} ({selectedLoanForReturn.borrowerIdentifier})</p>
                <p><strong>Due Date:</strong> {selectedLoanForReturn.dueDate}</p>
                <p><strong>Current Calculated Fine:</strong> <span className="text-destructive font-bold">{financeConfig.money(selectedLoanForReturn.fineAmount)}</span></p>
              </div>

              <div className="space-y-2">
                <Label>Return Date</Label>
                <Input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Fine Amount to Charge ({financeConfig.currency})</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={customFineAmount}
                  onChange={(e) => setCustomFineAmount(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="space-y-2">
                <Label>Return Notes (Optional)</Label>
                <Textarea
                  placeholder="Remarks on book condition or fine details..."
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedLoanForReturn(null)}>
                  Cancel
                </Button>
                <Button onClick={handleReturnLoanSubmit} disabled={returnSubmitting}>
                  {returnSubmitting ? "Processing Return..." : "Confirm Return"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
