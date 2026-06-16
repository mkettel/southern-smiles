-- ============================================================
-- DE-IDENTIFY PATIENTS — TAKE THE SURVEY APP OUT OF HIPAA SCOPE
--
-- We stop storing patient identity entirely. The practice (covered entity)
-- keeps the name list; we keep only an opaque `bridge_key` + aggregate metrics.
-- Identity is handled client-side at import and at mail-merge time, so names
-- never reach this database.
--
--   bridge_key = external_ref (chart/patient id) when present,
--                else HMAC-SHA256(per-practice salt, normalized name).
--
-- This migration is a SYNCHRONIZED cutover: it PURGES all existing patient
-- data first (so dropping NOT NULL columns can't fail and we "start clean"),
-- then drops the identifying columns. Deploy it together with the matching
-- application code — old code expects the dropped columns.
--
-- NOTE: dropped columns still live in PITR snapshots / WAL / prior backups.
-- Rotate/expire those and scrub any logs that captured names — see
-- docs/deidentification-runbook.md. Dropping a column is not erasure.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. PURGE all patient-linked data (start clean).
--    Children first is harmless (FKs cascade anyway); keep the
--    survey_campaigns + flyer_config templates.
-- ------------------------------------------------------------
delete from survey_responses;
delete from survey_recipients;
delete from patients;
delete from patient_sheet_sources;

-- ------------------------------------------------------------
-- 2. Per-practice salt for the name-hash fallback.
--    Kept in a SEPARATE table (not on `practices`) because the existing
--    "Users can read own practice" policy would expose it to all employees.
--    Here it is readable by admins only; writes are service-role only.
-- ------------------------------------------------------------
create table if not exists practice_secrets (
  practice_id  uuid primary key references practices(id),
  patient_salt text not null,
  created_at   timestamptz default now()
);

insert into practice_secrets (practice_id, patient_salt)
  select id, encode(gen_random_bytes(32), 'hex') from practices
  on conflict (practice_id) do nothing;

alter table practice_secrets enable row level security;

create policy "Admins read own practice secret" on practice_secrets
  for select using (practice_id = get_practice_id() and is_admin());

-- ------------------------------------------------------------
-- 3. Add the de-identified bridge key.
-- ------------------------------------------------------------
alter table patients add column if not exists bridge_key text;

-- ------------------------------------------------------------
-- 4. Drop all identifying columns + their name-based indexes.
--    (Table is empty after the purge, so the NOT NULL drop is safe.)
-- ------------------------------------------------------------
drop index if exists uniq_patients_practice_namekey;
drop index if exists idx_patients_name_key;

alter table patients drop column if exists full_name;
alter table patients drop column if exists first_name;
alter table patients drop column if exists phone;
alter table patients drop column if exists email;
alter table patients drop column if exists name_key;

-- ------------------------------------------------------------
-- 5. New dedupe indexes: external_ref preferred (kept from 032),
--    bridge_key as the fallback dedupe key.
-- ------------------------------------------------------------
create unique index if not exists uniq_patients_practice_bridgekey
  on patients(practice_id, bridge_key)
  where bridge_key is not null;
create index if not exists idx_patients_bridge on patients(practice_id, bridge_key);
