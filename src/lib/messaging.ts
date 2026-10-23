import { OpsRules, opsValue, opsList, parseOpsRules } from "./operations-rules";
import {
  AnnouncementInput,
  AnnouncementPriority,
  SendDirectMessageInput,
} from "./messaging.schemas";

export interface MessagingPolicies {
  directMessagesEnabled: boolean;
  maxMessageLength: number;
  announcementVisibilityDays: number;
  configuredChannels: string[];
  configuredAudiences: string[];
}

/** Extracts authoritative messaging policies from Operations Configuration rules. */
export function extractMessagingPolicies(opsRulesRaw: unknown): MessagingPolicies {
  const rules: OpsRules = parseOpsRules(opsRulesRaw);

  const directMsgsVal = opsValue(rules, "messaging", "direct-messages");
  const maxLenVal = opsValue(rules, "messaging", "max-length");
  const visibilityVal = opsValue(rules, "messaging", "announcement-days");

  return {
    directMessagesEnabled: typeof directMsgsVal === "boolean" ? directMsgsVal : true,
    maxMessageLength: typeof maxLenVal === "number" ? Math.max(10, maxLenVal) : 2000,
    announcementVisibilityDays: typeof visibilityVal === "number" ? Math.max(1, visibilityVal) : 30,
    configuredChannels: opsList(rules, "messagingChannels"),
    configuredAudiences: opsList(rules, "audiences"),
  };
}

/** Validates whether a direct message content exceeds the Operations Configuration max length limit. */
export function validateMessageLength(content: string, maxLen: number): { valid: boolean; length: number; error?: string } {
  const len = content.trim().length;
  if (len === 0) {
    return { valid: false, length: 0, error: "Message content cannot be empty." };
  }
  if (len > maxLen) {
    return { valid: false, length: len, error: `Message exceeds the configured maximum length of ${maxLen} characters (${len}/${maxLen}).` };
  }
  return { valid: true, length: len };
}

/** Evaluates whether an announcement is active and visible given publish date, expire date, and visibility rules. */
export function isAnnouncementActive(
  publishAt: string | Date,
  expireAt?: string | Date | null,
  visibilityDays = 30,
  now = new Date()
): boolean {
  const pub = new Date(publishAt);
  if (isNaN(pub.getTime()) || pub > now) return false;

  if (expireAt) {
    const exp = new Date(expireAt);
    if (!isNaN(exp.getTime()) && exp <= now) return false;
  } else {
    // If no explicit expire date is set, apply default visibility days limit from Operations Configuration
    const autoExpire = new Date(pub.getTime() + visibilityDays * 24 * 60 * 60 * 1000);
    if (autoExpire <= now) return false;
  }

  return true;
}

/** Determines if a user role/class matches an announcement target audience. */
export function isUserInAnnouncementAudience(
  userRole: string,
  userClassId: string | null | undefined,
  announcement: { audience: string; target_role?: string | null; target_class_id?: string | null }
): boolean {
  if (userRole === "super_admin" || userRole === "school_manager") return true;

  const audience = (announcement.audience || "Everyone").toLowerCase();
  const targetRole = (announcement.target_role || "").toLowerCase();
  const targetClassId = announcement.target_class_id || null;

  if (targetClassId && userClassId) {
    return targetClassId === userClassId;
  }

  if (targetRole && targetRole !== userRole.toLowerCase()) {
    return false;
  }

  if (audience === "everyone") return true;
  if (audience === "staff" && userRole === "staff") return true;
  if (audience === "parents" && userRole === "parent") return true;
  if (audience === "students" && userRole === "student") return true;

  return audience === userRole.toLowerCase();
}

/** Aggregates analytics metrics across announcements and conversations. */
export interface MessagingAnalytics {
  totalAnnouncements: number;
  activeAnnouncements: number;
  draftAnnouncements: number;
  totalConversations: number;
  totalUnreadMessages: number;
  priorityDistribution: Record<AnnouncementPriority, number>;
  channelDistribution: Record<string, number>;
}

export function calculateMessagingAnalytics(data: {
  announcements: any[];
  conversations: any[];
  policies: MessagingPolicies;
  now?: Date;
}): MessagingAnalytics {
  const now = data.now || new Date();

  const activeAnnouncements = data.announcements.filter(
    (a) => a.status === "published" && isAnnouncementActive(a.publish_at, a.expire_at, data.policies.announcementVisibilityDays, now)
  ).length;

  const draftAnnouncements = data.announcements.filter((a) => a.status === "draft").length;

  const totalUnreadMessages = data.conversations.reduce((acc, conv) => acc + (conv.unread_count || 0), 0);

  const priorityDistribution: Record<AnnouncementPriority, number> = {
    low: 0,
    normal: 0,
    high: 0,
    urgent: 0,
  };

  const channelDistribution: Record<string, number> = {};

  for (const ann of data.announcements) {
    const p = (ann.priority || "normal") as AnnouncementPriority;
    if (priorityDistribution[p] !== undefined) {
      priorityDistribution[p]++;
    }

    const channels: string[] = Array.isArray(ann.channels) ? ann.channels : ["In-app"];
    for (const ch of channels) {
      channelDistribution[ch] = (channelDistribution[ch] || 0) + 1;
    }
  }

  return {
    totalAnnouncements: data.announcements.length,
    activeAnnouncements,
    draftAnnouncements,
    totalConversations: data.conversations.length,
    totalUnreadMessages,
    priorityDistribution,
    channelDistribution,
  };
}

export const PRIORITY_BADGE_CLASSES: Record<AnnouncementPriority, string> = {
  urgent: "bg-destructive/10 text-destructive border-destructive/20",
  high: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  normal: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  low: "bg-slate-500/10 text-slate-600 border-slate-500/20",
};
