-- ============================================================
-- Messaging System: conversations, messages, members, read tracking
-- ============================================================

-- conversations: DMs and channels unified
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('dm', 'channel')),
  name text, -- NULL for DMs, required for channels
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_must_have_name CHECK (type != 'channel' OR name IS NOT NULL)
);

CREATE INDEX idx_conversations_practice ON conversations(practice_id);
CREATE INDEX idx_conversations_updated ON conversations(practice_id, updated_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- conversation_members: who belongs to each conversation
CREATE TABLE conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, profile_id)
);

CREATE INDEX idx_conversation_members_profile ON conversation_members(profile_id, practice_id);

ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;

-- messages
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) <= 4000),
  mentions uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at ASC);
CREATE INDEX idx_messages_practice ON messages(practice_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- conversation_last_seen: per-user read tracking
CREATE TABLE conversation_last_seen (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, profile_id)
);

CREATE INDEX idx_conversation_last_seen_profile
  ON conversation_last_seen(profile_id, conversation_id);

ALTER TABLE conversation_last_seen ENABLE ROW LEVEL SECURITY;

-- Helper table for DM uniqueness: stores sorted pair of profile IDs
-- Prevents duplicate DM conversations between the same two users
CREATE TABLE dm_pairs (
  conversation_id uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  profile_a uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  profile_b uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT dm_pairs_sorted CHECK (profile_a < profile_b),
  CONSTRAINT dm_pairs_unique UNIQUE (practice_id, profile_a, profile_b)
);

ALTER TABLE dm_pairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read dm pairs"
  ON dm_pairs FOR SELECT
  USING (practice_id = get_practice_id() AND (profile_a = auth.uid() OR profile_b = auth.uid()));

CREATE POLICY "Users can insert dm pairs"
  ON dm_pairs FOR INSERT
  WITH CHECK (practice_id = get_practice_id() AND (profile_a = auth.uid() OR profile_b = auth.uid()));

-- ============================================================
-- Trigger: bump conversations.updated_at on new message
-- ============================================================
CREATE OR REPLACE FUNCTION bump_conversation_updated_at()
RETURNS trigger AS $$
BEGIN
  UPDATE conversations SET updated_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_message_insert
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION bump_conversation_updated_at();

-- ============================================================
-- Helper: check conversation membership without triggering RLS recursion
-- ============================================================
CREATE OR REPLACE FUNCTION is_conversation_member(conv_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id = conv_id
      AND profile_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if current user created a conversation (bypasses RLS)
CREATE OR REPLACE FUNCTION is_conversation_creator(conv_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversations
    WHERE id = conv_id
      AND created_by = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- RLS Policies
-- ============================================================

-- conversations: members or creator can read
CREATE POLICY "Members can read conversations"
  ON conversations FOR SELECT
  USING (
    practice_id = get_practice_id()
    AND (is_conversation_member(id) OR created_by = auth.uid())
  );

CREATE POLICY "Users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (practice_id = get_practice_id() AND created_by = auth.uid());

CREATE POLICY "Creator or admin can update conversations"
  ON conversations FOR UPDATE
  USING (practice_id = get_practice_id() AND (created_by = auth.uid() OR is_admin()));

-- conversation_members: can see members of your conversations
CREATE POLICY "Members can read conversation members"
  ON conversation_members FOR SELECT
  USING (practice_id = get_practice_id() AND is_conversation_member(conversation_id));

-- Only conversation creators and admins can add members
CREATE POLICY "Creators and admins can add conversation members"
  ON conversation_members FOR INSERT
  WITH CHECK (
    practice_id = get_practice_id()
    AND (is_conversation_creator(conversation_id) OR is_admin())
  );

-- Users can leave conversations; admins can remove anyone
CREATE POLICY "Users can leave or admins can remove members"
  ON conversation_members FOR DELETE
  USING (
    practice_id = get_practice_id()
    AND (profile_id = auth.uid() OR is_admin())
  );

-- messages: members can read and send
CREATE POLICY "Members can read messages"
  ON messages FOR SELECT
  USING (practice_id = get_practice_id() AND is_conversation_member(conversation_id));

CREATE POLICY "Members can send messages"
  ON messages FOR INSERT
  WITH CHECK (
    practice_id = get_practice_id()
    AND sender_id = auth.uid()
    AND is_conversation_member(conversation_id)
  );

-- conversation_last_seen: self-only
CREATE POLICY "Users can read own last seen"
  ON conversation_last_seen FOR SELECT
  USING (profile_id = auth.uid() AND practice_id = get_practice_id());

CREATE POLICY "Users can insert own last seen"
  ON conversation_last_seen FOR INSERT
  WITH CHECK (profile_id = auth.uid() AND practice_id = get_practice_id());

CREATE POLICY "Users can update own last seen"
  ON conversation_last_seen FOR UPDATE
  USING (profile_id = auth.uid() AND practice_id = get_practice_id());

-- ============================================================
-- Enable Realtime on messages table
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ============================================================
-- Seed: Create a "General" channel for each existing practice
-- ============================================================
DO $$
DECLARE
  p RECORD;
  admin_id uuid;
  conv_id uuid;
  member RECORD;
BEGIN
  FOR p IN SELECT id FROM practices WHERE is_active = true LOOP
    -- Find an admin in this practice to be the creator
    SELECT id INTO admin_id FROM profiles
      WHERE practice_id = p.id AND role = 'admin' AND is_active = true
      LIMIT 1;

    IF admin_id IS NULL THEN
      -- Fallback to any active user
      SELECT id INTO admin_id FROM profiles
        WHERE practice_id = p.id AND is_active = true
        LIMIT 1;
    END IF;

    IF admin_id IS NOT NULL THEN
      conv_id := gen_random_uuid();

      INSERT INTO conversations (id, practice_id, type, name, created_by)
        VALUES (conv_id, p.id, 'channel', 'General', admin_id);

      -- Add all active members of this practice
      FOR member IN SELECT id FROM profiles WHERE practice_id = p.id AND is_active = true LOOP
        INSERT INTO conversation_members (conversation_id, profile_id, practice_id)
          VALUES (conv_id, member.id, p.id);
      END LOOP;
    END IF;
  END LOOP;
END $$;
