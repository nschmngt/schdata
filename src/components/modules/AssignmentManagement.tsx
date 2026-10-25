import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileEdit,
  FileText,
  FolderPlus,
  GraduationCap,
  Info,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/hooks/useSession";
import { useAcademicCalendar } from "@/hooks/useAcademicCalendar";
import { PeriodSelect } from "@/components/portal/PeriodFields";
import { useAcademicRules } from "@/hooks/useAcademicRules";
import { useSchoolClasses } from "@/hooks/useSchoolClasses";
import { useSubjectOptions } from "@/hooks/useSubjectOptions";
import { levelOfClass, subjectsForClass } from "@/lib/education-levels";
import { activeAssessmentTypes, gradeFromBands } from "@/lib/academic-rules";
import { Pager, usePaged } from "@/components/portal/Paged";
import {
  calculateLatePenalty,
  formatSubmissionMode,
  formatSubmissionType,
  getAssignmentStatus,
} from "@/lib/assignments";
import {
  deleteAssignment,
  getAssignmentDetails,
  getTeacherScopeData,
  gradeSubmission,
  listAssignments,
  manageAssignmentGroups,
  requestRegrade,
  reviewRegradeRequest,
  saveAssignment,
  submitAssignment,
} from "@/lib/assignments.functions";
import { formatRegradeStatus } from "@/lib/assignments";

interface StudentRow {
  id: string;
  admission_number: string | null;
  student_name: string;
  class_admitted: string;
  parent_name: string | null;
  parent_phone: string | null;
}

interface AssignmentItem {
  id: string;
  title: string;
  description: string;
  className: string;
  subject: string;
  educationLevel: string;
  term: string;
  assessmentType: string;
  maxScore: number;
  dueDate: string;
  submissionMode: string;
  submissionType: string;
  allowLate: boolean;
  lateGraceHours: number;
  latePenaltyType: string;
  latePenaltyValue: number;
  maxLatePenaltyPercent: number;
  cutoffDate: string | null;
  createdBy: string | null;
  createdAt: string;
  totalSubmissions: number;
  totalGraded: number;
  submissions?: any[];
}

const emptyAssignmentForm = {
  id: "",
  title: "",
  description: "",
  className: "",
  subject: "",
  educationLevel: "",
  term: "",
  assessmentType: "",
  maxScore: "100",
  dueDate: "",
  submissionMode: "individual",
  submissionType: "text",
  allowLate: true,
  lateGraceHours: "0",
  latePenaltyType: "percentage_per_day",
  latePenaltyValue: "5",
  maxLatePenaltyPercent: "50",
  cutoffDate: "",
};

