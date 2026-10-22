import React, { useState, useEffect, useRef } from "react";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  FileQuestion,
  Plus,
  Clock,
  CheckCircle,
  AlertCircle,
  BarChart3,
  Edit,
  Trash2,
  Play,
  Send,
  RefreshCw,
  Award,
  Layers,
  ArrowLeft,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  listExams,
  getExamDetails,
  saveExam,
  deleteExam,
  startExamAttempt,
  submitExamAnswers,
  gradeSubmission,
  syncExamToAssessment,
  listSubmissions,
} from "@/lib/exams.functions";
import type { QuestionInput } from "@/lib/exams.schemas";

export function ExamsQuizzes() {
  const { profile } = useSession();
  const [activeTab, setActiveTab] = useState<"directory" | "builder" | "session" | "grading" | "analytics">("directory");
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [activeExam, setActiveExam] = useState<any | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const isStaffOrAdmin = profile?.role === "super_admin" || profile?.role === "school_manager" || profile?.role === "staff";

  const fetchExams = async () => {
    setLoading(true);
    try {
      const data = await listExams();
      setExams(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load exams");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
  }, []);

  const filteredExams = exams.filter((e) => {
    const matchesSearch = e.title.toLowerCase().includes(searchTerm.toLowerCase()) || e.subject.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "all" || e.exam_type === typeFilter;
    const matchesStatus = statusFilter === "all" || e.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const handleEditExam = async (examId: string) => {
    setSelectedExamId(examId);
    try {
      const details = await getExamDetails({ data: { id: examId } });
      setActiveExam(details);
      setActiveTab("builder");
    } catch (err: any) {
      toast.error(err.message || "Failed to load exam details");
    }
  };

  const handleStartExam = async (examId: string) => {
    try {
      const res = await startExamAttempt({ data: { id: examId } });
      setSelectedExamId(examId);
      const details = await getExamDetails({ data: { id: examId } });
      setActiveExam({ ...details, submissionId: res.submissionId });
      setActiveTab("session");
      toast.success("Exam attempt started");
    } catch (err: any) {
      toast.error(err.message || "Cannot start exam");
    }
  };

  const handleOpenGrading = async (examId: string) => {
    setSelectedExamId(examId);
    try {
      const details = await getExamDetails({ data: { id: examId } });
      setActiveExam(details);
      setActiveTab("grading");
    } catch (err: any) {
      toast.error(err.message || "Failed to load grading details");
    }
  };

  const handleDelete = async (examId: string) => {
    if (!confirm("Are you sure you want to delete this exam?")) return;
    try {
      await deleteExam({ data: { id: examId } });
      toast.success("Exam deleted");
      fetchExams();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete exam");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between surface p-4 rounded-xl border border-border">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FileQuestion className="size-6 text-primary" />
            Exams & Quizzes Management
          </h2>
          <p className="text-sm text-muted-foreground">
            Create, manage, deliver online examinations and track assessment results.
          </p>
        </div>
        {isStaffOrAdmin && (
          <Button
            onClick={() => {
              setSelectedExamId(null);
              setActiveExam(null);
              setActiveTab("builder");
            }}
            className="flex items-center gap-2"
          >
            <Plus className="size-4" /> Create Exam / Quiz
          </Button>
        )}
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
        <TabsList className="grid w-full grid-cols-2 md:w-auto md:inline-flex md:grid-cols-none">
          <TabsTrigger value="directory" onClick={fetchExams}>
            Directory
          </TabsTrigger>
          {isStaffOrAdmin && <TabsTrigger value="builder">Exam Builder</TabsTrigger>}
          <TabsTrigger value="session" disabled={!activeExam || activeTab !== "session"}>
            Live Attempt
          </TabsTrigger>
          {isStaffOrAdmin && (
            <TabsTrigger value="grading" disabled={!selectedExamId}>
              Grading Hub
            </TabsTrigger>
          )}
          {isStaffOrAdmin && <TabsTrigger value="analytics">Analytics</TabsTrigger>}
        </TabsList>

        {/* Directory Tab */}
        <TabsContent value="directory" className="space-y-4 mt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <Input
              placeholder="Search by title or subject..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="sm:max-w-xs"
            />
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="sm:w-[150px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="exam">Exams</SelectItem>
                <SelectItem value="quiz">Quizzes</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="sm:w-[150px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={fetchExams} title="Refresh">
              <RefreshCw className="size-4" />
            </Button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-muted-foreground surface rounded-xl">Loading exams & quizzes...</div>
          ) : filteredExams.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground surface rounded-xl">
              No exams or quizzes found matching your criteria.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredExams.map((exam) => (
                <Card key={exam.id} className="relative flex flex-col justify-between">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <Badge variant={exam.exam_type === "quiz" ? "secondary" : "default"}>
                        {exam.exam_type.toUpperCase()}
                      </Badge>
                      <Badge
                        variant={
                          exam.status === "published"
                            ? "default"
                            : exam.status === "closed"
                            ? "destructive"
                            : "outline"
                        }
                      >
                        {exam.status}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg line-clamp-1">{exam.title}</CardTitle>
                    <CardDescription className="text-xs">
                      {exam.class_name} · {exam.subject} ({exam.term})
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-3 text-xs text-muted-foreground">
                    <p className="line-clamp-2">{exam.description || "No description provided."}</p>
                    <div className="flex items-center justify-between border-t pt-2 border-border">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3.5" /> {exam.duration_minutes} mins
                      </span>
                      <span className="flex items-center gap-1">
                        <Award className="size-3.5" /> Pass: {exam.pass_mark}/{exam.total_marks}
                      </span>
                    </div>
                  </CardContent>

                  <div className="p-4 pt-0 flex items-center justify-between border-t mt-3 pt-3 border-border">
                    {isStaffOrAdmin ? (
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => handleEditExam(exam.id)}>
                          <Edit className="size-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleOpenGrading(exam.id)}>
                          <Layers className="size-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(exam.id)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ) : (
                      exam.status === "published" && (
                        <Button size="sm" className="w-full gap-1" onClick={() => handleStartExam(exam.id)}>
                          <Play className="size-3.5" /> Take {exam.exam_type}
                        </Button>
                      )
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Builder Tab */}
        {isStaffOrAdmin && (
          <TabsContent value="builder" className="mt-6">
            <ExamBuilderForm
              initialData={activeExam}
              onSaved={() => {
                fetchExams();
                setActiveTab("directory");
              }}
            />
          </TabsContent>
        )}

        {/* Live Session Tab */}
        <TabsContent value="session" className="mt-6">
          {activeExam && (
            <LiveExamSession
              exam={activeExam}
              onSubmitted={() => {
                fetchExams();
                setActiveTab("directory");
              }}
            />
          )}
        </TabsContent>

        {/* Grading Hub Tab */}
        {isStaffOrAdmin && (
          <TabsContent value="grading" className="mt-6">
            {selectedExamId && (
              <GradingHub
                examId={selectedExamId}
                onDone={() => {
                  fetchExams();
                  setActiveTab("directory");
                }}
              />
            )}
          </TabsContent>
        )}

        {/* Analytics Tab */}
        {isStaffOrAdmin && (
          <TabsContent value="analytics" className="mt-6">
            <ExamAnalyticsView exams={exams} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// Sub-component: Exam Builder Form
function ExamBuilderForm({ initialData, onSaved }: { initialData?: any; onSaved: () => void }) {
  const [title, setTitle] = useState(initialData?.title || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [examType, setExamType] = useState<"exam" | "quiz">(initialData?.exam_type || "exam");
  const [className, setClassName] = useState(initialData?.class_name || "");
  const [subject, setSubject] = useState(initialData?.subject || "");
  const [term, setTerm] = useState(initialData?.term || "First Term");
  const [durationMinutes, setDurationMinutes] = useState(initialData?.duration_minutes || 60);
  const [totalMarks, setTotalMarks] = useState(initialData?.total_marks || 100);
  const [passMark, setPassMark] = useState(initialData?.pass_mark || 50);
  const [status, setStatus] = useState<"draft" | "published" | "closed" | "archived">(initialData?.status || "draft");
  const [shuffleQuestions, setShuffleQuestions] = useState(initialData?.shuffle_questions || false);
  const [questions, setQuestions] = useState<QuestionInput[]>(initialData?.questions || []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title || "");
      setDescription(initialData.description || "");
      setExamType(initialData.exam_type || "exam");
      setClassName(initialData.class_name || "");
      setSubject(initialData.subject || "");
      setTerm(initialData.term || "First Term");
      setDurationMinutes(initialData.duration_minutes || 60);
      setTotalMarks(initialData.total_marks || 100);
      setPassMark(initialData.pass_mark || 50);
      setStatus(initialData.status || "draft");
      setShuffleQuestions(initialData.shuffle_questions || false);
      setQuestions(initialData.questions || []);
    }
  }, [initialData]);

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        questionText: "",
        questionType: "multiple_choice",
        points: 1,
        options: ["Option 1", "Option 2"],
        correctAnswer: "Option 1",
        explanation: "",
        orderIndex: questions.length,
      },
    ]);
  };

  const updateQuestion = (index: number, updated: Partial<QuestionInput>) => {
    const list = [...questions];
    list[index] = { ...list[index], ...updated };
    setQuestions(list);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !className || !subject || !term) {
      toast.error("Please fill in all required exam metadata");
      return;
    }
    setSaving(true);
    try {
      await saveExam({
        data: {
          id: initialData?.id,
          title,
          description,
          examType,
          className,
          subject,
          term,
          durationMinutes: Number(durationMinutes),
          totalMarks: Number(totalMarks),
          passMark: Number(passMark),
          shuffleQuestions,
          status,
          questions,
        },
      });
      toast.success("Exam saved successfully");
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to save exam");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 surface p-6 rounded-xl border border-border">
      <h3 className="text-lg font-bold border-b pb-3 border-border">
        {initialData?.id ? "Edit Exam / Quiz" : "Create New Exam / Quiz"}
      </h3>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label>Title *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <Label>Type *</Label>
          <Select value={examType} onValueChange={(v: any) => setExamType(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="exam">Examination</SelectItem>
              <SelectItem value="quiz">Quiz</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Status *</Label>
          <Select value={status} onValueChange={(v: any) => setStatus(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Class *</Label>
          <Input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="e.g. Primary 1" required />
        </div>
        <div>
          <Label>Subject *</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Mathematics" required />
        </div>
        <div>
          <Label>Term / Period *</Label>
          <Input value={term} onChange={(e) => setTerm(e.target.value)} required />
        </div>
        <div>
          <Label>Duration (Minutes) *</Label>
          <Input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} required min={1} />
        </div>
        <div>
          <Label>Total Marks *</Label>
          <Input type="number" value={totalMarks} onChange={(e) => setTotalMarks(Number(e.target.value))} required min={0} />
        </div>
        <div>
          <Label>Pass Mark *</Label>
          <Input type="number" value={passMark} onChange={(e) => setPassMark(Number(e.target.value))} required min={0} />
        </div>
      </div>

      <div>
        <Label>Description</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>

      <div className="flex items-center gap-3 border-t pt-4 border-border">
        <Switch checked={shuffleQuestions} onCheckedChange={setShuffleQuestions} id="shuffle" />
        <Label htmlFor="shuffle" className="cursor-pointer">
          Shuffle Question Order for Students
        </Label>
      </div>

      {/* Question Builder */}
      <div className="space-y-4 border-t pt-6 border-border">
        <div className="flex items-center justify-between">
          <h4 className="text-md font-semibold">Questions ({questions.length})</h4>
          <Button type="button" variant="outline" size="sm" onClick={addQuestion} className="gap-1">
            <Plus className="size-4" /> Add Question
          </Button>
        </div>

        {questions.map((q, idx) => (
          <Card key={idx} className="p-4 space-y-3 bg-muted/30">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-sm">Question #{idx + 1}</span>
              <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => removeQuestion(idx)}>
                <Trash2 className="size-4" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Question Text</Label>
                <Input value={q.questionText} onChange={(e) => updateQuestion(idx, { questionText: e.target.value })} required />
              </div>
              <div>
                <Label>Question Type</Label>
                <Select value={q.questionType} onValueChange={(v: any) => updateQuestion(idx, { questionType: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                    <SelectItem value="true_false">True / False</SelectItem>
                    <SelectItem value="short_answer">Short Answer</SelectItem>
                    <SelectItem value="essay">Essay</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Points</Label>
                <Input type="number" value={q.points} onChange={(e) => updateQuestion(idx, { points: Number(e.target.value) })} min={0} />
              </div>

              {(q.questionType === "multiple_choice" || q.questionType === "true_false") && (
                <div className="sm:col-span-2 space-y-2">
                  <Label>Options (Comma-separated)</Label>
                  <Input
                    value={q.options.join(", ")}
                    onChange={(e) =>
                      updateQuestion(idx, {
                        options: e.target.value.split(",").map((s) => s.trim()),
                      })
                    }
                  />
                  <Label>Correct Answer</Label>
                  <Input value={q.correctAnswer} onChange={(e) => updateQuestion(idx, { correctAnswer: e.target.value })} />
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex justify-end gap-3 border-t pt-4 border-border">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Exam / Quiz"}
        </Button>
      </div>
    </form>
  );
}

// Sub-component: Live Exam Session
function LiveExamSession({ exam, onSubmitted }: { exam: any; onSubmitted: () => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(exam.duration_minutes * 60);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const formattedAnswers = Object.entries(answersRef.current).map(([questionId, answerText]) => ({
        questionId,
        answerText,
      }));

      await submitExamAnswers({
        data: {
          examId: exam.id,
          submissionId: exam.submissionId,
          answers: formattedAnswers,
        },
      });
      toast.success("Exam submitted successfully");
      onSubmitted();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit exam");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSelectOption = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="space-y-6 surface p-6 rounded-xl border border-border">
      <div className="flex items-center justify-between border-b pb-4 border-border">
        <div>
          <h3 className="text-xl font-bold">{exam.title}</h3>
          <p className="text-xs text-muted-foreground">{exam.subject} · {exam.class_name}</p>
        </div>
        <div className="flex items-center gap-2 bg-primary/10 text-primary font-mono px-3 py-1.5 rounded-lg text-sm font-bold">
          <Clock className="size-4" /> {formatTime(timeLeft)}
        </div>
      </div>

      <div className="space-y-6">
        {exam.questions.map((q: any, idx: number) => (
          <Card key={q.id} className="p-4 space-y-3">
            <p className="font-semibold text-sm">
              Q{idx + 1}. {q.questionText} <span className="text-xs font-normal text-muted-foreground">({q.points} pts)</span>
            </p>

            {q.questionType === "multiple_choice" || q.questionType === "true_false" ? (
              <div className="grid gap-2">
                {(q.options || []).map((opt: string, oIdx: number) => (
                  <label key={oIdx} className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-muted/50 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name={q.id}
                      value={opt}
                      checked={answers[q.id] === opt}
                      onChange={() => handleSelectOption(q.id, opt)}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            ) : (
              <Textarea
                placeholder="Type your answer..."
                value={answers[q.id] || ""}
                onChange={(e) => handleSelectOption(q.id, e.target.value)}
                rows={3}
              />
            )}
          </Card>
        ))}
      </div>

      <div className="flex justify-end border-t pt-4 border-border">
        <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
          <Send className="size-4" /> {submitting ? "Submitting..." : "Submit Examination"}
        </Button>
      </div>
    </div>
  );
}

// Sub-component: Grading Hub with Manual Grading UI
function GradingHub({ examId, onDone }: { examId: string; onDone: () => void }) {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [gradingSubmission, setGradingSubmission] = useState<any | null>(null);
  const [gradedAnswers, setGradedAnswers] = useState<Record<string, { pointsAwarded: number; isCorrect: boolean; feedback: string }>>({});
  const [overallFeedback, setOverallFeedback] = useState("");
  const [savingGrade, setSavingGrade] = useState(false);

  const fetchSubs = async () => {
    setLoading(true);
    try {
      const data = await listSubmissions({ data: { id: examId } });
      setSubmissions(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load submissions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubs();
  }, [examId]);

  const openGradingModal = (sub: any) => {
    setGradingSubmission(sub);
    setOverallFeedback(sub.feedback || "");
    const initialGraded: Record<string, { pointsAwarded: number; isCorrect: boolean; feedback: string }> = {};
    (sub.exam_answers || []).forEach((ans: any) => {
      initialGraded[ans.id] = {
        pointsAwarded: Number(ans.points_awarded ?? 0),
        isCorrect: ans.is_correct ?? true,
        feedback: ans.feedback || "",
      };
    });
    setGradedAnswers(initialGraded);
  };

  const handleSaveGrade = async () => {
    if (!gradingSubmission) return;
    setSavingGrade(true);
    try {
      const payloadAnswers = Object.entries(gradedAnswers).map(([answerId, details]) => ({
        answerId,
        pointsAwarded: Number(details.pointsAwarded),
        isCorrect: Boolean(details.isCorrect),
        feedback: details.feedback,
      }));

      await gradeSubmission({
        data: {
          submissionId: gradingSubmission.id,
          overallFeedback,
          gradedAnswers: payloadAnswers,
        },
      });

      toast.success("Submission graded successfully");
      setGradingSubmission(null);
      fetchSubs();
    } catch (err: any) {
      toast.error(err.message || "Failed to save grading");
    } finally {
      setSavingGrade(false);
    }
  };

  const handleSync = async (submissionId: string) => {
    try {
      await syncExamToAssessment({ data: { submissionId } });
      toast.success("Score synced to Assessment module");
    } catch (err: any) {
      toast.error(err.message || "Failed to sync score");
    }
  };

  return (
    <div className="space-y-4 surface p-6 rounded-xl border border-border">
      <h3 className="text-lg font-bold border-b pb-3 border-border">Submissions & Manual Grading Hub</h3>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading student submissions...</p>
      ) : submissions.length === 0 ? (
        <p className="text-muted-foreground text-sm">No submissions recorded for this exam yet.</p>
      ) : (
        <div className="space-y-3">
          {submissions.map((sub) => (
            <div key={sub.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-border bg-muted/20 gap-3">
              <div>
                <p className="font-semibold text-sm">{sub.admissions?.student_name || sub.profiles?.full_name || "Student Attempt"}</p>
                <p className="text-xs text-muted-foreground">
                  Status: <Badge variant={sub.status === "graded" ? "default" : "secondary"}>{sub.status}</Badge> · Total Score: <span className="font-bold">{sub.total_score} pts</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => openGradingModal(sub)}>
                  <Edit className="size-3.5 mr-1" /> Grade Answers
                </Button>
                <Button size="sm" variant="secondary" onClick={() => handleSync(sub.id)}>
                  Sync to Assessment
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manual Grading Dialog */}
      {gradingSubmission && (
        <Dialog open={!!gradingSubmission} onOpenChange={() => setGradingSubmission(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Grade Submission: {gradingSubmission.admissions?.student_name || gradingSubmission.profiles?.full_name || "Student"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-2">
              {(gradingSubmission.exam_answers || []).map((ans: any, idx: number) => {
                const question = ans.exam_questions;
                const currentGrade = gradedAnswers[ans.id] || { pointsAwarded: 0, isCorrect: false, feedback: "" };

                return (
                  <Card key={ans.id} className="p-4 space-y-3 bg-muted/20">
                    <div className="flex justify-between items-start gap-2">
                      <p className="font-semibold text-sm">
                        Q{idx + 1}. {question?.question_text || "Question"}
                      </p>
                      <Badge variant="outline">{question?.question_type}</Badge>
                    </div>

                    <div className="rounded-lg bg-background p-3 border border-border text-sm">
                      <p className="text-xs text-muted-foreground font-semibold mb-1">Student's Answer:</p>
                      <p className="font-mono text-sm">{ans.answer_text || "(No answer provided)"}</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label>Points Awarded (Max: {question?.points ?? 1})</Label>
                        <Input
                          type="number"
                          value={currentGrade.pointsAwarded}
                          onChange={(e) =>
                            setGradedAnswers({
                              ...gradedAnswers,
                              [ans.id]: { ...currentGrade, pointsAwarded: Number(e.target.value) },
                            })
                          }
                          max={question?.points ?? 100}
                          min={0}
                        />
                      </div>
                      <div>
                        <Label>Mark Correct</Label>
                        <Select
                          value={currentGrade.isCorrect ? "true" : "false"}
                          onValueChange={(v) =>
                            setGradedAnswers({
                              ...gradedAnswers,
                              [ans.id]: { ...currentGrade, isCorrect: v === "true" },
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Correct</SelectItem>
                            <SelectItem value="false">Incorrect</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-2">
                        <Label>Feedback for Question</Label>
                        <Input
                          value={currentGrade.feedback}
                          onChange={(e) =>
                            setGradedAnswers({
                              ...gradedAnswers,
                              [ans.id]: { ...currentGrade, feedback: e.target.value },
                            })
                          }
                          placeholder="Optional feedback..."
                        />
                      </div>
                    </div>
                  </Card>
                );
              })}

              <div>
                <Label>Overall Submission Feedback</Label>
                <Textarea
                  value={overallFeedback}
                  onChange={(e) => setOverallFeedback(e.target.value)}
                  placeholder="Feedback on full exam effort..."
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setGradingSubmission(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveGrade} disabled={savingGrade}>
                {savingGrade ? "Saving..." : "Finalize & Save Grades"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// Sub-component: Exam Analytics View
function ExamAnalyticsView({ exams }: { exams: any[] }) {
  const totalExams = exams.length;
  const totalQuizzes = exams.filter((e) => e.exam_type === "quiz").length;
  const activeExams = exams.filter((e) => e.status === "published").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total Assessments</p>
          <p className="text-2xl font-bold">{totalExams}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Active Quizzes</p>
          <p className="text-2xl font-bold">{totalQuizzes}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Published Live</p>
          <p className="text-2xl font-bold">{activeExams}</p>
        </Card>
      </div>
    </div>
  );
}
