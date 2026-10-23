import { SchoolLogo } from "@/components/branding/SchoolLogo";
import { useSchoolName } from "@/hooks/useSchoolName";
import { brandTitle } from "@/lib/branding.functions";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LogIn, KeyRound, ArrowLeft, ShieldAlert, Megaphone, FileText, Newspaper, Image, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ACCESS_LABEL, ROLES, ROLE_META, type Role } from "@/lib/access";
import { getSetupStatus, recordLogin, requestPasswordReset } from "@/lib/admin.functions";
import { resolveStudentLogin } from "@/lib/admissions.functions";
import { getPublicLandingData } from "@/lib/publicity.functions";
import { NOTICE_LABEL_META, isNoticeActive, filterActiveSlides } from "@/lib/publicity";


export const Route = createFileRoute("/")({
  head: ({ match }) => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: brandTitle("Sign In by Role", match.context) },
      {
        name: "description",
        content:
          "Select your role and sign in to the unified School Management Portal. Access is granted by role and access level.",
      },
      { property: "og:title", content: brandTitle("Sign In by Role", match.context) },
      {
        property: "og:description",
        content:
          "Role-based entry point to the unified School Management Portal for administrators, staff, students and parents.",
      },
    ],
  }),
  component: Landing,
});

const ACCENT_BAR: Record<Role, string> = {
  super_admin: "bg-role-super",
  school_manager: "bg-role-manager",
  staff: "bg-role-staff",
  student: "bg-role-student",
  parent: "bg-role-parent",
};

const ACCENT_TEXT: Record<Role, string> = {
  super_admin: "text-role-super border-role-super/30 bg-role-super/8",
  school_manager: "text-role-manager border-role-manager/30 bg-role-manager/8",
  staff: "text-role-staff border-role-staff/30 bg-role-staff/8",
  student: "text-role-student border-role-student/30 bg-role-student/8",
  parent: "text-role-parent border-role-parent/30 bg-role-parent/8",
};

