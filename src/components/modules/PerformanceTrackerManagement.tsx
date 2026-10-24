import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Award,
  Users,
  Calendar,
  Filter,
  Search,
  Plus,
  CheckCircle2,
  Clock,
  ShieldAlert,
  BarChart2,
  Layers,
  User,
  ArrowRight,
  BookOpen,
  Info,
  RefreshCw,
  Settings,
  FileText,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  ScatterChart,
  Scatter,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  getPerformanceTrackerOverview,
  getLongitudinalProgressData,
  getCrossAnalyticsData,
  getAtRiskStudentsData,
  getStudentAcademicProfile,
  createInterventionPlan,
  updateInterventionPlan,
  addInterventionNote,
  updatePerformanceRiskRules,
} from "@/lib/performance-tracker.functions";
import {
  INTERVENTION_STRATEGIES,
  TrackerFilter,
} from "@/lib/performance-tracker.schemas";

export function PerformanceTrackerManagement() {
  const [activeTab, setActiveTab] = useState<string>("overview");

  // Filters State
  const [filters, setFilters] = useState<TrackerFilter>({
    academicYear: "2024/2025",
    term: "Term 1",
    className: "",
    subject: "",
    gender: "",
  });

  const [loading, setLoading] = useState(true);
  const [overviewData, setOverviewData] = useState<any>(null);
  const [progressData, setProgressData] = useState<any>(null);
  const [crossData, setCrossData] = useState<any>(null);
  const [atRiskData, setAtRiskData] = useState<any>(null);

  // Individual Student Profile State
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [studentProfile, setStudentProfile] = useState<any>(null);

  // Modals
  const [createInterventionOpen, setCreateInterventionOpen] = useState(false);
  const [targetStudentRisk, setTargetStudentRisk] = useState<any>(null);
  const [riskRulesOpen, setRiskRulesOpen] = useState(false);
  const [selectedIntervention, setSelectedIntervention] = useState<any>(null);
  const [noteContent, setNoteContent] = useState("");

  // Create Intervention Form
  const [interventionForm, setInterventionForm] = useState({
    identifiedNeed: "",
    strategy: INTERVENTION_STRATEGIES[0] as string,
    responsibleStaffName: "",
    startDate: new Date().toISOString().slice(0, 10),
    reviewDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    targetOutcome: "Achieve >= 60% overall score",
  });

  // Risk Rules Config Form
  const [riskRulesForm, setRiskRulesForm] = useState({
    academicMinScore: 50,
    attendanceMinPercent: 75,
    engagementMaxMissing: 20,
    progressMaxDecline: 10,
    smallGroupDisclosureLimit: 3,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [ov, pr, cr, rsk] = await Promise.all([
        getPerformanceTrackerOverview({ data: filters }),
        getLongitudinalProgressData({ data: filters }),
        getCrossAnalyticsData({ data: filters }),
        getAtRiskStudentsData({ data: filters }),
      ]);
      setOverviewData(ov);
      setProgressData(pr);
      setCrossData(cr);
      setAtRiskData(rsk);

      if (rsk?.riskRules) {
        setRiskRulesForm(rsk.riskRules);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to load performance tracker data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filters]);

  const loadStudentProfile = async (id: string) => {
    if (!id) return;
    try {
      const prof = await getStudentAcademicProfile({ data: { admissionId: id } });
      setStudentProfile(prof);
    } catch (err: any) {
      toast.error("Failed to load student profile.");
    }
  };

  useEffect(() => {
    if (selectedStudentId) {
      loadStudentProfile(selectedStudentId);
    }
  }, [selectedStudentId]);

  const handleCreateIntervention = async () => {
    if (!targetStudentRisk) return;
    try {
      await createInterventionPlan({
        data: {
          admissionId: targetStudentRisk.admissionId,
          term: filters.term || "Term 1",
          academicYear: filters.academicYear || "2024/2025",
          subject: filters.subject || "",
          riskIndicators: targetStudentRisk.reasons,
          baselinePerformance: targetStudentRisk.overallScore || 0,
          baselineAttendance: targetStudentRisk.attendanceRate || 0,
          identifiedNeed: interventionForm.identifiedNeed || "Academic support required",
          strategy: interventionForm.strategy,
          responsibleStaffName: interventionForm.responsibleStaffName,
          startDate: interventionForm.startDate,
          reviewDate: interventionForm.reviewDate,
          targetOutcome: interventionForm.targetOutcome,
        },
      });
      toast.success("Intervention plan created successfully!");
      setCreateInterventionOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create intervention plan.");
    }
  };

  const handleUpdateStatus = async (id: string, status: any) => {
    try {
      await updateInterventionPlan({
        data: { id, status },
      });
      toast.success("Intervention status updated.");
      loadData();
      if (selectedStudentId) loadStudentProfile(selectedStudentId);
    } catch (err: any) {
      toast.error("Failed to update status.");
    }
  };

  const handleAddNote = async (id: string) => {
    if (!noteContent.trim()) return;
    try {
      await addInterventionNote({ data: { id, note: noteContent } });
      toast.success("Note added.");
      setNoteContent("");
      loadData();
      if (selectedStudentId) loadStudentProfile(selectedStudentId);
    } catch (err: any) {
      toast.error("Failed to add note.");
    }
  };

  const handleSaveRiskRules = async () => {
    try {
      await updatePerformanceRiskRules({ data: riskRulesForm });
      toast.success("Risk detection rules updated.");
      setRiskRulesOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update risk rules.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Controls & Filters */}
      <div className="surface p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={filters.term || "Term 1"}
            onValueChange={(v) => setFilters((f) => ({ ...f, term: v }))}
          >
            <SelectTrigger className="w-36">
              <Calendar className="mr-2 size-4 text-muted-foreground" />
              <SelectValue placeholder="Term" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Term 1">Term 1</SelectItem>
              <SelectItem value="Term 2">Term 2</SelectItem>
              <SelectItem value="Term 3">Term 3</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.className || "all_classes"}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, className: v === "all_classes" ? "" : v }))
            }
          >
            <SelectTrigger className="w-40">
              <Layers className="mr-2 size-4 text-muted-foreground" />
              <SelectValue placeholder="All Classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_classes">All Classes</SelectItem>
              <SelectItem value="Primary 1">Primary 1</SelectItem>
              <SelectItem value="Primary 2">Primary 2</SelectItem>
              <SelectItem value="JHS 1">JHS 1</SelectItem>
              <SelectItem value="JHS 2">JHS 2</SelectItem>
              <SelectItem value="SHS 1">SHS 1</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.gender || "all_genders"}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, gender: v === "all_genders" ? "" : v }))
            }
          >
            <SelectTrigger className="w-36">
              <User className="mr-2 size-4 text-muted-foreground" />
              <SelectValue placeholder="Gender" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_genders">All Genders</SelectItem>
              <SelectItem value="Male">Male</SelectItem>
              <SelectItem value="Female">Female</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={() => loadData()}>
            <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {overviewData?.isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setRiskRulesOpen(true)}>
            <Settings className="mr-2 size-4" />
            Configure Risk Rules
          </Button>
        )}
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart2 className="size-4" /> Performance Intelligence
          </TabsTrigger>
          <TabsTrigger value="longitudinal" className="flex items-center gap-2">
            <TrendingUp className="size-4" /> Longitudinal Progress
          </TabsTrigger>
          <TabsTrigger value="cross-analytics" className="flex items-center gap-2">
            <Layers className="size-4" /> Cross-Analytics
          </TabsTrigger>
          <TabsTrigger value="at-risk" className="flex items-center gap-2">
            <AlertTriangle className="size-4" /> At-Risk & Interventions
          </TabsTrigger>
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="size-4" /> Student Profile
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: OVERVIEW */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          {/* KPI Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="surface p-4 rounded-xl border border-border flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Overall Average
                </p>
                <h3 className="text-2xl font-bold mt-1">
                  {typeof overviewData?.kpis?.overallAverageScore === "number"
                    ? `${overviewData.kpis.overallAverageScore}%`
                    : "—"}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Across {overviewData?.kpis?.totalStudents ?? 0} students
                </p>
              </div>
              <span className="p-3 bg-primary/10 text-primary rounded-xl">
                <Award className="size-6" />
              </span>
            </div>

            <div className="surface p-4 rounded-xl border border-border flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Proficiency Rate
                </p>
                <h3 className="text-2xl font-bold mt-1">
                  {typeof overviewData?.kpis?.proficiencyRate === "number"
                    ? `${overviewData.kpis.proficiencyRate}%`
                    : "—"}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Meeting pass mark ({overviewData?.kpis?.passMark ?? 50}%)
                </p>
              </div>
              <span className="p-3 bg-emerald-500/10 text-emerald-600 rounded-xl">
                <CheckCircle2 className="size-6" />
              </span>
            </div>

            <div className="surface p-4 rounded-xl border border-border flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Attendance Rate
                </p>
                <h3 className="text-2xl font-bold mt-1">
                  {typeof overviewData?.kpis?.attendanceRatePercent === "number"
                    ? `${overviewData.kpis.attendanceRatePercent}%`
                    : "—"}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">Active term average</p>
              </div>
              <span className="p-3 bg-blue-500/10 text-blue-600 rounded-xl">
                <Clock className="size-6" />
              </span>
            </div>

            <div className="surface p-4 rounded-xl border border-border flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  At-Risk Students
                </p>
                <h3 className="text-2xl font-bold mt-1 text-amber-600">
                  {overviewData?.kpis?.atRiskCount ?? 0}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">Flagged for intervention</p>
              </div>
              <span className="p-3 bg-amber-500/10 text-amber-600 rounded-xl">
                <AlertTriangle className="size-6" />
              </span>
            </div>
          </div>

          {/* Charts Row 1: Subject Mastery & Score Distribution */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="surface p-6 rounded-xl border border-border lg:col-span-2">
              <h3 className="text-base font-semibold mb-4">Subject Mastery & Pass Rates</h3>
              <div className="h-72 w-full">
                {overviewData?.subjectMastery && overviewData.subjectMastery.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overviewData.subjectMastery}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="subject" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="avgScore" name="Average Score (%)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="passRate" name="Pass Rate (%)" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                    No subject score data available.
                  </div>
                )}
              </div>
            </div>

            <div className="surface p-6 rounded-xl border border-border">
              <h3 className="text-base font-semibold mb-4">Performance Tier Distribution</h3>
              <div className="h-72 w-full flex items-center justify-center">
                {overviewData?.scoreDistribution ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={overviewData.scoreDistribution}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label
                      >
                        {overviewData.scoreDistribution.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-sm text-muted-foreground">No distribution data</div>
                )}
              </div>
            </div>
          </div>

          {/* Class Comparison & Assessment Coverage */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="surface p-6 rounded-xl border border-border">
              <h3 className="text-base font-semibold mb-4">Class Performance Comparison</h3>
              <div className="h-64 w-full">
                {overviewData?.classPerformance && overviewData.classPerformance.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overviewData.classPerformance}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="className" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Bar dataKey="avgScore" name="Class Average Score (%)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                    No class performance data.
                  </div>
                )}
              </div>
            </div>

            <div className="surface p-6 rounded-xl border border-border flex flex-col justify-between">
              <div>
                <h3 className="text-base font-semibold mb-2">Teacher Assessment Completion</h3>
                <p className="text-sm text-muted-foreground">
                  Monitors timeliness and completeness of continuous assessment recording across classes.
                </p>
                <div className="mt-6 space-y-4">
                  <div className="flex justify-between items-center text-sm border-b pb-2">
                    <span className="text-muted-foreground">Total Recorded Tasks</span>
                    <span className="font-semibold">{overviewData?.teacherAssessmentTimeliness?.completedAssessments ?? 0}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-b pb-2">
                    <span className="text-muted-foreground">On-Time Submissions</span>
                    <span className="font-semibold text-emerald-600">
                      {overviewData?.teacherAssessmentTimeliness?.onTimeSubmissionsPercent}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Pending Grading Workloads</span>
                    <span className="font-semibold text-amber-600">
                      {overviewData?.teacherAssessmentTimeliness?.pendingGradingCount} tasks
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-6 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground flex items-center gap-2">
                <Info className="size-4 shrink-0" />
                Unsubmitted or ungraded assessments are preserved separately and not silently treated as zero scores.
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: LONGITUDINAL PROGRESS */}
        <TabsContent value="longitudinal" className="mt-6 space-y-6">
          <div className="surface p-6 rounded-xl border border-border">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-base font-semibold">Academic Progress Trajectory Across Terms</h3>
                <p className="text-sm text-muted-foreground">
                  Compares overall performance trends across terms, semesters, and academic years.
                </p>
              </div>
              <Badge variant="outline">Cohort Longitudinal Tracking</Badge>
            </div>

            <div className="h-80 w-full mt-4">
              {progressData?.progressTrend && progressData.progressTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={progressData.progressTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="avgScore"
                      name="Overall Average (%)"
                      stroke="#3b82f6"
                      strokeWidth={3}
                      activeDot={{ r: 8 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="classAvgScore"
                      name="Benchmark Average (%)"
                      stroke="#94a3b8"
                      strokeDasharray="5 5"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  Insufficient historical data across multiple terms to render progress trend.
                </div>
              )}
            </div>

            <div className="mt-6 border-t pt-4 grid gap-4 sm:grid-cols-3 text-sm">
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Class Transfers & Mid-Term Joins</p>
                <p className="text-xs mt-1 text-muted-foreground">
                  Historical results are preserved and associated with the learner's historical enrollment context.
                </p>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Missing Comparison Terms</p>
                <p className="text-xs mt-1 text-muted-foreground">
                  Terms without prior results explicitly disclose "No comparison" rather than misleading zero drops.
                </p>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Grading Policy Rules</p>
                <p className="text-xs mt-1 text-muted-foreground">
                  Historical grading rules and weights are retained when calculating past performance periods.
                </p>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB 3: CROSS-ANALYTICS */}
        <TabsContent value="cross-analytics" className="mt-6 space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Attendance vs Examination Score */}
            <div className="surface p-6 rounded-xl border border-border">
              <h3 className="text-base font-semibold mb-2">Attendance Rate vs Academic Performance</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Descriptive correlation between attendance percentage and overall assessment score.
              </p>
              <div className="h-64 w-full">
                {crossData?.attendanceVsScore && crossData.attendanceVsScore.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid />
                      <XAxis type="number" dataKey="attendanceRate" name="Attendance Rate" unit="%" domain={[0, 100]} />
                      <YAxis type="number" dataKey="overallScore" name="Overall Score" unit="%" domain={[0, 100]} />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                      <Scatter name="Students" data={crossData.attendanceVsScore} fill="#8884d8" />
                    </ScatterChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                    No attendance correlation data.
                  </div>
                )}
              </div>
            </div>

            {/* Continuous Assessment vs Examination */}
            <div className="surface p-6 rounded-xl border border-border">
              <h3 className="text-base font-semibold mb-2">Classwork vs Examination Scores</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Comparison between continuous class assessments and final exam scores per subject.
              </p>
              <div className="h-64 w-full">
                {crossData?.classworkVsExam && crossData.classworkVsExam.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={crossData.classworkVsExam}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="subject" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="classworkAvg" name="Classwork Average (%)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="examAvg" name="Exam Average (%)" fill="#ec4899" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                    No comparative assessment data.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Gender Performance Analytics with Privacy Safeguards */}
          <div className="surface p-6 rounded-xl border border-border">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-base font-semibold">Configured Gender Performance Analytics</h3>
                <p className="text-xs text-muted-foreground">
                  Descriptive performance reporting across configured gender categories with small-group disclosure safeguards.
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                Privacy Safeguard Active
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-xs font-semibold uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3">Gender Category</th>
                    <th className="p-3">Student Count</th>
                    <th className="p-3">Average Score</th>
                    <th className="p-3">Attendance Rate</th>
                    <th className="p-3">Proficiency Rate</th>
                    <th className="p-3">At-Risk Proportion</th>
                    <th className="p-3">Privacy Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {crossData?.genderSummaries?.map((g: any, idx: number) => (
                    <tr key={idx} className="hover:bg-muted/30">
                      <td className="p-3 font-medium">{g.gender}</td>
                      <td className="p-3">{g.studentCount}</td>
                      <td className="p-3">
                        {g.disclosureRestricted ? "—" : g.avgOverallScore !== null ? `${g.avgOverallScore}%` : "—"}
                      </td>
                      <td className="p-3">
                        {g.disclosureRestricted ? "—" : g.avgAttendanceRate !== null ? `${g.avgAttendanceRate}%` : "—"}
                      </td>
                      <td className="p-3">
                        {g.disclosureRestricted ? "—" : g.proficiencyRate !== null ? `${g.proficiencyRate}%` : "—"}
                      </td>
                      <td className="p-3">
                        {g.disclosureRestricted ? "—" : g.atRiskPercent !== null ? `${g.atRiskPercent}%` : "—"}
                      </td>
                      <td className="p-3">
                        {g.disclosureRestricted ? (
                          <Badge variant="secondary" className="text-amber-600 bg-amber-50">
                            Restricted (N &lt; 3)
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-emerald-600">
                            Disclosed
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-3 bg-amber-500/10 rounded-lg text-xs text-amber-800 flex items-center gap-2">
              <ShieldAlert className="size-4 shrink-0" />
              <span>
                <strong>Privacy Policy:</strong> Gender-based reporting is descriptive only and employs small-group disclosure limits. Gender is never used alone to assign academic risk or determine interventions.
              </span>
            </div>
          </div>
        </TabsContent>

        {/* TAB 4: AT-RISK & INTERVENTIONS */}
        <TabsContent value="at-risk" className="mt-6 space-y-6">
          {/* Risk Rules Thresholds Overview */}
          <div className="surface p-4 rounded-xl border border-border flex flex-wrap items-center justify-between gap-4 bg-muted/20">
            <div className="flex items-center gap-3">
              <AlertTriangle className="size-5 text-amber-600 shrink-0" />
              <div>
                <h4 className="text-sm font-semibold">Configured At-Risk Detection Thresholds</h4>
                <p className="text-xs text-muted-foreground">
                  Academic &lt; {atRiskData?.riskRules?.academicMinScore ?? 50}% · Attendance &lt;{" "}
                  {atRiskData?.riskRules?.attendanceMinPercent ?? 75}% · Missing Tasks &gt;{" "}
                  {atRiskData?.riskRules?.engagementMaxMissing ?? 20}%
                </p>
              </div>
            </div>
            {overviewData?.isAdmin && (
              <Button size="sm" variant="outline" onClick={() => setRiskRulesOpen(true)}>
                Edit Thresholds
              </Button>
            )}
          </div>

          {/* At-Risk Students Directory */}
          <div className="surface p-6 rounded-xl border border-border">
            <h3 className="text-base font-semibold mb-4">Flagged At-Risk Students Directory</h3>

            {atRiskData?.atRiskStudents && atRiskData.atRiskStudents.length > 0 ? (
              <div className="space-y-4">
                {atRiskData.atRiskStudents.map((st: any) => (
                  <div
                    key={st.admissionId}
                    className="p-4 rounded-xl border border-border bg-card flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base">{st.studentName}</span>
                        <Badge variant="outline">{st.className}</Badge>
                        <Badge
                          variant={
                            st.riskSeverity === "critical" || st.riskSeverity === "high"
                              ? "destructive"
                              : "secondary"
                          }
                          className="capitalize"
                        >
                          {st.riskSeverity} Risk
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mt-1">
                        <span>Score: {st.overallScore !== null ? `${st.overallScore}%` : "N/A"}</span>
                        <span>Attendance: {st.attendanceRate !== null ? `${st.attendanceRate}%` : "N/A"}</span>
                        <span>Missing Tasks: {st.missingAssignmentRate !== null ? `${st.missingAssignmentRate}%` : "0%"}</span>
                      </div>

                      {/* Evidence / Traceable Reasons */}
                      <div className="mt-2 space-y-1">
                        {st.reasons?.map((r: string, idx: number) => (
                          <p key={idx} className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                            <Info className="size-3 shrink-0" /> {r}
                          </p>
                        ))}
                      </div>

                      {/* Data Sufficiency Disclosures */}
                      {st.dataSufficiency?.disclosures?.map((disc: string, idx: number) => (
                        <p key={idx} className="text-xs text-muted-foreground italic">
                          * {disc}
                        </p>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => {
                          setTargetStudentRisk(st);
                          setCreateInterventionOpen(true);
                        }}
                      >
                        <Plus className="mr-1.5 size-4" /> Initiate Intervention
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedStudentId(st.admissionId);
                          setActiveTab("profile");
                        }}
                      >
                        View Profile
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No students currently meet the at-risk criteria for this selection.
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB 5: STUDENT ACADEMIC PROFILE */}
        <TabsContent value="profile" className="mt-6 space-y-6">
          <div className="surface p-6 rounded-xl border border-border">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-base font-semibold">Individual Student Academic Performance Profile</h3>
                <p className="text-xs text-muted-foreground">
                  Detailed transcript, subject breakdown, risk indicators, and intervention history.
                </p>
              </div>

              {/* Student Selector */}
              <div className="w-72">
                <Select
                  value={selectedStudentId}
                  onValueChange={setSelectedStudentId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a student..." />
                  </SelectTrigger>
                  <SelectContent>
                    {atRiskData?.atRiskStudents?.map((st: any) => (
                      <SelectItem key={st.admissionId} value={st.admissionId}>
                        {st.studentName} ({st.className})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {studentProfile ? (
              <div className="space-y-6">
                {/* Student Header Summary */}
                <div className="p-4 rounded-xl bg-muted/30 border flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold">{studentProfile.student.studentName}</h2>
                    <p className="text-xs text-muted-foreground">
                      Admission #: {studentProfile.student.admissionNumber} · Class: {studentProfile.student.className} · Gender: {studentProfile.student.gender}
                    </p>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground font-semibold">Overall Score</p>
                      <p className="text-2xl font-bold text-primary">
                        {studentProfile.overallAverage !== null ? `${studentProfile.overallAverage}%` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground font-semibold">Attendance</p>
                      <p className="text-2xl font-bold text-emerald-600">
                        {studentProfile.attendanceStats?.ratePercent !== null
                          ? `${studentProfile.attendanceStats?.ratePercent}%`
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Subject Breakdown Table */}
                <div>
                  <h4 className="text-sm font-semibold mb-3">Subject Performance Breakdown</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-muted/50 text-xs font-semibold uppercase">
                        <tr>
                          <th className="p-3">Subject</th>
                          <th className="p-3">Classwork Avg</th>
                          <th className="p-3">Exam Score</th>
                          <th className="p-3">Weighted Total</th>
                          <th className="p-3">Tasks Assessed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {studentProfile.subjectBreakdown?.map((sb: any, idx: number) => (
                          <tr key={idx} className="hover:bg-muted/20">
                            <td className="p-3 font-medium">{sb.subject}</td>
                            <td className="p-3">{sb.classworkPercent !== null ? `${sb.classworkPercent}%` : "—"}</td>
                            <td className="p-3">{sb.examPercent !== null ? `${sb.examPercent}%` : "—"}</td>
                            <td className="p-3 font-bold">{sb.scorePercent !== null ? `${sb.scorePercent}%` : "—"}</td>
                            <td className="p-3">{sb.taskCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Intervention History */}
                <div>
                  <h4 className="text-sm font-semibold mb-3">Intervention History & Outcome Progress</h4>
                  {studentProfile.interventions && studentProfile.interventions.length > 0 ? (
                    <div className="space-y-3">
                      {studentProfile.interventions.map((inv: any) => (
                        <div key={inv.id} className="p-4 rounded-lg border bg-card space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-sm">{inv.strategy}</span>
                            <Badge className="capitalize">{inv.status}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{inv.identified_need}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t">
                            <span>Start: {inv.start_date}</span>
                            <span>Review: {inv.review_date}</span>
                            <span>Target: {inv.target_outcome}</span>
                          </div>

                          {/* Progress Notes */}
                          {inv.progress_notes && inv.progress_notes.length > 0 && (
                            <div className="mt-2 space-y-1 bg-muted/30 p-2 rounded text-xs">
                              <p className="font-semibold text-muted-foreground">Progress Notes:</p>
                              {inv.progress_notes.map((n: any, nIdx: number) => (
                                <p key={nIdx}>• {n.content} <span className="text-muted-foreground font-normal">({new Date(n.createdAt).toLocaleDateString()})</span></p>
                              ))}
                            </div>
                          )}

                          {/* Status transition controls */}
                          <div className="flex items-center gap-2 pt-2">
                            {inv.status !== "closed" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleUpdateStatus(inv.id, "closed")}
                                >
                                  Close Intervention
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleUpdateStatus(inv.id, "escalated")}
                                >
                                  Escalate Case
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No prior interventions recorded for this student.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-muted-foreground text-sm">
                Select a student from the dropdown above to view their academic performance profile.
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* MODAL 1: CREATE INTERVENTION */}
      <Dialog open={createInterventionOpen} onOpenChange={setCreateInterventionOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Initiate Academic Intervention Plan</DialogTitle>
            <DialogDescription>
              Assign targeted support and measurable outcome goals for {targetStudentRisk?.studentName}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            <div>
              <Label>Intervention Strategy</Label>
              <Select
                value={interventionForm.strategy}
                onValueChange={(v) => setInterventionForm((f) => ({ ...f, strategy: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVENTION_STRATEGIES.map((st) => (
                    <SelectItem key={st} value={st}>
                      {st}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Identified Learning Need</Label>
              <Textarea
                className="mt-1"
                rows={2}
                placeholder="Describe specific learning difficulty or attendance challenge..."
                value={interventionForm.identifiedNeed}
                onChange={(e) =>
                  setInterventionForm((f) => ({ ...f, identifiedNeed: e.target.value }))
                }
              />
            </div>

            <div>
              <Label>Target Outcome Objective</Label>
              <Input
                className="mt-1"
                placeholder="e.g. Achieve >= 60% in Mathematics"
                value={interventionForm.targetOutcome}
                onChange={(e) =>
                  setInterventionForm((f) => ({ ...f, targetOutcome: e.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={interventionForm.startDate}
                  onChange={(e) =>
                    setInterventionForm((f) => ({ ...f, startDate: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Planned Review Date</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={interventionForm.reviewDate}
                  onChange={(e) =>
                    setInterventionForm((f) => ({ ...f, reviewDate: e.target.value }))
                  }
                />
              </div>
            </div>

            <div>
              <Label>Responsible Staff / Educator</Label>
              <Input
                className="mt-1"
                placeholder="Staff name or title"
                value={interventionForm.responsibleStaffName}
                onChange={(e) =>
                  setInterventionForm((f) => ({ ...f, responsibleStaffName: e.target.value }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateInterventionOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateIntervention}>Save & Initiate Plan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: RISK RULES CONFIGURATION */}
      <Dialog open={riskRulesOpen} onOpenChange={setRiskRulesOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configure Performance Risk Rules</DialogTitle>
            <DialogDescription>
              Set platform-wide threshold rules for automatic at-risk student detection.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            <div>
              <Label>Academic Pass / Proficiency Minimum Score (%)</Label>
              <Input
                type="number"
                className="mt-1"
                value={riskRulesForm.academicMinScore}
                onChange={(e) =>
                  setRiskRulesForm((f) => ({ ...f, academicMinScore: Number(e.target.value) }))
                }
              />
            </div>

            <div>
              <Label>Minimum Expected Attendance Rate (%)</Label>
              <Input
                type="number"
                className="mt-1"
                value={riskRulesForm.attendanceMinPercent}
                onChange={(e) =>
                  setRiskRulesForm((f) => ({ ...f, attendanceMinPercent: Number(e.target.value) }))
                }
              />
            </div>

            <div>
              <Label>Maximum Allowable Missing Tasks (%)</Label>
              <Input
                type="number"
                className="mt-1"
                value={riskRulesForm.engagementMaxMissing}
                onChange={(e) =>
                  setRiskRulesForm((f) => ({ ...f, engagementMaxMissing: Number(e.target.value) }))
                }
              />
            </div>

            <div>
              <Label>Max Allowable Performance Decline (%)</Label>
              <Input
                type="number"
                className="mt-1"
                value={riskRulesForm.progressMaxDecline}
                onChange={(e) =>
                  setRiskRulesForm((f) => ({ ...f, progressMaxDecline: Number(e.target.value) }))
                }
              />
            </div>

            <div>
              <Label>Gender Privacy Small-Group Disclosure Limit</Label>
              <Input
                type="number"
                className="mt-1"
                value={riskRulesForm.smallGroupDisclosureLimit}
                onChange={(e) =>
                  setRiskRulesForm((f) => ({ ...f, smallGroupDisclosureLimit: Number(e.target.value) }))
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                Aggregated statistics for groups with fewer students than this limit will be masked.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRiskRulesOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRiskRules}>Save Rules</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
