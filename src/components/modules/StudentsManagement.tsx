import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  DoorOpen,
  Download,
  Edit,
  FileText,
  Filter,
  GraduationCap,
  HelpCircle,
  Info,
  Library,
  Loader2,
  Mail,
  MoreHorizontal,
  Phone,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Users,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getStudentFullDetail,
  getStudentsOverview,
  recordStudentExeat,
  updateStudentClass,
  updateStudentDetail,
} from "@/lib/students.functions";
import { useFinanceConfig } from "@/hooks/useFinanceConfig";
import { useAcademicCalendar } from "@/hooks/useAcademicCalendar";
import { Pager, usePaged } from "@/components/portal/Paged";
import { PaymentStatus } from "@/lib/finance";

type OverviewData = Awaited<ReturnType<typeof getStudentsOverview>>;
type StudentRow = OverviewData["students"][number];
type StudentDetailData = Awaited<ReturnType<typeof getStudentFullDetail>>;

export function StudentsManagement() {
  const loadOverview = useServerFn(getStudentsOverview);
  const loadDetail = useServerFn(getStudentFullDetail);
  const updateDetailFn = useServerFn(updateStudentDetail);
  const updateClassFn = useServerFn(updateStudentClass);
  const recordExeatFn = useServerFn(recordStudentExeat);

  const { money } = useFinanceConfig();
  const calendar = useAcademicCalendar();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<OverviewData | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedGender, setSelectedGender] = useState("");
  const [selectedFeeStatus, setSelectedFeeStatus] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  // Selected Student for auto-populated detailed view
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [studentDetail, setStudentDetail] = useState<StudentDetailData | null>(null);

  // Dialog States
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [classDialogOpen, setClassDialogOpen] = useState(false);
  const [exeatDialogOpen, setExeatDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Exeat Form
  const [exeatStatus, setExeatStatus] = useState<"out" | "in_school">("out");
  const [exeatReason, setExeatReason] = useState("");
  const [exeatDestination, setExeatDestination] = useState("");
  const [exeatReturnAt, setExeatReturnAt] = useState("");

  // Class Change Form
  const [newClassName, setNewClassName] = useState("");

  // Edit Form State
  const [editForm, setEditForm] = useState({
    id: "",
    studentName: "",
    gender: "",
    dob: "",
    placeOfBirth: "",
    classAdmitted: "",
    previousSchool: "",
    previousClass: "",
    lastAttendance: "",
    reasonForLeaving: "",
    disabilityStatus: "No",
    disabilityType: "",
    assistanceNeeded: "",
    parentName: "",
    relationship: "",
    parentPhone: "",
    altContact: "",
    parentEmail: "",
    emergencyName: "",
    emergencyPhone: "",
    emergencyRelationship: "",
    emergencyResidence: "",
    emergencyResidenceDistrict: "",
    address: "",
    city: "",
    community: "",
    digitalAddress: "",
    hometown: "",
    hometownDistrict: "",
    residence: "",
    residenceDistrict: "",
    status: "admitted" as any,
  });

  const refreshOverview = () => {
    setLoading(true);
    loadOverview({
      data: {
        search,
        className: selectedClass,
        gender: selectedGender,
        feeStatus: selectedFeeStatus,
        status: selectedStatus,
      },
    })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load students"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refreshOverview();
  }, [search, selectedClass, selectedGender, selectedFeeStatus, selectedStatus]);

  useEffect(() => {
    if (!selectedStudentId) {
      setStudentDetail(null);
      return;
    }
    setDetailLoading(true);
    loadDetail({ data: { id: selectedStudentId } })
      .then((res) => {
        setStudentDetail(res);
        setNewClassName(res.admission.class_admitted);
        setEditForm({
          id: res.admission.id,
          studentName: res.admission.student_name,
          gender: res.admission.gender || "Other",
          dob: res.admission.dob || "",
          placeOfBirth: res.admission.place_of_birth || "",
          classAdmitted: res.admission.class_admitted,
          previousSchool: res.admission.previous_school || "",
          previousClass: res.admission.previous_class || "",
          lastAttendance: res.admission.last_attendance || "",
          reasonForLeaving: res.admission.reason_for_leaving || "",
          disabilityStatus: res.admission.disability_status || "No",
          disabilityType: res.admission.disability_type || "",
          assistanceNeeded: res.admission.assistance_needed || "",
          parentName: res.admission.parent_name,
          relationship: res.admission.relationship || "",
          parentPhone: res.admission.parent_phone || "",
          altContact: res.admission.alt_contact || "",
          parentEmail: res.admission.parent_email,
          emergencyName: res.admission.emergency_name || "",
          emergencyPhone: res.admission.emergency_phone || "",
          emergencyRelationship: res.admission.emergency_relationship || "",
          emergencyResidence: res.admission.emergency_residence || "",
          emergencyResidenceDistrict: res.admission.emergency_residence_district || "",
          address: res.admission.address || "",
          city: res.admission.city || "",
          community: res.admission.community || "",
          digitalAddress: res.admission.digital_address || "",
          hometown: res.admission.hometown || "",
          hometownDistrict: res.admission.hometown_district || "",
          residence: res.admission.residence || "",
          residenceDistrict: res.admission.residence_district || "",
          status: res.admission.status || "admitted",
        });
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load student details"))
      .finally(() => setDetailLoading(false));
  }, [selectedStudentId]);

  const handleUpdateDetail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await updateDetailFn({ data: editForm });
      toast.success("Student details updated successfully.");
      setEditDialogOpen(false);
      refreshOverview();
      if (selectedStudentId) {
        const updated = await loadDetail({ data: { id: selectedStudentId } });
        setStudentDetail(updated);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update student details");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId || !newClassName) return;
    setSubmitting(true);
    try {
      await updateClassFn({ data: { id: selectedStudentId, className: newClassName } });
      toast.success("Student class updated successfully.");
      setClassDialogOpen(false);
      refreshOverview();
      const updated = await loadDetail({ data: { id: selectedStudentId } });
      setStudentDetail(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update class");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordExeat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId || !exeatReason) return;
    setSubmitting(true);
    try {
      await recordExeatFn({
        data: {
          admissionId: selectedStudentId,
          status: exeatStatus,
          reason: exeatReason,
          destination: exeatDestination,
          returnAt: exeatReturnAt,
        },
      });
      toast.success("Exeat permission recorded.");
      setExeatDialogOpen(false);
      setExeatReason("");
      setExeatDestination("");
      setExeatReturnAt("");
      refreshOverview();
      const updated = await loadDetail({ data: { id: selectedStudentId } });
      setStudentDetail(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record exeat");
    } finally {
      setSubmitting(false);
    }
  };

  const pagedStudents = usePaged(data?.students ?? [], 12);

  if (selectedStudentId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedStudentId(null)}
            className="gap-2"
          >
            <ArrowLeft className="size-4" aria-hidden /> All Students
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refreshOverview()}>
              <RefreshCw className="mr-2 size-4" /> Refresh
            </Button>
            {data?.userScope.isAdmin && (
              <>
                <Button size="sm" variant="secondary" onClick={() => setClassDialogOpen(true)}>
                  Change Class
                </Button>
                <Button size="sm" onClick={() => setEditDialogOpen(true)}>
                  <Edit className="mr-2 size-4" /> Edit Profile
                </Button>
              </>
            )}
          </div>
        </div>

        {detailLoading || !studentDetail ? (
          <div className="surface flex items-center justify-center p-12 text-muted-foreground">
            <Loader2 className="mr-3 size-5 animate-spin" /> Loading selected student record...
          </div>
        ) : (
          <StudentDetailView
            detail={studentDetail}
            money={money}
            onOpenExeatDialog={() => setExeatDialogOpen(true)}
            onOpenEditDialog={() => setEditDialogOpen(true)}
          />
        )}

        {/* Dialogs */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Student Record</DialogTitle>
              <DialogDescription>
                Update student biodata, class, parent, and emergency contacts.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdateDetail} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold">Student Name</label>
                  <Input
                    required
                    value={editForm.studentName}
                    onChange={(e) => setEditForm({ ...editForm, studentName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">Gender</label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={editForm.gender}
                    onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold">Class Admitted</label>
                  <Input
                    required
                    value={editForm.classAdmitted}
                    onChange={(e) => setEditForm({ ...editForm, classAdmitted: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">Date of Birth</label>
                  <Input
                    type="date"
                    value={editForm.dob}
                    onChange={(e) => setEditForm({ ...editForm, dob: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">Parent / Guardian Name</label>
                  <Input
                    required
                    value={editForm.parentName}
                    onChange={(e) => setEditForm({ ...editForm, parentName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">Parent Email</label>
                  <Input
                    type="email"
                    required
                    value={editForm.parentEmail}
                    onChange={(e) => setEditForm({ ...editForm, parentEmail: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">Parent Phone</label>
                  <Input
                    value={editForm.parentPhone}
                    onChange={(e) => setEditForm({ ...editForm, parentPhone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">Emergency Name</label>
                  <Input
                    value={editForm.emergencyName}
                    onChange={(e) => setEditForm({ ...editForm, emergencyName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">Emergency Phone</label>
                  <Input
                    value={editForm.emergencyPhone}
                    onChange={(e) => setEditForm({ ...editForm, emergencyPhone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">Student Status</label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                  >
                    <option value="admitted">Admitted</option>
                    <option value="promoted">Promoted</option>
                    <option value="transferred">Transferred</option>
                    <option value="graduated">Graduated</option>
                    <option value="suspended">Suspended</option>
                    <option value="withdrawn">Withdrawn</option>
                  </select>
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button variant="outline" type="button" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} Save Changes
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={classDialogOpen} onOpenChange={setClassDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change Student Class</DialogTitle>
              <DialogDescription>
                Assign student to a new class placement across academic modules.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdateClass} className="space-y-4">
              <div>
                <label className="text-xs font-semibold">Select New Class</label>
                <Input
                  required
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="e.g. Basic 5, JHS 1"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setClassDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} Update Class
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={exeatDialogOpen} onOpenChange={setExeatDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Exeat Permission</DialogTitle>
              <DialogDescription>
                Issue or update exeat permission log for this student.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleRecordExeat} className="space-y-4">
              <div>
                <label className="text-xs font-semibold">Exeat Action</label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={exeatStatus}
                  onChange={(e) => setExeatStatus(e.target.value as any)}
                >
                  <option value="out">Departing School (Out)</option>
                  <option value="in_school">Returned to School (In School)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold">Reason</label>
                <Input
                  required
                  value={exeatReason}
                  onChange={(e) => setExeatReason(e.target.value)}
                  placeholder="e.g., Medical appointment, Family emergency"
                />
              </div>
              <div>
                <label className="text-xs font-semibold">Destination</label>
                <Input
                  value={exeatDestination}
                  onChange={(e) => setExeatDestination(e.target.value)}
                  placeholder="e.g., Regional Hospital"
                />
              </div>
              <div>
                <label className="text-xs font-semibold">Expected Return Date & Time</label>
                <Input
                  type="datetime-local"
                  value={exeatReturnAt}
                  onChange={(e) => setExeatReturnAt(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setExeatDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} Submit Exeat
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={GraduationCap}
          label="Total Students"
          value={data?.stats.totalStudents.toString() ?? "0"}
          hint="Admitted & active records"
        />
        <StatCard
          icon={CalendarCheck}
          label="Attendance Rate"
          value={data?.stats.averageAttendance !== null && data?.stats.averageAttendance !== undefined ? `${data.stats.averageAttendance}%` : "—"}
          hint="Overall register average"
        />
        <StatCard
          icon={Receipt}
          label="Fee Clearance Rate"
          value={`${data?.stats.feeClearanceRate ?? 100}%`}
          hint="Zero balance or fully paid"
        />
        <StatCard
          icon={DoorOpen}
          label="Active Exeats"
          value={data?.stats.activeExeatCount.toString() ?? "0"}
          hint="Currently out of school"
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="surface p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-1 items-center gap-2 min-w-[240px]">
            <Search className="size-4 text-muted-foreground" />
            <Input
              placeholder="Search by student name, admission #, parent..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter Class"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
            >
              <option value="">All Classes</option>
              {(data?.classes ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter Gender"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={selectedGender}
              onChange={(e) => setSelectedGender(e.target.value)}
            >
              <option value="">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>

            <select
              aria-label="Filter Fee Status"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={selectedFeeStatus}
              onChange={(e) => setSelectedFeeStatus(e.target.value)}
            >
              <option value="">All Fee Statuses</option>
              <option value="paid">Paid</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
            </select>

            <select
              aria-label="Filter Status"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="">All Lifecycle States</option>
              <option value="admitted">Admitted</option>
              <option value="promoted">Promoted</option>
              <option value="transferred">Transferred</option>
              <option value="graduated">Graduated</option>
              <option value="suspended">Suspended</option>
              <option value="withdrawn">Withdrawn</option>
            </select>

            <Button variant="outline" size="sm" onClick={() => refreshOverview()}>
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Student Master Table */}
      {loading ? (
        <div className="surface flex items-center justify-center p-12 text-muted-foreground">
          <Loader2 className="mr-3 size-5 animate-spin" /> Loading students directory...
        </div>
      ) : data?.students.length === 0 ? (
        <div className="surface p-8 text-center space-y-2">
          <GraduationCap className="mx-auto size-10 text-muted-foreground" />
          <h3 className="font-semibold text-lg">No student records found</h3>
          <p className="text-sm text-muted-foreground">
            No students match the current filters or scope. Try adjusting search criteria.
          </p>
        </div>
      ) : (
        <div className="surface space-y-4 p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left">
                <tr>
                  <th className="p-3 font-medium">Student Info</th>
                  <th className="p-3 font-medium">Class & Teacher</th>
                  <th className="p-3 font-medium">Parent Contact</th>
                  <th className="p-3 font-medium">Attendance</th>
                  <th className="p-3 font-medium">Fee Status</th>
                  <th className="p-3 font-medium">Exeat</th>
                  <th className="p-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedStudents.items.map((s) => (
                  <tr key={s.id} className="border-b hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-semibold">{s.student_name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {s.admission_number || "—"} · {s.gender}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-medium">{s.class_admitted}</div>
                      <div className="text-xs text-muted-foreground">
                        Teacher: {s.teacher?.teacher_name || "Unassigned"}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-medium">{s.parent_name}</div>
                      <div className="text-xs text-muted-foreground">{s.parent_phone || s.parent_email}</div>
                    </td>
                    <td className="p-3">
                      {s.attendanceRate !== null ? (
                        <Badge variant={s.attendanceRate >= 80 ? "secondary" : "outline"}>
                          {s.attendanceRate}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      <FeeStatusBadge status={s.financials.paymentStatus} balance={s.financials.balance} money={money} />
                    </td>
                    <td className="p-3">
                      {s.exeatStatus === "out" ? (
                        <Badge variant="destructive" className="gap-1">
                          <DoorOpen className="size-3" /> Out
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          In School
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedStudentId(s.id)}
                        className="gap-1 text-primary hover:text-primary"
                      >
                        View Full Record <ChevronRight className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager {...pagedStudents} />
        </div>
      )}
    </div>
  );
}

function StudentDetailView({
  detail,
  money,
  onOpenExeatDialog,
  onOpenEditDialog,
}: {
  detail: StudentDetailData;
  money: (val: number) => string;
  onOpenExeatDialog: () => void;
  onOpenEditDialog: () => void;
}) {
  const { admission, teacher, academicSummary, attendanceSummary, financialSummary, operationsSummary, lifecycle } =
    detail;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <header className="surface p-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold text-2xl">
            {admission.student_name.slice(0, 1)}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{admission.student_name}</h1>
              <Badge variant={admission.status === "admitted" ? "default" : "secondary"}>
                {admission.status || "admitted"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Admission #: <span className="font-mono text-foreground">{admission.admission_number}</span> · Class:{" "}
              <span className="font-semibold text-foreground">{admission.class_admitted}</span> · Gender: {admission.gender}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onOpenExeatDialog}>
            <DoorOpen className="mr-2 size-4" /> Issue / Log Exeat
          </Button>
          <Button size="sm" onClick={onOpenEditDialog}>
            <Edit className="mr-2 size-4" /> Edit Record
          </Button>
        </div>
      </header>

      {/* Summary Row */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label="Academic Average"
          value={academicSummary.averageScore !== null ? `${academicSummary.averageScore}%` : "—"}
          hint={`${academicSummary.totalAssessments} assessment(s)`}
        />
        <StatCard
          icon={CalendarCheck}
          label="Attendance Rate"
          value={attendanceSummary.overall.rate !== null ? `${attendanceSummary.overall.rate}%` : "—"}
          hint={`${attendanceSummary.overall.present + attendanceSummary.overall.late} of ${attendanceSummary.overall.total} days`}
        />
        <StatCard
          icon={Receipt}
          label="Fee Balance"
          value={money(financialSummary.balance)}
          hint={`Status: ${financialSummary.paymentStatus}`}
        />
        <StatCard
          icon={DoorOpen}
          label="Exeat Status"
          value={operationsSummary.currentExeatStatus === "out" ? "Out of School" : "In School"}
          hint={`Total logs: ${operationsSummary.totalExeats}`}
        />
      </div>

      {/* Lifecycle Rules Banner */}
      <div className="surface p-5 space-y-3 border-l-4 border-l-primary">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <UserCheck className="size-5 text-primary" /> People Configuration & Lifecycle Rules Evaluation
          </h3>
          <Badge variant={lifecycle.promotionEligible ? "default" : "destructive"}>
            {lifecycle.promotionEligible ? "Promotion Eligible" : "Promotion Pending"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Evaluated against active People Configuration rules: Min promotion average ({lifecycle.promotionMinAverage}%), Transfer Letter required ({lifecycle.requireTransferLetter ? "Yes" : "No"}), Fee clearance required ({lifecycle.requireFeeClearance ? "Yes" : "No"}).
        </p>
        {lifecycle.warnings.length > 0 && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 space-y-1">
            {lifecycle.warnings.map((w, idx) => (
              <p key={idx} className="text-xs font-medium text-warning flex items-center gap-1.5">
                <AlertTriangle className="size-3.5 shrink-0" /> {w}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Record Tabs */}
      <Tabs defaultValue="biodata" className="w-full space-y-4">
        <TabsList className="surface h-auto flex-wrap p-1 gap-1">
          <TabsTrigger value="biodata">Biodata & Guardians</TabsTrigger>
          <TabsTrigger value="academics">Academic Records</TabsTrigger>
          <TabsTrigger value="attendance">Attendance Register</TabsTrigger>
          <TabsTrigger value="financials">Financials & Fees</TabsTrigger>
          <TabsTrigger value="operations">Operations & Exeat</TabsTrigger>
        </TabsList>

        {/* Tab 1: Biodata & Guardians */}
        <TabsContent value="biodata" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="surface p-5 space-y-3">
              <h3 className="font-semibold border-b pb-2">Student Personal Info</h3>
              <dl className="grid gap-2 text-sm">
                <Line label="Full Name" value={admission.student_name} />
                <Line label="Admission Number" value={admission.admission_number} />
                <Line label="Gender" value={admission.gender} />
                <Line label="Date of Birth" value={admission.dob || "—"} />
                <Line label="Place of Birth" value={admission.place_of_birth || "—"} />
                <Line label="Hometown" value={admission.hometown || "—"} />
                <Line label="Residence" value={admission.residence || "—"} />
                <Line label="Digital Address" value={admission.digital_address || "—"} />
                <Line label="Disability Status" value={admission.disability_status || "No"} />
                <Line label="Disability Type" value={admission.disability_type || "—"} />
                <Line label="Assistance Needed" value={admission.assistance_needed || "—"} />
              </dl>
            </section>

            <section className="surface p-5 space-y-3">
              <h3 className="font-semibold border-b pb-2">Guardian & Emergency Contacts</h3>
              <dl className="grid gap-2 text-sm">
                <Line label="Primary Guardian" value={admission.parent_name} />
                <Line label="Relationship" value={admission.relationship || "—"} />
                <Line label="Phone Number" value={admission.parent_phone || "—"} />
                <Line label="Alt Phone" value={admission.alt_contact || "—"} />
                <Line label="Email Address" value={admission.parent_email} />
                <Line label="Emergency Contact" value={admission.emergency_name || "—"} />
                <Line label="Emergency Phone" value={admission.emergency_phone || "—"} />
                <Line label="Emergency Relationship" value={admission.emergency_relationship || "—"} />
                <Line label="Emergency Residence" value={admission.emergency_residence || "—"} />
              </dl>
              {teacher && (
                <div className="mt-4 rounded-lg bg-muted/40 p-3 text-xs space-y-1">
                  <p className="font-semibold">Class Teacher: {teacher.teacher_name}</p>
                  <p className="text-muted-foreground">Phone: {teacher.teacher_phone || "—"} · Email: {teacher.teacher_email || "—"}</p>
                </div>
              )}
            </section>
          </div>
        </TabsContent>

        {/* Tab 2: Academic Records */}
        <TabsContent value="academics" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard icon={TrendingUp} label="Average Score" value={academicSummary.averageScore !== null ? `${academicSummary.averageScore}%` : "—"} />
            <StatCard icon={FileText} label="Assignments Submitted" value={academicSummary.assignmentsSubmitted.toString()} />
            <StatCard icon={BookOpen} label="Lessons Completed" value={academicSummary.lessonsCompleted.toString()} />
            <StatCard icon={GraduationCap} label="Exams Taken" value={academicSummary.examsTaken.toString()} />
          </div>

          <section className="surface p-5 space-y-4">
            <h3 className="font-semibold">Continuous Assessments & Score Records</h3>
            <Table
              head={["Term", "Subject", "Assessment Type", "Score", "Remark", "Recorded Date"]}
              rows={detail.scores.map((s) => [
                s.term,
                s.subject,
                s.type,
                `${s.score}/${s.outOf}`,
                s.remark || "—",
                s.date ? new Date(s.date).toLocaleDateString() : "—",
              ])}
              empty="No assessment score records published yet."
            />
          </section>
        </TabsContent>

        {/* Tab 3: Attendance Register */}
        <TabsContent value="attendance" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-5">
            <DetailItem label="Attendance Rate" value={attendanceSummary.overall.rate !== null ? `${attendanceSummary.overall.rate}%` : "—"} />
            <DetailItem label="Present Days" value={String(attendanceSummary.overall.present)} />
            <DetailItem label="Late Days" value={String(attendanceSummary.overall.late)} />
            <DetailItem label="Absent Days" value={String(attendanceSummary.overall.absent)} />
            <DetailItem label="Excused Days" value={String(attendanceSummary.overall.excused)} />
          </div>

          <section className="surface p-5 space-y-4">
            <h3 className="font-semibold">Daily Attendance Register History</h3>
            <Table
              head={["Date", "Status", "Note / Comment"]}
              rows={detail.attendanceList.map((r) => [
                r.attendance_date,
                r.status,
                r.note || "—",
              ])}
              empty="No daily attendance recorded yet."
            />
          </section>
        </TabsContent>

        {/* Tab 4: Financials & Fees */}
        <TabsContent value="financials" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <DetailItem label="Total Fees Due" value={money(financialSummary.totalDue)} />
            <DetailItem label="Total Paid" value={money(financialSummary.totalPaid)} />
            <DetailItem label="Current Balance" value={money(financialSummary.balance)} />
            <DetailItem label="Centralized Status" value={financialSummary.paymentStatus} />
          </div>

          <section className="surface p-5 space-y-4">
            <h3 className="font-semibold">Fee Bills & Charges Breakdown</h3>
            <Table
              head={["Term", "Fee Category", "Amount Due", "Amount Paid", "Balance", "Due Date", "Status"]}
              rows={detail.fees.map((f: any) => {
                const due = Number(f.amount_due ?? 0);
                const paid = Number(f.amount_paid ?? 0);
                return [
                  f.term || "—",
                  f.fee_type || "Tuition Fee",
                  money(due),
                  money(paid),
                  money(due - paid),
                  f.due_date || "—",
                  f.status || "pending",
                ];
              })}
              empty="No fee bills assigned to this student."
            />
          </section>
        </TabsContent>

        {/* Tab 5: Operations & Library */}
        <TabsContent value="operations" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DetailItem label="Permission Status" value={operationsSummary.currentExeatStatus === "out" ? "Temporarily Out" : "In School"} />
            <DetailItem label="Total Exeat Logs" value={operationsSummary.totalExeats.toString()} />
            <DetailItem label="Active Library Loans" value={`${operationsSummary.activeLibraryLoans} (Overdue: ${operationsSummary.overdueLibraryLoans})`} />
            <DetailItem label="Library Policy Limit" value={`Max ${operationsSummary.libraryMaxLoans} loans (${operationsSummary.libraryLoanDays} days max)`} />
          </div>

          <section className="surface p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Exeat Permission Logs</h3>
              <Button size="sm" onClick={onOpenExeatDialog}>
                <Plus className="mr-2 size-4" /> New Exeat
              </Button>
            </div>
            <Table
              head={["Status", "Reason", "Destination", "Signed By", "Departed At", "Return Date"]}
              rows={detail.exeatLogs.map((e: any) => [
                e.status === "out" ? "Out of School" : "Returned",
                e.reason || "—",
                e.destination || "—",
                e.signed_by_name || "—",
                e.departed_at ? new Date(e.departed_at).toLocaleString() : "—",
                e.return_at ? new Date(e.return_at).toLocaleString() : "—",
              ])}
              empty="No exeat permissions logged for this student."
            />
          </section>

          <section className="surface p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Library className="size-4 text-primary" /> Library Book Loans & Borrowing History
              </h3>
              <Badge variant="outline">Total Borrowed: {operationsSummary.totalLibraryLoans}</Badge>
            </div>
            <Table
              head={["Book Title", "Author", "Issue Date", "Due Date", "Returned At", "Fine Amount", "Status"]}
              rows={(detail.libraryLoans || []).map((l: any) => [
                l.library_books?.title || "Book record",
                l.library_books?.author || "—",
                l.issued_at ? new Date(l.issued_at).toLocaleDateString() : "—",
                l.due_date || "—",
                l.returned_at ? new Date(l.returned_at).toLocaleDateString() : "Not returned",
                l.fine_amount ? money(Number(l.fine_amount)) : money(0),
                l.status || "issued",
              ])}
              empty="No library book loan history for this student."
            />
          </section>

          <section className="surface p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <BookOpen className="size-4 text-primary" /> Active Library Reservations
              </h3>
              <Badge variant="outline">Pending: {operationsSummary.activeLibraryReservations}</Badge>
            </div>
            <Table
              head={["Book Title", "Author", "Reserved Date", "Status"]}
              rows={(detail.libraryReservations || []).map((r: any) => [
                r.library_books?.title || "Book record",
                r.library_books?.author || "—",
                r.reserved_at ? new Date(r.reserved_at).toLocaleDateString() : "—",
                r.status || "pending",
              ])}
              empty="No active library reservations."
            />
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FeeStatusBadge({ status, balance, money }: { status: PaymentStatus; balance: number; money: (v: number) => string }) {
  if (status === "paid" || balance === 0) {
    return <Badge variant="default" className="bg-emerald-600">Paid ({money(0)})</Badge>;
  }
  if (status === "partially_paid") {
    return <Badge variant="secondary">Partially Paid ({money(balance)})</Badge>;
  }
  if (status === "overdue") {
    return <Badge variant="destructive">Overdue ({money(balance)})</Badge>;
  }
  return <Badge variant="outline">Pending ({money(balance)})</Badge>;
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="surface flex items-center gap-3 p-5">
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" aria-hidden />
      </span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-lg font-bold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/40 p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value || "—"}</dd>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/40 pb-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-right">{value || "—"}</dd>
    </div>
  );
}

function Table({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: string[][];
  empty: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left">
          <tr>
            {head.map((h) => (
              <th key={h} className="p-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b">
              {r.map((c, j) => (
                <td key={j} className="p-3">
                  {c || "—"}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="p-6 text-center text-muted-foreground" colSpan={head.length}>
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
