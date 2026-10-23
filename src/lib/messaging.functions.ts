import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveProvisionedSchool } from "@/lib/school.server";
import { OPS_FEATURE_KEY } from "@/lib/operations-rules";
import { extractMessagingPolicies, validateMessageLength } from "./messaging";
import {
  announcementSchema,
  createConversationSchema,
  sendDirectMessageSchema,
} from "./messaging.schemas";
import { z } from "zod";

// ----------------------------------------------------------------------
// CONFIGURATION & RULES
// ----------------------------------------------------------------------

export const getMessagingConfigAndRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, profile } = context;

    const { data: tenantSettings } = await supabase
      .from("tenant_settings")
      .select("features")
      .maybeSingle();

    const opsRaw = tenantSettings?.features?.[OPS_FEATURE_KEY] ?? null;
    const policies = extractMessagingPolicies(opsRaw);

    return {
      policies,
      profile: {
        id: profile.id,
        role: profile.role,
        fullName: profile.full_name || profile.email,
        email: profile.email,
      },
    };
  });

// ----------------------------------------------------------------------
// ANNOUNCEMENTS
// ----------------------------------------------------------------------

export const getAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, profile } = context;

    const { data, error } = await supabase
      .from("messaging_announcements")
      .select(`
        *,
        messaging_announcement_reads(id, user_id, read_at)
      `)
      .order("is_pinned", { ascending: false })
      .order("publish_at", { ascending: false });

    if (error) throw new Error(`Failed to load announcements: ${error.message}`);

    const formatted = (data || []).map((ann: any) => {
      const reads = ann.messaging_announcement_reads || [];
      const userHasRead = reads.some((r: any) => r.user_id === profile.id);
      return {
        ...ann,
        user_has_read: userHasRead,
        read_count: reads.length,
      };
    });

    return formatted;
  });

export const upsertAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => announcementSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, profile } = context;
    if (profile.role !== "super_admin" && profile.role !== "school_manager" && profile.role !== "staff") {
      throw new Error("Unauthorized to create or edit announcements.");
    }

    const school = await resolveProvisionedSchool(supabase, profile);

    const payload = {
      title: data.title,
      summary: data.summary,
      content: data.content,
      audience: data.audience,
      target_role: data.targetRole || "",
      target_class_id: data.targetClassId || null,
      priority: data.priority,
      channels: data.channels,
      attachment_url: data.attachmentUrl || "",
      attachment_name: data.attachmentName || "",
      is_pinned: data.isPinned,
      publish_at: data.publishAt,
      expire_at: data.expireAt || null,
      status: data.status,
      created_by: profile.id,
      school_id: school?.id || null,
    };

    if (data.id) {
      const { data: updated, error } = await supabase
        .from("messaging_announcements")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return updated;
    } else {
      const { data: inserted, error } = await supabase
        .from("messaging_announcements")
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return inserted;
    }
  });

export const deleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, profile } = context;
    if (profile.role !== "super_admin" && profile.role !== "school_manager" && profile.role !== "staff") {
      throw new Error("Unauthorized to delete announcements.");
    }

    const { error } = await supabase.from("messaging_announcements").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const markAnnouncementRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ announcementId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, profile } = context;

    const { error } = await supabase.from("messaging_announcement_reads").upsert(
      {
        announcement_id: data.announcementId,
        user_id: profile.id,
        read_at: new Date().toISOString(),
      },
      { onConflict: "announcement_id,user_id" }
    );

    if (error) throw new Error(error.message);
    return { success: true };
  });

// ----------------------------------------------------------------------
// DIRECT MESSAGES & CONVERSATIONS
// ----------------------------------------------------------------------

export const getConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, profile } = context;

    // Load conversations caller is participant in
    const { data: participantRows, error: partError } = await supabase
      .from("messaging_conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", profile.id);

    if (partError) throw new Error(`Failed to load user conversations: ${partError.message}`);

    const convIds = (participantRows || []).map((p: any) => p.conversation_id);
    if (!convIds.length) return [];

    const { data: convs, error: convError } = await supabase
      .from("messaging_conversations")
      .select(`
        *,
        messaging_conversation_participants(
          user_id,
          role,
          last_read_at,
          profiles:user_id(id, full_name, email, role)
        )
      `)
      .in("id", convIds)
      .order("last_message_at", { ascending: false });

    if (convError) throw new Error(`Failed to load conversation details: ${convError.message}`);

    const result = (convs || []).map((c: any) => {
      const myPart = participantRows.find((p: any) => p.conversation_id === c.id);
      const lastRead = myPart?.last_read_at ? new Date(myPart.last_read_at).getTime() : 0;
      const lastMsg = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
      const unread = lastMsg > lastRead ? 1 : 0;

      const participants = (c.messaging_conversation_participants || []).map((p: any) => ({
        id: p.user_id,
        role: p.role,
        fullName: p.profiles?.full_name || p.profiles?.email || "Unknown User",
        email: p.profiles?.email,
        userRole: p.profiles?.role,
      }));

      return {
        id: c.id,
        title: c.title,
        is_group: c.is_group,
        last_message_at: c.last_message_at,
        last_message_preview: c.last_message_preview,
        unread_count: unread,
        participants,
      };
    });

    return result;
  });

