/**
 * Pure video parsing & embed helpers for enterprise lessons.
 * Supports YouTube, Vimeo, MP4 direct video URLs, and web video fallbacks.
 */

export interface VideoMeta {
  url: string;
  type: "youtube" | "vimeo" | "direct" | "unknown";
  embedUrl: string | null;
  isValid: boolean;
}

export function parseVideoUrl(rawUrl: string): VideoMeta {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { url: "", type: "unknown", embedUrl: null, isValid: false };
  }

  const trimmed = rawUrl.trim();

  // YouTube match
  const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const ytMatch = trimmed.match(ytRegex);
  if (ytMatch && ytMatch[1]) {
    return {
      url: trimmed,
      type: "youtube",
      embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?rel=0&autoplay=0`,
      isValid: true,
    };
  }

  // Vimeo match
  const vimeoRegex = /(?:vimeo\.com\/)(?:channels\/(?:\w+\/)?|groups\/[^\/]*\/videos\/|album\/\d+\/video\/|video\/|)(\d+)/;
  const vimeoMatch = trimmed.match(vimeoRegex);
  if (vimeoMatch && vimeoMatch[1]) {
    return {
      url: trimmed,
      type: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
      isValid: true,
    };
  }

  // Direct MP4 / WebM
  if (/\.(mp4|webm|ogg)$/i.test(trimmed)) {
    return {
      url: trimmed,
      type: "direct",
      embedUrl: trimmed,
      isValid: true,
    };
  }

  // Generic HTTP/HTTPS URL
  if (/^https?:\/\//i.test(trimmed)) {
    return {
      url: trimmed,
      type: "unknown",
      embedUrl: trimmed,
      isValid: true,
    };
  }

  return { url: trimmed, type: "unknown", embedUrl: null, isValid: false };
}

/**
 * Calculates student progress statistics for lessons in a class or subject.
 */
export function calculateLessonProgress(
  lessons: { id: string }[],
  completions: { lesson_id: string }[],
): { total: number; completed: number; percent: number } {
  const total = lessons.length;
  if (total === 0) return { total: 0, completed: 0, percent: 100 };

  const completedIds = new Set(completions.map((c) => c.lesson_id));
  const completed = lessons.filter((l) => completedIds.has(l.id)).length;
  const percent = Math.round((completed / total) * 100);

  return { total, completed, percent };
}
