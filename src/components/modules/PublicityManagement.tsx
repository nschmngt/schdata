import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Megaphone,
  FileText,
  Sliders,
  Newspaper,
  Image,
  BarChart2,
  Eye,
  Plus,
  Trash2,
  Edit2,
  Pin,
  Star,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Calendar,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  NOTICE_LABELS,
  PUBLICITY_STATUSES,
  CIRCULAR_VISIBILITY,
  TRANSITION_EFFECTS,
  TEXT_ALIGNMENTS,
  TEXT_PLACEMENTS,
  FOCAL_POINTS,
  type BannerSlide,
  type NoticeInput,
  type CircularInput,
  type BannerInput,
  type ArticleInput,
  type MediaGalleryInput,
} from "@/lib/publicity.schemas";
import {
  NOTICE_LABEL_META,
  isNoticeActive,
  calculatePublicityAnalytics,
  generateSlug,
  filterActiveSlides,
} from "@/lib/publicity";
import {
  getPublicityNotices,
  upsertPublicityNotice,
  deletePublicityNotice,
  getPublicityCirculars,
  upsertPublicityCircular,
  deletePublicityCircular,
  getPublicityBanners,
  upsertPublicityBanner,
  deletePublicityBanner,
  getPublicityArticles,
  upsertPublicityArticle,
  deletePublicityArticle,
  getPublicityMediaGallery,
  upsertPublicityMediaGallery,
  deletePublicityMediaGallery,
} from "@/lib/publicity.functions";

export function PublicityManagement() {
  const [activeTab, setActiveTab] = useState("overview");

  // Data states
  const [notices, setNotices] = useState<any[]>([]);
  const [circulars, setCirculars] = useState<any[]>([]);
  const [banners, setBanners] = useState<any[]>([]);
  const [articles, setArticles] = useState<any[]>([]);
  const [gallery, setGallery] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Server functions
  const fetchNotices = useServerFn(getPublicityNotices);
  const saveNotice = useServerFn(upsertPublicityNotice);
  const delNotice = useServerFn(deletePublicityNotice);

  const fetchCirculars = useServerFn(getPublicityCirculars);
  const saveCircular = useServerFn(upsertPublicityCircular);
  const delCircular = useServerFn(deletePublicityCircular);

  const fetchBanners = useServerFn(getPublicityBanners);
  const saveBanner = useServerFn(upsertPublicityBanner);
  const delBanner = useServerFn(deletePublicityBanner);

  const fetchArticles = useServerFn(getPublicityArticles);
  const saveArticle = useServerFn(upsertPublicityArticle);
  const delArticle = useServerFn(deletePublicityArticle);

  const fetchGallery = useServerFn(getPublicityMediaGallery);
  const saveGallery = useServerFn(upsertPublicityMediaGallery);
  const delGallery = useServerFn(deletePublicityMediaGallery);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [n, c, b, a, g] = await Promise.all([
        fetchNotices(),
        fetchCirculars(),
        fetchBanners(),
        fetchArticles(),
        fetchGallery(),
      ]);
      setNotices(n);
      setCirculars(c);
      setBanners(b);
      setArticles(a);
      setGallery(g);
    } catch (err: any) {
      toast.error(err.message || "Failed to load publicity data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAllData();
  }, []);

  const analytics = calculatePublicityAnalytics({
    notices,
    circulars,
    banners,
    articles,
    gallery,
  });

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-7 h-auto p-1">
          <TabsTrigger value="overview" className="gap-1.5 py-2">
            <BarChart2 className="size-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="notices" className="gap-1.5 py-2">
            <Megaphone className="size-4" /> Notices
          </TabsTrigger>
          <TabsTrigger value="circulars" className="gap-1.5 py-2">
            <FileText className="size-4" /> Circulars
          </TabsTrigger>
          <TabsTrigger value="banners" className="gap-1.5 py-2">
            <Sliders className="size-4" /> Banners
          </TabsTrigger>
          <TabsTrigger value="articles" className="gap-1.5 py-2">
            <Newspaper className="size-4" /> Articles
          </TabsTrigger>
          <TabsTrigger value="gallery" className="gap-1.5 py-2">
            <Image className="size-4" /> Gallery
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-1.5 py-2">
            <Eye className="size-4" /> Preview
          </TabsTrigger>
        </TabsList>

        {/* OVERVIEW & ANALYTICS TAB */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Active Notices</CardTitle>
                <Megaphone className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.activeNotices}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Out of {analytics.totalNotices} total notices
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Official Circulars</CardTitle>
                <FileText className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.totalCirculars}</div>
                <p className="text-xs text-muted-foreground mt-1">Published documents & notices</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Banner Slideshows</CardTitle>
                <Sliders className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.totalBanners}</div>
                <p className="text-xs text-muted-foreground mt-1">Configured landing hero banners</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Article Publications</CardTitle>
                <Newspaper className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.totalArticles}</div>
                <p className="text-xs text-muted-foreground mt-1">News and school stories</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Publicity Module Quick Actions</CardTitle>
              <CardDescription>
                Manage public communication, announcement boards, official circulars, and banner photo slideshows.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              <Button variant="outline" className="h-auto flex-col items-start p-4 text-left space-y-1" onClick={() => setActiveTab("notices")}>
                <span className="font-semibold flex items-center gap-2"><Plus className="size-4" /> Create Public Notice</span>
                <span className="text-xs text-muted-foreground">Announce urgent reminders and deadline updates</span>
              </Button>
              <Button variant="outline" className="h-auto flex-col items-start p-4 text-left space-y-1" onClick={() => setActiveTab("circulars")}>
                <span className="font-semibold flex items-center gap-2"><Plus className="size-4" /> Issue Circular</span>
                <span className="text-xs text-muted-foreground">Upload official PDF notices with reference numbers</span>
              </Button>
              <Button variant="outline" className="h-auto flex-col items-start p-4 text-left space-y-1" onClick={() => setActiveTab("banners")}>
                <span className="font-semibold flex items-center gap-2"><Plus className="size-4" /> Configure Slideshow Banner</span>
                <span className="text-xs text-muted-foreground">Upload photo slides with custom messages & links</span>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* NOTICES TAB */}
        <TabsContent value="notices" className="mt-6">
          <NoticesSection notices={notices} onRefresh={loadAllData} saveNotice={saveNotice} delNotice={delNotice} />
        </TabsContent>

        {/* CIRCULARS TAB */}
        <TabsContent value="circulars" className="mt-6">
          <CircularsSection circulars={circulars} onRefresh={loadAllData} saveCircular={saveCircular} delCircular={delCircular} />
        </TabsContent>

        {/* BANNERS TAB */}
        <TabsContent value="banners" className="mt-6">
          <BannersSection banners={banners} onRefresh={loadAllData} saveBanner={saveBanner} delBanner={delBanner} />
        </TabsContent>

        {/* ARTICLES TAB */}
        <TabsContent value="articles" className="mt-6">
          <ArticlesSection articles={articles} onRefresh={loadAllData} saveArticle={saveArticle} delArticle={delArticle} />
        </TabsContent>

        {/* GALLERY TAB */}
        <TabsContent value="gallery" className="mt-6">
          <GallerySection gallery={gallery} onRefresh={loadAllData} saveGallery={saveGallery} delGallery={delGallery} />
        </TabsContent>

        {/* PREVIEW TAB */}
        <TabsContent value="preview" className="mt-6">
          <PublicPreviewSection notices={notices} circulars={circulars} banners={banners} articles={articles} gallery={gallery} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ----------------------------------------------------------------------