function Landing() {
  const brand = useSchoolName();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role | null>(null);
  const [view, setView] = useState<"login" | "forgot">("login");
  const [initialised, setInitialised] = useState<boolean | null>(null);
  const checkSetup = useServerFn(getSetupStatus);

  const [publicData, setPublicData] = useState<any>({
    notices: [],
    circulars: [],
    heroBanner: null,
    articles: [],
    gallery: [],
  });
  const fetchLandingData = useServerFn(getPublicLandingData);

  useEffect(() => {
    void checkSetup().then((s) => setInitialised(s.initialised));
    void fetchLandingData().then((res) => setPublicData(res)).catch(() => {});
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/portal" });
    });
  }, []);

  const heroSlides = publicData.heroBanner ? filterActiveSlides(publicData.heroBanner.slides) : [];
  const activeNotices = publicData.notices.filter((n: any) => isNoticeActive(n.publish_at, n.expire_at));

  return (
    <main className="min-h-screen bg-background">
      <header className="bg-ink text-ink-foreground">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 py-12 text-center">
          <div className="flex items-center gap-3">
            <SchoolLogo size="lg" />
            <h1 className="text-4xl font-bold sm:text-5xl">{brand.name}</h1>
          </div>
          <p className="text-ink-muted">{brand.tagline || "Comprehensive Educational Management Platform"}</p>
        </div>
      </header>

      {/* HERO BANNER SLIDESHOW */}
      {heroSlides.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 pt-8">
          <HeroBannerSlider slides={heroSlides} banner={publicData.heroBanner} />
        </section>
      )}

      <div className="mx-auto max-w-6xl px-6 py-12 space-y-12">
        {initialised === false && (
          <div className="surface mb-8 flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 size-5 text-warning" aria-hidden />
              <div>
                <p className="font-semibold">This system has not been set up yet</p>
                <p className="text-sm text-muted-foreground">
                  Create the initial Super Administrator and School Manager accounts to begin.
                </p>
              </div>
            </div>
            <Button asChild>
              <Link to="/setup">Run system setup</Link>
            </Button>
          </div>
        )}

        {!role ? (
          <section aria-labelledby="roles-heading">
            <h2 id="roles-heading" className="text-xl font-bold mb-4 text-center">
              Portal Access & Role Sign In
            </h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {ROLES.map((r) => {
                const meta = ROLE_META[r];
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setRole(r);
                      setView("login");
                    }}
                    className="surface group relative overflow-hidden p-7 text-center transition hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]"
                  >
                    <span
                      className={`absolute inset-x-0 top-0 h-1 ${ACCENT_BAR[r]}`}
                      aria-hidden
                    />
                    <h3 className="text-xl font-semibold">{meta.label}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{meta.tagline}</p>
                    <span
                      className={`mt-5 inline-block rounded-full border px-3 py-1 text-xs font-medium ${ACCENT_TEXT[r]}`}
                    >
                      {ACCESS_LABEL[meta.accessLevel]}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <AuthPanel role={role} view={view} setView={setView} onBack={() => setRole(null)} />
        )}

        {/* PUBLIC PUBLICITY SECTIONS */}
        <div className="grid gap-8 md:grid-cols-2">
          {/* PUBLIC NOTICE BOARD */}
          {activeNotices.length > 0 && (
            <section className="surface p-6 space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Megaphone className="size-5 text-primary" /> Notice Board
                </h3>
                <Badge variant="secondary">{activeNotices.length} Notices</Badge>
              </div>
              <div className="space-y-3">
                {activeNotices.map((n: any) => {
                  const meta = NOTICE_LABEL_META[n.label] || NOTICE_LABEL_META.general;
                  return (
                    <div key={n.id} className="p-3.5 rounded-lg border bg-card space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className={meta.badgeClass}>
                          {meta.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(n.publish_at).toLocaleDateString()}
                        </span>
                      </div>
                      <h4 className="font-semibold text-sm">{n.title}</h4>
                      <p className="text-xs text-muted-foreground">{n.summary || n.content}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* CIRCULARS & OFFICIAL NOTICES */}
          {publicData.circulars.length > 0 && (
            <section className="surface p-6 space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <FileText className="size-5 text-primary" /> Official Circulars
                </h3>
                <Badge variant="secondary">{publicData.circulars.length} Documents</Badge>
              </div>
              <div className="space-y-3">
                {publicData.circulars.map((c: any) => (
                  <div key={c.id} className="p-3.5 rounded-lg border bg-card space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-mono font-semibold text-foreground">{c.reference_number}</span>
                      <span>{c.issue_date}</span>
                    </div>
                    <h4 className="font-semibold text-sm">{c.title}</h4>
                    <p className="text-xs text-muted-foreground">{c.summary || c.issuing_department}</p>
                    {c.document_url && (
                      <a href={c.document_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline pt-1">
                        <Download className="size-3" /> Download Attachment
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ARTICLES & NEWS SHOWCASE */}
        {publicData.articles.length > 0 && (
          <section className="surface p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Newspaper className="size-5 text-primary" /> School News & Articles
              </h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {publicData.articles.map((a: any) => (
                <div key={a.id} className="p-4 rounded-lg border bg-card flex flex-col justify-between space-y-2">
                  <div className="space-y-1">
                    <Badge variant="outline" className="text-[10px]">{a.category}</Badge>
                    <h4 className="font-semibold text-sm line-clamp-1">{a.title}</h4>
                    <p className="text-xs text-muted-foreground line-clamp-2">{a.short_summary || a.headline}</p>
                  </div>
                  <div className="text-[10px] text-muted-foreground pt-2 border-t flex justify-between">
                    <span>{a.author_name || "Editorial"}</span>
                    <span>{new Date(a.publication_date).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="mt-8 text-center text-sm text-muted-foreground whitespace-pre-wrap">
          {"About Us           Contact Us            Privacy Policy          Terms of Service                FAQ          Resources "}
        </p>
      </div>
    </main>
  );
}

function HeroBannerSlider({ slides, banner }: { slides: any[]; banner: any }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!banner?.auto_flip || slides.length <= 1) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, banner.slide_duration || 5000);
    return () => clearInterval(interval);
  }, [slides.length, banner?.auto_flip, banner?.slide_duration]);

  if (!slides[index]) return null;
  const slide = slides[index];

  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-900 text-white min-h-[360px] sm:min-h-[420px] flex items-center justify-center shadow-xl">
      <div className="absolute inset-0">
        <img
          src={slide.imageUrl}
          alt={slide.altText || ""}
          className="w-full h-full object-cover"
          style={{ objectPosition: slide.focalPoint || "center" }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: slide.overlayColor || "#000000",
            opacity: (slide.overlayOpacity ?? 40) / 100,
          }}
        />
      </div>

      <div className="relative z-10 p-8 text-center max-w-2xl space-y-4">
        {slide.heading && <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight" style={{ color: slide.textColor }}>{slide.heading}</h2>}
        {slide.caption && <p className="text-base sm:text-lg font-medium opacity-90">{slide.caption}</p>}
        {slide.message && <p className="text-xs sm:text-sm opacity-80 max-w-xl mx-auto">{slide.message}</p>}
        {slide.buttonLabel && slide.buttonUrl && (
          <div className="pt-2">
            <Button size="lg" asChild className="font-semibold shadow-md">
              <a href={slide.buttonUrl}>{slide.buttonLabel}</a>
            </Button>
          </div>
        )}
      </div>

      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setIndex((index - 1 + slides.length) % slides.length)}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 size-10 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white"
          >
            <ChevronLeft className="size-6" />
          </button>
          <button
            type="button"
            onClick={() => setIndex((index + 1) % slides.length)}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 size-10 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white"
          >
            <ChevronRight className="size-6" />
          </button>
          <div className="absolute bottom-4 left-0 right-0 z-20 flex justify-center gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                className={`size-2.5 rounded-full transition-all ${i === index ? "bg-white w-6" : "bg-white/50"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AuthPanel({
  role,
  view,
  setView,
  onBack,
}: {
  role: Role;
  view: "login" | "forgot";
  setView: (v: "login" | "forgot") => void;
  onBack: () => void;
}) {
  const meta = ROLE_META[role];
  const navigate = useNavigate();
  const isStudent = role === "student";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [admissionNumber, setAdmissionNumber] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const raiseReset = useServerFn(requestPasswordReset);
  const stampLogin = useServerFn(recordLogin);
  const resolveStudent = useServerFn(resolveStudentLogin);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);

    // Student login is the parent email provided at admission + the child's
    // admission number; it resolves to the student identity created then.
    let loginEmail = email;
    let loginPassword = password;
    if (isStudent) {
      try {
        const resolved = await resolveStudent({
          data: { parentEmail: email, admissionNumber: admissionNumber.trim() },
        });
        loginEmail = resolved.email;
        loginPassword = admissionNumber.trim().toUpperCase();
      } catch (err) {
        setBusy(false);
        toast.error(
          err instanceof Error ? err.message : "Could not verify those admission details.",
        );
        return;
      }
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    if (error || !data.user) {
      setBusy(false);
      toast.error(error?.message ?? "Sign in failed");
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!profile || profile.status !== "active") {
      await supabase.auth.signOut();
      setBusy(false);
      toast.error("This account is not active. Contact an administrator.");
      return;
    }
    if (profile.role !== role) {
      await supabase.auth.signOut();
      setBusy(false);
      toast.error(`This account is not registered as ${meta.label}.`);
      return;
    }
    try {
      await stampLogin({ data: undefined });
    } catch {
      // non-blocking: login tracking must never prevent access
    }
    navigate({ to: "/portal" });
  };


  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await raiseReset({ data: { email, note: note || undefined } });
      toast.success("Request sent. An administrator will reset your password.");
      setView("login");
      setNote("");
    } catch {
      toast.error("Could not send the request. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Choose a different role
      </button>

      <div className="surface relative overflow-hidden p-8">
        <span className={`absolute inset-x-0 top-0 h-1 ${ACCENT_BAR[role]}`} aria-hidden />
        <h2 className="text-2xl font-semibold">{meta.label} sign in</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {ACCESS_LABEL[meta.accessLevel]} — {meta.tagline}
        </p>

        {view === "login" ? (
          <form className="mt-6 space-y-4" onSubmit={signIn}>
            <div className="space-y-2">
              <Label htmlFor="email">{isStudent ? "Parent email (from admission)" : "Email"}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {isStudent ? (
              <div className="space-y-2">
                <Label htmlFor="admno">Admission number</Label>
                <Input
                  id="admno"
                  required
                  placeholder="ADM-2026-0001"
                  value={admissionNumber}
                  onChange={(e) => setAdmissionNumber(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Students sign in with the parent email given at admission and their own
                  admission number.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              <LogIn className="size-4" aria-hidden /> Sign in
            </Button>
            <button
              type="button"
              onClick={() => setView("forgot")}
              className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Forgot password?
            </button>
          </form>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={submitReset}>
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              Passwords can only be reset by an administrator. Submit a request and your
              administrator will issue a new password.
            </p>
            <div className="space-y-2">
              <Label htmlFor="reset-email">Account email</Label>
              <Input
                id="reset-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-note">Message (optional)</Label>
              <Textarea
                id="reset-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              <KeyRound className="size-4" aria-hidden /> Send reset request
            </Button>
            <button
              type="button"
              onClick={() => setView("login")}
              className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
