import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileSpreadsheet,
  Award,
  Globe,
  Lock,
  Printer,
  Download,
  Search,
  CheckCircle2,
  AlertTriangle,
  Users,
  BarChart,
  ShieldAlert,
} from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { useSchoolClasses } from "@/hooks/useSchoolClasses";
import { useSchoolName } from "@/hooks/useSchoolName";
import { SchoolLogo } from "@/components/branding/SchoolLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  getBroadsheetData,
  getResultsPublicationStatus,
  getStudentTranscript,
  updateResultPublication,
} from "@/lib/results.functions";
import { PublicationStatus } from "@/lib/results.schemas";

export function ResultsManagement() {
  const { profile } = useSession();
  const school = useSchoolName();
  const queryClient = useQueryClient();

  const { classes: classOptions } = useSchoolClasses();
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [selectedTerm, setSelectedTerm] = useState<string>("First Term");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Set initial class when options load
  if (!selectedClass && classOptions.length > 0) {
    // Pick first class if none selected
    const initial = classOptions[0];
    if (initial) setSelectedClass(initial);
  }

  const isStaffOrAdmin =
    profile?.role === "super_admin" ||
    profile?.role === "school_manager" ||
    profile?.role === "staff";

  // Broadsheet query
  const {
    data: broadsheetRes,
    isLoading: isBroadsheetLoading,
    refetch: refetchBroadsheet,
  } = useQuery({
    queryKey: ["broadsheet", selectedClass, selectedTerm],
    queryFn: () => getBroadsheetData({ data: { term: selectedTerm, className: selectedClass } }),
    enabled: isStaffOrAdmin && !!selectedClass && !!selectedTerm,
  });

  // Publication status query
  const { data: pubStatusRes } = useQuery({
    queryKey: ["publicationStatus", selectedClass, selectedTerm],
    queryFn: () =>
      getResultsPublicationStatus({ data: { term: selectedTerm, className: selectedClass } }),
    enabled: isStaffOrAdmin && !!selectedClass && !!selectedTerm,
  });

  // State for withholding management
  const [withheldIds, setWithheldIds] = useState<string[]>([]);
  const [pubNotes, setPubNotes] = useState<string>("");

  // Update publication mutation
  const updatePubMutation = useMutation({
    mutationFn: (newStatus: PublicationStatus) =>
      updateResultPublication({
        data: {
          term: selectedTerm,
          className: selectedClass,
          status: newStatus,
          withheldStudentIds: withheldIds,
          notes: pubNotes,
        },
      }),
    onSuccess: () => {
      toast.success("Publication status updated successfully");
      queryClient.invalidateQueries({ queryKey: ["publicationStatus", selectedClass, selectedTerm] });
      queryClient.invalidateQueries({ queryKey: ["broadsheet", selectedClass, selectedTerm] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update publication status");
    },
  });

  // Selected student for transcript view
  const [selectedAdmissionId, setSelectedAdmissionId] = useState<string | null>(null);

  // Transcript query
  const { data: transcriptRes, isLoading: isTranscriptLoading } = useQuery({
    queryKey: ["studentTranscript", selectedAdmissionId, selectedTerm],
    queryFn: () =>
      getStudentTranscript({
        data: {
          admissionId: selectedAdmissionId!,
          term: selectedTerm,
        },
      }),
    enabled: !!selectedAdmissionId && !!selectedTerm,
  });

  const handlePrint = () => {
    window.print();
  };

  const exportCSV = () => {
    if (!broadsheetRes?.broadsheet) return;
    const bs = broadsheetRes.broadsheet;
    const headers = ["Admission No", "Student Name", ...bs.subjects.map((s) => `${s} Total`), "Overall Total", "Average %", "Rank", "Status"];
    const rows = bs.students.map((st) => [
      st.admissionNumber,
      `"${st.studentName}"`,
      ...bs.subjects.map((s) => st.subjects[s]?.totalScore ?? 0),
      st.overallTotal,
      st.overallAverage,
      st.position,
      st.status,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Broadsheet_${selectedClass}_${selectedTerm}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredStudents = (broadsheetRes?.broadsheet.students ?? []).filter(
    (st) =>
      st.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      st.admissionNumber.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* Top Filter Controls Bar */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold">Class:</label>
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Select Class" />
                </SelectTrigger>
                <SelectContent>
                  {classOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold">Term:</label>
              <Select value={selectedTerm} onValueChange={setSelectedTerm}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Select Term" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="First Term">First Term</SelectItem>
                  <SelectItem value="Second Term">Second Term</SelectItem>
                  <SelectItem value="Third Term">Third Term</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {pubStatusRes?.status === "published" ? (
              <Badge variant="default" className="bg-emerald-600 text-white gap-1 px-3 py-1">
                <Globe className="size-3.5" /> Published
              </Badge>
            ) : pubStatusRes?.status === "withheld" ? (
              <Badge variant="destructive" className="gap-1 px-3 py-1">
                <ShieldAlert className="size-3.5" /> Results Withheld
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1 px-3 py-1">
                <Lock className="size-3.5" /> Draft / Unpublished
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue={isStaffOrAdmin ? "broadsheet" : "transcript"}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          {isStaffOrAdmin && (
            <TabsTrigger value="broadsheet" className="flex items-center gap-1.5">
              <FileSpreadsheet className="size-4" /> Broadsheet
            </TabsTrigger>
          )}
          <TabsTrigger value="transcript" className="flex items-center gap-1.5">
            <Award className="size-4" /> Transcript / Card
          </TabsTrigger>
          {isStaffOrAdmin && (
            <TabsTrigger value="publication" className="flex items-center gap-1.5">
              <Globe className="size-4" /> Publication Controls
            </TabsTrigger>
          )}
        </TabsList>

        {/* Broadsheet Tab */}
        {isStaffOrAdmin && (
          <TabsContent value="broadsheet" className="space-y-6 mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-xl">Class Broadsheet Matrix</CardTitle>
                  <CardDescription>
                    Official term broadsheet for {selectedClass} — {selectedTerm}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
                    <Download className="size-4" /> Export CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
                    <Printer className="size-4" /> Print
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="relative w-64">
                    <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                    <Input
                      placeholder="Search student..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  {broadsheetRes?.broadsheet && (
                    <div className="text-sm font-medium text-muted-foreground">
                      Class Average:{" "}
                      <span className="text-foreground font-bold">
                        {broadsheetRes.broadsheet.classAverage}%
                      </span>{" "}
                      · Total Students:{" "}
                      <span className="text-foreground font-bold">
                        {broadsheetRes.broadsheet.totalStudents}
                      </span>
                    </div>
                  )}
                </div>

                {isBroadsheetLoading ? (
                  <p className="text-center py-8 text-sm text-muted-foreground">
                    Loading broadsheet matrix data...
                  </p>
                ) : !broadsheetRes?.broadsheet || broadsheetRes.broadsheet.students.length === 0 ? (
                  <p className="text-center py-8 text-sm text-muted-foreground">
                    No student scores found for this class and term.
                  </p>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead className="min-w-[150px]">Student Name</TableHead>
                          <TableHead className="min-w-[100px]">Adm No</TableHead>
                          {broadsheetRes.broadsheet.subjects.map((s) => (
                            <TableHead key={s} className="text-center min-w-[90px]">
                              {s}
                            </TableHead>
                          ))}
                          <TableHead className="text-center font-bold min-w-[90px]">Total</TableHead>
                          <TableHead className="text-center font-bold min-w-[90px]">Avg %</TableHead>
                          <TableHead className="text-center font-bold min-w-[70px]">Rank</TableHead>
                          <TableHead className="text-center font-bold min-w-[80px]">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredStudents.map((st, idx) => (
                          <TableRow
                            key={st.admissionId}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setSelectedAdmissionId(st.admissionId)}
                          >
                            <TableCell>{idx + 1}</TableCell>
                            <TableCell className="font-medium">{st.studentName}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {st.admissionNumber}
                            </TableCell>
                            {broadsheetRes.broadsheet.subjects.map((sub) => {
                              const cell = st.subjects[sub];
                              return (
                                <TableCell key={sub} className="text-center">
                                  {cell ? (
                                    <div className="text-xs">
                                      <span className="font-semibold">{cell.totalScore}</span>
                                      <span className="text-muted-foreground ml-1">({cell.grade})</span>
                                    </div>
                                  ) : (
                                    "—"
                                  )}
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-center font-bold">{st.overallTotal}</TableCell>
                            <TableCell className="text-center font-bold">{st.overallAverage}%</TableCell>
                            <TableCell className="text-center font-semibold">{st.position}</TableCell>
                            <TableCell className="text-center">
                              <Badge
                                variant={st.status === "Pass" ? "default" : "destructive"}
                                className="text-xs px-2 py-0"
                              >
                                {st.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Subject Summary Statistics Section */}
            {broadsheetRes?.broadsheet && broadsheetRes.broadsheet.subjects.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BarChart className="size-5 text-primary" /> Subject Performance Analytics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {broadsheetRes.broadsheet.subjects.map((sub) => {
                      const stats = broadsheetRes.broadsheet.subjectStats[sub];
                      if (!stats) return null;
                      return (
                        <div key={sub} className="rounded-lg border p-4 bg-muted/20 space-y-2">
                          <h4 className="font-semibold text-sm border-b pb-1">{sub}</h4>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Average:</span>{" "}
                              <span className="font-bold">{stats.averageScore}%</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Pass Rate:</span>{" "}
                              <span className="font-bold text-emerald-600">{stats.passPercentage}%</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Highest:</span>{" "}
                              <span className="font-medium">{stats.highestScore}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Lowest:</span>{" "}
                              <span className="font-medium">{stats.lowestScore}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        {/* Transcript / Result Card Tab */}
        <TabsContent value="transcript" className="space-y-6 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl">Official Student Result Card</CardTitle>
                <CardDescription>View formatted result sheet for printing and verification</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
                <Printer className="size-4" /> Print Card
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {isStaffOrAdmin && (
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium">Select Student:</label>
                  <Select value={selectedAdmissionId || ""} onValueChange={setSelectedAdmissionId}>
                    <SelectTrigger className="w-72">
                      <SelectValue placeholder="Choose a student" />
                    </SelectTrigger>
                    <SelectContent>
                      {(broadsheetRes?.broadsheet.students ?? []).map((s) => (
                        <SelectItem key={s.admissionId} value={s.admissionId}>
                          {s.studentName} ({s.admissionNumber})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {isTranscriptLoading ? (
                <p className="text-center py-8 text-sm text-muted-foreground">Loading result card...</p>
              ) : !selectedAdmissionId && isStaffOrAdmin ? (
                <p className="text-center py-8 text-sm text-muted-foreground">
                  Select a student from the dropdown above or click on a student row in the broadsheet.
                </p>
              ) : transcriptRes && !transcriptRes.accessible ? (
                <div className="surface p-6 rounded-lg border border-destructive/30 bg-destructive/5 space-y-3 text-center">
                  <ShieldAlert className="size-8 text-destructive mx-auto" />
                  <h3 className="font-bold text-lg text-destructive">Results Unavailable</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">{transcriptRes.reason}</p>
                </div>
              ) : transcriptRes?.result ? (
                <div className="border rounded-xl p-6 bg-background space-y-6 print:border-none print:p-0">
                  {/* Branded Header */}
                  <div className="flex items-center justify-between border-b pb-4">
                    <div className="flex items-center gap-3">
                      <SchoolLogo size="md" />
                      <div>
                        <h2 className="text-xl font-bold">{school.name}</h2>
                        <p className="text-xs text-muted-foreground">{school.tagline}</p>
                      </div>
                    </div>
                    <div className="text-right text-xs space-y-0.5">
                      <p className="font-bold text-sm">{selectedTerm}</p>
                      <p className="text-muted-foreground">Class: {transcriptRes.className}</p>
                    </div>
                  </div>

                  {/* Student Details Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-lg bg-muted/30 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground block">Student Name</span>
                      <span className="font-bold">{transcriptRes.student.studentName}</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">Admission No</span>
                      <span className="font-semibold">{transcriptRes.student.admissionNumber}</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">Class Rank</span>
                      <span className="font-bold text-primary">
                        {transcriptRes.result.position} of {transcriptRes.totalStudents}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">Overall Average</span>
                      <span className="font-bold text-emerald-600">
                        {transcriptRes.result.overallAverage}%
                      </span>
                    </div>
                  </div>

                  {/* Subjects Breakdown Table */}
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Subject</TableHead>
                          <TableHead className="text-center">CA Score</TableHead>
                          <TableHead className="text-center">Exam Score</TableHead>
                          <TableHead className="text-center font-bold">Total</TableHead>
                          <TableHead className="text-center">Grade</TableHead>
                          <TableHead className="text-center">Remarks</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.values(transcriptRes.result.subjects).map((sub) => (
                          <TableRow key={sub.subject}>
                            <TableCell className="font-medium">{sub.subject}</TableCell>
                            <TableCell className="text-center">{sub.classWorkScore}</TableCell>
                            <TableCell className="text-center">{sub.examScore}</TableCell>
                            <TableCell className="text-center font-bold">{sub.totalScore}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="font-semibold">
                                {sub.grade}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center text-xs text-muted-foreground">
                              {sub.gradeLevel}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <p className="text-center py-8 text-sm text-muted-foreground">
                  No transcript data available.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Result Publication Controls Tab */}
        {isStaffOrAdmin && (
          <TabsContent value="publication" className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Globe className="size-5 text-primary" /> Term Publication Control Plane
                </CardTitle>
                <CardDescription>
                  Manage result release status and individual student withholding policies for{" "}
                  <strong>{selectedClass}</strong> ({selectedTerm})
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-wrap items-center gap-4 border p-4 rounded-lg bg-muted/20">
                  <div>
                    <span className="text-xs font-semibold uppercase text-muted-foreground block">
                      Current Publication State
                    </span>
                    <span className="text-base font-bold capitalize">
                      {pubStatusRes?.status ?? "Published"}
                    </span>
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      variant={pubStatusRes?.status === "published" ? "default" : "outline"}
                      size="sm"
                      onClick={() => updatePubMutation.mutate("published")}
                      disabled={updatePubMutation.isPending}
                      className="gap-1.5"
                    >
                      <CheckCircle2 className="size-4" /> Publish Results
                    </Button>
                    <Button
                      variant={pubStatusRes?.status === "draft" ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => updatePubMutation.mutate("draft")}
                      disabled={updatePubMutation.isPending}
                      className="gap-1.5"
                    >
                      <Lock className="size-4" /> Revert to Draft
                    </Button>
                    <Button
                      variant={pubStatusRes?.status === "withheld" ? "destructive" : "outline"}
                      size="sm"
                      onClick={() => updatePubMutation.mutate("withheld")}
                      disabled={updatePubMutation.isPending}
                      className="gap-1.5"
                    >
                      <AlertTriangle className="size-4" /> Withhold Entire Class
                    </Button>
                  </div>
                </div>

                {/* Individual Student Withholding Section */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Users className="size-4 text-muted-foreground" /> Granular Student Withholding
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Select students whose results should remain hidden (e.g., due to outstanding fee arrears
                    or pending clearance).
                  </p>

                  <div className="border rounded-md max-h-60 overflow-y-auto p-2 space-y-1">
                    {(broadsheetRes?.broadsheet.students ?? []).map((st) => {
                      const isWithheld = withheldIds.includes(st.admissionId);
                      return (
                        <div
                          key={st.admissionId}
                          className="flex items-center justify-between p-2 hover:bg-muted/40 rounded text-sm"
                        >
                          <div>
                            <span className="font-medium">{st.studentName}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              ({st.admissionNumber})
                            </span>
                          </div>
                          <Checkbox
                            checked={isWithheld}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setWithheldIds([...withheldIds, st.admissionId]);
                              } else {
                                setWithheldIds(withheldIds.filter((id) => id !== st.admissionId));
                              }
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
