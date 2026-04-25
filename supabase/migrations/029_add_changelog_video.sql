-- ============================================================
-- Migration 029: Add video support to changelog entries
-- ============================================================
-- Header media can be either an image (image_url) or a video
-- (video_url). UI enforces one-or-the-other; both columns are
-- nullable so existing entries are unaffected.
--
-- Videos are stored in the same `changelog-images` bucket as
-- images — the bucket policy is permissive on file type and the
-- upload action enforces the extension whitelist.
-- ============================================================

ALTER TABLE changelog_entries
  ADD COLUMN IF NOT EXISTS video_url text;
