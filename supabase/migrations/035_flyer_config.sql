-- ============================================================
-- FLYER CONFIG
-- Per-campaign flyer template settings (branding, copy, background).
-- The app composites a unique QR + patient name onto this template and
-- renders a print-ready PDF (one page per enrolled patient).
-- ============================================================

alter table survey_campaigns
  add column if not exists flyer_config jsonb not null default '{}'::jsonb;

-- ============================================================
-- Storage bucket: flyer-assets (public read) — uploaded / AI-generated
-- flyer backgrounds. Mirrors the changelog-images bucket (migration 026).
-- ============================================================
insert into storage.buckets (id, name, public)
values ('flyer-assets', 'flyer-assets', true)
on conflict (id) do nothing;

create policy "Public read flyer assets"
  on storage.objects for select
  using (bucket_id = 'flyer-assets');

create policy "Admins can upload flyer assets"
  on storage.objects for insert
  with check (bucket_id = 'flyer-assets' and is_admin());

create policy "Admins can update flyer assets"
  on storage.objects for update
  using (bucket_id = 'flyer-assets' and is_admin());

create policy "Admins can delete flyer assets"
  on storage.objects for delete
  using (bucket_id = 'flyer-assets' and is_admin());
