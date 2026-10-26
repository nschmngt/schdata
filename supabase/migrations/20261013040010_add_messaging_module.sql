-- Create Messaging Module Tables

-- 1. Announcements
CREATE TABLE public.messaging_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT 'Everyone',
  target_role text NOT NULL DEFAULT '',
  target_class_id uuid REFERENCES public.school_classes(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  channels jsonb NOT NULL DEFAULT '["In-app"]'::jsonb,
  attachment_url text NOT NULL DEFAULT '',
  attachment_name text NOT NULL DEFAULT '',
  is_pinned boolean NOT NULL DEFAULT false,
  publish_at timestamptz NOT NULL DEFAULT now(),
  expire_at timestamptz,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Announcement Read Receipts
CREATE TABLE public.messaging_announcement_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.messaging_announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

-- 3. Conversations (Threads for 1-on-1 and Group DMs)
CREATE TABLE public.messaging_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  is_group boolean NOT NULL DEFAULT false,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_preview text NOT NULL DEFAULT '',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Conversation Participants
CREATE TABLE public.messaging_conversation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.messaging_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

-- Security definer helper function to safely check participation without infinite RLS recursion
CREATE OR REPLACE FUNCTION private.is_conversation_participant(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.messaging_conversation_participants
    WHERE conversation_id = _conversation_id AND user_id = _user_id
  );
$$;

REVOKE ALL ON FUNCTION private.is_conversation_participant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_conversation_participant(uuid, uuid) TO authenticated, service_role;

-- 5. Direct Messages
CREATE TABLE public.messaging_direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.messaging_conversations(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  content text NOT NULL DEFAULT '',
  attachment_url text NOT NULL DEFAULT '',
  attachment_name text NOT NULL DEFAULT '',
  is_edited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX messaging_announcements_status_idx ON public.messaging_announcements(status, publish_at DESC);
CREATE INDEX messaging_announcements_school_idx ON public.messaging_announcements(school_id);
CREATE INDEX messaging_announcement_reads_user_idx ON public.messaging_announcement_reads(user_id, announcement_id);

CREATE INDEX messaging_conversations_school_idx ON public.messaging_conversations(school_id, last_message_at DESC);
CREATE INDEX messaging_participants_user_idx ON public.messaging_conversation_participants(user_id, conversation_id);
CREATE INDEX messaging_direct_messages_conv_idx ON public.messaging_direct_messages(conversation_id, created_at ASC);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messaging_announcements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messaging_announcement_reads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messaging_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messaging_conversation_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messaging_direct_messages TO authenticated;

GRANT ALL ON public.messaging_announcements TO service_role;
GRANT ALL ON public.messaging_announcement_reads TO service_role;
GRANT ALL ON public.messaging_conversations TO service_role;
GRANT ALL ON public.messaging_conversation_participants TO service_role;
GRANT ALL ON public.messaging_direct_messages TO service_role;

-- RLS
ALTER TABLE public.messaging_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_direct_messages ENABLE ROW LEVEL SECURITY;

-- Announcement Policies
CREATE POLICY "authenticated view announcements" ON public.messaging_announcements FOR SELECT TO authenticated
  USING (status = 'published' OR private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "admins manage messaging_announcements" ON public.messaging_announcements FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY "staff manage messaging_announcements" ON public.messaging_announcements FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'staff'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'staff'::app_role));

-- Read Receipt Policies
CREATE POLICY "users manage own announcement reads" ON public.messaging_announcement_reads FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "admins view all announcement reads" ON public.messaging_announcement_reads FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()));

-- Conversation & Participant Policies
CREATE POLICY "participants view conversations" ON public.messaging_conversations FOR SELECT TO authenticated
  USING (
    private.is_conversation_participant(id, auth.uid()) OR private.is_admin(auth.uid())
  );

CREATE POLICY "authenticated create conversations" ON public.messaging_conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "participants manage conversations" ON public.messaging_conversations FOR UPDATE TO authenticated
  USING (
    private.is_conversation_participant(id, auth.uid()) OR private.is_admin(auth.uid())
  );

CREATE POLICY "view participants in my conversations" ON public.messaging_conversation_participants FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    private.is_conversation_participant(conversation_id, auth.uid()) OR
    private.is_admin(auth.uid())
  );

CREATE POLICY "create participants" ON public.messaging_conversation_participants FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR
    private.is_conversation_participant(conversation_id, auth.uid()) OR
    private.is_admin(auth.uid())
  );

CREATE POLICY "manage participants" ON public.messaging_conversation_participants FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid() OR
    private.is_conversation_participant(conversation_id, auth.uid()) OR
    private.is_admin(auth.uid())
  );

CREATE POLICY "delete participants" ON public.messaging_conversation_participants FOR DELETE TO authenticated
  USING (
    user_id = auth.uid() OR
    private.is_conversation_participant(conversation_id, auth.uid()) OR
    private.is_admin(auth.uid())
  );

-- Direct Messages Policies
CREATE POLICY "view direct messages in conversation" ON public.messaging_direct_messages FOR SELECT TO authenticated
  USING (
    private.is_conversation_participant(conversation_id, auth.uid()) OR private.is_admin(auth.uid())
  );

CREATE POLICY "send direct messages to joined conversation" ON public.messaging_direct_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    (private.is_conversation_participant(conversation_id, auth.uid()) OR private.is_admin(auth.uid()))
  );

-- Triggers for updated_at
CREATE TRIGGER set_updated_at_messaging_announcements BEFORE UPDATE ON public.messaging_announcements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_messaging_conversations BEFORE UPDATE ON public.messaging_conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_messaging_direct_messages BEFORE UPDATE ON public.messaging_direct_messages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
