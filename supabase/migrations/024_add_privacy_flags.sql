-- ============================================================
-- Migration 024: Division & Stat Privacy Flags
-- Adds is_private boolean to divisions and stats so admins can
-- hide specific divisions (and their stats) or individual stats
-- from non-admin users on the dashboard and stat detail pages.
--
-- SAFETY: Additive only. Default = false (visible), matching
-- current behavior. No RLS changes — filtering is done in the
-- server actions so admins retain read access and non-admins
-- assigned to a private stat's post can still submit entries.
-- ============================================================

ALTER TABLE divisions ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;
ALTER TABLE stats     ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;
