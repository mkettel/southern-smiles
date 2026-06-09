-- ============================================================
-- GOOGLE SHEETS PATIENT SOURCE
-- Stores one connected Google Sheet per practice for syncing the patient list.
-- Admin-only RLS (the sync runs server-side via a service account).
-- ============================================================

create table if not exists patient_sheet_sources (
  id              uuid primary key default gen_random_uuid(),
  practice_id     uuid not null references practices(id),
  spreadsheet_id  text not null,
  spreadsheet_url text,
  sheet_title     text,                       -- tab name; null = first tab
  last_synced_at  timestamptz,
  last_row_count  int,
  last_status     text,                        -- 'ok' | 'error'
  last_error      text,
  created_by      uuid references profiles(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique(practice_id)                          -- one source per practice
);

create index if not exists idx_patient_sheet_sources_practice
  on patient_sheet_sources(practice_id);

alter table patient_sheet_sources enable row level security;

create policy "Admins can read practice sheet source" on patient_sheet_sources
  for select using (practice_id = get_practice_id() and is_admin());
create policy "Admins can insert practice sheet source" on patient_sheet_sources
  for insert with check (practice_id = get_practice_id() and is_admin());
create policy "Admins can update practice sheet source" on patient_sheet_sources
  for update using (practice_id = get_practice_id() and is_admin());
create policy "Admins can delete practice sheet source" on patient_sheet_sources
  for delete using (practice_id = get_practice_id() and is_admin());
