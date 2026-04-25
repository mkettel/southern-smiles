-- ============================================================
-- Migration 028: Add VFP (Valuable Final Product) to posts
-- ============================================================
-- Each post represents a role with a tangible product. The VFP is
-- a short text statement describing what that product looks like
-- (e.g. Receptionist VFP: "A well-maintained reception area and a
-- quickly checked-in patient"). Admins edit it; employees see it
-- as read-only context next to their stats.
--
-- Mirrors the existing divisions.vfp column added in 020.
-- ============================================================

ALTER TABLE posts ADD COLUMN IF NOT EXISTS vfp text;
