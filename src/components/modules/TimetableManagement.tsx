import { useState, useEffect, useMemo } from "react";
import { useSession } from "@/hooks/useSession";
import { toast } from "sonner";
import {
  CalendarClock,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  Clock,
  User,
  MapPin,
  HelpCircle,
  BookOpen,
  Filter,
  CheckCircle2,
  AlertCircle,
  FileQuestion,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  DAYS_OF_WEEK,
  DAY_LABELS,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  type DayOfWeek,
  type TimetableEventType,
} from "@/lib/timetable.schemas";
import {
  formatTime12h,
  generateDailyGrid,
  type PeriodSlot,
} from "@/lib/timetable";
import {
  listTimetableSlots,
  getTimetableAutoPopulationData,
  saveTimetableSlot,
  deleteTimetableSlot,
} from "@/lib/timetable.functions";

interface TimetableSlotUI {
  id: string;
  term: string;
  className: string;
  subject: string;
  dayOfWeek: DayOfWeek;
  specificDate?: string | null;
  startTime: string;
  endTime: string;
  roomNumber: string;
  teacherId?: string | null;
  teacherName?: string;
  eventType: TimetableEventType;
  quizId?: string | null;
  quizTitle?: string;
  title: string;
  description: string;
  createdBy?: string;
}

