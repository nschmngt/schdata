import {
  NOTICE_LABELS,
  type BannerSlide,
  type NoticeInput,
  type CircularInput,
  type ArticleInput,
  type MediaGalleryInput,
} from "./publicity.schemas";

export interface NoticeBadgeMeta {
  label: string;
  badgeClass: string;
}

export const NOTICE_LABEL_META: Record<string, NoticeBadgeMeta> = {
  coming_soon: {
    label: "Coming Soon",
    badgeClass: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  },
  urgent: {
    label: "Urgent",
    badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
  },
  new: {
    label: "New",
    badgeClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  },
  deadline_approaching: {
    label: "Deadline Approaching",
    badgeClass: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  },
  general: {
    label: "General",
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
};

/** Evaluates whether a notice is currently active based on publishAt and expireAt dates. */
export function isNoticeActive(publishAt: string | Date, expireAt?: string | Date | null, now = new Date()): boolean {
  const pub = new Date(publishAt);
  if (isNaN(pub.getTime()) || pub > now) return false;
  if (expireAt) {
    const exp = new Date(expireAt);
    if (!isNaN(exp.getTime()) && exp <= now) return false;
  }
  return true;
}

/** Evaluates individual slide active status based on individual scheduling rules. */
export function isSlideActive(slide: BannerSlide, now = new Date()): boolean {
  if (slide.startDate) {
    const start = new Date(slide.startDate);
    if (!isNaN(start.getTime()) && start > now) return false;
  }
  if (slide.endDate) {
    const end = new Date(slide.endDate);
    if (!isNaN(end.getTime()) && end <= now) return false;
  }
  return true;
}

/** Filters slides for display in public slideshows. */
export function filterActiveSlides(slides: BannerSlide[], now = new Date()): BannerSlide[] {
  return slides
    .filter((s) => isSlideActive(s, now))
    .sort((a, b) => a.orderIndex - b.orderIndex);
}

/** Aggregates publishing metrics across publicity modules. */
export interface PublicityAnalytics {
  totalNotices: number;
  activeNotices: number;
  totalCirculars: number;
  totalBanners: number;
  totalArticles: number;
  totalViews: number;
  totalGalleryItems: number;
}

export function calculatePublicityAnalytics(data: {
  notices: NoticeInput[];
  circulars: CircularInput[];
  banners: any[];
  articles: (ArticleInput & { viewCount?: number })[];
  gallery: MediaGalleryInput[];
}): PublicityAnalytics {
  const now = new Date();
  const activeNotices = data.notices.filter(
    (n) => n.status === "published" && isNoticeActive(n.publishAt, n.expireAt, now)
  ).length;

  const totalViews = data.articles.reduce((acc, curr) => acc + (curr.viewCount || 0), 0);

  return {
    totalNotices: data.notices.length,
    activeNotices,
    totalCirculars: data.circulars.length,
    totalBanners: data.banners.length,
    totalArticles: data.articles.length,
    totalViews,
    totalGalleryItems: data.gallery.length,
  };
}

/** Helper to generate article slug from title */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