export const getDirectMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;

    const { data: messages, error } = await supabase
      .from("messaging_direct_messages")
      .select(`
        *,
        sender:sender_id(id, full_name, email, role)
      `)
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(`Failed to load messages: ${error.message}`);
    return messages || [];
  });

export const startConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => createConversationSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, profile } = context;

    // Enforce Operations Configuration rule for direct messages
    const { data: tenantSettings } = await supabase
      .from("tenant_settings")
      .select("features")
      .maybeSingle();

    const opsRaw = tenantSettings?.features?.[OPS_FEATURE_KEY] ?? null;
    const policies = extractMessagingPolicies(opsRaw);

    if (!policies.directMessagesEnabled) {
      throw new Error("Direct messaging is currently disabled by Operations Configuration policy.");
    }

    const school = await resolveProvisionedSchool(supabase, profile);

    // Create conversation record
    const { data: conv, error: convErr } = await supabase
      .from("messaging_conversations")
      .insert({
        school_id: school?.id || null,
        title: data.title || "",
        is_group: data.isGroup || false,
        created_by: profile.id,
      })
      .select()
      .single();

    if (convErr) throw new Error(`Failed to create conversation: ${convErr.message}`);

    // Add current user + requested recipients as participants
    const allUserIds = Array.from(new Set([profile.id, ...data.participantUserIds]));
    const participantsPayload = allUserIds.map((uid) => ({
      conversation_id: conv.id,
      user_id: uid,
      role: uid === profile.id ? "owner" : "member",
    }));

    const { error: partErr } = await supabase
      .from("messaging_conversation_participants")
      .insert(participantsPayload);

    if (partErr) throw new Error(`Failed to add participants: ${partErr.message}`);

    return conv;
  });

export const sendDirectMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => sendDirectMessageSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, profile } = context;

    // Load tenant rules to check direct-messages toggle & max-length limit
    const { data: tenantSettings } = await supabase
      .from("tenant_settings")
      .select("features")
      .maybeSingle();

    const opsRaw = tenantSettings?.features?.[OPS_FEATURE_KEY] ?? null;
    const policies = extractMessagingPolicies(opsRaw);

    if (!policies.directMessagesEnabled) {
      throw new Error("Direct messaging is currently disabled by Operations Configuration policy.");
    }

    const lengthCheck = validateMessageLength(data.content, policies.maxMessageLength);
    if (!lengthCheck.valid) {
      throw new Error(lengthCheck.error || "Message content length is invalid.");
    }

    // Insert message
    const { data: msg, error: msgErr } = await supabase
      .from("messaging_direct_messages")
      .insert({
        conversation_id: data.conversationId,
        sender_id: profile.id,
        content: data.content,
        attachment_url: data.attachmentUrl || "",
        attachment_name: data.attachmentName || "",
      })
      .select()
      .single();

    if (msgErr) throw new Error(`Failed to send message: ${msgErr.message}`);

    // Update conversation last message timestamp & preview
    const preview = data.content.length > 80 ? `${data.content.slice(0, 80)}...` : data.content;
    const nowIso = new Date().toISOString();

    await supabase
      .from("messaging_conversations")
      .update({
        last_message_at: nowIso,
        last_message_preview: preview,
      })
      .eq("id", data.conversationId);

    // Update current sender's last read timestamp
    await supabase
      .from("messaging_conversation_participants")
      .update({ last_read_at: nowIso })
      .eq("conversation_id", data.conversationId)
      .eq("user_id", profile.id);

    return msg;
  });

export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, profile } = context;

    const { error } = await supabase
      .from("messaging_conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", data.conversationId)
      .eq("user_id", profile.id);

    if (error) throw new Error(error.message);
    return { success: true };
  });

// ----------------------------------------------------------------------
// RECIPIENT DISCOVERY
// ----------------------------------------------------------------------

export const getEligibleRecipients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, profile } = context;

    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .neq("id", profile.id)
      .order("full_name", { ascending: true })
      .limit(100);

    if (error) throw new Error(`Failed to load eligible recipients: ${error.message}`);

    return (profiles || []).map((p: any) => ({
      id: p.id,
      fullName: p.full_name || p.email,
      email: p.email,
      role: p.role,
    }));
  });
