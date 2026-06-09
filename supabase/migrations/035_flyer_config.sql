-- ============================================================
-- FLYER CONFIG
-- Per-campaign flyer template settings (branding, copy, background).
-- The app composites a unique QR + patient name onto this template and
-- renders a print-ready PDF (one page per enrolled patient).
-- ============================================================

alter table survey_campaigns
  add column if not exists flyer_config jsonb not null default '{}'::jsonb;

-- Storage: uploaded / AI-generated flyer backgrounds live in a public
-- `flyer-assets` bucket. Create it once (Storage → New bucket → public),
-- same as the existing `logos` / `avatars` buckets. SQL form:
--   insert into storage.buckets (id, name, public)
--   values ('flyer-assets', 'flyer-assets', true)
--   on conflict (id) do nothing;
