import { useState, useMemo, useEffect } from "react";
import {
  Receipt,
  Plus,
  Search,
  Filter,
  DollarSign,
  Calendar,
  Layers,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Play,
  Settings2,
  TrendingUp,
  CreditCard,
  Building2,
  ShieldCheck,
  RefreshCw,
  Printer,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cedis } from "@/lib/finance";
import { EDUCATION_LEVELS } from "@/lib/education-levels";
import {
  calculateBalanceSummary,
  mapStudentFeeLedger,
  computeBillingRunPreview,
  resolveApplicableFees,
  type FeeStructureItem,
} from "@/lib/fees-invoicing";
import {
  getFeesInvoicingOverview,
  executeBillingRun,
  recordFeePayment,
  applyFeeAdjustment,
} from "@/lib/fees-invoicing.functions";

export function FeesInvoicingManagement() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("overview");

  // Filters for Student Balances
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [termFilter, setTermFilter] = useState("all");

  // Dialog States
  const [isBillingRunOpen, setIsBillingRunOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [isStatementOpen, setIsStatementOpen] = useState(false);

  const [selectedFeeRecord, setSelectedFeeRecord] = useState<any>(null);

  // Billing Run Form
  const [billingScope, setBillingScope] = useState<"all" | "education_level" | "class">("all");
  const [billingTargetValue, setBillingTargetValue] = useState("");
  const [billingPeriod, setBillingPeriod] = useState("");
  const [billingAcademicYear, setBillingAcademicYear] = useState("");
  const [billingDueDate, setBillingDueDate] = useState("");
  const [billingNotes, setBillingNotes] = useState("");
  const [executingRun, setExecutingRun] = useState(false);

  // Record Payment Form
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [postToIncome, setPostToIncome] = useState(true);
  const [recordingPayment, setRecordingPayment] = useState(false);

  // Fee Adjustment Form
  const [adjustmentType, setAdjustmentType] = useState<"discount" | "waiver" | "penalty">("discount");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [applyingAdjustment, setApplyingAdjustment] = useState(false);

  const loadOverviewData = async () => {
    setLoading(true);
    try {
      const res = await getFeesInvoicingOverview();
      setData(res);
      if (res.activePeriod) {
        setBillingPeriod(res.activePeriod.name);
      }
      if (res.academicCalendar) {
        setBillingAcademicYear(res.academicCalendar.academicYear);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load Fees & Invoicing data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverviewData();
  }, []);

  // Balance Summary Calculations
  const balanceSummary = useMemo(() => {
    if (!data?.fees) return calculateBalanceSummary([]);
    return calculateBalanceSummary(data.fees);
  }, [data?.fees]);

  // Ledger Mapping & Filtering
  const ledgerItems = useMemo(() => {
    if (!data?.fees) return [];
    let items = mapStudentFeeLedger(data.fees);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (i) => i.studentName.toLowerCase().includes(q) || i.admissionNumber.toLowerCase().includes(q),
      );
    }

    if (classFilter !== "all") {
      items = items.filter((i) => i.className.toLowerCase() === classFilter.toLowerCase());
    }

    if (statusFilter !== "all") {
      items = items.filter((i) => i.status === statusFilter);
    }

    if (termFilter !== "all") {
      items = items.filter((i) => i.term.toLowerCase() === termFilter.toLowerCase());
    }

    return items;
  }, [data?.fees, searchQuery, classFilter, statusFilter, termFilter]);

  // Billing Run Preview Calculation
  const dryRunPreview = useMemo(() => {
    if (!data?.students || !data?.feeStructures) {
      return { targetStudentCount: 0, studentsPricedCount: 0, estimatedTotalBilled: 0, sampleStudents: [] };
    }
    return computeBillingRunPreview(
      data.students,
      data.feeStructures,
      billingScope,
      billingTargetValue,
      billingPeriod,
    );
  }, [data?.students, data?.feeStructures, billingScope, billingTargetValue, billingPeriod]);

  // Handle Billing Run Execution
  const handleRunBilling = async () => {
    if (!billingPeriod || !billingAcademicYear) {
      toast.error("Please select a valid academic year and term/period.");
      return;
    }
    setExecutingRun(true);
    try {
      const res = await executeBillingRun({
        academicYear: billingAcademicYear,
        period: billingPeriod,
        targetScope: billingScope,
        targetValue: billingTargetValue,
        dueDate: billingDueDate || null,
        notes: billingNotes,
      });
      toast.success(
        `Billing run executed successfully! Billed ${res.studentsBilled} students for total of ${cedis(res.totalBilled)}.`,
      );
      setIsBillingRunOpen(false);
      setBillingNotes("");
      await loadOverviewData();
    } catch (err: any) {
      toast.error(err.message || "Failed to execute billing run.");
    } finally {
      setExecutingRun(false);
    }
  };

  // Handle Record Payment
  const handleRecordPaymentSubmit = async () => {
    if (!selectedFeeRecord) return;
    const amount = Number(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid payment amount greater than zero.");
      return;
    }

    setRecordingPayment(true);
    try {
      await recordFeePayment({
        feeId: selectedFeeRecord.id,
        amountPaid: amount,
        paymentMethod,
        reference: paymentReference,
        entryDate: paymentDate,
        postToIncome,
      });
      toast.success(`Recorded payment of ${cedis(amount)} successfully.`);
      setIsPaymentOpen(false);
      setSelectedFeeRecord(null);
      setPaymentAmount("");
      setPaymentReference("");
      await loadOverviewData();
    } catch (err: any) {
      toast.error(err.message || "Failed to record payment.");
    } finally {
      setRecordingPayment(false);
    }
  };

  // Handle Fee Adjustment
  const handleApplyAdjustmentSubmit = async () => {
    if (!selectedFeeRecord) return;
    const amount = Number(adjustmentAmount);
    if (isNaN(amount) || amount < 0) {
      toast.error("Please enter a valid adjustment amount.");
      return;
    }
    if (!adjustmentReason.trim()) {
      toast.error("Please provide a reason for the adjustment.");
      return;
    }

    setApplyingAdjustment(true);
    try {
      await applyFeeAdjustment({
        feeId: selectedFeeRecord.id,
        adjustmentType,
        amount,
        reason: adjustmentReason,
      });
      toast.success(`Applied ${adjustmentType} of ${cedis(amount)} successfully.`);
      setIsAdjustmentOpen(false);
      setSelectedFeeRecord(null);
      setAdjustmentAmount("");
      setAdjustmentReason("");
      await loadOverviewData();
    } catch (err: any) {
      toast.error(err.message || "Failed to apply adjustment.");
    } finally {
      setApplyingAdjustment(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center surface p-8 rounded-xl">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="size-5 animate-spin text-primary" />
          <span>Loading Fees & Invoicing module data...</span>
        </div>
      </div>
    );
  }

  const termsList = Array.from(new Set((data?.fees ?? []).map((f: any) => f.term))).filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Context & Control Header */}
      <div className="surface p-6 rounded-xl border border-border space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-medium">
                <Calendar className="size-3.5 mr-1" />
                Academic Year: {data?.academicCalendar?.academicYear || "Active Session"}
              </Badge>
              {data?.activePeriod && (
                <Badge variant="secondary" className="font-medium">
                  Active Period: {data.activePeriod.name}
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">
                Currency: GHS (₵)
              </Badge>
            </div>
            <h2 className="text-xl font-bold mt-2">Fees & Invoicing Operations</h2>
            <p className="text-sm text-muted-foreground">
              Centralized fee structures, batch billing runs, student balance ledgers, and payment controls.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadOverviewData}>
              <RefreshCw className="size-4 mr-1.5" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setIsBillingRunOpen(true)}>
              <Play className="size-4 mr-1.5" />
              New Billing Run
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted/60 p-1 flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="gap-2">
            <TrendingUp className="size-4" />
            Overview & Analytics
          </TabsTrigger>
          <TabsTrigger value="structures" className="gap-2">
            <Layers className="size-4" />
            Fee Structures
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-2">
            <Play className="size-4" />
            Billing Runs ({data?.billingRuns?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="balances" className="gap-2">
            <CreditCard className="size-4" />
            Student Balances & Ledger
          </TabsTrigger>
          <TabsTrigger value="governance" className="gap-2">
            <Settings2 className="size-4" />
            Configuration & Rules
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* KPI Stat Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-semibold uppercase tracking-wider">Total Billed</CardDescription>
                <CardTitle className="text-2xl font-bold">{cedis(balanceSummary.totalBilled)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Cumulative fees billed across all terms</p>
              </CardContent>
            </Card>

            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Total Collected</CardDescription>
                <CardTitle className="text-2xl font-bold text-emerald-700">{cedis(balanceSummary.totalPaid)}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-xs text-emerald-700 font-medium">
                  <span>Collection Rate</span>
                  <span>{balanceSummary.collectionRate}%</span>
                </div>
                <Progress value={balanceSummary.collectionRate} className="h-1.5 mt-2 bg-emerald-200" />
              </CardContent>
            </Card>

            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-semibold uppercase tracking-wider text-amber-700">Outstanding Balance</CardDescription>
                <CardTitle className="text-2xl font-bold text-amber-700">{cedis(balanceSummary.totalOutstanding)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-amber-700">Uncollected total across active students</p>
              </CardContent>
            </Card>

            <Card className="border-rose-500/20 bg-rose-500/5">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-semibold uppercase tracking-wider text-rose-700">Overdue Balance</CardDescription>
                <CardTitle className="text-2xl font-bold text-rose-700">{cedis(balanceSummary.totalOverdue)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-rose-700">{balanceSummary.overdueCount} student records past due date</p>
              </CardContent>
            </Card>
          </div>

          {/* Payment Status Breakdown */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  Payment Status Distribution
                </CardTitle>
                <CardDescription>Breakdown of student fee accounts by status</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-emerald-700">Fully Paid ({balanceSummary.paidCount})</span>
                    <span className="text-muted-foreground">{cedis(balanceSummary.totalPaid)}</span>
                  </div>
                  <Progress
                    value={data?.fees?.length ? (balanceSummary.paidCount / data.fees.length) * 100 : 0}
                    className="h-2 bg-muted"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-amber-700">Partially Paid ({balanceSummary.partiallyPaidCount})</span>
                    <span className="text-muted-foreground">{cedis(balanceSummary.totalPartiallyPaid)} remaining</span>
                  </div>
                  <Progress
                    value={data?.fees?.length ? (balanceSummary.partiallyPaidCount / data.fees.length) * 100 : 0}
                    className="h-2 bg-muted"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-blue-700">Pending ({balanceSummary.pendingCount})</span>
                    <span className="text-muted-foreground">{cedis(balanceSummary.totalPending)} pending</span>
                  </div>
                  <Progress
                    value={data?.fees?.length ? (balanceSummary.pendingCount / data.fees.length) * 100 : 0}
                    className="h-2 bg-muted"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-rose-700">Overdue ({balanceSummary.overdueCount})</span>
                    <span className="text-muted-foreground">{cedis(balanceSummary.totalOverdue)} overdue</span>
                  </div>
                  <Progress
                    value={data?.fees?.length ? (balanceSummary.overdueCount / data.fees.length) * 100 : 0}
                    className="h-2 bg-muted"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Central Governance Integration Matrix */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Building2 className="size-4 text-primary" />
                  Central Configuration Dependencies
                </CardTitle>
                <CardDescription>Enterprise modules nested with Fees & Invoicing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-3 rounded-lg border border-border bg-muted/30 flex items-start gap-3 text-xs">
                  <ShieldCheck className="size-4 text-emerald-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold text-foreground">System & Platform Configuration:</span>
                    <p className="text-muted-foreground mt-0.5">
                      Provides school tenant identity ({data?.school?.name || "Active School"}), currency formatting ({cedis(100)}), and security parameters.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-border bg-muted/30 flex items-start gap-3 text-xs">
                  <Calendar className="size-4 text-blue-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold text-foreground">Academic Configuration:</span>
                    <p className="text-muted-foreground mt-0.5">
                      Governs academic year ({data?.academicCalendar?.academicYear}), terms, lock dates, and write-block protections.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-border bg-muted/30 flex items-start gap-3 text-xs">
                  <Layers className="size-4 text-purple-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold text-foreground">People & Education Levels Configuration:</span>
                    <p className="text-muted-foreground mt-0.5">
                      Provides student records ({data?.students?.length || 0} active), class listings ({data?.classes?.length || 0} classes), and education level scope rules.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-border bg-muted/30 flex items-start gap-3 text-xs">
                  <FileText className="size-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold text-foreground">Reporting & Records Configuration:</span>
                    <p className="text-muted-foreground mt-0.5">
                      Controls export authorization, watermarking rules, and audit logging parameters.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Fee Structures Tab */}
        <TabsContent value="structures" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Configured Fee Structures</CardTitle>
                <CardDescription>
                  Centralized fee structure rules retrieved from Financial Configuration (Area 02)
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {!data?.feeStructures || data.feeStructures.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Layers className="size-8 mx-auto mb-2 opacity-50" />
                  <p className="font-medium">No active fee structures found.</p>
                  <p className="text-xs mt-1">Configure fee structures in Financial Configuration Area 02.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/50 text-xs uppercase font-medium text-muted-foreground">
                      <tr>
                        <th className="p-3">Fee Code</th>
                        <th className="p-3">Structure Name</th>
                        <th className="p-3">Category</th>
                        <th className="p-3">Target Class</th>
                        <th className="p-3">Base Amount</th>
                        <th className="p-3">Coverage Scope</th>
                        <th className="p-3">Level Overrides</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.feeStructures.map((st: FeeStructureItem, idx: number) => (
                        <tr key={idx} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3 font-mono text-xs font-semibold text-primary">{st.code}</td>
                          <td className="p-3 font-medium">{st.name}</td>
                          <td className="p-3">
                            <Badge variant="outline" className="capitalize">
                              {st.fee_category}
                            </Badge>
                          </td>
                          <td className="p-3 text-muted-foreground">{st.class_name || "All Classes"}</td>
                          <td className="p-3 font-semibold">{cedis(st.amount)}</td>
                          <td className="p-3 text-xs capitalize text-muted-foreground">{st.scope || "Active Period"}</td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {st.levels && Object.keys(st.levels).length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(st.levels).map(([lvl, amt]) => (
                                  <Badge key={lvl} variant="secondary" className="text-[10px]">
                                    {lvl}: {cedis(amt)}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              "None (Base rate applies)"
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

        {/* Billing Runs Tab */}
        <TabsContent value="billing" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Batch Billing Runs</CardTitle>
                <CardDescription>
                  Automated billing run history and batch invoice generation for academic terms
                </CardDescription>
              </div>
              <Button onClick={() => setIsBillingRunOpen(true)}>
                <Play className="size-4 mr-1.5" />
                Initiate Billing Run
              </Button>
            </CardHeader>
            <CardContent>
              {!data?.billingRuns || data.billingRuns.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Play className="size-8 mx-auto mb-2 opacity-50" />
                  <p className="font-medium">No billing runs executed yet.</p>
                  <p className="text-xs mt-1">Click "Initiate Billing Run" to issue termly fee bills in bulk.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/50 text-xs uppercase font-medium text-muted-foreground">
                      <tr>
                        <th className="p-3">Run Date</th>
                        <th className="p-3">Academic Year</th>
                        <th className="p-3">Term / Period</th>
                        <th className="p-3">Target Scope</th>
                        <th className="p-3">Students Billed</th>
                        <th className="p-3">Total Billed</th>
                        <th className="p-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.billingRuns.map((run: any) => (
                        <tr key={run.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3 text-xs text-muted-foreground">
                            {new Date(run.created_at).toLocaleDateString()}
                          </td>
                          <td className="p-3 font-medium">{run.academic_year}</td>
                          <td className="p-3">
                            <Badge variant="secondary">{run.period}</Badge>
                          </td>
                          <td className="p-3 capitalize text-xs">
                            {run.target_scope} {run.target_value ? `(${run.target_value})` : ""}
                          </td>
                          <td className="p-3 font-medium">{run.student_count}</td>
                          <td className="p-3 font-bold text-primary">{cedis(run.total_amount_billed)}</td>
                          <td className="p-3 text-xs text-muted-foreground max-w-xs truncate">{run.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Student Balances & Fee Ledger Tab */}
        <TabsContent value="balances" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Student Fee Ledger & Balances</CardTitle>
              <CardDescription>View, filter and manage individual student fee balances and payments</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search & Filters */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="relative">
                  <Search className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    placeholder="Search name or admission #"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 text-sm"
                  />
                </div>

                <Select value={classFilter} onValueChange={setClassFilter}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Filter by class" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {data?.classes?.map((c: any) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="partially_paid">Partially Paid</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={termFilter} onValueChange={setTermFilter}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Filter by term" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Terms</SelectItem>
                    {termsList.map((t: string) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Ledger Table */}
              {ledgerItems.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CreditCard className="size-8 mx-auto mb-2 opacity-50" />
                  <p className="font-medium">No student fee records found matching criteria.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/50 text-xs uppercase font-medium text-muted-foreground">
                      <tr>
                        <th className="p-3">Admission #</th>
                        <th className="p-3">Student Name</th>
                        <th className="p-3">Class</th>
                        <th className="p-3">Term / Period</th>
                        <th className="p-3">Amount Due</th>
                        <th className="p-3">Amount Paid</th>
                        <th className="p-3">Outstanding Balance</th>
                        <th className="p-3">Due Date</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {ledgerItems.map((item) => (
                        <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3 font-mono text-xs font-semibold text-primary">{item.admissionNumber}</td>
                          <td className="p-3 font-medium">{item.studentName}</td>
                          <td className="p-3 text-xs text-muted-foreground">{item.className}</td>
                          <td className="p-3 text-xs">{item.term}</td>
                          <td className="p-3 font-medium">{cedis(item.amountDue)}</td>
                          <td className="p-3 font-medium text-emerald-700">{cedis(item.amountPaid)}</td>
                          <td className="p-3 font-bold text-foreground">{cedis(item.balance)}</td>
                          <td className="p-3 text-xs text-muted-foreground">{item.dueDate || "—"}</td>
                          <td className="p-3">
                            <Badge
                              variant={
                                item.status === "paid"
                                  ? "default"
                                  : item.status === "partially_paid"
                                    ? "secondary"
                                    : item.status === "overdue"
                                      ? "destructive"
                                      : "outline"
                              }
                              className="text-[11px] capitalize"
                            >
                              {item.status.replace("_", " ")}
                            </Badge>
                          </td>
                          <td className="p-3 text-right space-x-1">
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => {
                                setSelectedFeeRecord(item);
                                setPaymentAmount(String(item.balance));
                                setIsPaymentOpen(true);
                              }}
                              disabled={item.status === "paid"}
                            >
                              Pay
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => {
                                setSelectedFeeRecord(item);
                                setIsAdjustmentOpen(true);
                              }}
                            >
                              Adjust
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => {
                                setSelectedFeeRecord(item);
                                setIsStatementOpen(true);
                              }}
                            >
                              Statement
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

        {/* Configuration & Governance Tab */}
        <TabsContent value="governance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Governance & Rules Matrix</CardTitle>
              <CardDescription>
                Authoritative financial and academic rules enforced across Fees & Invoicing operations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-4 rounded-lg border border-border bg-muted/20 space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Calendar className="size-4 text-primary" />
                    Academic Period Locks & Grace Window
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Lock after grace: {data?.academicCalendar?.lockAfterGrace ? "Enabled" : "Disabled"} (
                    {data?.academicCalendar?.graceDays || 0} grace days)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Modifications to closed academic periods are blocked automatically by server guards.
                  </p>
                </div>

                <div className="p-4 rounded-lg border border-border bg-muted/20 space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <DollarSign className="size-4 text-primary" />
                    Currency & Posting Engine
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    System Currency: GHS (₵). Auto-posting payments to finance income is active.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Payment statuses (Pending, Partially Paid, Paid, Overdue) update in real-time based on payment balance.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: Initiate Billing Run */}
      <Dialog open={isBillingRunOpen} onOpenChange={setIsBillingRunOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="size-5 text-primary" />
              Initiate Batch Billing Run
            </DialogTitle>
            <DialogDescription>
              Generate fee bills in bulk for students matching selected scope and academic term.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Academic Year</Label>
                <Input
                  value={billingAcademicYear}
                  onChange={(e) => setBillingAcademicYear(e.target.value)}
                  placeholder="e.g. 2024/2025"
                  className="text-sm mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Term / Period</Label>
                <Input
                  value={billingPeriod}
                  onChange={(e) => setBillingPeriod(e.target.value)}
                  placeholder="e.g. Term 1"
                  className="text-sm mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Billing Target Scope</Label>
              <Select value={billingScope} onValueChange={(v: any) => setBillingScope(v)}>
                <SelectTrigger className="text-sm mt-1">
                  <SelectValue placeholder="Select scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Active Students (Whole School)</SelectItem>
                  <SelectItem value="education_level">Specific Education Level</SelectItem>
                  <SelectItem value="class">Specific Class</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {billingScope === "education_level" && (
              <div>
                <Label className="text-xs">Target Education Level</Label>
                <Select value={billingTargetValue} onValueChange={setBillingTargetValue}>
                  <SelectTrigger className="text-sm mt-1">
                    <SelectValue placeholder="Select education level" />
                  </SelectTrigger>
                  <SelectContent>
                    {EDUCATION_LEVELS.map((lvl) => (
                      <SelectItem key={lvl.code} value={lvl.code}>
                        {lvl.name} ({lvl.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {billingScope === "class" && (
              <div>
                <Label className="text-xs">Target Class</Label>
                <Select value={billingTargetValue} onValueChange={setBillingTargetValue}>
                  <SelectTrigger className="text-sm mt-1">
                    <SelectValue placeholder="Select target class" />
                  </SelectTrigger>
                  <SelectContent>
                    {data?.classes?.map((c: any) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-xs">Fee Due Date (Optional)</Label>
              <Input
                type="date"
                value={billingDueDate}
                onChange={(e) => setBillingDueDate(e.target.value)}
                className="text-sm mt-1"
              />
            </div>

            <div>
              <Label className="text-xs">Notes / Billing Audit Description</Label>
              <Input
                value={billingNotes}
                onChange={(e) => setBillingNotes(e.target.value)}
                placeholder="e.g. Standard termly fee billing run"
                className="text-sm mt-1"
              />
            </div>

            {/* Dry Run Preview Box */}
            <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 text-xs space-y-1">
              <span className="font-semibold text-primary">Dry-Run Estimation Preview:</span>
              <div className="flex justify-between text-muted-foreground pt-1">
                <span>Matching Students:</span>
                <span className="font-medium text-foreground">{dryRunPreview.targetStudentCount}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Estimated Total Billed:</span>
                <span className="font-bold text-foreground">{cedis(dryRunPreview.estimatedTotalBilled)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBillingRunOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRunBilling} disabled={executingRun}>
              {executingRun ? "Executing Billing Run..." : "Execute Billing Run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Record Payment */}
      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Student Fee Payment</DialogTitle>
            <DialogDescription>
              {selectedFeeRecord ? `Recording payment for ${selectedFeeRecord.studentName} (${selectedFeeRecord.admissionNumber})` : "Record Payment"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Payment Amount (₵)</Label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
                className="text-sm mt-1"
              />
            </div>

            <div>
              <Label className="text-xs">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="text-sm mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank-transfer">Bank Transfer</SelectItem>
                  <SelectItem value="mobile-money">Mobile Money</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Transaction Reference / Receipt #</Label>
              <Input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="e.g. MM-89123 or Cheque #401"
                className="text-sm mt-1"
              />
            </div>

            <div>
              <Label className="text-xs">Payment Date</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="text-sm mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRecordPaymentSubmit} disabled={recordingPayment}>
              {recordingPayment ? "Saving Payment..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Apply Fee Adjustment */}
      <Dialog open={isAdjustmentOpen} onOpenChange={setIsAdjustmentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply Fee Adjustment / Waiver</DialogTitle>
            <DialogDescription>
              {selectedFeeRecord ? `Adjusting fee record for ${selectedFeeRecord.studentName}` : "Fee Adjustment"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Adjustment Type</Label>
              <Select value={adjustmentType} onValueChange={(v: any) => setAdjustmentType(v)}>
                <SelectTrigger className="text-sm mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="discount">Discount (Reduce Amount Due)</SelectItem>
                  <SelectItem value="waiver">Waiver (Waive Amount Due)</SelectItem>
                  <SelectItem value="penalty">Penalty (Increase Amount Due)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Adjustment Amount (₵)</Label>
              <Input
                type="number"
                value={adjustmentAmount}
                onChange={(e) => setAdjustmentAmount(e.target.value)}
                placeholder="0.00"
                className="text-sm mt-1"
              />
            </div>

            <div>
              <Label className="text-xs">Reason / Approval Notes</Label>
              <Input
                value={adjustmentReason}
                onChange={(e) => setAdjustmentReason(e.target.value)}
                placeholder="e.g. Scholarship discount approved by Registrar"
                className="text-sm mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAdjustmentOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApplyAdjustmentSubmit} disabled={applyingAdjustment}>
              {applyingAdjustment ? "Applying..." : "Apply Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Fee Statement */}
      <Dialog open={isStatementOpen} onOpenChange={setIsStatementOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-5 text-primary" />
              Student Fee Statement
            </DialogTitle>
          </DialogHeader>

          {selectedFeeRecord && (
            <div className="space-y-4 py-2 text-sm">
              <div className="p-3 rounded-lg border border-border bg-muted/40 space-y-1">
                <p className="font-bold">{selectedFeeRecord.studentName}</p>
                <p className="text-xs text-muted-foreground">Admission #: {selectedFeeRecord.admissionNumber}</p>
                <p className="text-xs text-muted-foreground">Class: {selectedFeeRecord.className}</p>
                <p className="text-xs text-muted-foreground">Term: {selectedFeeRecord.term}</p>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Total Fee Amount Due:</span>
                  <span className="font-bold">{cedis(selectedFeeRecord.amountDue)}</span>
                </div>

                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Total Paid to Date:</span>
                  <span className="font-bold text-emerald-700">{cedis(selectedFeeRecord.amountPaid)}</span>
                </div>

                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Net Outstanding Balance:</span>
                  <span className="font-bold text-primary">{cedis(selectedFeeRecord.balance)}</span>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Current Payment Status:</span>
                  <Badge variant="outline" className="capitalize text-[10px]">
                    {selectedFeeRecord.status.replace("_", " ")}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4 mr-1.5" />
              Print Statement
            </Button>
            <Button onClick={() => setIsStatementOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
