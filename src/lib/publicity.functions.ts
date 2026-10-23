import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveProvisionedSchool } from "@/lib/school.server";
import {
  noticeSchema,
  circularSchema,
  bannerSchema,
  articleSchema,
  mediaGallerySchema,
} from "./publicity.schemas";
import { z } from "zod";
import { calculatePublicityAnalytics } from "./publicity";

// ----------------------------------------------------------------------
// NOTICES
// ----------------------------------------------------------------------

export const getPublicityNotices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, profile } = context;
    const { data, error } = await supabase
      .from("publicity_notices")
      .select("*")
      .order("is_pinned", { ascending: false })
      .order("is_featured", { ascending: false })
      .order("publish_at", { ascending: false });

    if (error) throw new Error(`Failed to load notices: ${error.message}`);
    return data || [];
  });

export const upsertPublicityNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => noticeSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, profile } = context;
    if (profile.role !== "super_admin" && profile.role !== "school_manager" && profile.role !== "staff") {
      throw new Error("Unauthorized to modify publicity notices");
    }
    const school = await resolveProvisionedSchool(supabase, profile);

    const payload = {
      title: data.title,
      summary: data.summary,
      content: data.content,
      label: data.label,
      is_featured: data.isFeatured,
      is_pinned: data.isPinned,
      image_url: data.imageUrl,
      attachment_url: data.attachmentUrl,
      attachment_name: data.attachmentName,
      read_more_link: data.readMoreLink,
      publish_at: data.publishAt,
      expire_at: data.expireAt || null,
      status: data.status,
      created_by: profile.id,
      school_id: school?.id || null,
    };

    if (data.id) {
      const { data: updated, error } = await supabase
        .from("publicity_notices")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return updated;
    } else {
      const { data: inserted, error } = await supabase
        .from("publicity_notices")
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return inserted;
    }
  });

export const deletePublicityNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, profile } = context;
    if (profile.role !== "super_admin" && profile.role !== "school_manager" && profile.role !== "staff") {
      throw new Error("Unauthorized to delete publicity notices");
    }
    const { error } = await supabase.from("publicity_notices").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

// ----------------------------------------------------------------------
// CIRCULARS
// ----------------------------------------------------------------------

export const getPublicityCirculars = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("publicity_circulars")
      .select("*")
      .order("issue_date", { ascending: false });

    if (error) throw new Error(`Failed to load circulars: ${error.message}`);
    return data || [];
  });

export const upsertPublicityCircular = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => circularSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, profile } = context;
    if (profile.role !== "super_admin" && profile.role !== "school_manager" && profile.role !== "staff") {
      throw new Error("Unauthorized to modify circulars");
    }
    const school = await resolveProvisionedSchool(supabase, profile);

    const payload = {
      reference_number: data.referenceNumber,
      title: data.title,
      issuing_department: data.issuingDepartment,
      issue_date: data.issueDate,
      featured_image: data.featuredImage,
      summary: data.summary,
      content: data.content,
      document_url: data.documentUrl,
      document_name: data.documentName,
      external_link: data.externalLink,
      deep_link: data.deepLink,
      visibility: data.visibility,
      is_featured: data.isFeatured,
      status: data.status,
      created_by: profile.id,
      school_id: school?.id || null,
    };

    if (data.id) {
      const { data: updated, error } = await supabase
        .from("publicity_circulars")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return updated;
    } else {
      const { data: inserted, error } = await supabase
        .from("publicity_circulars")
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return inserted;
    }
  });

export const deletePublicityCircular = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, profile } = context;
    if (profile.role !== "super_admin" && profile.role !== "school_manager" && profile.role !== "staff") {
      throw new Error("Unauthorized to delete circulars");
    }
    const { error } = await supabase.from("publicity_circulars").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

// ----------------------------------------------------------------------
// BANNERS
// ----------------------------------------------------------------------

