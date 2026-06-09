-- ============================================================
-- PATIENT METRICS & SEGMENTATION
-- Extends the patients table (032) with per-patient value/recency/frequency
-- metrics derived from an imported revenue report, plus a normalized dedupe
-- key and a flexible attributes bag. Powers targeted campaign enrollment.
-- ============================================================

alter table patients add column if not exists total_collected_cents bigint not null default 0;
alter table patients add column if not exists visit_count int not null default 0;
alter table patients add column if not exists first_seen date;
alter table patients add column if not exists last_seen date;
alter table patients add column if not exists name_key text;
alter table patients add column if not exists attributes jsonb not null default '{}'::jsonb;

-- Dedupe by normalized "last|first" key within a practice when no external_ref.
create index if not exists idx_patients_name_key on patients(practice_id, name_key);
create unique index if not exists uniq_patients_practice_namekey
  on patients(practice_id, name_key)
  where name_key is not null;

-- Helpful for value-sorted segment queries.
create index if not exists idx_patients_value on patients(practice_id, total_collected_cents desc);
