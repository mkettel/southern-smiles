-- ============================================================
-- Migration 026: Changelog
-- A simple practice-scoped log of updates/announcements that
-- admins author. Each entry has a visibility level controlling
-- whether it's admin-only or visible to all employees. Per-user
-- read tracking drives an unread-count badge in the UI.
-- ============================================================

CREATE TABLE changelog_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) <= 200),
  body jsonb NOT NULL,
  image_url text,
  tags text[] NOT NULL DEFAULT '{}',
  visibility text NOT NULL DEFAULT 'admin' CHECK (visibility IN ('admin', 'everyone')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_changelog_practice_created
  ON changelog_entries(practice_id, created_at DESC);

ALTER TABLE changelog_entries ENABLE ROW LEVEL SECURITY;

-- Per-user read state. One row per (entry, profile) pair the user has read.
CREATE TABLE changelog_reads (
  entry_id uuid NOT NULL REFERENCES changelog_entries(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, profile_id)
);

CREATE INDEX idx_changelog_reads_profile
  ON changelog_reads(profile_id, practice_id);

ALTER TABLE changelog_reads ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- ============================================================

-- Admins see everything in their practice; employees only see 'everyone' entries.
CREATE POLICY "Visible changelog entries"
  ON changelog_entries FOR SELECT
  USING (
    practice_id = get_practice_id()
    AND (is_admin() OR visibility = 'everyone')
  );

CREATE POLICY "Admins can insert changelog entries"
  ON changelog_entries FOR INSERT
  WITH CHECK (
    practice_id = get_practice_id()
    AND is_admin()
    AND author_id = auth.uid()
  );

CREATE POLICY "Admins can update changelog entries"
  ON changelog_entries FOR UPDATE
  USING (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins can delete changelog entries"
  ON changelog_entries FOR DELETE
  USING (practice_id = get_practice_id() AND is_admin());

-- changelog_reads: self-only
CREATE POLICY "Users can read own changelog reads"
  ON changelog_reads FOR SELECT
  USING (profile_id = auth.uid() AND practice_id = get_practice_id());

CREATE POLICY "Users can insert own changelog reads"
  ON changelog_reads FOR INSERT
  WITH CHECK (profile_id = auth.uid() AND practice_id = get_practice_id());

CREATE POLICY "Users can update own changelog reads"
  ON changelog_reads FOR UPDATE
  USING (profile_id = auth.uid() AND practice_id = get_practice_id());

CREATE POLICY "Users can delete own changelog reads"
  ON changelog_reads FOR DELETE
  USING (profile_id = auth.uid() AND practice_id = get_practice_id());

-- ============================================================
-- Storage bucket: changelog-images (public read)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('changelog-images', 'changelog-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read changelog images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'changelog-images');

CREATE POLICY "Admins can upload changelog images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'changelog-images' AND is_admin());

CREATE POLICY "Admins can update changelog images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'changelog-images' AND is_admin());

CREATE POLICY "Admins can delete changelog images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'changelog-images' AND is_admin());
