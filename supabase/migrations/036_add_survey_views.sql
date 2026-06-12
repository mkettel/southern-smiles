-- ============================================================
-- SURVEY OPEN TRACKING
-- Records when a recipient actually opens the survey/flyer link, closing
-- the funnel gap: sent → opened → responded. Stamped server-side on the
-- public page load (bot/scanner user-agents are filtered out before the
-- write, so these counts approximate real human opens).
--
-- Timestamps-only model (no per-event table): first/last open + a counter
-- is enough to compute open rate and re-open behavior per letter.
-- ============================================================

alter table survey_recipients
  add column if not exists first_viewed_at timestamptz,
  add column if not exists last_viewed_at  timestamptz,
  add column if not exists view_count      int not null default 0;
