# Patient De-identification Runbook

This documents the cutover that takes the survey/patients feature **out of HIPAA
scope** by ensuring no patient identity (name, phone, email) is ever stored on
or transmitted to our server. Identity stays with the practice (the covered
entity); we hold only an opaque `bridge_key` + aggregate metrics.

> Scope note: the rest of the app (employee KPIs, conditions, OIC log, messaging,
> tasks) was never PHI and is unaffected. Only the `patients` + `survey_*` surface
> changed.

## How it works after this change

- **Import**: the practice's CSV is parsed **in the browser**. Each patient's
  identity is hashed to a `bridge_key` (the practice's chart id `external_ref`
  when present, else `HMAC-SHA256(per-practice salt, normalized name)`). Only the
  `bridge_key` + metrics are sent to the server. Names/phone/email never leave
  the browser. The import action's Zod schema has no name fields, so PHI cannot
  be smuggled through even by a modified client.
- **Mail merge**: to print name-addressed letters, the practice uploads their
  **own** name+address list into the in-app Mail merge tool. The join against
  survey codes happens entirely in the browser; letters are rendered and printed
  client-side (`window.print()` → Save as PDF). Identity never touches the server.
- **Salt**: stored per practice in `practice_secrets` (admin-only RLS), delivered
  to the admin browser via `getPatientSalt()`. It is **immutable** — rotating it
  orphans every existing `bridge_key`.

## Pre-flight

1. **Each practice must export and retain their own patient CSV** (name + address
   + chart id). After this migration the app no longer stores names — that CSV
   becomes their only system of record for addressing letters.
2. Confirm the matching application code is deployed in the **same release** as
   migration `037` (synchronized cutover — see below).

## Cutover

1. Deploy migration `supabase/migrations/037_deidentify_patients.sql`. It runs in
   one transaction and:
   - **Purges** all `patients`, `survey_recipients`, `survey_responses`, and
     `patient_sheet_sources` rows (this is the "start clean" step).
   - Keeps `survey_campaigns` + their `flyer_config` templates.
   - Creates `practice_secrets` with a random salt per practice.
   - Adds `patients.bridge_key`; drops `full_name, first_name, phone, email,
     name_key` and their name-based indexes; adds the `bridge_key` dedupe index.
2. Deploy the application code in the same release. (The purge means there is no
   window where old code reads dropped columns on real data.)
3. After deploy the patient list is empty by design. Each practice re-imports via
   the new client-side import.

## Post-migration validation

```sql
-- No identifying columns remain; bridge_key is present.
select column_name from information_schema.columns
where table_name = 'patients' order by column_name;
-- expect: NO full_name/first_name/phone/email/name_key; bridge_key present.

-- Every practice has a salt.
select (select count(*) from practices) as practices,
       (select count(*) from practice_secrets) as secrets;  -- must be equal

-- Patient-linked data was purged.
select count(*) from patients;          -- 0 until re-import
select count(*) from survey_recipients; -- 0
select count(*) from survey_responses;  -- 0
```

App-side spot check: import a sample CSV and confirm (Network tab) the request to
the import action contains **no** name/phone/email — only `bridge_key` + metrics.

## HARD REQUIREMENT — history still contains PHI

Dropping a column does **not** erase it from history. To genuinely complete
de-identification you must also:

- **Expire/rotate database backups & PITR snapshots** taken before this cutover —
  they still contain patient names. In Supabase, this means letting the
  point-in-time-recovery window roll past the cutover and removing any manual
  backups that predate it.
- **Scrub server/application logs** that may have captured names in request
  bodies of the old `importPatients` / Google Sheets sync paths.
- Confirm no external copies remain (e.g. the old Google Sheets the sync pulled
  from are the practice's own responsibility, but the connection is removed).

Until backups age out and logs are scrubbed, residual PHI exists at rest even
though the live table is clean.

## What was removed

- Server-side Google Sheets sync (`actions/patient-sources.ts`,
  `lib/google/sheets.ts`, `components/surveys/sheet-connection.tsx`,
  `patient_sheet_sources` flow) — it received names on our server.
- Server-side personalized flyer generation that read patient names
  (`/api/flyer/[campaignId]` now renders a sample-only design preview).