export const getPublicityBanners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("publicity_banners")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to load banners: ${error.message}`);
    return data || [];
  });

export const upsertPublicityBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => bannerSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, profile } = context;
    if (profile.role !== "super_admin" && profile.role !== "school_manager" && profile.role !== "staff") {
      throw new Error("Unauthorized to modify banners");
    }
    const school = await resolveProvisionedSchool(supabase, profile);

    const payload = {
      title: data.title,
      description: data.description,
      placement: data.placement,
      auto_flip: data.autoFlip,
      transition_effect: data.transitionEffect,
      slide_duration: data.slideDuration,
      show_arrows: data.showArrows,
      show_indicators: data.showIndicators,
      show_pause_controls: data.showPauseControls,
      slides: data.slides,
      status: data.status,
      created_by: profile.id,
      school_id: school?.id || null,
    };

    if (data.id) {
      const { data: updated, error } = await supabase
        .from("publicity_banners")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return updated;
    } else {
      const { data: inserted, error } = await supabase
        .from("publicity_banners")
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return inserted;
    }
  });

export const deletePublicityBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, profile } = context;
    if (profile.role !== "super_admin" && profile.role !== "school_manager" && profile.role !== "staff") {
      throw new Error("Unauthorized to delete banners");
    }
    const { error } = await supabase.from("publicity_banners").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

// ----------------------------------------------------------------------
// ARTICLES
// ----------------------------------------------------------------------

export const getPublicityArticles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("publicity_articles")
      .select("*")
      .order("publication_date", { ascending: false });

    if (error) throw new Error(`Failed to load articles: ${error.message}`);
    return data || [];
  });

export const upsertPublicityArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => articleSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, profile } = context;
    if (profile.role !== "super_admin" && profile.role !== "school_manager" && profile.role !== "staff") {
      throw new Error("Unauthorized to modify articles");
    }
    const school = await resolveProvisionedSchool(supabase, profile);

    const payload = {
      title: data.title,
      slug: data.slug,
      headline: data.headline,
      short_summary: data.shortSummary,
      full_content: data.fullContent,
      featured_image: data.featuredImage,
      gallery_images: data.galleryImages,
      attachments: data.attachments,
      action_button_label: data.actionButtonLabel,
      action_button_url: data.actionButtonUrl,
      relevant_details_link: data.relevantDetailsLink,
      author_name: data.authorName,
      author_role: data.authorRole,
      category: data.category,
      publication_date: data.publicationDate,
      seo_title: data.seoTitle,
      seo_keywords: data.seoKeywords,
      is_featured: data.isFeatured,
      is_pinned: data.isPinned,
      status: data.status,
      created_by: profile.id,
      school_id: school?.id || null,
    };

    if (data.id) {
      const { data: updated, error } = await supabase
        .from("publicity_articles")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return updated;
    } else {
      const { data: inserted, error } = await supabase
        .from("publicity_articles")
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return inserted;
    }
  });

export const deletePublicityArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, profile } = context;
    if (profile.role !== "super_admin" && profile.role !== "school_manager" && profile.role !== "staff") {
      throw new Error("Unauthorized to delete articles");
    }
    const { error } = await supabase.from("publicity_articles").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

// ----------------------------------------------------------------------
// MEDIA GALLERY
// ----------------------------------------------------------------------

export const getPublicityMediaGallery = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("publicity_media_gallery")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to load media gallery: ${error.message}`);
    return data || [];
  });

export const upsertPublicityMediaGallery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => mediaGallerySchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, profile } = context;
    if (profile.role !== "super_admin" && profile.role !== "school_manager" && profile.role !== "staff") {
      throw new Error("Unauthorized to modify media gallery");
    }
    const school = await resolveProvisionedSchool(supabase, profile);

    const payload = {
      title: data.title,
      caption: data.caption,
      category: data.category,
      media_type: data.mediaType,
      media_url: data.mediaUrl,
      thumbnail_url: data.thumbnailUrl,
      tags: data.tags,
      is_featured: data.isFeatured,
      status: data.status,
      created_by: profile.id,
      school_id: school?.id || null,
    };

    if (data.id) {
      const { data: updated, error } = await supabase
        .from("publicity_media_gallery")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return updated;
    } else {
      const { data: inserted, error } = await supabase
        .from("publicity_media_gallery")
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return inserted;
    }
  });

export const deletePublicityMediaGallery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, profile } = context;
    if (profile.role !== "super_admin" && profile.role !== "school_manager" && profile.role !== "staff") {
      throw new Error("Unauthorized to delete media gallery items");
    }
    const { error } = await supabase.from("publicity_media_gallery").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

// ----------------------------------------------------------------------
// PUBLIC LANDING DATA FETCH
// ----------------------------------------------------------------------

export const getPublicLandingData = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  const { supabase } = context;

  const [noticesRes, circularsRes, bannersRes, articlesRes, galleryRes] = await Promise.all([
    supabase
      .from("publicity_notices")
      .select("*")
      .eq("status", "published")
      .order("is_pinned", { ascending: false })
      .order("publish_at", { ascending: false }),
    supabase
      .from("publicity_circulars")
      .select("*")
      .eq("status", "published")
      .eq("visibility", "public")
      .order("issue_date", { ascending: false }),
    supabase
      .from("publicity_banners")
      .select("*")
      .eq("status", "published")
      .eq("placement", "landing_hero")
      .limit(1),
    supabase
      .from("publicity_articles")
      .select("*")
      .eq("status", "published")
      .order("is_pinned", { ascending: false })
      .order("publication_date", { ascending: false }),
    supabase
      .from("publicity_media_gallery")
      .select("*")
      .eq("status", "published")
      .order("created_at", { ascending: false }),
  ]);

  return {
    notices: noticesRes.data || [],
    circulars: circularsRes.data || [],
    heroBanner: bannersRes.data?.[0] || null,
    articles: articlesRes.data || [],
    gallery: galleryRes.data || [],
  };
});
