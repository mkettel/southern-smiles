-- ============================================================
-- Fix: Allow multiple employees to submit the same stat per week
-- Old: unique(stat_id, week_start) — only one entry per stat per week
-- New: unique(stat_id, profile_id, week_start) — one entry per stat per person per week
-- ============================================================

ALTER TABLE stat_entries DROP CONSTRAINT IF EXISTS stat_entries_stat_id_week_start_key;
ALTER TABLE stat_entries ADD CONSTRAINT stat_entries_stat_profile_week_key UNIQUE (stat_id, profile_id, week_start);
