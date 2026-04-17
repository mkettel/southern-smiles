-- ============================================================
-- Migration 023: Stat-level overall condition
-- Lets an admin set a single "overall" condition per stat that
-- represents the lifetime trend, distinct from the per-week
-- auto/final condition stored on stat_entries.
-- ============================================================

ALTER TABLE stats
  ADD COLUMN IF NOT EXISTS overall_condition condition_name;
