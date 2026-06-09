-- ============================================================
-- PATIENT SURVEYS & REFERRAL INSIGHTS
-- Mailed "Personal Note" letters → QR → public survey → insights.
--
-- Identity model: each letter carries a UNIQUE code (bearer token) in its
-- QR URL, so a scan resolves to a specific patient. The public survey page
-- and submission are UNAUTHENTICATED and reach the DB via the service-role
-- client (bypasses RLS). The code is validated server-side. Therefore these
-- tables have ADMIN-ONLY RLS (per practice) and NO anonymous policies.
-- ============================================================

-- ============================================================
-- PATIENTS (persistent per practice — insights accumulate across campaigns)
-- ============================================================
create table if not exists patients (
  id            uuid primary key default gen_random_uuid(),
  practice_id   uuid not null references practices(id),
  full_name     text not null,
  first_name    text,
  phone         text,
  email         text,
  external_ref  text,                       -- optional id from the imported CSV (dedupe)
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Dedupe within a practice when an external ref is supplied.
create unique index if not exists uniq_patients_practice_extref
  on patients(practice_id, external_ref)
  where external_ref is not null;
create index if not exists idx_patients_practice on patients(practice_id);

-- ============================================================
-- SURVEY_CAMPAIGNS (one mailing batch; questions are configurable JSON)
-- ============================================================
create table if not exists survey_campaigns (
  id                  uuid primary key default gen_random_uuid(),
  practice_id         uuid not null references practices(id),
  title               text not null,
  -- questions: jsonb array of
  --   { id, type: 'rating'|'single_choice'|'multi_choice'|'text'|'referral_source',
  --     label, options?: string[], required?: boolean }
  questions           jsonb not null default '[]'::jsonb,
  credit_amount_cents int not null default 5000,   -- the $50 appreciation credit
  credit_expires_days int,                          -- null = no expiration
  status              text not null default 'draft' check (status in ('draft','active','closed')),
  created_by          uuid references profiles(id),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index if not exists idx_survey_campaigns_practice on survey_campaigns(practice_id);

-- ============================================================
-- SURVEY_RECIPIENTS (one row per patient per campaign — holds the unique
-- code AND the per-letter $50 credit ledger)
-- ============================================================
create table if not exists survey_recipients (
  id                  uuid primary key default gen_random_uuid(),
  practice_id         uuid not null references practices(id),
  campaign_id         uuid not null references survey_campaigns(id) on delete cascade,
  patient_id          uuid not null references patients(id) on delete cascade,
  code                text not null unique,         -- bearer token in the /survey/<code> URL
  sent_at             timestamptz,                  -- null until the batch is "sent"
  responded_at        timestamptz,
  -- $50 credit ledger
  credit_status       text not null default 'none'
                        check (credit_status in ('none','promised','redeemed','expired')),
  credit_amount_cents int,
  credit_expires_at   date,
  credit_redeemed_at  timestamptz,
  credit_redeemed_by  uuid references profiles(id),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  unique(campaign_id, patient_id)
);

create index if not exists idx_survey_recipients_practice on survey_recipients(practice_id);
create index if not exists idx_survey_recipients_campaign on survey_recipients(campaign_id);
create index if not exists idx_survey_recipients_patient on survey_recipients(patient_id);

-- ============================================================
-- SURVEY_RESPONSES (one submission per recipient)
-- ============================================================
create table if not exists survey_responses (
  id                  uuid primary key default gen_random_uuid(),
  practice_id         uuid not null references practices(id),
  campaign_id         uuid not null references survey_campaigns(id) on delete cascade,
  recipient_id        uuid not null unique references survey_recipients(id) on delete cascade,
  patient_id          uuid not null references patients(id) on delete cascade,
  answers             jsonb not null default '{}'::jsonb,   -- { [questionId]: value }
  referral_source     text,                                  -- denormalized for cheap aggregation
  submitted_at        timestamptz default now()
);

create index if not exists idx_survey_responses_practice on survey_responses(practice_id);
create index if not exists idx_survey_responses_campaign on survey_responses(campaign_id);

-- ============================================================
-- ROW LEVEL SECURITY — admin-only per practice.
-- (Public read/write happens via the service-role client, which bypasses RLS.)
-- ============================================================
alter table patients enable row level security;
alter table survey_campaigns enable row level security;
alter table survey_recipients enable row level security;
alter table survey_responses enable row level security;

-- PATIENTS
create policy "Admins can read practice patients" on patients
  for select using (practice_id = get_practice_id() and is_admin());
create policy "Admins can insert practice patients" on patients
  for insert with check (practice_id = get_practice_id() and is_admin());
create policy "Admins can update practice patients" on patients
  for update using (practice_id = get_practice_id() and is_admin());
create policy "Admins can delete practice patients" on patients
  for delete using (practice_id = get_practice_id() and is_admin());

-- SURVEY_CAMPAIGNS
create policy "Admins can read practice campaigns" on survey_campaigns
  for select using (practice_id = get_practice_id() and is_admin());
create policy "Admins can insert practice campaigns" on survey_campaigns
  for insert with check (practice_id = get_practice_id() and is_admin());
create policy "Admins can update practice campaigns" on survey_campaigns
  for update using (practice_id = get_practice_id() and is_admin());
create policy "Admins can delete practice campaigns" on survey_campaigns
  for delete using (practice_id = get_practice_id() and is_admin());

-- SURVEY_RECIPIENTS
create policy "Admins can read practice recipients" on survey_recipients
  for select using (practice_id = get_practice_id() and is_admin());
create policy "Admins can insert practice recipients" on survey_recipients
  for insert with check (practice_id = get_practice_id() and is_admin());
create policy "Admins can update practice recipients" on survey_recipients
  for update using (practice_id = get_practice_id() and is_admin());
create policy "Admins can delete practice recipients" on survey_recipients
  for delete using (practice_id = get_practice_id() and is_admin());

-- SURVEY_RESPONSES
create policy "Admins can read practice responses" on survey_responses
  for select using (practice_id = get_practice_id() and is_admin());
create policy "Admins can insert practice responses" on survey_responses
  for insert with check (practice_id = get_practice_id() and is_admin());
create policy "Admins can update practice responses" on survey_responses
  for update using (practice_id = get_practice_id() and is_admin());
create policy "Admins can delete practice responses" on survey_responses
  for delete using (practice_id = get_practice_id() and is_admin());
