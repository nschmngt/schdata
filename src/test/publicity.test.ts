import { describe, it, expect } from "vitest";
import {
  noticeSchema,
  circularSchema,
  bannerSchema,
  bannerSlideSchema,
  articleSchema,
  mediaGallerySchema,
} from "@/lib/publicity.schemas";
import {
  isNoticeActive,
  isSlideActive,
  filterActiveSlides,
  calculatePublicityAnalytics,
  generateSlug,
} from "@/lib/publicity";

describe("Publicity Module Schemas & Validations", () => {
  it("validates valid public notice input", () => {
    const validNotice = {
      title: "Annual Sports Meet 2026",
      summary: "Registration now open for track and field events.",
      content: "Detailed schedule and guidelines for all houses...",
      label: "urgent",
      isFeatured: true,
      isPinned: true,
      publishAt: "2026-03-01T08:00:00.000Z",
      status: "published",
    };
    const parsed = noticeSchema.safeParse(validNotice);
    expect(parsed.success).toBe(true);
  });

  it("rejects notice when title is too short", () => {
    const invalidNotice = {
      title: "A",
      label: "new",
    };
    const parsed = noticeSchema.safeParse(invalidNotice);
    expect(parsed.success).toBe(false);
  });

  it("validates official circular schema with reference numbers", () => {
    const validCircular = {
      referenceNumber: "CIRC-2026-004",
      title: "Mid-Term Academic Calendar Revision",
      issuingDepartment: "Office of the Registrar",
      issueDate: "2026-03-15",
      visibility: "public",
      status: "published",
    };
    const parsed = circularSchema.safeParse(validCircular);
    expect(parsed.success).toBe(true);
  });

  it("validates banner slideshow with individual photo slide settings", () => {
    const validBanner = {
      title: "Landing Page Banner",
      placement: "landing_hero",
      autoFlip: true,
      transitionEffect: "fade",
      slideDuration: 6000,
      slides: [
        {
          id: "slide-1",
          imageUrl: "https://example.com/photo1.jpg",
          heading: "Welcome to Excellence",
          caption: "Empowering Next Gen Leaders",
          message: "Admissions open for 2026/2027 academic year.",
          buttonLabel: "Apply Now",
          buttonUrl: "/portal/admissions",
          textColor: "#ffffff",
          overlayColor: "#000000",
          overlayOpacity: 50,
          focalPoint: "center",
          orderIndex: 0,
        },
        {
          id: "slide-2",
          imageUrl: "https://example.com/photo2.jpg",
          heading: "State of the Art Facilities",
          buttonLabel: "Explore Campus",
          buttonUrl: "/portal/gallery",
          textColor: "#ffea00",
          focalPoint: "top",
          orderIndex: 1,
        },
      ],
    };
    const parsed = bannerSchema.safeParse(validBanner);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.slides).toHaveLength(2);
      expect(parsed.data.slides[0].buttonLabel).toBe("Apply Now");
      expect(parsed.data.slides[1].textColor).toBe("#ffea00");
    }
  });

  it("validates article schema and generates slug accurately", () => {
    const title = "School Wins National Science Olympiad 2026!";
    const slug = generateSlug(title);
    expect(slug).toBe("school-wins-national-science-olympiad-2026");

    const articleInput = {
      title,
      headline: "Students secure 1st place in robotics and physics",
      shortSummary: "Outstanding performance by our Senior High team.",
      fullContent: "The competition brought together over 100 schools...",
      authorName: "Dr. Jane Doe",
      category: "Achievements",
      publicationDate: "2026-03-20T10:00:00.000Z",
    };
    const parsed = articleSchema.safeParse(articleInput);
    expect(parsed.success).toBe(true);
  });
});

describe("Publicity Pure Business Logic & Scheduling Controls", () => {
  it("correctly evaluates notice active status based on publication and expiration dates", () => {
    const now = new Date("2026-03-10T12:00:00Z");

    // Published in past, no expiry -> Active
    expect(isNoticeActive("2026-03-01T00:00:00Z", null, now)).toBe(true);

    // Published in future -> Inactive
    expect(isNoticeActive("2026-03-15T00:00:00Z", null, now)).toBe(false);

    // Expired in past -> Inactive
    expect(isNoticeActive("2026-03-01T00:00:00Z", "2026-03-05T00:00:00Z", now)).toBe(false);

    // Active with future expiry -> Active
    expect(isNoticeActive("2026-03-01T00:00:00Z", "2026-03-20T00:00:00Z", now)).toBe(true);
  });

  it("filters active slides based on individual slide scheduling and orders by orderIndex", () => {
    const now = new Date("2026-03-10T12:00:00Z");
    const slides = [
      {
        id: "slide-3",
        imageUrl: "img3.jpg",
        orderIndex: 2,
        startDate: "2026-03-01",
        endDate: "2026-03-30",
      },
      {
        id: "slide-1",
        imageUrl: "img1.jpg",
        orderIndex: 0,
        startDate: null,
        endDate: null,
      },
      {
        id: "slide-expired",
        imageUrl: "img-exp.jpg",
        orderIndex: 1,
        startDate: "2026-01-01",
        endDate: "2026-02-01", // expired
      },
    ] as any;

    const filtered = filterActiveSlides(slides, now);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].id).toBe("slide-1");
    expect(filtered[1].id).toBe("slide-3");
  });

  it("calculates publicity analytics accurately across modules", () => {
    const analytics = calculatePublicityAnalytics({
      notices: [
        {
          title: "Notice 1",
          publishAt: "2026-03-01T00:00:00Z",
          status: "published",
        } as any,
        {
          title: "Notice 2",
          publishAt: "2026-03-01T00:00:00Z",
          expireAt: "2026-03-05T00:00:00Z", // expired
          status: "published",
        } as any,
      ],
      circulars: [{ title: "Circ 1" }] as any,
      banners: [{ title: "Hero" }] as any,
      articles: [
        { title: "Article 1", viewCount: 150 },
        { title: "Article 2", viewCount: 250 },
      ] as any,
      gallery: [{ title: "Image 1" }] as any,
    });

    expect(analytics.totalNotices).toBe(2);
    expect(analytics.activeNotices).toBe(1);
    expect(analytics.totalCirculars).toBe(1);
    expect(analytics.totalBanners).toBe(1);
    expect(analytics.totalArticles).toBe(2);
    expect(analytics.totalViews).toBe(400);
    expect(analytics.totalGalleryItems).toBe(1);
  });
});
