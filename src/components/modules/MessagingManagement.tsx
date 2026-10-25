import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  MessagesSquare,
  Megaphone,
  BarChart2,
  Sliders,
  Send,
  Plus,
  Trash2,
  Edit2,
  Pin,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Search,
  Paperclip,
  User,
  Users,
  MessageCircle,
  ExternalLink,
  AlertTriangle,
  Info,
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ANNOUNCEMENT_PRIORITIES,
  ANNOUNCEMENT_STATUSES,
  AnnouncementInput,
} from "@/lib/messaging.schemas";
import {
  PRIORITY_BADGE_CLASSES,
  MessagingPolicies,
  calculateMessagingAnalytics,
  isAnnouncementActive,
  validateMessageLength,
} from "@/lib/messaging";
import {
  getMessagingConfigAndRules,
  getAnnouncements,
  upsertAnnouncement,
  deleteAnnouncement,
  markAnnouncementRead,
  getConversations,
  getDirectMessages,
  startConversation,
  sendDirectMessage,
  markConversationRead,
  getEligibleRecipients,
} from "@/lib/messaging.functions";
import { Link } from "@tanstack/react-router";

export function MessagingManagement() {
  const [activeTab, setActiveTab] = useState("overview");

  // Config & Policies
  const [policies, setPolicies] = useState<MessagingPolicies>({
    directMessagesEnabled: true,
    maxMessageLength: 2000,
    announcementVisibilityDays: 30,
    configuredChannels: ["In-app", "Email", "SMS"],
    configuredAudiences: ["Everyone", "Staff", "Parents", "Students"],
  });
  const [userProfile, setUserProfile] = useState<any>(null);

  // Data states
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Active DM Thread State
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);

  // Filters
  const [annSearch, setAnnSearch] = useState("");
  const [annAudienceFilter, setAnnAudienceFilter] = useState("all");
  const [annPriorityFilter, setAnnPriorityFilter] = useState("all");

  // Modals
  const [annModalOpen, setAnnModalOpen] = useState(false);
  const [editingAnn, setEditingAnn] = useState<any>(null);
  const [annForm, setAnnForm] = useState<AnnouncementInput>({
    title: "",
    summary: "",
    content: "",
    audience: "Everyone",
    targetRole: "",
    priority: "normal",
    channels: ["In-app"],
    attachmentUrl: "",
    attachmentName: "",
    isPinned: false,
    publishAt: new Date().toISOString(),
    expireAt: null,
    status: "published",
  });

  const [convModalOpen, setConvModalOpen] = useState(false);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>("");
  const [convTitle, setConvTitle] = useState("");

  // Server Fn Hooks
  const fetchConfig = useServerFn(getMessagingConfigAndRules);
  const fetchAnn = useServerFn(getAnnouncements);
  const saveAnn = useServerFn(upsertAnnouncement);
  const delAnn = useServerFn(deleteAnnouncement);
  const markAnnRead = useServerFn(markAnnouncementRead);

  const fetchConvs = useServerFn(getConversations);
  const fetchMsgs = useServerFn(getDirectMessages);
  const createConv = useServerFn(startConversation);
  const postMsg = useServerFn(sendDirectMessage);
  const markConvRead = useServerFn(markConversationRead);
  const fetchRecipients = useServerFn(getEligibleRecipients);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [cfg, annList, convList, recList] = await Promise.all([
        fetchConfig(),
        fetchAnn(),
        fetchConvs(),
        fetchRecipients(),
      ]);
      setPolicies(cfg.policies);
      setUserProfile(cfg.profile);
      setClasses(cfg.classes || []);
      setAnnouncements(annList);
      setConversations(convList);
      setRecipients(recList);

      if (convList.length > 0 && !activeConvId) {
        setActiveConvId(convList[0].id);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load messaging data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAllData();
  }, []);

  // Fetch thread messages when active conversation changes
  useEffect(() => {
    if (!activeConvId) return;
    const loadThread = async () => {
      try {
        const msgs = await fetchMsgs({ data: { conversationId: activeConvId } });
        setActiveMessages(msgs);
        await markConvRead({ data: { conversationId: activeConvId } });
        setConversations((prev) =>
          prev.map((c) => (c.id === activeConvId ? { ...c, unread_count: 0 } : c)),
        );
      } catch (err: any) {
        toast.error(err.message || "Failed to load messages");
      }
    };
    void loadThread();
  }, [activeConvId]);

  const analytics = calculateMessagingAnalytics({
    announcements,
    conversations,
    policies,
  });

  const isStaffOrAdmin =
    userProfile?.role === "super_admin" ||
    userProfile?.role === "school_manager" ||
    userProfile?.role === "staff";

  // Announcement Handlers
  const handleOpenAnnModal = (item?: any) => {
    if (item) {
      setEditingAnn(item);
      setAnnForm({
        id: item.id,
        title: item.title,
        summary: item.summary || "",
        content: item.content || "",
        audience: item.audience || "Everyone",
        targetRole: item.target_role || "",
        targetClassId: item.target_class_id || null,
        priority: item.priority || "normal",
        channels: Array.isArray(item.channels) ? item.channels : ["In-app"],
        attachmentUrl: item.attachment_url || "",
        attachmentName: item.attachment_name || "",
        isPinned: item.is_pinned || false,
        publishAt: item.publish_at || new Date().toISOString(),
        expireAt: item.expire_at || null,
        status: item.status || "published",
      });
    } else {
      setEditingAnn(null);
      setAnnForm({
        title: "",
        summary: "",
        content: "",
        audience: "Everyone",
        targetRole: "",
        targetClassId: null,
        priority: "normal",
        channels: ["In-app"],
        attachmentUrl: "",
        attachmentName: "",
        isPinned: false,
        publishAt: new Date().toISOString(),
        expireAt: null,
        status: "published",
      });
    }
    setAnnModalOpen(true);
  };

  const handleSaveAnn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveAnn({ data: annForm });
      toast.success(editingAnn ? "Announcement updated" : "Announcement published");
      setAnnModalOpen(false);
      void loadAllData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save announcement");
    }
  };

  const handleDeleteAnn = async (id: string) => {
    if (!confirm("Are you sure you want to delete this announcement?")) return;
    try {
      await delAnn({ data: { id } });
      toast.success("Announcement deleted");
      void loadAllData();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete announcement");
    }
  };

  const handleMarkAnnRead = async (id: string) => {
    try {
      await markAnnRead({ data: { announcementId: id } });
      toast.success("Marked as read");
      setAnnouncements((prev) =>
        prev.map((a) => (a.id === id ? { ...a, user_has_read: true } : a)),
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to mark as read");
    }
  };

  // Direct Message Handlers
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConvId || !messageInput.trim()) return;

    const lenCheck = validateMessageLength(messageInput, policies.maxMessageLength);
    if (!lenCheck.valid) {
      toast.error(lenCheck.error);
      return;
    }

    setSendingMsg(true);
    try {
      const newMsg = await postMsg({
        data: {
          conversationId: activeConvId,
          content: messageInput.trim(),
        },
      });
      setActiveMessages((prev) => [
        ...prev,
        {
          ...newMsg,
          sender: { id: userProfile.id, full_name: userProfile.fullName, email: userProfile.email },
        },
      ]);
      setMessageInput("");
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConvId
            ? {
                ...c,
                last_message_preview: messageInput.slice(0, 80),
                last_message_at: new Date().toISOString(),
              }
            : c,
        ),
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to send message");
    } finally {
      setSendingMsg(false);
    }
  };

  const handleStartConv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecipientId) {
      toast.error("Please select a recipient");
      return;
    }
    try {
      const conv = await createConv({
        data: {
          participantUserIds: [selectedRecipientId],
          title: convTitle,
          isGroup: false,
        },
      });
      toast.success("Conversation started");
      setConvModalOpen(false);
      setSelectedRecipientId("");
      setConvTitle("");
      await loadAllData();
      setActiveConvId(conv.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to start conversation");
    }
  };

  // Filtered Announcements
  const filteredAnnouncements = announcements.filter((a) => {
    const matchesSearch =
      !annSearch ||
      a.title.toLowerCase().includes(annSearch.toLowerCase()) ||
      a.content.toLowerCase().includes(annSearch.toLowerCase());

    const matchesAudience = annAudienceFilter === "all" || a.audience === annAudienceFilter;
    const matchesPriority = annPriorityFilter === "all" || a.priority === annPriorityFilter;

    return matchesSearch && matchesAudience && matchesPriority;
  });

  const activeConv = conversations.find((c) => c.id === activeConvId);

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto p-1">
          <TabsTrigger value="overview" className="gap-1.5 py-2">
            <BarChart2 className="size-4" /> Overview & Analytics
          </TabsTrigger>
          <TabsTrigger value="announcements" className="gap-1.5 py-2">
            <Megaphone className="size-4" /> Internal Announcements
          </TabsTrigger>
          <TabsTrigger value="direct-messages" className="gap-1.5 py-2">
            <MessagesSquare className="size-4" /> Direct Messages
          </TabsTrigger>
          <TabsTrigger value="configuration" className="gap-1.5 py-2">
            <Sliders className="size-4" /> Channel & Policy Status
          </TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Active Announcements</CardTitle>
                <Megaphone className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.activeAnnouncements}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Out of {analytics.totalAnnouncements} total broadcasts
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Direct Conversations</CardTitle>
                <MessagesSquare className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.totalConversations}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Active 1-on-1 and group threads
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Unread Messages</CardTitle>
                <MessageCircle className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">
                  {analytics.totalUnreadMessages}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Pending direct messages</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Direct Messaging Policy</CardTitle>
                <Sliders className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Badge variant={policies.directMessagesEnabled ? "default" : "destructive"}>
                    {policies.directMessagesEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Max length: {policies.maxMessageLength} chars
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Announcement Priority Breakdown</CardTitle>
                <CardDescription>
                  Distribution of active announcements by urgency level
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {ANNOUNCEMENT_PRIORITIES.map((p) => (
                  <div key={p} className="flex items-center justify-between">
                    <span className="capitalize text-sm font-medium flex items-center gap-2">
                      <Badge variant="outline" className={PRIORITY_BADGE_CLASSES[p]}>
                        {p}
                      </Badge>
                    </span>
                    <span className="font-bold">{analytics.priorityDistribution[p] || 0}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Operations Configuration Rules</CardTitle>
                <CardDescription>
                  Governing settings from System Operations Configuration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Direct Messages Enabled</span>
                  <span className="font-semibold">
                    {policies.directMessagesEnabled ? "Yes" : "No"}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Max Message Length</span>
                  <span className="font-semibold">{policies.maxMessageLength} chars</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Announcement Visibility</span>
                  <span className="font-semibold">{policies.announcementVisibilityDays} days</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Channels Configured</span>
                  <span className="font-semibold">{policies.configuredChannels.join(", ")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Target Audiences</span>
                  <span className="font-semibold">{policies.configuredAudiences.join(", ")}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Messaging Actions</CardTitle>
              <CardDescription>
                Quick actions for announcements and direct messaging
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {isStaffOrAdmin && (
                <Button
                  variant="outline"
                  className="h-auto flex-col items-start p-4 text-left space-y-1"
                  onClick={() => handleOpenAnnModal()}
                >
                  <span className="font-semibold flex items-center gap-2">
                    <Plus className="size-4" /> Create Internal Announcement
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Broadcast to school, staff, parents, or students
                  </span>
                </Button>
              )}
              <Button
                variant="outline"
                className="h-auto flex-col items-start p-4 text-left space-y-1"
                onClick={() => {
                  setActiveTab("direct-messages");
                  setConvModalOpen(true);
                }}
              >
                <span className="font-semibold flex items-center gap-2">
                  <MessageCircle className="size-4" /> Start Direct Message
                </span>
                <span className="text-xs text-muted-foreground">
                  Send 1-on-1 message to staff, student, or parent
                </span>
              </Button>
              <Button
                variant="outline"
                className="h-auto flex-col items-start p-4 text-left space-y-1"
                onClick={() => setActiveTab("configuration")}
              >
                <span className="font-semibold flex items-center gap-2">
                  <Sliders className="size-4" /> Review Channel Policies
                </span>
                <span className="text-xs text-muted-foreground">
                  Inspect system configuration rules and limits
                </span>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* INTERNAL ANNOUNCEMENTS TAB */}
        <TabsContent value="announcements" className="space-y-4 mt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">Internal Announcements</h3>
              <p className="text-sm text-muted-foreground">
                Official broadcasts across departments, staff, parents, and students.
              </p>
            </div>
            {isStaffOrAdmin && (
              <Button onClick={() => handleOpenAnnModal()} className="gap-2">
                <Plus className="size-4" /> Create Announcement
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-muted/40">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Search announcements..."
                className="pl-8 bg-background"
                value={annSearch}
                onChange={(e) => setAnnSearch(e.target.value)}
              />
            </div>

            <Select value={annAudienceFilter} onValueChange={setAnnAudienceFilter}>
              <SelectTrigger className="w-[160px] bg-background">
                <SelectValue placeholder="Audience" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Audiences</SelectItem>
                {policies.configuredAudiences.map((aud) => (
                  <SelectItem key={aud} value={aud}>
                    {aud}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={annPriorityFilter} onValueChange={setAnnPriorityFilter}>
              <SelectTrigger className="w-[140px] bg-background">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                {ANNOUNCEMENT_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredAnnouncements.map((ann) => {
              const active = isAnnouncementActive(
                ann.publish_at,
                ann.expire_at,
                policies.announcementVisibilityDays,
              );
              return (
                <Card key={ann.id} className="flex flex-col justify-between">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge
                        variant="outline"
                        className={
                          PRIORITY_BADGE_CLASSES[
                            ann.priority as keyof typeof PRIORITY_BADGE_CLASSES
                          ] || ""
                        }
                      >
                        {ann.priority}
                      </Badge>
                      <div className="flex items-center gap-1">
                        {ann.is_pinned && (
                          <Pin className="size-3.5 text-amber-500 fill-amber-500" />
                        )}
                        <Badge variant={ann.status === "published" ? "default" : "secondary"}>
                          {ann.status}
                        </Badge>
                      </div>
                    </div>
                    <CardTitle className="text-base mt-2 line-clamp-1">{ann.title}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {ann.summary || ann.content}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    <div className="text-xs text-muted-foreground flex flex-col gap-1 border-t pt-2">
                      <div className="flex justify-between">
                        <span>
                          Audience: <strong>{ann.audience}</strong>
                        </span>
                        <span>Published: {new Date(ann.publish_at).toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>
                          Channels:{" "}
                          {Array.isArray(ann.channels) ? ann.channels.join(", ") : "In-app"}
                        </span>
                        <span>Reads: {ann.read_count || 0}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t">
                      <span
                        className={`text-xs font-medium ${active ? "text-emerald-600" : "text-muted-foreground"}`}
                      >
                        {active ? "Active" : "Expired / Scheduled"}
                      </span>

                      <div className="flex items-center gap-1">
                        {!ann.user_has_read && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => handleMarkAnnRead(ann.id)}
                          >
                            <CheckCircle2 className="size-3" /> Mark Read
                          </Button>
                        )}
                        {isStaffOrAdmin && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => handleOpenAnnModal(ann)}
                            >
                              <Edit2 className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => handleDeleteAnn(ann.id)}
                            >
                              <Trash2 className="size-3.5 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* DIRECT MESSAGES TAB */}
        <TabsContent value="direct-messages" className="space-y-4 mt-6">
          {!policies.directMessagesEnabled && (
            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-start gap-3">
              <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-amber-800 dark:text-amber-400">
                  Direct Messaging Disabled
                </h4>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                  Direct messages have been turned off by System Operations Configuration policy.
                  Existing conversation history remains readable, but new messages cannot be sent
                  until enabled in Operations Configuration.
                </p>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-12 gap-6 min-h-[500px]">
            {/* Conversation List Column */}
            <div className="md:col-span-4 border rounded-xl bg-card flex flex-col h-[550px]">
              <div className="p-3 border-b flex items-center justify-between">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <MessagesSquare className="size-4" /> Conversations
                </h4>
                {policies.directMessagesEnabled && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1 text-xs"
                    onClick={() => setConvModalOpen(true)}
                  >
                    <Plus className="size-3.5" /> New
                  </Button>
                )}
              </div>

              <div className="overflow-y-auto flex-1 divide-y">
                {conversations.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    No active conversations found. Click "New" to start a direct message.
                  </div>
                ) : (
                  conversations.map((c) => {
                    const active = c.id === activeConvId;
                    const otherParticipant = c.participants?.find(
                      (p: any) => p.id !== userProfile?.id,
                    );
                    const title = c.title || otherParticipant?.fullName || "Direct Message";

                    return (
                      <button
                        key={c.id}
                        onClick={() => setActiveConvId(c.id)}
                        className={`w-full text-left p-3 flex items-start justify-between hover:bg-muted/50 transition-colors ${active ? "bg-muted/80 font-medium" : ""}`}
                      >
                        <div className="space-y-1 min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold truncate">{title}</span>
                            {otherParticipant?.userRole && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 capitalize">
                                {otherParticipant.userRole}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {c.last_message_preview || "No messages yet"}
                          </p>
                        </div>
                        {c.unread_count > 0 && (
                          <Badge
                            variant="default"
                            className="size-5 p-0 flex items-center justify-center rounded-full text-[10px]"
                          >
                            {c.unread_count}
                          </Badge>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Message Thread Column */}
            <div className="md:col-span-8 border rounded-xl bg-card flex flex-col h-[550px]">
              {activeConv ? (
                <>
                  <div className="p-3 border-b flex items-center justify-between bg-muted/30">
                    <div>
                      <h4 className="font-semibold text-sm">
                        {activeConv.title ||
                          activeConv.participants?.find((p: any) => p.id !== userProfile?.id)
                            ?.fullName ||
                          "Direct Message"}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Participants:{" "}
                        {activeConv.participants?.map((p: any) => p.fullName).join(", ")}
                      </p>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {activeMessages.map((msg) => {
                      const isMe = msg.sender_id === userProfile?.id;
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                        >
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                            <span>{isMe ? "You" : msg.sender?.full_name || "User"}</span>
                            <span>·</span>
                            <span>
                              {new Date(msg.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <div
                            className={`p-3 rounded-2xl max-w-[80%] text-sm ${isMe ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-muted rounded-tl-none"}`}
                          >
                            <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                            {msg.attachment_url && (
                              <a
                                href={msg.attachment_url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 text-xs flex items-center gap-1 underline"
                              >
                                <Paperclip className="size-3" />{" "}
                                {msg.attachment_name || "Attachment"}
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <form onSubmit={handleSendMessage} className="p-3 border-t bg-muted/20 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        disabled={!policies.directMessagesEnabled}
                        placeholder={
                          policies.directMessagesEnabled
                            ? "Type your message..."
                            : "Direct messaging disabled by Operations policy"
                        }
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        className="bg-background"
                      />
                      <Button
                        type="submit"
                        disabled={
                          !policies.directMessagesEnabled || !messageInput.trim() || sendingMsg
                        }
                        className="gap-2"
                      >
                        <Send className="size-4" /> Send
                      </Button>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                      <span>Operations Limit: {policies.maxMessageLength} characters</span>
                      <span
                        className={
                          messageInput.length > policies.maxMessageLength
                            ? "text-destructive font-bold"
                            : ""
                        }
                      >
                        {messageInput.length} / {policies.maxMessageLength}
                      </span>
                    </div>
                  </form>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground space-y-2">
                  <MessagesSquare className="size-10 text-muted-foreground/50" />
                  <p className="text-sm font-medium">
                    Select a conversation or start a new message thread.
                  </p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* CONFIGURATION TAB */}
        <TabsContent value="configuration" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sliders className="size-5 text-primary" /> Operations & Messaging Configuration
                Status
              </CardTitle>
              <CardDescription>
                System messaging policies are governed centrally in Operations Configuration under
                the Operations domain.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="p-4 rounded-lg border bg-card space-y-1">
                  <p className="text-xs text-muted-foreground uppercase font-semibold">
                    Direct Messaging Rule
                  </p>
                  <p className="text-lg font-bold flex items-center gap-2">
                    <Badge variant={policies.directMessagesEnabled ? "default" : "destructive"}>
                      {policies.directMessagesEnabled ? "Active & Enabled" : "Disabled by Policy"}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Controls 1-on-1 direct chat availability
                  </p>
                </div>

                <div className="p-4 rounded-lg border bg-card space-y-1">
                  <p className="text-xs text-muted-foreground uppercase font-semibold">
                    Max Message Character Limit
                  </p>
                  <p className="text-2xl font-bold">
                    {policies.maxMessageLength}{" "}
                    <span className="text-sm font-normal text-muted-foreground">chars</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Enforced during direct message submission
                  </p>
                </div>

                <div className="p-4 rounded-lg border bg-card space-y-1">
                  <p className="text-xs text-muted-foreground uppercase font-semibold">
                    Announcement Visibility
                  </p>
                  <p className="text-2xl font-bold">
                    {policies.announcementVisibilityDays}{" "}
                    <span className="text-sm font-normal text-muted-foreground">days</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Default lifecycle for active broadcasts
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="p-4 rounded-lg border bg-card space-y-2">
                  <p className="text-sm font-semibold">
                    Configured Delivery Channels ({policies.configuredChannels.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {policies.configuredChannels.map((ch) => (
                      <Badge key={ch} variant="outline">
                        {ch}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-lg border bg-card space-y-2">
                  <p className="text-sm font-semibold">
                    Target Audience Groups ({policies.configuredAudiences.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {policies.configuredAudiences.map((aud) => (
                      <Badge key={aud} variant="secondary">
                        {aud}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-muted flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Info className="size-4 shrink-0" />
                  <span>
                    Administrators can customize messaging limits, channels, and rules on the
                    Operations Configuration page.
                  </span>
                </div>
                <Button variant="outline" size="sm" asChild className="gap-1.5 shrink-0">
                  <Link to="/portal/operations-configuration">
                    <ExternalLink className="size-3.5" /> Operations Configuration
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ANNOUNCEMENT DIALOG */}
      <Dialog open={annModalOpen} onOpenChange={setAnnModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAnn ? "Edit Internal Announcement" : "New Internal Announcement"}
            </DialogTitle>
            <DialogDescription>
              Specify title, content, target audience, priority, and delivery channels.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveAnn} className="space-y-4">
            <div className="space-y-2">
              <Label>Announcement Title *</Label>
              <Input
                required
                value={annForm.title}
                onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Target Audience</Label>
                <Select
                  value={annForm.audience}
                  onValueChange={(val) => setAnnForm({ ...annForm, audience: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {policies.configuredAudiences.map((aud) => (
                      <SelectItem key={aud} value={aud}>
                        {aud}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Target Class (Optional)</Label>
                <Select
                  value={annForm.targetClassId || "all"}
                  onValueChange={(val) =>
                    setAnnForm({ ...annForm, targetClassId: val === "all" ? null : val })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Classes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Priority Level</Label>
                <Select
                  value={annForm.priority}
                  onValueChange={(val: any) => setAnnForm({ ...annForm, priority: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANNOUNCEMENT_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Short Summary</Label>
              <Textarea
                rows={2}
                value={annForm.summary}
                onChange={(e) => setAnnForm({ ...annForm, summary: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Full Announcement Content *</Label>
              <Textarea
                rows={4}
                required
                value={annForm.content}
                onChange={(e) => setAnnForm({ ...annForm, content: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Attachment URL (Optional)</Label>
                <Input
                  value={annForm.attachmentUrl}
                  onChange={(e) => setAnnForm({ ...annForm, attachmentUrl: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Publish Date</Label>
                <Input
                  type="datetime-local"
                  value={
                    annForm.publishAt ? new Date(annForm.publishAt).toISOString().slice(0, 16) : ""
                  }
                  onChange={(e) =>
                    setAnnForm({ ...annForm, publishAt: new Date(e.target.value).toISOString() })
                  }
                />
              </div>
            </div>

            <div className="flex items-center gap-6 pt-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="pin"
                  checked={annForm.isPinned}
                  onCheckedChange={(val) => setAnnForm({ ...annForm, isPinned: val })}
                />
                <Label htmlFor="pin">Pin Announcement</Label>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs font-medium">Status:</Label>
                <Select
                  value={annForm.status}
                  onValueChange={(val: any) => setAnnForm({ ...annForm, status: val })}
                >
                  <SelectTrigger className="w-[120px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANNOUNCEMENT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAnnModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save Announcement</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* NEW CONVERSATION DIALOG */}
      <Dialog open={convModalOpen} onOpenChange={setConvModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Direct Message</DialogTitle>
            <DialogDescription>
              Select a recipient from staff, parents, or students to start messaging.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleStartConv} className="space-y-4">
            <div className="space-y-2">
              <Label>Select Recipient *</Label>
              <Select value={selectedRecipientId} onValueChange={setSelectedRecipientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a recipient..." />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {recipients.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.fullName} ({r.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Thread Title (Optional)</Label>
              <Input
                placeholder="e.g. Subject discussion"
                value={convTitle}
                onChange={(e) => setConvTitle(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConvModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Start Conversation</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
