import { useState, useEffect } from "react";
import { useSession } from "@/hooks/useSession";
import { useSchoolName } from "@/hooks/useSchoolName";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BookOpen,
  Plus,
  Video,
  CheckCircle2,
  FileQuestion,
  PlayCircle,
  ExternalLink,
  Trash2,
  Edit,
  Sparkles,
  ArrowRight,
  GraduationCap,
  HelpCircle,
  Layers,
  Award,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  listLessons,
  getLessonDetails,
  saveLesson,
  deleteLesson,
  completeLesson,
  listAvailableQuizzes,
} from "@/lib/lessons.functions";
import { submitExamAnswers, startExamAttempt } from "@/lib/exams.functions";
import { parseVideoUrl } from "@/lib/lessons";
import type { QuestionInput } from "@/lib/exams.schemas";

export function LessonsManagement() {
  const { profile } = useSession();
  const school = useSchoolName();
  const isStaffOrAdmin =
    profile?.role === "super_admin" ||
    profile?.role === "school_manager" ||
    profile?.role === "staff";

  const [lessons, setLessons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [activeLesson, setActiveLesson] = useState<any | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);

  // Form states
  const [formId, setFormId] = useState<string | undefined>(undefined);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formClassName, setFormClassName] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formTerm, setFormTerm] = useState("Term 1");
  const [formIntroVideoUrl, setFormIntroVideoUrl] = useState("");
  const [formStatus, setFormStatus] = useState<"draft" | "published" | "archived">("draft");
  const [formQuizMode, setFormQuizMode] = useState<"none" | "existing" | "new">("none");
  const [formQuizId, setFormQuizId] = useState<string | null>(null);

  // Available quizzes for selection
  const [availableQuizzes, setAvailableQuizzes] = useState<any[]>([]);

  // Inline quiz building
  const [quizTitle, setQuizTitle] = useState("");
  const [quizPassMark, setQuizPassMark] = useState(50);
  const [quizQuestions, setQuizQuestions] = useState<QuestionInput[]>([
    {
      questionText: "",
      questionType: "multiple_choice",
      points: 10,
      options: ["Option A", "Option B", "Option C", "Option D"],
      correctAnswer: "Option A",
      explanation: "",
      orderIndex: 0,
    },
  ]);

  // Quiz taking state for students
  const [quizSubmissionId, setQuizSubmissionId] = useState<string | null>(null);
  const [studentAnswers, setStudentAnswers] = useState<Record<string, string>>({});
  const [submittingQuiz, setSubmittingQuiz] = useState(false);

  useEffect(() => {
    fetchLessons();
  }, []);

  async function fetchLessons() {
    setLoading(true);
    try {
      const data = await listLessons();
      setLessons(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load lessons");
    } finally {
      setLoading(false);
    }
  }

  // Extract unique classes & subjects for filter auto-population
  const availableClasses = [...new Set(lessons.map((l) => l.class_name))].filter(Boolean).sort();
  const availableSubjects = [...new Set(lessons.map((l) => l.subject))].filter(Boolean).sort();

  const filteredLessons = lessons.filter((l) => {
    const classMatch = selectedClass === "all" || l.class_name === selectedClass;
    const subjectMatch = selectedSubject === "all" || l.subject === selectedSubject;
    return classMatch && subjectMatch;
  });

  const completedCount = lessons.filter((l) => l.isCompleted).length;
  const totalCount = lessons.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  async function handleOpenCreate(lessonToEdit?: any) {
    if (lessonToEdit) {
      setFormId(lessonToEdit.id);
      setFormTitle(lessonToEdit.title);
      setFormDescription(lessonToEdit.description);
      setFormContent(lessonToEdit.content);
      setFormClassName(lessonToEdit.class_name);
      setFormSubject(lessonToEdit.subject);
      setFormTerm(lessonToEdit.term || "Term 1");
      setFormIntroVideoUrl(lessonToEdit.intro_video_url || "");
      setFormStatus(lessonToEdit.status);
      setFormQuizId(lessonToEdit.quiz_id || null);
      setFormQuizMode(lessonToEdit.quiz_id ? "existing" : "none");
    } else {
      setFormId(undefined);
      setFormTitle("");
      setFormDescription("");
      setFormContent("");
      setFormClassName(availableClasses[0] || "Primary 1");
      setFormSubject(availableSubjects[0] || "Mathematics");
      setFormTerm("Term 1");
      setFormIntroVideoUrl("");
      setFormStatus("draft");
      setFormQuizMode("none");
      setFormQuizId(null);
    }

    // Load subject quizzes if class and subject are set
    if (formClassName || availableClasses[0]) {
      try {
        const quizzes = await listAvailableQuizzes({
          className: lessonToEdit?.class_name || availableClasses[0] || "",
          subject: lessonToEdit?.subject || availableSubjects[0] || "",
        });
        setAvailableQuizzes(quizzes);
      } catch (e) {
        console.error(e);
      }
    }

    setIsCreateOpen(true);
  }

  async function handleClassOrSubjectChange(newClass: string, newSubject: string) {
    setFormClassName(newClass);
    setFormSubject(newSubject);
    try {
      const quizzes = await listAvailableQuizzes({
        className: newClass,
        subject: newSubject,
      });
      setAvailableQuizzes(quizzes);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleSaveLesson() {
    if (!formTitle.trim() || !formClassName.trim() || !formSubject.trim()) {
      toast.error("Title, class, and subject are required.");
      return;
    }

    try {
      let inlineQuizData = undefined;

      if (formQuizMode === "new") {
        if (!quizTitle.trim()) {
          toast.error("Inline quiz title is required.");
          return;
        }
        inlineQuizData = {
          title: quizTitle,
          passMark: quizPassMark,
          totalMarks: quizQuestions.reduce((acc, q) => acc + (q.points || 10), 0),
          durationMinutes: 15,
          shuffleQuestions: false,
          showResultsImmediately: true,
          questions: quizQuestions,
        };
      }

      await saveLesson({
        data: {
          id: formId,
          title: formTitle,
          description: formDescription,
          content: formContent,
          className: formClassName,
          subject: formSubject,
          term: formTerm,
          introVideoUrl: formIntroVideoUrl,
          quizId: formQuizMode === "existing" ? formQuizId : null,
          inlineQuiz: inlineQuizData,
          status: formStatus,
        },
      });

      toast.success(formId ? "Lesson updated successfully" : "Lesson created successfully");
      setIsCreateOpen(false);
      fetchLessons();
    } catch (err: any) {
      toast.error(err.message || "Failed to save lesson");
    }
  }

  async function handleDeleteLesson(id: string) {
    if (!confirm("Are you sure you want to delete this lesson?")) return;
    try {
      await deleteLesson({ data: { id } });
      toast.success("Lesson deleted successfully");
      if (activeLesson?.id === id) setActiveLesson(null);
      fetchLessons();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete lesson");
    }
  }

  async function handleSelectLesson(lesson: any) {
    try {
      const details = await getLessonDetails({ data: { id: lesson.id } });
      setActiveLesson(details);
    } catch (err: any) {
      toast.error(err.message || "Failed to load lesson details");
    }
  }

  async function handleCompleteLesson() {
    if (!activeLesson) return;
    try {
      await completeLesson({
        data: {
          lessonId: activeLesson.id,
          quizSubmissionId: quizSubmissionId ?? undefined,
        },
      });
      toast.success("Congratulations! Lesson marked as completed 🎉");
      setActiveLesson({ ...activeLesson, isCompleted: true });
      fetchLessons();
    } catch (err: any) {
      toast.error(err.message || "Could not complete lesson");
    }
  }

  async function handleStartQuiz() {
    if (!activeLesson?.quiz_id) return;
    try {
      const res = await startExamAttempt({ data: { id: activeLesson.quiz_id } });
      setQuizSubmissionId(res.submissionId);
      setIsQuizModalOpen(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to start quiz attempt");
    }
  }

  async function handleSubmitQuiz() {
    if (!activeLesson?.quiz_id || !quizSubmissionId) return;
    setSubmittingQuiz(true);
    try {
      const answersArray = Object.entries(studentAnswers).map(([questionId, answerText]) => ({
        questionId,
        answerText,
      }));

      const res = await submitExamAnswers({
        data: {
          examId: activeLesson.quiz_id,
          submissionId: quizSubmissionId,
          answers: answersArray,
        },
      });

      toast.success(`Quiz submitted! Score: ${res.score} points`);
      setIsQuizModalOpen(false);
      handleSelectLesson(activeLesson);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit quiz");
    } finally {
      setSubmittingQuiz(false);
    }
  }

  function addQuestion() {
    setQuizQuestions([
      ...quizQuestions,
      {
        questionText: "",
        questionType: "multiple_choice",
        points: 10,
        options: ["Option A", "Option B", "Option C", "Option D"],
        correctAnswer: "Option A",
        explanation: "",
        orderIndex: quizQuestions.length,
      },
    ]);
  }

  return (
    <div className="space-y-6">
      {/* Header & Stats Bar */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="surface">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Course Lessons</CardTitle>
            <BookOpen className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Available in syllabus catalog</p>
          </CardContent>
        </Card>

        <Card className="surface">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Learner Progress</CardTitle>
            <GraduationCap className="size-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{progressPercent}%</div>
            <Progress value={progressPercent} className="mt-2 h-2" />
          </CardContent>
        </Card>

        <Card className="surface flex flex-col justify-between">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Authoring & Scope</CardTitle>
            <CardDescription className="text-xs">
              {isStaffOrAdmin ? "Assigned Class Scope Active" : "Learner Course View"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {isStaffOrAdmin ? (
              <Button onClick={() => handleOpenCreate()} className="w-full gap-2">
                <Plus className="size-4" /> Create New Lesson
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Complete lessons and pass associated quizzes to build course mastery.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 surface p-4 rounded-xl">
        <div className="flex flex-wrap items-center gap-3">
          <Label className="text-xs font-semibold uppercase text-muted-foreground">Class:</Label>
          <Select value={selectedClass} onValueChange={setSelectedClass}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {availableClasses.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Label className="text-xs font-semibold uppercase text-muted-foreground">Subject:</Label>
          <Select value={selectedSubject} onValueChange={setSelectedSubject}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Subjects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subjects</SelectItem>
              {availableSubjects.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Badge variant="outline" className="text-xs gap-1">
          <Sparkles className="size-3 text-primary" />
          {filteredLessons.length} lessons shown
        </Badge>
      </div>

      {/* Main Catalog & Viewer Split Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Lessons List */}
        <div className="lg:col-span-5 space-y-3">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Layers className="size-5 text-primary" /> Lesson Modules
          </h2>

          {loading ? (
            <div className="surface p-8 text-center text-muted-foreground text-sm">
              Loading course lessons...
            </div>
          ) : filteredLessons.length === 0 ? (
            <Card className="surface p-8 text-center">
              <BookOpen className="mx-auto size-8 text-muted-foreground opacity-50 mb-2" />
              <p className="font-semibold text-sm">No lessons found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Select a different class or subject filter above.
              </p>
            </Card>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {filteredLessons.map((lesson) => {
                const isActive = activeLesson?.id === lesson.id;
                const videoMeta = lesson.videoMeta || parseVideoUrl(lesson.intro_video_url);

                return (
                  <Card
                    key={lesson.id}
                    onClick={() => handleSelectLesson(lesson)}
                    className={`cursor-pointer transition-all hover:border-primary/50 ${
                      isActive ? "border-primary bg-primary/5 shadow-sm" : "surface"
                    }`}
                  >
                    <CardContent className="p-4 flex items-start gap-3">
                      <div className="mt-1">
                        {lesson.isCompleted ? (
                          <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
                        ) : videoMeta.isValid ? (
                          <PlayCircle className="size-5 text-primary shrink-0" />
                        ) : (
                          <BookOpen className="size-5 text-muted-foreground shrink-0" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-semibold text-sm truncate">{lesson.title}</h3>
                          {lesson.status !== "published" && (
                            <Badge variant="secondary" className="text-[10px] capitalize">
                              {lesson.status}
                            </Badge>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {lesson.description || "No description provided"}
                        </p>

                        <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                          <Badge variant="outline" className="text-[10px]">
                            {lesson.class_name}
                          </Badge>
                          <span>•</span>
                          <span>{lesson.subject}</span>
                          {lesson.exams_quizzes && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1 text-primary">
                                <FileQuestion className="size-3" /> Quiz Attached
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Active Lesson Workspace / Viewer */}
        <div className="lg:col-span-7">
          {activeLesson ? (
            <Card className="surface space-y-4">
              <CardHeader className="pb-3 border-b border-border">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Badge variant="secondary">{activeLesson.class_name}</Badge>
                      <span>{activeLesson.subject}</span>
                      <span>•</span>
                      <span>{activeLesson.term}</span>
                    </div>
                    <CardTitle className="text-xl font-bold">{activeLesson.title}</CardTitle>
                  </div>

                  {isStaffOrAdmin && (
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleOpenCreate(activeLesson)}
                      >
                        <Edit className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => handleDeleteLesson(activeLesson.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-6 pt-4">
                {/* Embedded Video Player if Intro Video URL exists */}
                {activeLesson.videoMeta?.isValid && activeLesson.videoMeta?.embedUrl ? (
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                      <Video className="size-4 text-primary" /> Intro Video Tutorial
                    </Label>

                    {activeLesson.videoMeta.type === "youtube" ||
                    activeLesson.videoMeta.type === "vimeo" ? (
                      <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
                        <iframe
                          src={activeLesson.videoMeta.embedUrl}
                          className="h-full w-full"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          title={activeLesson.title}
                        />
                      </div>
                    ) : (
                      <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-black flex items-center justify-center">
                        <video
                          src={activeLesson.videoMeta.embedUrl}
                          controls
                          className="h-full w-full object-contain"
                        />
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Lesson Description & Content */}
                <div className="space-y-3">
                  {activeLesson.description && (
                    <p className="text-sm text-muted-foreground italic border-l-2 border-primary/40 pl-3">
                      {activeLesson.description}
                    </p>
                  )}

                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap rounded-xl bg-muted/30 p-4 border border-border">
                    {activeLesson.content || "No text content provided for this lesson."}
                  </div>
                </div>

                {/* Attached Lesson Completion Quiz Section */}
                {activeLesson.exams_quizzes ? (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h4 className="font-semibold text-sm flex items-center gap-1.5 text-primary">
                          <FileQuestion className="size-4" /> Lesson Completion Quiz
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {activeLesson.exams_quizzes.title} (Pass Mark:{" "}
                          {activeLesson.exams_quizzes.pass_mark} /{" "}
                          {activeLesson.exams_quizzes.total_marks} pts)
                        </p>
                      </div>

                      {activeLesson.userQuizSubmission ? (
                        <Badge
                          variant={
                            Number(activeLesson.userQuizSubmission.total_score) >=
                            Number(activeLesson.exams_quizzes.pass_mark)
                              ? "default"
                              : "destructive"
                          }
                        >
                          Score: {activeLesson.userQuizSubmission.total_score} pts
                        </Badge>
                      ) : (
                        <Badge variant="outline">Not Attempted</Badge>
                      )}
                    </div>

                    <Button onClick={handleStartQuiz} variant="outline" size="sm" className="gap-2">
                      <HelpCircle className="size-4" />
                      {activeLesson.userQuizSubmission ? "Retake Quiz" : "Take Lesson Quiz"}
                    </Button>
                  </div>
                ) : null}
              </CardContent>

              <CardFooter className="flex items-center justify-between border-t border-border pt-4">
                <div className="flex items-center gap-2">
                  {activeLesson.isCompleted ? (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1 text-xs">
                      <CheckCircle2 className="size-3.5" /> Completed
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      In Progress
                    </Badge>
                  )}
                </div>

                {!activeLesson.isCompleted && (
                  <Button onClick={handleCompleteLesson} className="gap-2">
                    Mark Lesson as Completed <ArrowRight className="size-4" />
                  </Button>
                )}
              </CardFooter>
            </Card>
          ) : (
            <Card className="surface p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
              <BookOpen className="size-12 text-muted-foreground opacity-30 mb-3" />
              <h3 className="font-bold text-base">Select a Lesson</h3>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                Choose a lesson module from the list on the left to start reading, view video tutorials, or complete quizzes.
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Modal: Create/Edit Lesson */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formId ? "Edit Lesson Module" : "Create New Lesson Module"}</DialogTitle>
            <DialogDescription>
              Configure course materials, auto-populated scope, video links, and attached completion quizzes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Class Name *</Label>
                <Input
                  value={formClassName}
                  onChange={(e) => handleClassOrSubjectChange(e.target.value, formSubject)}
                  placeholder="e.g. Primary 1"
                />
              </div>

              <div className="space-y-2">
                <Label>Subject *</Label>
                <Input
                  value={formSubject}
                  onChange={(e) => handleClassOrSubjectChange(formClassName, e.target.value)}
                  placeholder="e.g. Mathematics"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Lesson Title *</Label>
                <Input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Introduction to Fractions"
                />
              </div>

              <div className="space-y-2">
                <Label>Academic Term / Period</Label>
                <Input
                  value={formTerm}
                  onChange={(e) => setFormTerm(e.target.value)}
                  placeholder="e.g. Term 1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description / Overview</Label>
              <Input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Brief summary of learning objectives"
              />
            </div>

            <div className="space-y-2">
              <Label>Intro Video URL (YouTube, Vimeo, MP4)</Label>
              <Input
                value={formIntroVideoUrl}
                onChange={(e) => setFormIntroVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
              {formIntroVideoUrl && (
                <p className="text-[11px] text-muted-foreground">
                  Detected Type: {parseVideoUrl(formIntroVideoUrl).type}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Lesson Content & Material</Label>
              <Textarea
                rows={6}
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Write detailed lesson notes, bullet points, formula guides, and instructions..."
              />
            </div>

            <div className="space-y-3 pt-2 border-t border-border">
              <Label className="font-bold flex items-center gap-2">
                <FileQuestion className="size-4 text-primary" /> Completion Quiz Strategy
              </Label>

              <Tabs
                value={formQuizMode}
                onValueChange={(v: any) => setFormQuizMode(v)}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="none">No Quiz</TabsTrigger>
                  <TabsTrigger value="existing">Select Existing Quiz</TabsTrigger>
                  <TabsTrigger value="new">Create New Quiz</TabsTrigger>
                </TabsList>

                <TabsContent value="existing" className="space-y-2 pt-3">
                  <Label>Available Quizzes for {formClassName} - {formSubject}</Label>
                  <Select
                    value={formQuizId || ""}
                    onValueChange={(val) => setFormQuizId(val || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a quiz..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableQuizzes.length === 0 ? (
                        <SelectItem value="none" disabled>
                          No quizzes found for this class/subject
                        </SelectItem>
                      ) : (
                        availableQuizzes.map((q) => (
                          <SelectItem key={q.id} value={q.id}>
                            {q.title} ({q.total_marks} pts)
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </TabsContent>

                <TabsContent value="new" className="space-y-3 pt-3">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Inline Quiz Title</Label>
                      <Input
                        value={quizTitle}
                        onChange={(e) => setQuizTitle(e.target.value)}
                        placeholder="e.g. Quick Knowledge Check"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Pass Mark (%)</Label>
                      <Input
                        type="number"
                        value={quizPassMark}
                        onChange={(e) => setQuizPassMark(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">Questions ({quizQuestions.length})</Label>
                      <Button size="sm" variant="outline" onClick={addQuestion} className="gap-1">
                        <Plus className="size-3" /> Add Question
                      </Button>
                    </div>

                    {quizQuestions.map((q, idx) => (
                      <div key={idx} className="p-3 surface rounded-lg space-y-2 border border-border">
                        <Input
                          placeholder={`Question ${idx + 1} text...`}
                          value={q.questionText}
                          onChange={(e) => {
                            const updated = [...quizQuestions];
                            updated[idx].questionText = e.target.value;
                            setQuizQuestions(updated);
                          }}
                        />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input
                            placeholder="Correct Answer"
                            value={q.correctAnswer}
                            onChange={(e) => {
                              const updated = [...quizQuestions];
                              updated[idx].correctAnswer = e.target.value;
                              setQuizQuestions(updated);
                            }}
                          />
                          <Input
                            type="number"
                            placeholder="Points"
                            value={q.points}
                            onChange={(e) => {
                              const updated = [...quizQuestions];
                              updated[idx].points = Number(e.target.value);
                              setQuizQuestions(updated);
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <Label>Publication Status</Label>
              <Select value={formStatus} onValueChange={(v: any) => setFormStatus(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft (Visible only to teachers)</SelectItem>
                  <SelectItem value="published">Published (Visible to students)</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveLesson}>Save Lesson Module</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Student Taking Quiz */}
      <Dialog open={isQuizModalOpen} onOpenChange={setIsQuizModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileQuestion className="size-5 text-primary" />
              Lesson Quiz: {activeLesson?.exams_quizzes?.title}
            </DialogTitle>
            <DialogDescription>
              Answer all questions below and submit to complete your lesson requirements.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto py-2">
            {activeLesson?.exams_quizzes?.exam_questions?.map((q: any, idx: number) => (
              <div key={q.id} className="p-4 surface rounded-xl border border-border space-y-3">
                <p className="font-semibold text-sm">
                  {idx + 1}. {q.question_text}{" "}
                  <span className="text-xs font-normal text-muted-foreground">({q.points} pts)</span>
                </p>

                {Array.isArray(q.options) && q.options.length > 0 ? (
                  <div className="space-y-2">
                    {q.options.map((opt: string, optIdx: number) => (
                      <label
                        key={optIdx}
                        className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-muted/50 cursor-pointer text-xs"
                      >
                        <input
                          type="radio"
                          name={`question_${q.id}`}
                          value={opt}
                          checked={studentAnswers[q.id] === opt}
                          onChange={(e) =>
                            setStudentAnswers({ ...studentAnswers, [q.id]: e.target.value })
                          }
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <Input
                    placeholder="Type your answer here..."
                    value={studentAnswers[q.id] || ""}
                    onChange={(e) =>
                      setStudentAnswers({ ...studentAnswers, [q.id]: e.target.value })
                    }
                  />
                )}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsQuizModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitQuiz} disabled={submittingQuiz}>
              {submittingQuiz ? "Submitting..." : "Submit Answers"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
