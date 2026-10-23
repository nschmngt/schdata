import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getInvoicesOverview,
  recordInvoicePayment,
  issueInvoice,
  voidInvoice,
} from "@/lib/invoices.functions";
import {
  type InvoiceRecord,
  type ReceiptRecord,
  filterInvoices,
} from "@/lib/invoices";
import { useFinanceConfig } from "@/hooks/useFinanceConfig";
import { formatCurrency } from "@/lib/finance";
import { ALL_LEVELS } from "@/lib/education-levels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FileText,
  Receipt,
  PlusCircle,
  CreditCard,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  Ban,
  Download,
  Printer,
  ShieldCheck,
  Building2,
  Calendar,
  Layers,
  ArrowUpRight,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

export function InvoicesManagement() {
  const queryClient = useQueryClient();
  const finConfig = useFinanceConfig();

  // Queries
  const { data, isLoading, error } = useQuery({
    queryKey: ["invoicesOverview"],
    queryFn: () => getInvoicesOverview(),
  });

  // State
  const [activeTab, setActiveTab] = useState("invoices");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [termFilter, setTermFilter] = useState("all");

  // Selected modals
  const [selectedInvoiceForView, setSelectedInvoiceForView] = useState<InvoiceRecord | null>(null);
  const [selectedInvoiceForPay, setSelectedInvoiceForPay] = useState<InvoiceRecord | null>(null);
  const [selectedInvoiceForVoid, setSelectedInvoiceForVoid] = useState<InvoiceRecord | null>(null);
  const [selectedReceiptForView, setSelectedReceiptForView] = useState<ReceiptRecord | null>(null);
  const [isIssueOpen, setIsIssueOpen] = useState(false);

  // Form states
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<string>("bank-transfer");
  const [payReference, setPayReference] = useState("");
  const [payEntryDate, setPayEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [payPostIncome, setPayPostIncome] = useState(true);

  const [issueAdmissionId, setIssueAdmissionId] = useState("");
  const [issueTerm, setIssueTerm] = useState("");
  const [issueDueDate, setIssueDueDate] = useState("");
  const [issueNotes, setIssueNotes] = useState("");
  const [lineItems, setLineItems] = useState<Array<{ description: string; feeCategory: string; amount: number }>>([
    { description: "Tuition Fee", feeCategory: "tuition", amount: 0 },
  ]);

  const [voidReason, setVoidReason] = useState("");

  // Default initial values when invoice or overview loads
  useEffect(() => {
    if (data?.activePeriod) {
      setIssueTerm(data.activePeriod);
    }
  }, [data]);

  useEffect(() => {
    if (selectedInvoiceForPay) {
      setPayAmount(selectedInvoiceForPay.balance);
    }
  }, [selectedInvoiceForPay]);

  // Mutations
  const recordPayMut = useMutation({
    mutationFn: recordInvoicePayment,
    onSuccess: () => {
      toast.success("Payment successfully recorded against invoice!");
      queryClient.invalidateQueries({ queryKey: ["invoicesOverview"] });
      setSelectedInvoiceForPay(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to record payment");
    },
  });

  const issueInvMut = useMutation({
    mutationFn: issueInvoice,
    onSuccess: () => {
      toast.success("New invoice issued successfully!");
      queryClient.invalidateQueries({ queryKey: ["invoicesOverview"] });
      setIsIssueOpen(false);
      // reset form
      setLineItems([{ description: "Tuition Fee", feeCategory: "tuition", amount: 0 }]);
      setIssueNotes("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to issue invoice");
    },
  });

  const voidInvMut = useMutation({
    mutationFn: voidInvoice,
    onSuccess: () => {
      toast.success("Invoice voided successfully");
      queryClient.invalidateQueries({ queryKey: ["invoicesOverview"] });
      setSelectedInvoiceForVoid(null);
      setVoidReason("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to void invoice");
    },
  });

  // Derived filtered records
  const filteredInvoices = useMemo(() => {
    if (!data?.invoices) return [];
    return filterInvoices(data.invoices, {
      search,
      status: statusFilter,
      className: classFilter,
      levelCode: levelFilter,
      term: termFilter,
    });
  }, [data?.invoices, search, statusFilter, classFilter, levelFilter, termFilter]);

  const filteredReceipts = useMemo(() => {
    if (!data?.receipts) return [];
    const normSearch = search.trim().toLowerCase();
    const normClass = classFilter.trim().toLowerCase();
    const normTerm = termFilter.trim().toLowerCase();

    return data.receipts.filter((r) => {
      if (normClass !== "all" && r.className.toLowerCase() !== normClass) return false;
      if (normTerm !== "all" && r.term.toLowerCase() !== normTerm) return false;
      if (normSearch) {
        const match =
          r.receiptNumber.toLowerCase().includes(normSearch) ||
          r.invoiceNumber.toLowerCase().includes(normSearch) ||
          r.studentName.toLowerCase().includes(normSearch) ||
          r.admissionNumber.toLowerCase().includes(normSearch);
        if (!match) return false;
      }
      return true;
    });
  }, [data?.receipts, search, classFilter, termFilter]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center surface p-8">
        <p className="text-sm text-muted-foreground animate-pulse">
          Loading Invoices & Receipts module context...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="surface p-6 text-destructive">
        <p className="font-semibold">Error loading Invoices module</p>
        <p className="text-sm mt-1">{(error as any)?.message || "Failed to retrieve invoice ledger data."}</p>
      </div>
    );
  }

  const { school, summary, categories, paymentMethods, students, classes } = data;

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Billed / Issued</CardTitle>
            <FileText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary.totalIssued, finConfig.currency)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.totalInvoicesCount} total issued invoice(s)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
            <Receipt className="size-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(summary.totalCollected, finConfig.currency)}
            </div>
            <p className="text-xs text-emerald-600/80 mt-1 font-medium flex items-center gap-1">
              <TrendingUp className="size-3" /> {summary.collectionRate}% Collection Rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
            <Clock className="size-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {formatCurrency(summary.totalOutstanding, finConfig.currency)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.pendingCount + summary.partiallyPaidCount} pending / partial
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue Amount</CardTitle>
            <AlertCircle className="size-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {formatCurrency(summary.totalOverdue, finConfig.currency)}
            </div>
            <p className="text-xs text-destructive/80 mt-1 font-medium">
              {summary.overdueCount} overdue invoice(s)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Control Bar: Search & Filters */}
      <div className="surface p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-1 items-center gap-2 min-w-[260px]">
            <Search className="size-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="Search by invoice #, receipt #, student name, or admission..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="partially_paid">Partially Paid</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="void">Void</SelectItem>
              </SelectContent>
            </Select>

            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue placeholder="Class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                {ALL_LEVELS.map((lvl) => (
                  <SelectItem key={lvl.code} value={lvl.code}>
                    {lvl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              onClick={() => setIsIssueOpen(true)}
              className="h-9 gap-1.5"
            >
              <PlusCircle className="size-4" /> Issue Custom Invoice
            </Button>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/60 p-1">
          <TabsTrigger value="invoices" className="gap-2">
            <FileText className="size-4" /> Issued Invoices ({filteredInvoices.length})
          </TabsTrigger>
          <TabsTrigger value="receipts" className="gap-2">
            <Receipt className="size-4" /> Receipts & Payment History ({filteredReceipts.length})
          </TabsTrigger>
          <TabsTrigger value="governance" className="gap-2">
            <ShieldCheck className="size-4" /> Alignment & Control Plane
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Issued Invoices */}
        <TabsContent value="invoices" className="space-y-4">
          <div className="surface rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Class / Level</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Issue / Due Date</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                      No invoices found matching current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs font-semibold">
                        {inv.invoiceNumber}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{inv.studentName}</div>
                        <div className="text-xs text-muted-foreground">{inv.admissionNumber}</div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs">{inv.className}</span>
                        <Badge variant="outline" className="ml-1.5 text-[10px]">
                          {inv.levelCode}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{inv.term}</TableCell>
                      <TableCell className="text-xs">
                        <div>{inv.issueDate}</div>
                        {inv.dueDate && (
                          <div className="text-[11px] text-muted-foreground">
                            Due: {inv.dueDate}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium text-xs">
                        {formatCurrency(inv.amountDue, finConfig.currency)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-xs text-emerald-600">
                        {formatCurrency(inv.amountPaid, finConfig.currency)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-xs text-amber-600">
                        {formatCurrency(inv.balance, finConfig.currency)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={inv.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => setSelectedInvoiceForView(inv)}
                          >
                            <FileText className="size-3.5 mr-1" /> View
                          </Button>

                          {inv.status !== "paid" && inv.status !== "void" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 text-xs gap-1 border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                              onClick={() => setSelectedInvoiceForPay(inv)}
                            >
                              <CreditCard className="size-3.5" /> Pay
                            </Button>
                          )}

                          {inv.amountPaid === 0 && inv.status !== "void" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10"
                              onClick={() => setSelectedInvoiceForVoid(inv)}
                            >
                              <Ban className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Tab 2: Receipts & Payment History */}
        <TabsContent value="receipts" className="space-y-4">
          <div className="surface rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Receipt #</TableHead>
                  <TableHead>Invoice Ref #</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Class / Term</TableHead>
                  <TableHead>Payment Method</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount Collected</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReceipts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      No payment receipt records available.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReceipts.map((rcpt) => (
                    <TableRow key={rcpt.id}>
                      <TableCell className="font-mono text-xs font-semibold text-emerald-700">
                        {rcpt.receiptNumber}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {rcpt.invoiceNumber}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{rcpt.studentName}</div>
                        <div className="text-xs text-muted-foreground">{rcpt.admissionNumber}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {rcpt.className} · {rcpt.term}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="capitalize">
                          {rcpt.paymentMethod}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{rcpt.entryDate}</TableCell>
                      <TableCell className="text-right font-bold text-sm text-emerald-600">
                        {formatCurrency(rcpt.amountPaid, finConfig.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={() => setSelectedReceiptForView(rcpt)}
                        >
                          <Printer className="size-3.5 mr-1" /> Receipt
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Tab 3: Governance & Configuration Control Plane */}
        <TabsContent value="governance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" /> Centralized Financial Control Plane Integration
              </CardTitle>
              <CardDescription>
                The Invoices module inherits rules, numbering templates, and access controls directly from the centralized configuration system.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-3">
              <div className="space-y-2 rounded-lg border p-4 bg-muted/20">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <Building2 className="size-4 text-muted-foreground" />
                  School & Provisioning Context
                </div>
                <p className="text-xs text-muted-foreground">
                  Operating under provisioned school context: <strong>{school?.name ?? "Default School"}</strong> (Code: {data.invoiceNumberingConfig.schoolCode}).
                </p>
              </div>

              <div className="space-y-2 rounded-lg border p-4 bg-muted/20">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <FileText className="size-4 text-muted-foreground" />
                  Invoice Numbering Template
                </div>
                <p className="text-xs text-muted-foreground">
                  Template: <code className="bg-muted px-1 py-0.5 rounded text-[11px] font-mono">{data.invoiceNumberingConfig.format}</code> (Sequence length: {data.invoiceNumberingConfig.sequenceDigits}).
                </p>
              </div>

              <div className="space-y-2 rounded-lg border p-4 bg-muted/20">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <Receipt className="size-4 text-muted-foreground" />
                  Receipt Numbering Template
                </div>
                <p className="text-xs text-muted-foreground">
                  Template: <code className="bg-muted px-1 py-0.5 rounded text-[11px] font-mono">{data.receiptNumberingConfig.format}</code> (Sequence length: {data.receiptNumberingConfig.sequenceDigits}).
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* MODAL 1: View Printable Invoice */}
      {selectedInvoiceForView && (
        <Dialog open={!!selectedInvoiceForView} onOpenChange={() => setSelectedInvoiceForView(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>Official Issued Invoice</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {selectedInvoiceForView.invoiceNumber}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                {school?.name || "School"} official billing statement for student records.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 my-2 border rounded-lg p-6 bg-background">
              {/* Header */}
              <div className="flex justify-between items-start border-b pb-4">
                <div>
                  <h3 className="font-bold text-lg">{school?.name ?? "School Name"}</h3>
                  <p className="text-xs text-muted-foreground">Official Student Fee Statement</p>
                </div>
                <div className="text-right">
                  <StatusBadge status={selectedInvoiceForView.status} />
                  <p className="text-xs text-muted-foreground mt-1">
                    Issued: {selectedInvoiceForView.issueDate}
                  </p>
                </div>
              </div>

              {/* Student Meta */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-muted-foreground font-semibold uppercase tracking-wide">Billed To</p>
                  <p className="font-bold text-sm mt-0.5">{selectedInvoiceForView.studentName}</p>
                  <p className="text-muted-foreground">Adm #: {selectedInvoiceForView.admissionNumber}</p>
                  <p className="text-muted-foreground">Class: {selectedInvoiceForView.className} ({selectedInvoiceForView.levelCode})</p>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground font-semibold uppercase tracking-wide">Billing Cycle</p>
                  <p className="font-medium mt-0.5">Term: {selectedInvoiceForView.term}</p>
                  {selectedInvoiceForView.dueDate && (
                    <p className="text-muted-foreground">Due Date: {selectedInvoiceForView.dueDate}</p>
                  )}
                </div>
              </div>

              {/* Line items table */}
              <div className="border rounded">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs">Category</TableHead>
                      <TableHead className="text-right text-xs">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedInvoiceForView.lineItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-xs font-medium">{item.description}</TableCell>
                        <TableCell className="text-xs capitalize">{item.feeCategory}</TableCell>
                        <TableCell className="text-right text-xs font-mono">
                          {formatCurrency(item.amount, finConfig.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Summary totals */}
              <div className="flex justify-end pt-2">
                <div className="w-64 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Billed:</span>
                    <span className="font-mono font-medium">
                      {formatCurrency(selectedInvoiceForView.amountDue, finConfig.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount Paid:</span>
                    <span className="font-mono font-medium text-emerald-600">
                      {formatCurrency(selectedInvoiceForView.amountPaid, finConfig.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-1.5 font-bold text-sm">
                    <span>Balance Due:</span>
                    <span className="font-mono text-amber-600">
                      {formatCurrency(selectedInvoiceForView.balance, finConfig.currency)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => window.print()} className="gap-1.5">
                <Printer className="size-4" /> Print Invoice
              </Button>
              <Button onClick={() => setSelectedInvoiceForView(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* MODAL 2: Record Payment Dialog */}
      {selectedInvoiceForPay && (
        <Dialog open={!!selectedInvoiceForPay} onOpenChange={() => setSelectedInvoiceForPay(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="size-5 text-emerald-600" />
                Record Payment
              </DialogTitle>
              <DialogDescription>
                Record a payment for <strong>{selectedInvoiceForPay.studentName}</strong> ({selectedInvoiceForPay.invoiceNumber}).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span>Total Invoice Amount:</span>
                  <span className="font-mono font-semibold">{formatCurrency(selectedInvoiceForPay.amountDue, finConfig.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Current Outstanding Balance:</span>
                  <span className="font-mono font-bold text-amber-600">{formatCurrency(selectedInvoiceForPay.balance, finConfig.currency)}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Amount Paid ({finConfig.currency.code})</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={selectedInvoiceForPay.balance}
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Payment Method</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((m) => (
                      <SelectItem key={m.code} value={m.code}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Reference / Bank Slip # (Optional)</Label>
                <Input
                  placeholder="e.g. TXN-98472910"
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Entry Date</Label>
                <Input
                  type="date"
                  value={payEntryDate}
                  onChange={(e) => setPayEntryDate(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedInvoiceForPay(null)}>
                Cancel
              </Button>
              <Button
                disabled={payAmount <= 0 || recordPayMut.isPending}
                onClick={() =>
                  recordPayMut.mutate({
                    invoiceId: selectedInvoiceForPay.id,
                    amountPaid: payAmount,
                    paymentMethod: payMethod,
                    reference: payReference || undefined,
                    entryDate: payEntryDate,
                    postToIncome: payPostIncome,
                  })
                }
              >
                {recordPayMut.isPending ? "Recording..." : "Confirm & Post Payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* MODAL 3: Issue Invoice Dialog */}
      <Dialog open={isIssueOpen} onOpenChange={setIsIssueOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Issue Custom Invoice</DialogTitle>
            <DialogDescription>
              Create and issue a student fee invoice directly to a student's ledger.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Target Student</Label>
              <Select value={issueAdmissionId} onValueChange={setIssueAdmissionId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select student..." />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.student_name} ({s.admission_number}) — {s.class_admitted}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Term / Period</Label>
                <Input
                  placeholder="e.g. 2024/2025 - Term 1"
                  value={issueTerm}
                  onChange={(e) => setIssueTerm(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Due Date (Optional)</Label>
                <Input
                  type="date"
                  value={issueDueDate}
                  onChange={(e) => setIssueDueDate(e.target.value)}
                />
              </div>
            </div>

            {/* Line items list */}
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs font-semibold">Line Items</Label>
              {lineItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    placeholder="Description"
                    className="flex-1 h-8 text-xs"
                    value={item.description}
                    onChange={(e) => {
                      const updated = [...lineItems];
                      updated[idx].description = e.target.value;
                      setLineItems(updated);
                    }}
                  />
                  <Select
                    value={item.feeCategory}
                    onValueChange={(val) => {
                      const updated = [...lineItems];
                      updated[idx].feeCategory = val;
                      setLineItems(updated);
                    }}
                  >
                    <SelectTrigger className="w-[120px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="Amount"
                    className="w-[100px] h-8 text-xs"
                    value={item.amount || ""}
                    onChange={(e) => {
                      const updated = [...lineItems];
                      updated[idx].amount = Number(e.target.value);
                      setLineItems(updated);
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notes / Instructions (Optional)</Label>
              <Input
                placeholder="Additional invoice notes..."
                value={issueNotes}
                onChange={(e) => setIssueNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsIssueOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!issueAdmissionId || !issueTerm || issueInvMut.isPending}
              onClick={() =>
                issueInvMut.mutate({
                  admissionId: issueAdmissionId,
                  term: issueTerm,
                  dueDate: issueDueDate || undefined,
                  lineItems,
                  notes: issueNotes || undefined,
                })
              }
            >
              {issueInvMut.isPending ? "Issuing..." : "Issue Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 4: Void Invoice */}
      {selectedInvoiceForVoid && (
        <Dialog open={!!selectedInvoiceForVoid} onOpenChange={() => setSelectedInvoiceForVoid(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Ban className="size-5" /> Void / Cancel Invoice
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to void invoice <strong>{selectedInvoiceForVoid.invoiceNumber}</strong>?
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Cancellation Reason</Label>
                <Input
                  placeholder="Enter clear audit reason for cancellation..."
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedInvoiceForVoid(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={voidReason.trim().length < 3 || voidInvMut.isPending}
                onClick={() =>
                  voidInvMut.mutate({
                    invoiceId: selectedInvoiceForVoid.id,
                    reason: voidReason,
                  })
                }
              >
                {voidInvMut.isPending ? "Voiding..." : "Confirm Void"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* MODAL 5: View Receipt */}
      {selectedReceiptForView && (
        <Dialog open={!!selectedReceiptForView} onOpenChange={() => setSelectedReceiptForView(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>Official Payment Receipt</span>
                <Badge variant="outline" className="font-mono text-xs text-emerald-700 border-emerald-600">
                  {selectedReceiptForView.receiptNumber}
                </Badge>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 my-2 border rounded-lg p-5 bg-background text-xs">
              <div className="flex justify-between items-start border-b pb-3">
                <div>
                  <h4 className="font-bold text-base">{school?.name ?? "School"}</h4>
                  <p className="text-muted-foreground">Official Receipt</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-muted-foreground">Date: {selectedReceiptForView.entryDate}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <p><span className="text-muted-foreground">Received From:</span> <strong>{selectedReceiptForView.studentName}</strong> ({selectedReceiptForView.admissionNumber})</p>
                <p><span className="text-muted-foreground">Invoice Reference:</span> <code className="font-mono">{selectedReceiptForView.invoiceNumber}</code></p>
                <p><span className="text-muted-foreground">Term / Period:</span> {selectedReceiptForView.term}</p>
                <p><span className="text-muted-foreground">Payment Method:</span> <span className="capitalize">{selectedReceiptForView.paymentMethod}</span></p>
                {selectedReceiptForView.reference && (
                  <p><span className="text-muted-foreground">Reference:</span> {selectedReceiptForView.reference}</p>
                )}
              </div>

              <div className="border-t pt-3 flex justify-between items-center text-sm font-bold">
                <span>Amount Paid:</span>
                <span className="font-mono text-emerald-600 text-base">
                  {formatCurrency(selectedReceiptForView.amountPaid, finConfig.currency)}
                </span>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => window.print()} className="gap-1.5">
                <Printer className="size-4" /> Print Receipt
              </Button>
              <Button onClick={() => setSelectedReceiptForView(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "paid":
      return <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 border-emerald-200">Paid</Badge>;
    case "partially_paid":
      return <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 border-amber-200">Partial</Badge>;
    case "overdue":
      return <Badge variant="destructive">Overdue</Badge>;
    case "void":
      return <Badge variant="outline" className="text-muted-foreground line-through">Void</Badge>;
    default:
      return <Badge variant="secondary">Pending</Badge>;
  }
}
