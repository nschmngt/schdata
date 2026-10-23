import { describe, it, expect } from "vitest";
import {
  extractMessagingPolicies,
  validateMessageLength,
  isAnnouncementActive,
  isUserInAnnouncementAudience,
  calculateMessagingAnalytics,
} from "../lib/messaging";
import {
  announcementSchema,
  createConversationSchema,
  sendDirectMessageSchema,
} from "../lib/messaging.schemas";

describe("Messaging Module - Operations Configuration Integration", () => {
  it("extracts messaging policies correctly from Operations rules", () => {
    const mockOpsRules = {
      version: 1,
      requiredDocuments: [],
      genders: [],
      messagingChannels: ["In-app", "Email", "SMS", "Push"],
      audiences: ["Everyone", "Staff", "Parents", "Students", "Alumni"],
      admissions: [],
      library: [],
      messaging: [
        { key: "direct-messages", label: "Allow direct messages", value: true },
        { key: "max-length", label: "Maximum message length", value: 500, unit: "chars" },
        { key: "announcement-days", label: "Announcements stay visible for", value: 14, unit: "days" },
      ],
    };

    const policies = extractMessagingPolicies(mockOpsRules);

    expect(policies.directMessagesEnabled).toBe(true);
    expect(policies.maxMessageLength).toBe(500);
    expect(policies.announcementVisibilityDays).toBe(14);
    expect(policies.configuredChannels).toEqual(["In-app", "Email", "SMS", "Push"]);
    expect(policies.configuredAudiences).toEqual(["Everyone", "Staff", "Parents", "Students", "Alumni"]);
  });

  it("handles disabled direct messaging rule in Operations Configuration", () => {
    const mockOpsRules = {
      version: 1,
      requiredDocuments: [],
      genders: [],
      messagingChannels: ["In-app"],
      audiences: ["Everyone"],
      admissions: [],
      library: [],
      messaging: [
        { key: "direct-messages", label: "Allow direct messages", value: false },
        { key: "max-length", label: "Maximum message length", value: 1000 },
        { key: "announcement-days", label: "Announcements stay visible for", value: 30 },
      ],
    };

    const policies = extractMessagingPolicies(mockOpsRules);
    expect(policies.directMessagesEnabled).toBe(false);
  });
});

describe("Messaging Module - Direct Message Length Validation", () => {
  it("validates messages within length limits", () => {
    const res = validateMessageLength("Hello world", 100);
    expect(res.valid).toBe(true);
    expect(res.length).toBe(11);
    expect(res.error).toBeUndefined();
  });

  it("rejects empty messages", () => {
    const res = validateMessageLength("   ", 100);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("cannot be empty");
  });

  it("rejects messages exceeding configured max length", () => {
    const longText = "A".repeat(150);
    const res = validateMessageLength(longText, 100);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("exceeds the configured maximum length of 100 characters");
  });
});

describe("Messaging Module - Announcement Lifecycle & Audience Scoping", () => {
  it("evaluates announcement active state accurately", () => {
    const now = new Date("2025-03-01T10:00:00Z");
    const pubDate = "2025-02-25T10:00:00Z";

    // Active within 30 days
    expect(isAnnouncementActive(pubDate, null, 30, now)).toBe(true);

    // Expired past explicit expire date
    const expiredDate = "2025-02-28T10:00:00Z";
    expect(isAnnouncementActive(pubDate, expiredDate, 30, now)).toBe(false);

    // Auto-expired past visibility days limit
    const oldPubDate = "2025-01-01T10:00:00Z";
    expect(isAnnouncementActive(oldPubDate, null, 30, now)).toBe(false);
  });

  it("evaluates audience visibility rules correctly", () => {
    const annEveryone = { audience: "Everyone" };
    const annStaffOnly = { audience: "Staff" };
    const annParentsOnly = { audience: "Parents" };

    // Super admin & managers see everything
    expect(isUserInAnnouncementAudience("super_admin", null, annStaffOnly)).toBe(true);
    expect(isUserInAnnouncementAudience("school_manager", null, annParentsOnly)).toBe(true);

    // Staff sees Everyone & Staff
    expect(isUserInAnnouncementAudience("staff", null, annEveryone)).toBe(true);
    expect(isUserInAnnouncementAudience("staff", null, annStaffOnly)).toBe(true);
    expect(isUserInAnnouncementAudience("staff", null, annParentsOnly)).toBe(false);

    // Student sees Everyone but not Parents
    expect(isUserInAnnouncementAudience("student", null, annEveryone)).toBe(true);
    expect(isUserInAnnouncementAudience("student", null, annParentsOnly)).toBe(false);
  });
});

describe("Messaging Module - Analytics Aggregation", () => {
  it("computes messaging analytics metrics correctly", () => {
    const now = new Date("2025-03-01T10:00:00Z");
    const policies = {
      directMessagesEnabled: true,
      maxMessageLength: 2000,
      announcementVisibilityDays: 30,
      configuredChannels: ["In-app", "Email"],
      configuredAudiences: ["Everyone", "Staff"],
    };

    const mockAnnouncements = [
      { id: "1", status: "published", priority: "urgent", publish_at: "2025-02-28T10:00:00Z", channels: ["In-app", "Email"] },
      { id: "2", status: "published", priority: "normal", publish_at: "2025-02-20T10:00:00Z", channels: ["In-app"] },
      { id: "3", status: "draft", priority: "low", publish_at: "2025-03-05T10:00:00Z", channels: ["SMS"] },
    ];

    const mockConversations = [
      { id: "c1", unread_count: 2 },
      { id: "c2", unread_count: 0 },
    ];

    const analytics = calculateMessagingAnalytics({
      announcements: mockAnnouncements,
      conversations: mockConversations,
      policies,
      now,
    });

    expect(analytics.totalAnnouncements).toBe(3);
    expect(analytics.activeAnnouncements).toBe(2);
    expect(analytics.draftAnnouncements).toBe(1);
    expect(analytics.totalConversations).toBe(2);
    expect(analytics.totalUnreadMessages).toBe(2);
    expect(analytics.priorityDistribution.urgent).toBe(1);
    expect(analytics.priorityDistribution.normal).toBe(1);
    expect(analytics.channelDistribution["In-app"]).toBe(2);
    expect(analytics.channelDistribution["Email"]).toBe(1);
  });
});

describe("Messaging Module - Zod Schema Validations", () => {
  it("validates valid announcement payload", () => {
    const payload = {
      title: "Staff Briefing Meeting",
      summary: "Important agenda for end of term",
      content: "All teachers are requested to gather in the main auditorium at 2:00 PM.",
      audience: "Staff",
      priority: "high",
      channels: ["In-app", "Email"],
      isPinned: true,
      status: "published",
    };

    const res = announcementSchema.safeParse(payload);
    expect(res.success).toBe(true);
  });

  it("rejects announcement with empty title or content", () => {
    const payload = {
      title: " ",
      content: " ",
    };

    const res = announcementSchema.safeParse(payload);
    expect(res.success).toBe(false);
  });

  it("validates direct message input payload", () => {
    const payload = {
      conversationId: "123e4567-e89b-12d3-a456-426614174000",
      content: "Thank you for the update.",
    };

    const res = sendDirectMessageSchema.safeParse(payload);
    expect(res.success).toBe(true);
  });

  it("validates conversation creation payload", () => {
    const payload = {
      participantUserIds: ["123e4567-e89b-12d3-a456-426614174000"],
      title: "Parent-Teacher Query",
      isGroup: false,
    };

    const res = createConversationSchema.safeParse(payload);
    expect(res.success).toBe(true);
  });
});