// SUB-COMPONENTS
// ----------------------------------------------------------------------

function NoticesSection({ notices, onRefresh, saveNotice, delNotice }: any) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<NoticeInput>({
    title: "",
    summary: "",
    content: "",
    label: "new",
    isFeatured: false,
    isPinned: false,
    imageUrl: "",
    attachmentUrl: "",
    attachmentName: "",
    readMoreLink: "",
    publishAt: new Date().toISOString(),
    expireAt: null,
    status: "published",
  });

  const handleOpen = (item?: any) => {
    if (item) {
      setEditing(item);
      setForm({
        id: item.id,
        title: item.title,
        summary: item.summary || "",
        content: item.content || "",
        label: item.label || "new",
        isFeatured: item.is_featured || false,
        isPinned: item.is_pinned || false,
        imageUrl: item.image_url || "",
        attachmentUrl: item.attachment_url || "",
        attachmentName: item.attachment_name || "",
        readMoreLink: item.read_more_link || "",
        publishAt: item.publish_at || new Date().toISOString(),
        expireAt: item.expire_at || null,
        status: item.status || "published",
      });
    } else {
      setEditing(null);
      setForm({
        title: "",
        summary: "",
        content: "",
        label: "new",
        isFeatured: false,
        isPinned: false,
        imageUrl: "",
        attachmentUrl: "",
        attachmentName: "",
        readMoreLink: "",
        publishAt: new Date().toISOString(),
        expireAt: null,
        status: "published",
      });
    }
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveNotice({ data: form });
      toast.success(editing ? "Notice updated" : "Notice created");
      setOpen(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to save notice");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this notice?")) return;
    try {
      await delNotice({ data: { id } });
      toast.success("Notice deleted");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete notice");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Public Notice Board</h3>
          <p className="text-sm text-muted-foreground">General announcements, urgent reminders, and deadline alerts.</p>
        </div>
        <Button onClick={() => handleOpen()} className="gap-2">
          <Plus className="size-4" /> Add Public Notice
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {notices.map((n: any) => {
          const meta = NOTICE_LABEL_META[n.label] || NOTICE_LABEL_META.general;
          const active = isNoticeActive(n.publish_at, n.expire_at);
          return (
            <Card key={n.id} className="flex flex-col justify-between">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className={meta.badgeClass}>
                    {meta.label}
                  </Badge>
                  <div className="flex items-center gap-1">
                    {n.is_pinned && <Pin className="size-3.5 text-amber-500 fill-amber-500" />}
                    {n.is_featured && <Star className="size-3.5 text-blue-500 fill-blue-500" />}
                    <Badge variant={n.status === "published" ? "default" : "secondary"}>
                      {n.status}
                    </Badge>
                  </div>
                </div>
                <CardTitle className="text-base mt-2 line-clamp-1">{n.title}</CardTitle>
                <CardDescription className="line-clamp-2">{n.summary || n.content}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="text-xs text-muted-foreground flex flex-col gap-1">
                  <span>Published: {new Date(n.publish_at).toLocaleDateString()}</span>
                  {n.expire_at && <span>Expires: {new Date(n.expire_at).toLocaleDateString()}</span>}
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className={`text-xs font-medium ${active ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {active ? "Active" : "Expired/Scheduled"}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleOpen(n)}>
                      <Edit2 className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(n.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Public Notice" : "New Public Notice"}</DialogTitle>
            <DialogDescription>Configure notice attributes, labels, badges, and publication schedule.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Notice Title</Label>
              <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Label Badge</Label>
                <Select value={form.label} onValueChange={(val: any) => setForm({ ...form, label: val })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NOTICE_LABELS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {NOTICE_LABEL_META[l]?.label || l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(val: any) => setForm({ ...form, status: val })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PUBLICITY_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Short Summary</Label>
              <Textarea rows={2} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>Full Content</Label>
              <Textarea rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Image URL (Optional)</Label>
                <Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Read More Link (Optional)</Label>
                <Input value={form.readMoreLink} onChange={(e) => setForm({ ...form, readMoreLink: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Publish Date</Label>
                <Input type="datetime-local" value={form.publishAt ? new Date(form.publishAt).toISOString().slice(0, 16) : ""} onChange={(e) => setForm({ ...form, publishAt: new Date(e.target.value).toISOString() })} />
              </div>
              <div className="space-y-2">
                <Label>Expiration Date (Optional)</Label>
                <Input type="datetime-local" value={form.expireAt ? new Date(form.expireAt).toISOString().slice(0, 16) : ""} onChange={(e) => setForm({ ...form, expireAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
              </div>
            </div>

            <div className="flex items-center gap-6 pt-2">
              <div className="flex items-center gap-2">
                <Switch id="pinned" checked={form.isPinned} onCheckedChange={(val) => setForm({ ...form, isPinned: val })} />
                <Label htmlFor="pinned">Pin Notice</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="featured" checked={form.isFeatured} onCheckedChange={(val) => setForm({ ...form, isFeatured: val })} />
                <Label htmlFor="featured">Feature Notice</Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">Save Notice</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CircularsSection({ circulars, onRefresh, saveCircular, delCircular }: any) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<CircularInput>({
    referenceNumber: "",
    title: "",
    issuingDepartment: "Administration",
    issueDate: new Date().toISOString().slice(0, 10),
    featuredImage: "",
    summary: "",
    content: "",
    documentUrl: "",
    documentName: "",
    externalLink: "",
    deepLink: "",
    visibility: "public",
    isFeatured: false,
    status: "published",
  });

  const handleOpen = (item?: any) => {
    if (item) {
      setEditing(item);
      setForm({
        id: item.id,
        referenceNumber: item.reference_number || "",
        title: item.title,
        issuingDepartment: item.issuing_department || "Administration",
        issueDate: item.issue_date || new Date().toISOString().slice(0, 10),
        featuredImage: item.featured_image || "",
        summary: item.summary || "",
        content: item.content || "",
        documentUrl: item.document_url || "",
        documentName: item.document_name || "",
        externalLink: item.external_link || "",
        deepLink: item.deep_link || "",
        visibility: item.visibility || "public",
        isFeatured: item.is_featured || false,
        status: item.status || "published",
      });
    } else {
      setEditing(null);
      setForm({
        referenceNumber: `CIRC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
        title: "",
        issuingDepartment: "Administration",
        issueDate: new Date().toISOString().slice(0, 10),
        featuredImage: "",
        summary: "",
        content: "",
        documentUrl: "",
        documentName: "",
        externalLink: "",
        deepLink: "",
        visibility: "public",
        isFeatured: false,
        status: "published",
      });
    }
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveCircular({ data: form });
      toast.success(editing ? "Circular updated" : "Circular created");
      setOpen(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to save circular");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this circular?")) return;
    try {
      await delCircular({ data: { id } });
      toast.success("Circular deleted");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete circular");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Official Circulars & Notices</h3>
          <p className="text-sm text-muted-foreground">Official documents with reference numbers, issuing departments, and downloads.</p>
        </div>
        <Button onClick={() => handleOpen()} className="gap-2">
          <Plus className="size-4" /> Issue Circular
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {circulars.map((c: any) => (
          <Card key={c.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-mono font-semibold">{c.reference_number}</span>
                <Badge variant="outline">{c.visibility}</Badge>
              </div>
              <CardTitle className="text-base mt-2 line-clamp-1">{c.title}</CardTitle>
              <CardDescription className="line-clamp-2">{c.summary || c.issuing_department}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="text-xs text-muted-foreground flex justify-between">
                <span>Dept: {c.issuing_department}</span>
                <span>{c.issue_date}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                {c.document_url ? (
                  <a href={c.document_url} target="_blank" rel="noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">
                    <Download className="size-3.5" /> PDF Document
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">No Document</span>
                )}
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => handleOpen(c)}>
                    <Edit2 className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Circular" : "Issue Official Circular"}</DialogTitle>
            <DialogDescription>Specify circular details, document attachments, and visibility controls.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Reference Number</Label>
                <Input required value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Issuing Department</Label>
                <Input value={form.issuingDepartment} onChange={(e) => setForm({ ...form, issuingDepartment: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Circular Title</Label>
              <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Issue Date</Label>
                <Input type="date" required value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Visibility Mode</Label>
                <Select value={form.visibility} onValueChange={(val: any) => setForm({ ...form, visibility: val })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CIRCULAR_VISIBILITY.map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Short Summary</Label>
              <Textarea rows={2} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Document Attachment URL (PDF/Doc)</Label>
                <Input value={form.documentUrl} onChange={(e) => setForm({ ...form, documentUrl: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Document Name</Label>
                <Input value={form.documentName} onChange={(e) => setForm({ ...form, documentName: e.target.value })} />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">Save Circular</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BannersSection({ banners, onRefresh, saveBanner, delBanner }: any) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<BannerInput>({
    title: "",
    description: "",
    placement: "landing_hero",
    autoFlip: true,
    transitionEffect: "slide",
    slideDuration: 5000,
    showArrows: true,
    showIndicators: true,
    showPauseControls: true,
    slides: [],
    status: "published",
  });

  const [slideOpen, setSlideOpen] = useState(false);
  const [editingSlide, setEditingSlide] = useState<BannerSlide | null>(null);
  const [slideForm, setSlideForm] = useState<BannerSlide>({
    id: "",
    imageUrl: "",
    altText: "",
    orderIndex: 0,
    heading: "",
    caption: "",
    message: "",
    buttonLabel: "",
    buttonUrl: "",
    textAlignment: "center",
    textPlacement: "center",
    textColor: "#ffffff",
    overlayColor: "#000000",
    overlayOpacity: 40,
    focalPoint: "center",
    cropMode: "cover",
  });

  const handleOpenBanner = (item?: any) => {
    if (item) {
      setEditing(item);
      setForm({
        id: item.id,
        title: item.title,
        description: item.description || "",
        placement: item.placement || "landing_hero",
        autoFlip: item.auto_flip ?? true,
        transitionEffect: item.transition_effect || "slide",
        slideDuration: item.slide_duration || 5000,
        showArrows: item.show_arrows ?? true,
        showIndicators: item.show_indicators ?? true,
        showPauseControls: item.show_pause_controls ?? true,
        slides: item.slides || [],
        status: item.status || "published",
      });
    } else {
      setEditing(null);
      setForm({
        title: "Main Landing Slideshow",
        description: "Primary banner slider on school homepage",
        placement: "landing_hero",
        autoFlip: true,
        transitionEffect: "slide",
        slideDuration: 5000,
        showArrows: true,
        showIndicators: true,
        showPauseControls: true,
        slides: [],
        status: "published",
      });
    }
    setOpen(true);
  };

  const handleOpenSlideModal = (slide?: BannerSlide) => {
    if (slide) {
      setEditingSlide(slide);
      setSlideForm({ ...slide });
    } else {
      setEditingSlide(null);
      setSlideForm({
        id: `slide_${Date.now()}`,
        imageUrl: "",
        altText: "",
        orderIndex: form.slides.length,
        heading: "",
        caption: "",
        message: "",
        buttonLabel: "",
        buttonUrl: "",
        textAlignment: "center",
        textPlacement: "center",
        textColor: "#ffffff",
        overlayColor: "#000000",
        overlayOpacity: 40,
        focalPoint: "center",
        cropMode: "cover",
      });
    }
    setSlideOpen(true);
  };

  const handleSaveSlide = (e: React.FormEvent) => {
    e.preventDefault();
    if (!slideForm.imageUrl) {
      toast.error("Image URL is required");
      return;
    }
    let updated = [...form.slides];
    if (editingSlide) {
      updated = updated.map((s) => (s.id === editingSlide.id ? slideForm : s));
    } else {
      updated.push(slideForm);
    }
    setForm({ ...form, slides: updated });
    setSlideOpen(false);
  };

  const handleDeleteSlide = (id: string) => {
    setForm({ ...form, slides: form.slides.filter((s) => s.id !== id) });
  };

  const handleSubmitBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveBanner({ data: form });
      toast.success(editing ? "Banner updated" : "Banner created");
      setOpen(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to save banner");
    }
  };

  const handleDeleteBanner = async (id: string) => {
    if (!confirm("Delete this banner slideshow?")) return;
    try {
      await delBanner({ data: { id } });
      toast.success("Banner deleted");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete banner");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Configurable Banners & Photo Slideshows</h3>
          <p className="text-sm text-muted-foreground">Upload multiple photos per slideshow with independent captions, messages, overlays, buttons, and scheduling.</p>
        </div>
        <Button onClick={() => handleOpenBanner()} className="gap-2">
          <Plus className="size-4" /> Add Slideshow Banner
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {banners.map((b: any) => (
          <Card key={b.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Badge variant="outline">{b.placement}</Badge>
                <Badge variant={b.status === "published" ? "default" : "secondary"}>{b.status}</Badge>
              </div>
              <CardTitle className="mt-2">{b.title}</CardTitle>
              <CardDescription>{b.description || `${(b.slides || []).length} photo slides configured`}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground flex gap-4">
                <span>Auto-flip: {b.auto_flip ? "Enabled" : "Disabled"}</span>
                <span>Transition: {b.transition_effect}</span>
                <span>Duration: {b.slide_duration}ms</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-xs font-semibold">{b.slides?.length || 0} Slides</span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => handleOpenBanner(b)}>
                    <Edit2 className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteBanner(b.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Banner Slideshow" : "New Banner Slideshow"}</DialogTitle>
            <DialogDescription>Configure transition controls, durations, and manage individual photo slides.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitBanner} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Placement</Label>
                <Input value={form.placement} onChange={(e) => setForm({ ...form, placement: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Transition Effect</Label>
                <Select value={form.transitionEffect} onValueChange={(val: any) => setForm({ ...form, transitionEffect: val })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRANSITION_EFFECTS.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Slide Duration (ms)</Label>
                <Input type="number" step="500" value={form.slideDuration} onChange={(e) => setForm({ ...form, slideDuration: parseInt(e.target.value) || 5000 })} />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(val: any) => setForm({ ...form, status: val })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PUBLICITY_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 p-4 rounded-lg bg-muted/40">
              <div className="flex items-center gap-2">
                <Switch id="autoFlip" checked={form.autoFlip} onCheckedChange={(val) => setForm({ ...form, autoFlip: val })} />
                <Label htmlFor="autoFlip">Enable Automatic Flipping</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="showArrows" checked={form.showArrows} onCheckedChange={(val) => setForm({ ...form, showArrows: val })} />
                <Label htmlFor="showArrows">Next/Prev Arrows</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="showIndicators" checked={form.showIndicators} onCheckedChange={(val) => setForm({ ...form, showIndicators: val })} />
                <Label htmlFor="showIndicators">Indicators</Label>
              </div>
            </div>

            {/* SLIDES BUILDER */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Individual Photo Slides ({form.slides.length})</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => handleOpenSlideModal()} className="gap-1">
                  <Plus className="size-3.5" /> Add Photo Slide
                </Button>
              </div>

              <div className="space-y-2">
                {form.slides.map((slide, idx) => (
                  <div key={slide.id} className="flex items-center justify-between p-3 rounded-md border bg-card text-card-foreground">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono font-bold text-muted-foreground w-4">{idx + 1}</span>
                      {slide.imageUrl && <img src={slide.imageUrl} alt="" className="size-10 object-cover rounded" />}
                      <div>
                        <p className="text-sm font-semibold">{slide.heading || "Untitled Slide"}</p>
                        <p className="text-xs text-muted-foreground">{slide.buttonLabel ? `CTA: ${slide.buttonLabel}` : "No CTA button"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" size="icon" onClick={() => handleOpenSlideModal(slide)}>
                        <Edit2 className="size-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => handleDeleteSlide(slide.id)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">Save Banner Slideshow</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* INDIVIDUAL SLIDE SETTINGS MODAL */}
      <Dialog open={slideOpen} onOpenChange={setSlideOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSlide ? "Edit Photo Slide Settings" : "Add Photo Slide"}</DialogTitle>
            <DialogDescription>Configure granular photo settings including overlay, button, focal point and scheduling.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveSlide} className="space-y-4">
            <div className="space-y-2">
              <Label>Photo Image URL *</Label>
              <Input required placeholder="https://..." value={slideForm.imageUrl} onChange={(e) => setSlideForm({ ...slideForm, imageUrl: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Slide Heading</Label>
                <Input value={slideForm.heading} onChange={(e) => setSlideForm({ ...slideForm, heading: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Caption / Tagline</Label>
                <Input value={slideForm.caption} onChange={(e) => setSlideForm({ ...slideForm, caption: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Longer Message / Description</Label>
              <Textarea rows={2} value={slideForm.message} onChange={(e) => setSlideForm({ ...slideForm, message: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Call-To-Action Button Label</Label>
                <Input placeholder="e.g. Apply Now / Learn More" value={slideForm.buttonLabel} onChange={(e) => setSlideForm({ ...slideForm, buttonLabel: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Destination URL</Label>
                <Input placeholder="e.g. /portal/admissions or https://..." value={slideForm.buttonUrl} onChange={(e) => setSlideForm({ ...slideForm, buttonUrl: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Text Alignment</Label>
                <Select value={slideForm.textAlignment} onValueChange={(val: any) => setSlideForm({ ...slideForm, textAlignment: val })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEXT_ALIGNMENTS.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Text Placement</Label>
                <Select value={slideForm.textPlacement} onValueChange={(val: any) => setSlideForm({ ...slideForm, textPlacement: val })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEXT_PLACEMENTS.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Focal Point</Label>
                <Select value={slideForm.focalPoint} onValueChange={(val: any) => setSlideForm({ ...slideForm, focalPoint: val })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FOCAL_POINTS.map((fp) => (<SelectItem key={fp} value={fp}>{fp}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Text Color</Label>
                <Input type="color" value={slideForm.textColor} onChange={(e) => setSlideForm({ ...slideForm, textColor: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Overlay Color</Label>
                <Input type="color" value={slideForm.overlayColor} onChange={(e) => setSlideForm({ ...slideForm, overlayColor: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Overlay Opacity (%)</Label>
                <Input type="number" min="0" max="100" value={slideForm.overlayOpacity} onChange={(e) => setSlideForm({ ...slideForm, overlayOpacity: parseInt(e.target.value) || 0 })} />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSlideOpen(false)}>Cancel</Button>
              <Button type="submit">Save Slide Settings</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ArticlesSection({ articles, onRefresh, saveArticle, delArticle }: any) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<ArticleInput>({
    title: "",
    slug: "",
    headline: "",
    shortSummary: "",
    fullContent: "",
    featuredImage: "",
    galleryImages: [],
    attachments: [],
    actionButtonLabel: "",
    actionButtonUrl: "",
    relevantDetailsLink: "",
    authorName: "",
    authorRole: "",
    category: "News",
    publicationDate: new Date().toISOString(),
    seoTitle: "",
    seoKeywords: "",
    isFeatured: false,
    isPinned: false,
    status: "published",
  });

  const handleOpen = (item?: any) => {
    if (item) {
      setEditing(item);
      setForm({
        id: item.id,
        title: item.title,
        slug: item.slug || "",
        headline: item.headline || "",
        shortSummary: item.short_summary || "",
        fullContent: item.full_content || "",
        featuredImage: item.featured_image || "",
        galleryImages: item.gallery_images || [],
        attachments: item.attachments || [],
        actionButtonLabel: item.action_button_label || "",
        actionButtonUrl: item.action_button_url || "",
        relevantDetailsLink: item.relevant_details_link || "",
        authorName: item.author_name || "",
        authorRole: item.author_role || "",
        category: item.category || "News",
        publicationDate: item.publication_date || new Date().toISOString(),
        seoTitle: item.seo_title || "",
        seoKeywords: item.seo_keywords || "",
        isFeatured: item.is_featured || false,
        isPinned: item.is_pinned || false,
        status: item.status || "published",
      });
    } else {
      setEditing(null);
      setForm({
        title: "",
        slug: "",
        headline: "",
        shortSummary: "",
        fullContent: "",
        featuredImage: "",
        galleryImages: [],
        attachments: [],
        actionButtonLabel: "",
        actionButtonUrl: "",
        relevantDetailsLink: "",
        authorName: "",
        authorRole: "",
        category: "News",
        publicationDate: new Date().toISOString(),
        seoTitle: "",
        seoKeywords: "",
        isFeatured: false,
        isPinned: false,
        status: "published",
      });
    }
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      slug: form.slug || generateSlug(form.title),
    };
    try {
      await saveArticle({ data: payload });
      toast.success(editing ? "Article updated" : "Article created");
      setOpen(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to save article");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this article?")) return;
    try {
      await delArticle({ data: { id } });
      toast.success("Article deleted");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete article");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Articles, News & Public Publications</h3>
          <p className="text-sm text-muted-foreground">Formatted stories, author credentials, SEO metadata, and downloadable media.</p>
        </div>
        <Button onClick={() => handleOpen()} className="gap-2">
          <Plus className="size-4" /> Add Article
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((a: any) => (
          <Card key={a.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline">{a.category}</Badge>
                <Badge variant={a.status === "published" ? "default" : "secondary"}>{a.status}</Badge>
              </div>
              <CardTitle className="text-base mt-2 line-clamp-1">{a.title}</CardTitle>
              <CardDescription className="line-clamp-2">{a.short_summary || a.headline}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="text-xs text-muted-foreground flex justify-between">
                <span>By: {a.author_name || "School Editorial"}</span>
                <span>{new Date(a.publication_date).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-xs text-muted-foreground">{a.view_count || 0} Views</span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => handleOpen(a)}>
                    <Edit2 className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(a.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Article" : "Create New Article"}</DialogTitle>
            <DialogDescription>Configure formatted publication text, author attribution, and SEO details.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Article Title</Label>
              <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Headline / Subtitle</Label>
                <Input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Short Summary</Label>
              <Textarea rows={2} value={form.shortSummary} onChange={(e) => setForm({ ...form, shortSummary: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>Full Article Content</Label>
              <Textarea rows={6} value={form.fullContent} onChange={(e) => setForm({ ...form, fullContent: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Author Name</Label>
                <Input value={form.authorName} onChange={(e) => setForm({ ...form, authorName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Author Role</Label>
                <Input value={form.authorRole} onChange={(e) => setForm({ ...form, authorRole: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Action Button Label</Label>
                <Input placeholder="e.g. Register / Read More" value={form.actionButtonLabel} onChange={(e) => setForm({ ...form, actionButtonLabel: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Action Button URL</Label>
                <Input placeholder="e.g. /portal/admissions" value={form.actionButtonUrl} onChange={(e) => setForm({ ...form, actionButtonUrl: e.target.value })} />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">Save Article</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GallerySection({ gallery, onRefresh, saveGallery, delGallery }: any) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<MediaGalleryInput>({
    title: "",
    caption: "",
    category: "Events",
    mediaType: "image",
    mediaUrl: "",
    thumbnailUrl: "",
    tags: [],
    isFeatured: false,
    status: "published",
  });

  const handleOpen = (item?: any) => {
    if (item) {
      setEditing(item);
      setForm({
        id: item.id,
        title: item.title,
        caption: item.caption || "",
        category: item.category || "Events",
        mediaType: item.media_type || "image",
        mediaUrl: item.media_url,
        thumbnailUrl: item.thumbnail_url || "",
        tags: item.tags || [],
        isFeatured: item.is_featured || false,
        status: item.status || "published",
      });
    } else {
      setEditing(null);
      setForm({
        title: "",
        caption: "",
        category: "Events",
        mediaType: "image",
        mediaUrl: "",
        thumbnailUrl: "",
        tags: [],
        isFeatured: false,
        status: "published",
      });
    }
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveGallery({ data: form });
      toast.success(editing ? "Media item updated" : "Media item created");
      setOpen(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to save media item");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this media item?")) return;
    try {
      await delGallery({ data: { id } });
      toast.success("Media item deleted");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete media item");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Media Gallery</h3>
          <p className="text-sm text-muted-foreground">Photos, videos, and event showcase media.</p>
        </div>
        <Button onClick={() => handleOpen()} className="gap-2">
          <Plus className="size-4" /> Add Media Item
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {gallery.map((g: any) => (
          <Card key={g.id} className="overflow-hidden">
            <div className="aspect-video bg-muted relative">
              <img src={g.media_url} alt="" className="w-full h-full object-cover" />
              <Badge className="absolute top-2 left-2" variant="secondary">{g.category}</Badge>
            </div>
            <CardHeader className="p-3">
              <CardTitle className="text-sm line-clamp-1">{g.title}</CardTitle>
              <CardDescription className="text-xs line-clamp-1">{g.caption}</CardDescription>
            </CardHeader>
            <CardContent className="p-3 pt-0 flex justify-end gap-1 border-t">
              <Button variant="ghost" size="icon" className="size-7" onClick={() => handleOpen(g)}>
                <Edit2 className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => handleDelete(g.id)}>
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Media Item" : "New Media Item"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Media Title</Label>
              <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>Media URL *</Label>
              <Input required value={form.mediaUrl} onChange={(e) => setForm({ ...form, mediaUrl: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Caption</Label>
                <Input value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">Save Media</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PublicPreviewSection({ notices, circulars, banners, articles, gallery }: any) {
  const activeNotices = notices.filter((n: any) => n.status === "published" && isNoticeActive(n.publish_at, n.expire_at));
  const publicCirculars = circulars.filter((c: any) => c.status === "published" && c.visibility === "public");
  const heroBanner = banners.find((b: any) => b.placement === "landing_hero" && b.status === "published");
  const activeSlides = heroBanner ? filterActiveSlides(heroBanner.slides) : [];

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  return (
    <div className="space-y-8 border p-6 rounded-xl bg-background">
      <div className="border-b pb-4">
        <Badge variant="outline" className="mb-2">Live Public Landing Page Preview</Badge>
        <h2 className="text-2xl font-bold">Publicity Showcase</h2>
        <p className="text-sm text-muted-foreground">Inspection preview of active landing page content visible to site visitors.</p>
      </div>

      {/* HERO BANNER SLIDESHOW PREVIEW */}
      {activeSlides.length > 0 && (
        <div className="relative overflow-hidden rounded-xl bg-slate-900 text-white min-h-[300px] flex items-center justify-center">
          {activeSlides[currentSlideIndex] && (
            <div className="absolute inset-0">
              <img
                src={activeSlides[currentSlideIndex].imageUrl}
                alt={activeSlides[currentSlideIndex].altText || ""}
                className="w-full h-full object-cover"
                style={{
                  objectPosition: activeSlides[currentSlideIndex].focalPoint,
                }}
              />
              <div
                className="absolute inset-0"
                style={{
                  backgroundColor: activeSlides[currentSlideIndex].overlayColor,
                  opacity: (activeSlides[currentSlideIndex].overlayOpacity || 40) / 100,
                }}
              />
            </div>
          )}

          <div className="relative z-10 p-8 text-center max-w-2xl space-y-3">
            <h3 className="text-3xl font-bold">{activeSlides[currentSlideIndex]?.heading}</h3>
            <p className="text-sm opacity-90">{activeSlides[currentSlideIndex]?.message}</p>
            {activeSlides[currentSlideIndex]?.buttonLabel && (
              <Button size="sm" className="mt-2">
                {activeSlides[currentSlideIndex]?.buttonLabel}
              </Button>
            )}
          </div>

          {activeSlides.length > 1 && (
            <div className="absolute bottom-4 left-0 right-0 z-20 flex justify-center gap-2">
              {activeSlides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentSlideIndex(i)}
                  className={`size-2.5 rounded-full transition-all ${i === currentSlideIndex ? "bg-white w-6" : "bg-white/50"}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* NOTICE BOARD & CIRCULARS GRID */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Megaphone className="size-5 text-primary" /> Active Notice Board ({activeNotices.length})
          </h3>
          <div className="space-y-3">
            {activeNotices.map((n: any) => (
              <div key={n.id} className="p-4 rounded-lg border bg-card text-card-foreground space-y-1">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{NOTICE_LABEL_META[n.label]?.label || n.label}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(n.publish_at).toLocaleDateString()}</span>
                </div>
                <h4 className="font-semibold">{n.title}</h4>
                <p className="text-xs text-muted-foreground">{n.summary || n.content}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <FileText className="size-5 text-primary" /> Public Official Circulars ({publicCirculars.length})
          </h3>
          <div className="space-y-3">
            {publicCirculars.map((c: any) => (
              <div key={c.id} className="p-4 rounded-lg border bg-card text-card-foreground space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-semibold">{c.reference_number}</span>
                  <span className="text-xs text-muted-foreground">{c.issue_date}</span>
                </div>
                <h4 className="font-semibold">{c.title}</h4>
                <p className="text-xs text-muted-foreground">{c.summary}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