export function TimetableManagement() {
  const { profile } = useSession();
  const isAdminOrStaff =
    profile?.role === "super_admin" ||
    profile?.role === "school_manager" ||
    profile?.role === "staff";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [slots, setSlots] = useState<TimetableSlotUI[]>([]);
  const [autoData, setAutoData] = useState<any>(null);

  // Filters
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [selectedTeacher, setSelectedTeacher] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"matrix" | "daily">("matrix");
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>("monday");

  // Modal dialog state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TimetableSlotUI | null>(null);

  // Form state
  const [formClassName, setFormClassName] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formDayOfWeek, setFormDayOfWeek] = useState<DayOfWeek>("monday");
  const [formStartTime, setFormStartTime] = useState("08:00");
  const [formEndTime, setFormEndTime] = useState("08:40");
  const [formRoomNumber, setFormRoomNumber] = useState("");
  const [formTeacherId, setFormTeacherId] = useState("");
  const [formEventType, setFormEventType] = useState<TimetableEventType>("class");
  const [formQuizMode, setFormQuizMode] = useState<"existing" | "new">("existing");
  const [formQuizId, setFormQuizId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");

  // Inline Quiz state
  const [inlineQuizTitle, setInlineQuizTitle] = useState("");
  const [inlineQuizDesc, setInlineQuizDesc] = useState("");
  const [inlineQuizDuration, setInlineQuizDuration] = useState(30);
  const [inlineQuizPassMark, setInlineQuizPassMark] = useState(50);
  const [inlineQuizQuestions, setInlineQuizQuestions] = useState<
    { questionText: string; questionType: string; points: number; options: string[]; correctAnswer: string; explanation: string }[]
  >([
    {
      questionText: "",
      questionType: "multiple_choice",
      points: 1,
      options: ["Option A", "Option B", "Option C", "Option D"],
      correctAnswer: "Option A",
      explanation: "",
    },
  ]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [dataRes, autoRes] = await Promise.all([
        listTimetableSlots({}),
        getTimetableAutoPopulationData(),
      ]);
      setSlots(dataRes as any);
      setAutoData(autoRes);

      // Default class filter to first available class if present
      if (autoRes.classes && autoRes.classes.length > 0 && selectedClass === "all") {
        setSelectedClass(autoRes.classes[0].name);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load timetable data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const availableSubjectsForForm = useMemo(() => {
    if (!autoData?.subjectCatalog) return [];
    if (!formClassName) {
      return autoData.subjectCatalog.map((s: any) => s.name);
    }
    const cls = autoData.classes.find((c: any) => c.name === formClassName);
    if (!cls) return autoData.subjectCatalog.map((s: any) => s.name);
    return autoData.subjectCatalog
      .filter((s: any) => s.levelCode === cls.levelCode)
      .map((s: any) => s.name);
  }, [autoData, formClassName]);

  const dailyGrid = useMemo(() => {
    if (!autoData?.rules) {
      return generateDailyGrid({} as any);
    }
    return generateDailyGrid(autoData.rules);
  }, [autoData]);

  const filteredSlots = useMemo(() => {
    return slots.filter((s) => {
      if (selectedClass !== "all" && s.className !== selectedClass) return false;
      if (selectedTeacher !== "all" && s.teacherId !== selectedTeacher) return false;
      return true;
    });
  }, [slots, selectedClass, selectedTeacher]);

  const openCreateModal = (day?: DayOfWeek, startTime?: string, endTime?: string) => {
    setEditingSlot(null);
    setFormClassName(selectedClass !== "all" ? selectedClass : autoData?.classes?.[0]?.name || "");
    setFormSubject("");
    setFormDayOfWeek(day || "monday");
    setFormStartTime(startTime || "08:00");
    setFormEndTime(endTime || "08:40");
    setFormRoomNumber("");
    setFormTeacherId(profile?.id || "");
    setFormEventType("class");
    setFormQuizMode("existing");
    setFormQuizId("");
    setFormTitle("");
    setFormDescription("");
    setInlineQuizTitle("");
    setInlineQuizDesc("");
    setInlineQuizDuration(30);
    setInlineQuizPassMark(50);
    setInlineQuizQuestions([
      {
        questionText: "",
        questionType: "multiple_choice",
        points: 1,
        options: ["Option A", "Option B", "Option C", "Option D"],
        correctAnswer: "Option A",
        explanation: "",
      },
    ]);
    setIsModalOpen(true);
  };

  const openEditModal = (slot: TimetableSlotUI) => {
    setEditingSlot(slot);
    setFormClassName(slot.className);
    setFormSubject(slot.subject);
    setFormDayOfWeek(slot.dayOfWeek);
    setFormStartTime(slot.startTime);
    setFormEndTime(slot.endTime);
    setFormRoomNumber(slot.roomNumber || "");
    setFormTeacherId(slot.teacherId || "");
    setFormEventType(slot.eventType);
    setFormQuizMode("existing");
    setFormQuizId(slot.quizId || "");
    setFormTitle(slot.title || "");
    setFormDescription(slot.description || "");
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (!formClassName) {
        toast.error("Please select a class.");
        return;
      }
      if (!formSubject) {
        toast.error("Please select or enter a subject.");
        return;
      }

      setSaving(true);

      let inlineQuizPayload = undefined;
      if (formEventType === "quiz" && formQuizMode === "new") {
        if (!inlineQuizTitle.trim()) {
          toast.error("Please enter a title for the new quiz.");
          return;
        }
        if (inlineQuizQuestions.some((q) => !q.questionText.trim())) {
          toast.error("All quiz questions must have question text.");
          return;
        }
        inlineQuizPayload = {
          title: inlineQuizTitle.trim(),
          description: inlineQuizDesc,
          durationMinutes: inlineQuizDuration,
          totalMarks: inlineQuizQuestions.reduce((acc, q) => acc + q.points, 0),
          passMark: inlineQuizPassMark,
          shuffleQuestions: false,
          showResultsImmediately: true,
          questions: inlineQuizQuestions,
        };
      }

      const activeTerm = autoData?.calendar?.periods?.find(
        (p: any) => p.status === "active" || p.status === "upcoming",
      )?.name || "";

      await saveTimetableSlot({
        id: editingSlot?.id,
        term: activeTerm,
        className: formClassName,
        subject: formSubject,
        dayOfWeek: formDayOfWeek,
        startTime: formStartTime,
        endTime: formEndTime,
        roomNumber: formRoomNumber,
        teacherId: formTeacherId || null,
        eventType: formEventType,
        quizId: formEventType === "quiz" && formQuizMode === "existing" ? formQuizId : null,
        inlineQuiz: inlineQuizPayload,
        title: formTitle,
        description: formDescription,
      });

      toast.success(editingSlot ? "Timetable slot updated!" : "Timetable slot created!");
      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save timetable slot.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this timetable slot?")) return;
    try {
      await deleteTimetableSlot({ id });
      toast.success("Timetable slot removed.");
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete slot.");
    }
  };

  const addQuestion = () => {
    setInlineQuizQuestions([
      ...inlineQuizQuestions,
      {
        questionText: "",
        questionType: "multiple_choice",
        points: 1,
        options: ["Option A", "Option B", "Option C", "Option D"],
        correctAnswer: "Option A",
        explanation: "",
      },
    ]);
  };

  const removeQuestion = (idx: number) => {
    if (inlineQuizQuestions.length <= 1) return;
    setInlineQuizQuestions(inlineQuizQuestions.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-6">
      {/* Header Controls & Filters */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-xs md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium text-muted-foreground">Class:</span>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {(autoData?.classes || []).map((c: any) => (
                  <SelectItem key={c.id} value={c.name}>
                    {c.name} ({c.levelName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Teacher:</span>
            <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Teachers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teachers</SelectItem>
                {(autoData?.teachers || []).map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isAdminOrStaff && (
          <Button onClick={() => openCreateModal()} className="gap-2">
            <Plus className="size-4" aria-hidden /> Add Schedule Slot
          </Button>
        )}
      </div>

      {/* Main Timetable Tabs View */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <div className="flex items-center justify-between border-b pb-2">
          <TabsList>
            <TabsTrigger value="matrix" className="gap-2">
              <Calendar className="size-4" /> Weekly Grid
            </TabsTrigger>
            <TabsTrigger value="daily" className="gap-2">
              <Clock className="size-4" /> Day List View
            </TabsTrigger>
          </TabsList>
          <span className="text-xs text-muted-foreground">
            {filteredSlots.length} slot{filteredSlots.length === 1 ? "" : "s"} scheduled
          </span>
        </div>

        {/* Matrix View */}
        <TabsContent value="matrix" className="mt-4">
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="w-32 p-3 font-semibold text-muted-foreground">Time / Period</th>
                  {DAYS_OF_WEEK.slice(0, 5).map((day) => (
                    <th key={day} className="p-3 font-semibold capitalize text-foreground">
                      {DAY_LABELS[day]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {dailyGrid.map((period) => {
                  if (period.isBreak) {
                    return (
                      <tr key={`break-${period.startTime}`} className="bg-muted/30">
                        <td className="p-3 text-xs font-semibold text-muted-foreground">
                          {formatTime12h(period.startTime)} - {formatTime12h(period.endTime)}
                        </td>
                        <td colSpan={5} className="p-3 text-center text-xs font-medium italic text-muted-foreground">
                          ☕ {period.label} ({formatTime12h(period.startTime)} - {formatTime12h(period.endTime)})
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={`period-${period.periodNumber}`}>
                      <td className="p-3 text-xs font-semibold text-muted-foreground">
                        <div>{period.label}</div>
                        <div className="text-[11px] font-normal text-muted-foreground">
                          {formatTime12h(period.startTime)} - {formatTime12h(period.endTime)}
                        </div>
                      </td>
                      {DAYS_OF_WEEK.slice(0, 5).map((day) => {
                        const cellSlots = filteredSlots.filter(
                          (s) =>
                            s.dayOfWeek === day &&
                            s.startTime >= period.startTime &&
                            s.startTime < period.endTime,
                        );

                        return (
                          <td key={`${day}-${period.periodNumber}`} className="p-2 vertical-top hover:bg-muted/20 min-w-[150px]">
                            {cellSlots.length > 0 ? (
                              cellSlots.map((slot) => (
                                <div
                                  key={slot.id}
                                  className="group relative mb-2.5 rounded-lg border border-border bg-background p-2.5 shadow-2xs hover:border-primary/50 transition-colors"
                                >
                                  <div className="flex items-start justify-between gap-1">
                                    <span className="font-semibold text-primary">{slot.subject}</span>
                                    {isAdminOrStaff && (
                                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                        <button
                                          onClick={() => openEditModal(slot)}
                                          className="text-muted-foreground hover:text-foreground"
                                        >
                                          <Edit2 className="size-3" />
                                        </button>
                                        <button
                                          onClick={() => handleDelete(slot.id)}
                                          className="text-destructive/80 hover:text-destructive"
                                        >
                                          <Trash2 className="size-3" />
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                    <Badge variant="outline" className="px-1 py-0 text-[10px]">
                                      {slot.className}
                                    </Badge>
                                    <Badge
                                      variant={
                                        slot.eventType === "exam"
                                          ? "destructive"
                                          : slot.eventType === "quiz"
                                          ? "secondary"
                                          : "outline"
                                      }
                                      className="px-1 py-0 text-[10px]"
                                    >
                                      {EVENT_TYPE_LABELS[slot.eventType]}
                                    </Badge>
                                  </div>

                                  {slot.teacherName && (
                                    <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                                      <User className="size-3" /> {slot.teacherName}
                                    </div>
                                  )}

                                  {slot.roomNumber && (
                                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                                      <MapPin className="size-3" /> Room {slot.roomNumber}
                                    </div>
                                  )}

                                  {slot.quizTitle && (
                                    <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                      <FileQuestion className="size-3" /> {slot.quizTitle}
                                    </div>
                                  )}
                                </div>
                              ))
                            ) : (
                              isAdminOrStaff && (
                                <button
                                  onClick={() => openCreateModal(day, period.startTime, period.endTime)}
                                  className="w-full h-full min-h-[60px] rounded-lg border border-dashed border-border/60 hover:border-primary/40 hover:bg-primary/5 flex items-center justify-center text-xs text-muted-foreground transition-colors group"
                                >
                                  <Plus className="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                              )
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Daily View */}
        <TabsContent value="daily" className="mt-4 space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {DAYS_OF_WEEK.map((day) => (
              <Button
                key={day}
                variant={selectedDay === day ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedDay(day)}
                className="capitalize"
              >
                {DAY_LABELS[day]}
              </Button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSlots.filter((s) => s.dayOfWeek === selectedDay).length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                No slots scheduled for {DAY_LABELS[selectedDay]}.
              </div>
            ) : (
              filteredSlots
                .filter((s) => s.dayOfWeek === selectedDay)
                .map((slot) => (
                  <div key={slot.id} className="rounded-xl border border-border bg-card p-4 shadow-2xs space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <Badge
                          variant={
                            slot.eventType === "exam"
                              ? "destructive"
                              : slot.eventType === "quiz"
                              ? "secondary"
                              : "outline"
                          }
                          className="mb-1"
                        >
                          {EVENT_TYPE_LABELS[slot.eventType]}
                        </Badge>
                        <h3 className="text-lg font-bold">{slot.subject}</h3>
                        <p className="text-xs text-muted-foreground">{slot.className}</p>
                      </div>

                      {isAdminOrStaff && (
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEditModal(slot)}>
                            <Edit2 className="size-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(slot.id)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Clock className="size-3.5" /> {formatTime12h(slot.startTime)} - {formatTime12h(slot.endTime)}
                      </div>
                      {slot.teacherName && (
                        <div className="flex items-center gap-2">
                          <User className="size-3.5" /> {slot.teacherName}
                        </div>
                      )}
                      {slot.roomNumber && (
                        <div className="flex items-center gap-2">
                          <MapPin className="size-3.5" /> Room {slot.roomNumber}
                        </div>
                      )}
                      {slot.quizTitle && (
                        <div className="flex items-center gap-2 font-medium text-amber-600 dark:text-amber-400">
                          <FileQuestion className="size-3.5" /> {slot.quizTitle}
                        </div>
                      )}
                    </div>

                    {slot.description && (
                      <p className="text-xs border-t pt-2 text-muted-foreground">{slot.description}</p>
                    )}
                  </div>
                ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Save/Edit Modal Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSlot ? "Edit Schedule Slot" : "Add Schedule Slot"}</DialogTitle>
            <DialogDescription>
              Configure period timetable slot with auto-populated teachers, subjects, and optional inline quiz creation.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Class</Label>
                <Select value={formClassName} onValueChange={setFormClassName}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select Class" />
                  </SelectTrigger>
                  <SelectContent>
                    {(autoData?.classes || []).map((c: any) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Subject</Label>
                <Select value={formSubject} onValueChange={setFormSubject}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select Subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSubjectsForForm.map((subj: string) => (
                      <SelectItem key={subj} value={subj}>
                        {subj}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Day of Week</Label>
                <Select value={formDayOfWeek} onValueChange={(v) => setFormDayOfWeek(v as DayOfWeek)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map((d) => (
                      <SelectItem key={d} value={d} className="capitalize">
                        {DAY_LABELS[d]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={formStartTime}
                  onChange={(e) => setFormStartTime(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={formEndTime}
                  onChange={(e) => setFormEndTime(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Assigned Teacher</Label>
                <Select value={formTeacherId} onValueChange={setFormTeacherId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select Teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">None / Unassigned</SelectItem>
                    {(autoData?.teachers || []).map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Room / Location</Label>
                <Input
                  placeholder="e.g. Lab 1, Room 204"
                  value={formRoomNumber}
                  onChange={(e) => setFormRoomNumber(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Event Type</Label>
                <Select value={formEventType} onValueChange={(v) => setFormEventType(v as TimetableEventType)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {EVENT_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formEventType === "upcoming_event" && (
                <div>
                  <Label>Event Title</Label>
                  <Input
                    placeholder="e.g. Science Fair Presentation"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="mt-1"
                  />
                </div>
              )}
            </div>

            {/* Quiz Attachment Section */}
            {formEventType === "quiz" && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <FileQuestion className="size-4" /> Quiz Configuration
                  </h4>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      className={`px-2 py-1 rounded ${formQuizMode === "existing" ? "bg-amber-600 text-white" : "bg-muted text-muted-foreground"}`}
                      onClick={() => setFormQuizMode("existing")}
                    >
                      Select Existing Quiz
                    </button>
                    <button
                      type="button"
                      className={`px-2 py-1 rounded ${formQuizMode === "new" ? "bg-amber-600 text-white" : "bg-muted text-muted-foreground"}`}
                      onClick={() => setFormQuizMode("new")}
                    >
                      + Create New Quiz
                    </button>
                  </div>
                </div>

                {formQuizMode === "existing" ? (
                  <div>
                    <Label className="text-xs">Select Quiz from Subject</Label>
                    <Select value={formQuizId} onValueChange={setFormQuizId}>
                      <SelectTrigger className="mt-1 bg-background">
                        <SelectValue placeholder="Choose an existing quiz..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(autoData?.quizzes || []).map((q: any) => (
                          <SelectItem key={q.id} value={q.id}>
                            {q.title} ({q.class_name} - {q.subject})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Quiz Title</Label>
                        <Input
                          placeholder="e.g. Chapter 3 Quick Assessment"
                          value={inlineQuizTitle}
                          onChange={(e) => setInlineQuizTitle(e.target.value)}
                          className="mt-1 bg-background"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Pass Mark (%)</Label>
                        <Input
                          type="number"
                          value={inlineQuizPassMark}
                          onChange={(e) => setInlineQuizPassMark(Number(e.target.value))}
                          className="mt-1 bg-background"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">Questions ({inlineQuizQuestions.length})</span>
                        <Button type="button" size="xs" variant="outline" onClick={addQuestion}>
                          + Add Question
                        </Button>
                      </div>

                      {inlineQuizQuestions.map((q, idx) => (
                        <div key={idx} className="rounded-lg border bg-background p-3 text-xs space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-muted-foreground">Q{idx + 1}</span>
                            {inlineQuizQuestions.length > 1 && (
                              <button type="button" onClick={() => removeQuestion(idx)} className="text-destructive">
                                <Trash2 className="size-3" />
                              </button>
                            )}
                          </div>
                          <Input
                            placeholder="Enter question text..."
                            value={q.questionText}
                            onChange={(e) => {
                              const updated = [...inlineQuizQuestions];
                              updated[idx].questionText = e.target.value;
                              setInlineQuizQuestions(updated);
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <Label>Description / Notes</Label>
              <Textarea
                placeholder="Optional notes or instructions for students..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="mt-1"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Timetable Slot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