export function AssignmentManagement() {
  const { profile } = useSession();
  const cal = useAcademicCalendar();
  const rules = useAcademicRules();
  const assessmentTypes = activeAssessmentTypes(rules);
  const { names: allClasses, classes: classCatalog } = useSchoolClasses();
  const { subjects: allSubjects, catalog: subjectCatalog } = useSubjectOptions();

  const fetchScopeData = useServerFn(getTeacherScopeData);
  const fetchList = useServerFn(listAssignments);
  const fetchDetails = useServerFn(getAssignmentDetails);
  const saveAction = useServerFn(saveAssignment);
  const deleteAction = useServerFn(deleteAssignment);
  const createGroupAction = useServerFn(manageAssignmentGroups);
  const submitAction = useServerFn(submitAssignment);
  const gradeAction = useServerFn(gradeSubmission);
  const requestRegradeAction = useServerFn(requestRegrade);
  const reviewRegradeAction = useServerFn(reviewRegradeRequest);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<any>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);

  // Form state for assignment creation/edit
  const [form, setForm] = useState(emptyAssignmentForm);
  const [editingAssignment, setEditingAssignment] = useState<string | null>(null);

  // Active assignment details state (for grading / viewing / groups)
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [details, setDetails] = useState<{
    assignment: AssignmentItem;
    groups: any[];
    submissions: any[];
  } | null>(null);

  // Filter state
  const [filterClass, setFilterClass] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterTerm, setFilterTerm] = useState("");

  // Group creation form state
  const [groupName, setGroupName] = useState("");
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]);

  // Submission modal state (student)
  const [submittingAssignment, setSubmittingAssignment] = useState<AssignmentItem | null>(null);
  const [submissionText, setSubmissionText] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");

  // Grading state
  const [gradingSubmissionId, setGradingSubmissionId] = useState<string | null>(null);
  const [rawScoreInput, setRawScoreInput] = useState("");
  const [feedbackInput, setFeedbackInput] = useState("");
  const [syncToAssessment, setSyncToAssessment] = useState(false);

  // Regrade Request state
  const [requestingRegradeSubmissionId, setRequestingRegradeSubmissionId] = useState<string | null>(null);
  const [regradeReasonInput, setRegradeReasonInput] = useState("");
  const [reviewingRegradeReqId, setReviewingRegradeReqId] = useState<string | null>(null);
  const [regradeReviewStatus, setRegradeReviewStatus] = useState<"approved" | "rejected">("approved");
  const [teacherResponseInput, setTeacherResponseInput] = useState("");
  const [newRawScoreInput, setNewRawScoreInput] = useState("");

  const isTeacherOrAdmin = profile?.role === "super_admin" || profile?.role === "school_manager" || profile?.role === "staff";

  const refreshData = async () => {
    try {
      const data = await fetchList();
      setAssignments(data as AssignmentItem[]);
      if (selectedAssignmentId) {
        const detailData = await fetchDetails({ data: { id: selectedAssignmentId } });
        setDetails(detailData as any);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to refresh assignments.");
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const scopeRes = await fetchScopeData();
        setScope(scopeRes.scope);
        setStudents(scopeRes.students as StudentRow[]);
        await refreshData();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error loading scope data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (cal.current?.name && !form.term) {
      setForm((f) => ({ ...f, term: cal.current.name }));
    }
  }, [cal.current?.name]);

  // Derived options for dropdowns based on teacher scope
  const classOptions = scope && !scope.isAdmin ? scope.classes : allClasses;
  const subjectOptions =
    scope && !scope.isAdmin
      ? [...new Set(scope.pairs.filter((p: any) => !form.className || p.class_name === form.className).map((p: any) => p.subject))]
      : form.className
        ? subjectsForClass(subjectCatalog, classCatalog, form.className)
        : allSubjects;

  const handleClassChange = (className: string) => {
    const level = levelOfClass(classCatalog, className) ?? "";
    setForm((f) => ({
      ...f,
      className,
      educationLevel: level,
      subject: f.className === className ? f.subject : "",
    }));
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await saveAction({
        data: {
          ...(form.id ? { id: form.id } : {}),
          title: form.title,
          description: form.description,
          className: form.className,
          subject: form.subject,
          educationLevel: form.educationLevel || levelOfClass(classCatalog, form.className) || "",
          term: form.term || cal.current?.name || "",
          assessmentType: form.assessmentType || assessmentTypes[0] || "Assignment",
          maxScore: Number(form.maxScore),
          dueDate: form.dueDate,
          submissionMode: form.submissionMode as "individual" | "group",
          submissionType: form.submissionType as "text" | "file_link" | "offline",
          allowLate: form.allowLate,
          lateGraceHours: Number(form.lateGraceHours),
          latePenaltyType: form.latePenaltyType as "percentage_per_day" | "fixed_per_day" | "none",
          latePenaltyValue: Number(form.latePenaltyValue),
          maxLatePenaltyPercent: Number(form.maxLatePenaltyPercent),
          cutoffDate: form.cutoffDate || null,
        },
      });
      toast.success(form.id ? "Assignment updated." : "Assignment created.");
      setForm(emptyAssignmentForm);
      setEditingAssignment(null);
      await refreshData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save assignment.");
    } finally {
      setBusy(false);
    }
  };

  const handleRequestRegrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestingRegradeSubmissionId) return;
    setBusy(true);
    try {
      await requestRegradeAction({
        data: {
          submissionId: requestingRegradeSubmissionId,
          reason: regradeReasonInput,
        },
      });
      toast.success("Regrade request submitted successfully.");
      setRequestingRegradeSubmissionId(null);
      setRegradeReasonInput("");
      if (selectedAssignmentId) await handleOpenDetails(selectedAssignmentId);
      await refreshData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit regrade request.");
    } finally {
      setBusy(false);
    }
  };

  const handleReviewRegrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingRegradeReqId) return;
    setBusy(true);
    try {
      const res = await reviewRegradeAction({
        data: {
          regradeRequestId: reviewingRegradeReqId,
          status: regradeReviewStatus,
          teacherResponse: teacherResponseInput,
          newRawScore: newRawScoreInput !== "" ? Number(newRawScoreInput) : null,
          syncToAssessment,
        },
      });
      toast.success(`Regrade request ${res.status}.`);
      setReviewingRegradeReqId(null);
      setTeacherResponseInput("");
      setNewRawScoreInput("");
      if (selectedAssignmentId) await handleOpenDetails(selectedAssignmentId);
      await refreshData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to review regrade request.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAssignment = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"?`)) return;
    try {
      await deleteAction({ data: { id } });
      toast.success("Assignment deleted.");
      if (selectedAssignmentId === id) {
        setSelectedAssignmentId(null);
        setDetails(null);
      }
      await refreshData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete assignment.");
    }
  };

  const handleOpenDetails = async (id: string) => {
    setSelectedAssignmentId(id);
    try {
      const d = await fetchDetails({ data: { id } });
      setDetails(d as any);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load details.");
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignmentId) return;
    if (selectedGroupMembers.length === 0) {
      toast.error("Please select at least one student for the group.");
      return;
    }
    setBusy(true);
    try {
      await createGroupAction({
        data: {
          assignmentId: selectedAssignmentId,
          groupName,
          admissionIds: selectedGroupMembers,
        },
      });
      toast.success("Group created successfully.");
      setGroupName("");
      setSelectedGroupMembers([]);
      await handleOpenDetails(selectedAssignmentId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create group.");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submittingAssignment) return;
    setBusy(true);
    try {
      await submitAction({
        data: {
          assignmentId: submittingAssignment.id,
          submissionText,
          attachmentUrl,
          groupId: submittingAssignment.submissionMode === "group" ? selectedGroupId : undefined,
        },
      });
      toast.success("Assignment submitted successfully.");
      setSubmittingAssignment(null);
      setSubmissionText("");
      setAttachmentUrl("");
      setSelectedGroupId("");
      await refreshData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit assignment.");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradingSubmissionId) return;
    setBusy(true);
    try {
      const res = await gradeAction({
        data: {
          submissionId: gradingSubmissionId,
          rawScore: Number(rawScoreInput),
          feedback: feedbackInput,
          syncToAssessment,
        },
      });
      toast.success(`Submission graded! Final score: ${res.finalScore}`);
      setGradingSubmissionId(null);
      setRawScoreInput("");
      setFeedbackInput("");
      if (selectedAssignmentId) await handleOpenDetails(selectedAssignmentId);
      await refreshData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to grade submission.");
    } finally {
      setBusy(false);
    }
  };

  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      const matchClass = !filterClass || a.className.toLowerCase().includes(filterClass.toLowerCase());
      const matchSubject = !filterSubject || a.subject.toLowerCase().includes(filterSubject.toLowerCase());
      const matchTerm = !filterTerm || a.term.toLowerCase().includes(filterTerm.toLowerCase());
      return matchClass && matchSubject && matchTerm;
    });
  }, [assignments, filterClass, filterSubject, filterTerm]);

  const pagedAssignments = usePaged(filteredAssignments, 20);

  if (loading) {
    return (
      <div className="surface flex items-center justify-center p-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" aria-hidden /> Loading assignments module…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="list" className="space-y-6">
        <TabsList>
          <TabsTrigger value="list" className="gap-2">
            <FileText className="size-4" aria-hidden /> Assignments List
          </TabsTrigger>
          {isTeacherOrAdmin ? (
            <TabsTrigger value="create" className="gap-2">
              <Plus className="size-4" aria-hidden /> {form.id ? "Edit Assignment" : "New Assignment"}
            </TabsTrigger>
          ) : null}
        </TabsList>

        {/* LIST TAB */}
        <TabsContent value="list" className="space-y-6">
          <section className="surface space-y-4 p-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Filter Class</Label>
                <Input
                  placeholder="All classes..."
                  value={filterClass}
                  onChange={(e) => setFilterClass(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Filter Subject</Label>
                <Input
                  placeholder="All subjects..."
                  value={filterSubject}
                  onChange={(e) => setFilterSubject(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Filter Term</Label>
                <Input
                  placeholder="All terms..."
                  value={filterTerm}
                  onChange={(e) => setFilterTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pagedAssignments.items.map((item) => {
                const status = getAssignmentStatus(item);
                const isOverdue = status === "overdue";
                const isClosed = status === "closed";

                return (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <Badge variant="outline" className="text-xs font-semibold uppercase">
                          {item.className} · {item.subject}
                        </Badge>
                        <Badge
                          className={
                            isClosed
                              ? "bg-muted text-muted-foreground"
                              : isOverdue
                              ? "bg-destructive/10 text-destructive border-destructive/20"
                              : "bg-success/10 text-success border-success/20"
                          }
                        >
                          {status.toUpperCase()}
                        </Badge>
                      </div>

                      <div>
                        <h3 className="font-bold text-card-foreground">{item.title}</h3>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {item.description || "No instructions provided."}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Users className="size-3.5 text-primary" aria-hidden />
                          <span>{formatSubmissionMode(item.submissionMode)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <FileEdit className="size-3.5 text-primary" aria-hidden />
                          <span>{formatSubmissionType(item.submissionType)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="size-3.5 text-primary" aria-hidden />
                          <span>Due: {new Date(item.dueDate).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="size-3.5 text-primary" aria-hidden />
                          <span>Max Points: {item.maxScore}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                      {isTeacherOrAdmin ? (
                        <>
                          <span className="text-xs text-muted-foreground">
                            Submissions: <strong>{item.totalSubmissions}</strong> ({item.totalGraded} graded)
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenDetails(item.id)}
                            >
                              Grade / View
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setForm({
                                  id: item.id,
                                  title: item.title,
                                  description: item.description,
                                  className: item.className,
                                  subject: item.subject,
                                  educationLevel: item.educationLevel,
                                  term: item.term,
                                  assessmentType: item.assessmentType,
                                  maxScore: String(item.maxScore),
                                  dueDate: new Date(item.dueDate).toISOString().slice(0, 16),
                                  submissionMode: item.submissionMode,
                                  submissionType: item.submissionType,
                                  allowLate: item.allowLate,
                                  lateGraceHours: String(item.lateGraceHours),
                                  latePenaltyType: item.latePenaltyType,
                                  latePenaltyValue: String(item.latePenaltyValue),
                                  maxLatePenaltyPercent: String(item.maxLatePenaltyPercent),
                                  cutoffDate: item.cutoffDate ? new Date(item.cutoffDate).toISOString().slice(0, 16) : "",
                                });
                                setEditingAssignment(item.id);
                              }}
                            >
                              <Pencil className="size-3.5" aria-hidden />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => handleDeleteAssignment(item.id, item.title)}
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </Button>
                          </div>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          disabled={isClosed}
                          onClick={async () => {
                            await handleOpenDetails(item.id);
                            setSubmittingAssignment(item);
                          }}
                        >
                          <Send className="mr-1.5 size-3.5" aria-hidden />
                          Submit Work
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredAssignments.length === 0 ? (
                <div className="col-span-full rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
                  No assignments found matching criteria.
                </div>
              ) : null}
            </div>

            <Pager {...pagedAssignments} />
          </section>
        </TabsContent>

        {/* CREATE / EDIT TAB */}
        {isTeacherOrAdmin ? (
          <TabsContent value="create" className="space-y-6">
            <form onSubmit={handleSaveAssignment} className="surface space-y-6 p-6">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h2 className="text-lg font-bold">
                    {form.id ? "Edit Assignment" : "Create New Assignment"}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Define assignment details, submission mode, due dates, and late penalty rules.
                  </p>
                </div>
                {form.id ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setForm(emptyAssignmentForm);
                      setEditingAssignment(null);
                    }}
                  >
                    <X className="mr-1.5 size-4" aria-hidden /> Cancel Editing
                  </Button>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Assignment Title</Label>
                  <Input
                    required
                    placeholder="e.g. Chapter 4 Calculus Problem Set"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Target Class</Label>
                  <Select value={form.className} onValueChange={handleClassChange}>
                    <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                    <SelectContent>
                      {classOptions.map((c: string) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Subject</Label>
                  <Select
                    value={form.subject}
                    onValueChange={(v) => setForm({ ...form, subject: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                    <SelectContent>
                      {subjectOptions.map((x: string) => (
                        <SelectItem key={x} value={x}>{x}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Academic Term / Period</Label>
                  <PeriodSelect value={form.term} onChange={(v) => setForm({ ...form, term: v })} />
                </div>

                <div className="space-y-1.5">
                  <Label>Assessment Type (Academic Configuration)</Label>
                  <Select
                    value={form.assessmentType || assessmentTypes[0] || "Assignment"}
                    onValueChange={(v) => setForm({ ...form, assessmentType: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {assessmentTypes.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Submission Mode</Label>
                  <Select
                    value={form.submissionMode}
                    onValueChange={(v) => setForm({ ...form, submissionMode: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual">Individual Submission</SelectItem>
                      <SelectItem value="group">Group Submission</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Submission Format Type</Label>
                  <Select
                    value={form.submissionType}
                    onValueChange={(v) => setForm({ ...form, submissionType: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Online Text Entry</SelectItem>
                      <SelectItem value="file_link">File / URL Link</SelectItem>
                      <SelectItem value="offline">Offline / Physical Submission</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Max Score / Total Points</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.maxScore}
                    onChange={(e) => setForm({ ...form, maxScore: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Due Date & Time</Label>
                  <Input
                    type="datetime-local"
                    required
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Hard Cutoff Date & Time (Optional)</Label>
                  <Input
                    type="datetime-local"
                    value={form.cutoffDate}
                    onChange={(e) => setForm({ ...form, cutoffDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Instructions / Description</Label>
                <Textarea
                  rows={3}
                  placeholder="Provide clear guidelines, objectives, and instructions..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              {/* LATE SUBMISSION POLICY SECTION */}
              <div className="rounded-xl border border-border bg-muted/40 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-sm">Late Submission & Penalty Policy</h3>
                    <p className="text-xs text-muted-foreground">
                      Configure automated late penalty deductions after the predetermined grace period.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="allow-late-switch" className="text-xs font-semibold">
                      {form.allowLate ? "Late Submissions Allowed" : "No Late Submissions"}
                    </Label>
                    <Switch
                      id="allow-late-switch"
                      checked={form.allowLate}
                      onCheckedChange={(checked) => setForm({ ...form, allowLate: checked })}
                    />
                  </div>
                </div>

                {form.allowLate ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-2">
                    <div className="space-y-1.5">
                      <Label>Grace Period (Hours)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.lateGraceHours}
                        onChange={(e) => setForm({ ...form, lateGraceHours: e.target.value })}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Penalty Calculation Type</Label>
                      <Select
                        value={form.latePenaltyType}
                        onValueChange={(v) => setForm({ ...form, latePenaltyType: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage_per_day">% Deduction per Day</SelectItem>
                          <SelectItem value="fixed_per_day">Fixed Points per Day</SelectItem>
                          <SelectItem value="none">No Penalty (Grace Only)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Penalty Rate Value</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.latePenaltyValue}
                        onChange={(e) => setForm({ ...form, latePenaltyValue: e.target.value })}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Max Penalty Cap (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={form.maxLatePenaltyPercent}
                        onChange={(e) => setForm({ ...form, maxLatePenaltyPercent: e.target.value })}
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : <Plus className="mr-2 size-4" aria-hidden />}
                {form.id ? "Update Assignment" : "Create Assignment"}
              </Button>
            </form>
          </TabsContent>
        ) : null}
      </Tabs>

      {/* DETAIL / GRADING DIALOG */}
      {details ? (
        <Dialog open={!!details} onOpenChange={(open) => !open && setDetails(null)}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between pr-6">
                <div>
                  <DialogTitle className="text-xl font-bold">{details.assignment.title}</DialogTitle>
                  <DialogDescription className="text-xs">
                    {details.assignment.className} · {details.assignment.subject} ({details.assignment.term})
                  </DialogDescription>
                </div>
                <Badge variant="outline">{formatSubmissionMode(details.assignment.submissionMode)}</Badge>
              </div>
            </DialogHeader>

            <Tabs defaultValue="submissions" className="space-y-4">
              <TabsList>
                <TabsTrigger value="submissions">Submissions ({details.submissions.length})</TabsTrigger>
                {details.assignment.submissionMode === "group" ? (
                  <TabsTrigger value="groups">Groups ({details.groups.length})</TabsTrigger>
                ) : null}
              </TabsList>

              {/* SUBMISSIONS TAB */}
              <TabsContent value="submissions" className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                        <th className="p-2">Submitter</th>
                        <th className="p-2">Submitted Date</th>
                        <th className="p-2">Status</th>
                        <th className="p-2">Submission</th>
                        <th className="p-2 text-right">Score</th>
                        <th className="p-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.submissions.map((sub) => {
                        const band =
                          sub.finalScore !== null
                            ? gradeFromBands(
                                rules.gradeBands,
                                (sub.finalScore / details.assignment.maxScore) * 100
                              )
                            : null;

                        return (
                          <tbody key={sub.id} className="contents">
                            <tr className="border-b border-border/60">
                              <td className="p-2 font-medium">
                                {sub.studentName ?? sub.groupName ?? "Unknown"}
                                {sub.admissionNumber ? ` (${sub.admissionNumber})` : ""}
                              </td>
                              <td className="p-2 text-xs">
                                {new Date(sub.submittedAt).toLocaleString()}
                              </td>
                              <td className="p-2">
                                {sub.isLate ? (
                                  <Badge variant="destructive" className="text-[10px]">
                                    Late ({sub.lateHours}h)
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px]">On time</Badge>
                                )}
                              </td>
                              <td className="p-2 text-xs max-w-xs truncate">
                                {sub.submissionText || sub.attachmentUrl || "Offline Submission"}
                              </td>
                              <td className="p-2 text-right font-semibold">
                                {sub.finalScore !== null ? (
                                  <span>
                                    {sub.finalScore} / {details.assignment.maxScore}
                                    {band ? ` (${band.grade})` : ""}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground font-normal">Not graded</span>
                                )}
                              </td>
                              <td className="p-2 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {isTeacherOrAdmin ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setGradingSubmissionId(sub.id);
                                        setRawScoreInput(sub.rawScore !== null ? String(sub.rawScore) : "");
                                        setFeedbackInput(sub.feedback || "");
                                      }}
                                    >
                                      Grade
                                    </Button>
                                  ) : sub.gradedAt ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setRequestingRegradeSubmissionId(sub.id);
                                      }}
                                    >
                                      Request Regrade
                                    </Button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>

                            {/* REGRADE REQUEST SUB-ROW */}
                            {sub.regradeRequests && sub.regradeRequests.length > 0 ? (
                              <tr key={`${sub.id}-regrade`} className="bg-muted/20 border-b border-border/40">
                                <td colSpan={6} className="p-3 pl-8 text-xs space-y-2">
                                  <span className="font-semibold text-primary">Regrade Requests ({sub.regradeRequests.length}):</span>
                                  <div className="space-y-1.5">
                                    {sub.regradeRequests.map((rr: any) => (
                                      <div key={rr.id} className="flex items-center justify-between rounded-md border border-border/50 bg-card p-2 text-xs">
                                        <div className="space-y-0.5">
                                          <div className="flex items-center gap-2">
                                            <Badge
                                              variant={rr.status === "approved" ? "default" : rr.status === "rejected" ? "destructive" : "outline"}
                                              className="text-[10px]"
                                            >
                                              {formatRegradeStatus(rr.status)}
                                            </Badge>
                                            <span className="font-medium text-foreground">Reason: {rr.reason}</span>
                                          </div>
                                          {rr.teacher_response ? (
                                            <p className="text-[11px] text-muted-foreground">Response: {rr.teacher_response}</p>
                                          ) : null}
                                        </div>

                                        {isTeacherOrAdmin && rr.status === "pending" ? (
                                          <Button
                                            size="sm"
                                            variant="secondary"
                                            className="text-xs"
                                            onClick={() => {
                                              setReviewingRegradeReqId(rr.id);
                                              setRegradeReviewStatus("approved");
                                              setNewRawScoreInput(sub.rawScore !== null ? String(sub.rawScore) : "");
                                              setTeacherResponseInput("");
                                            }}
                                          >
                                            Review Request
                                          </Button>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        );
                      })}

                      {details.submissions.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-muted-foreground">
                            No submissions recorded yet for this assignment.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* GROUPS TAB */}
              {details.assignment.submissionMode === "group" ? (
                <TabsContent value="groups" className="space-y-4">
                  <form onSubmit={handleCreateGroup} className="rounded-xl border border-border p-4 space-y-3 bg-muted/30">
                    <h4 className="font-semibold text-sm">Create New Group</h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Group Name</Label>
                        <Input
                          placeholder="Group Alpha"
                          value={groupName}
                          onChange={(e) => setGroupName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Group Members</Label>
                        <Select
                          onValueChange={(val) => {
                            if (!selectedGroupMembers.includes(val)) {
                              setSelectedGroupMembers([...selectedGroupMembers, val]);
                            }
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Add student to group..." /></SelectTrigger>
                          <SelectContent>
                            {students
                              .filter((s) => s.class_admitted === details.assignment.className)
                              .map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.student_name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {selectedGroupMembers.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {selectedGroupMembers.map((id) => {
                          const s = students.find((x) => x.id === id);
                          return (
                            <Badge key={id} variant="secondary" className="gap-1">
                              {s?.student_name}
                              <X
                                className="size-3 cursor-pointer"
                                onClick={() =>
                                  setSelectedGroupMembers(selectedGroupMembers.filter((x) => x !== id))
                                }
                              />
                            </Badge>
                          );
                        })}
                      </div>
                    ) : null}

                    <Button size="sm" type="submit" disabled={busy}>
                      <FolderPlus className="mr-1.5 size-4" aria-hidden /> Add Group
                    </Button>
                  </form>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {details.groups.map((g) => (
                      <div key={g.id} className="rounded-lg border border-border p-3 space-y-2">
                        <h5 className="font-bold text-sm text-primary">{g.groupName}</h5>
                        <ul className="text-xs space-y-1 text-muted-foreground">
                          {g.members.map((m: any) => (
                            <li key={m.memberId} className="flex items-center gap-1.5">
                              <GraduationCap className="size-3 text-muted-foreground" aria-hidden />
                              <span>{m.studentName} ({m.admissionNumber ?? "N/A"})</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              ) : null}
            </Tabs>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* STUDENT SUBMISSION MODAL */}
      {submittingAssignment ? (
        <Dialog open={!!submittingAssignment} onOpenChange={(open) => !open && setSubmittingAssignment(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit Assignment: {submittingAssignment.title}</DialogTitle>
              <DialogDescription className="text-xs">
                Format required: {formatSubmissionType(submittingAssignment.submissionType)}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmitWork} className="space-y-4">
              {submittingAssignment.submissionMode === "group" ? (
                <div className="space-y-1.5">
                  <Label>Select Your Assigned Group</Label>
                  <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                    <SelectTrigger><SelectValue placeholder="Select group..." /></SelectTrigger>
                    <SelectContent>
                      {(details?.groups ?? []).map((g: any) => (
                        <SelectItem key={g.id} value={g.id}>{g.groupName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {submittingAssignment.submissionType === "text" || submittingAssignment.submissionType === "file_link" ? (
                <div className="space-y-1.5">
                  <Label>Submission Content / Text</Label>
                  <Textarea
                    rows={4}
                    placeholder="Type or paste your response here..."
                    value={submissionText}
                    onChange={(e) => setSubmissionText(e.target.value)}
                  />
                </div>
              ) : null}

              {submittingAssignment.submissionType === "file_link" ? (
                <div className="space-y-1.5">
                  <Label>Attachment URL / Document Link</Label>
                  <Input
                    placeholder="https://drive.google.com/file/..."
                    value={attachmentUrl}
                    onChange={(e) => setAttachmentUrl(e.target.value)}
                  />
                </div>
              ) : null}

              {submittingAssignment.submissionType === "offline" ? (
                <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
                  This assignment requires physical / offline submission. Clicking submit will log your intent and timestamp.
                </div>
              ) : null}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : <Send className="mr-2 size-4" aria-hidden />}
                Confirm & Submit
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* REGRADE REQUEST SUBMISSION MODAL (STUDENT) */}
      {requestingRegradeSubmissionId ? (
        <Dialog open={!!requestingRegradeSubmissionId} onOpenChange={(open) => !open && setRequestingRegradeSubmissionId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Regrade</DialogTitle>
              <DialogDescription className="text-xs">
                Provide a clear reason or justification for requesting a regrade on this assignment submission.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleRequestRegrade} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Reason for Regrade Request</Label>
                <Textarea
                  rows={4}
                  required
                  placeholder="Explain why you believe your grade should be reviewed..."
                  value={regradeReasonInput}
                  onChange={(e) => setRegradeReasonInput(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : <Send className="mr-2 size-4" aria-hidden />}
                Submit Request
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* REGRADE REVIEW MODAL (TEACHER / ADMIN) */}
      {reviewingRegradeReqId ? (
        <Dialog open={!!reviewingRegradeReqId} onOpenChange={(open) => !open && setReviewingRegradeReqId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Review Regrade Request</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleReviewRegrade} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Review Decision</Label>
                <Select
                  value={regradeReviewStatus}
                  onValueChange={(val: "approved" | "rejected") => setRegradeReviewStatus(val)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">Approve & Update Grade</SelectItem>
                    <SelectItem value="rejected">Reject Request</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {regradeReviewStatus === "approved" ? (
                <div className="space-y-1.5">
                  <Label>New Raw Score</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={newRawScoreInput}
                    onChange={(e) => setNewRawScoreInput(e.target.value)}
                  />
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label>Teacher Response / Note</Label>
                <Textarea
                  rows={3}
                  placeholder="Add feedback regarding your regrade decision..."
                  value={teacherResponseInput}
                  onChange={(e) => setTeacherResponseInput(e.target.value)}
                />
              </div>

              {regradeReviewStatus === "approved" ? (
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-semibold">Sync Updated Score to Assessment Records</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Automatically updates the continuous assessment profile with the regraded score.
                    </p>
                  </div>
                  <Switch
                    checked={syncToAssessment}
                    onCheckedChange={setSyncToAssessment}
                  />
                </div>
              ) : null}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="mr-2 size-4" aria-hidden />}
                Confirm Review
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* GRADING MODAL */}
      {gradingSubmissionId && details ? (
        <Dialog open={!!gradingSubmissionId} onOpenChange={(open) => !open && setGradingSubmissionId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Grade Submission</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSaveGrade} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Raw Score (Out of {details.assignment.maxScore})</Label>
                <Input
                  type="number"
                  min="0"
                  max={details.assignment.maxScore}
                  step="0.01"
                  required
                  value={rawScoreInput}
                  onChange={(e) => setRawScoreInput(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Teacher Feedback / Comments</Label>
                <Textarea
                  rows={3}
                  placeholder="Excellent problem-solving logic..."
                  value={feedbackInput}
                  onChange={(e) => setFeedbackInput(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">Sync Grade to Assessment Records</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Automatically publishes this score to the student's continuous assessment profile.
                  </p>
                </div>
                <Switch
                  checked={syncToAssessment}
                  onCheckedChange={setSyncToAssessment}
                />
              </div>

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="mr-2 size-4" aria-hidden />}
                Save Grade
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
