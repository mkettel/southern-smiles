# Care Calls: Vault daily reporting

Approved cutover: **2026-10-26 America/Phoenix**. No imports/backfill before this
date. Existing daily and weekly rows are not changed by the migration.

The Vault sends one office-wide aggregate for each completed day at 00:10 Phoenix
time (07:10 UTC). First eligible report: October 27, covering October 26. It uses
the same attempt-counting function as the Vault's Calls made summary: each
recorded outcome counts once, including repeated no answer. No patient names,
phone numbers, staff identities, or outcomes leave the Vault.

## Storage and user controls

`care_call_sync_days` keeps imported counts separate from manual additional
calls/texts. The daily/weekly projections remain in the Board's existing tables,
so charts and dashboards continue to use the normal effective totals. Before
October 26 the existing UI and editing workflow stay unchanged. After cutover,
Care Calls has read-only From Vault and editable Additional calls/texts fields.
Weekly replacement overrides require a reason; reset returns to the calculated
sum. An override never changes the daily inputs.

The service-role-only RPC serializes writes for this metric, rejects old dates,
future/uncompleted snapshots and decreasing immutable counts, ignores stale or
repeated revisions, and atomically updates projections. Weekly conditions and
percentage changes use the effective number (including overrides). Original
pre-cutover rows are not recalculated. Existing post-cutover manual rows without
integration provenance stop the import for review rather than being overwritten.
The private table has RLS and no browser grants. A trigger blocks old-browser
numeric writes to the managed projections; authenticated server actions check
practice and assignment, repeated in the database.

## Coordinated rollout (do not skip)

1. Merge both Board and Vault PRs. Verify current production targets: Board
   `mkettel/southern-smiles`, Supabase project **tvlwsanjmlcbxeoazzmi**;
   Vault `meezdds/survival-vault`, AWS **180745324698 / us-west-2**.
   Do not use the unrelated Supabase projects returned by the current connector.
2. Take a read-only export/hash of all Care Calls daily/weekly rows before
   2026-10-26. Apply `20261023033719_care_call_vault_sync.sql` through authorized
   access to the correct database, then compare the historical rows byte-for-byte
   and run security advisors. No historical UPDATE/DELETE is in this migration.
3. Generate a dedicated random shared secret (at least 32 bytes). Store it only
   in AWS Secrets Manager and Board server environment `VAULT_CARE_SYNC_SECRET`.
   Never place it in NEXT_PUBLIC variables, source, screenshots, or logs.
   Set `VAULT_CARE_SYNC_ENABLED=true` only after the migration is verified.
4. Deploy the Board through its existing Vercel Git workflow. Confirm the
   production receiver `/api/webhooks/vault-care-calls` rejects unsigned calls
   and correctly signed pre-cutover data without any database changes.
5. Configure Vault GitHub variables `BOARD_CARE_SYNC_URL` (verified Board
   production HTTPS domain plus that path) and `BOARD_CARE_SYNC_SECRET_ARN`.
   Dispatch the existing production deployment with `board_care_sync=true`.
   The default is `preserve`; a new stack defaults off. Do not enable a worker
   pointing at a preview deployment or an unverified receiver.
6. Verify the schedule, read-only IAM policy, error alarm, and first daily run.
   A pre-cutover manual invocation is a no-op. Never insert fake production
   counts just to test. On October 27 compare Monday's aggregate to the Vault.

Every nightly run replays completed days since cutover to recover missed runs.
Missing data shows Awaiting sync/partial, not a fabricated zero. A full successful
Vault read with no attempts does send a legitimate zero. Failures throw for AWS
retries and the dedicated CloudWatch error alarm; no patient data is logged.
The alarm is visible in CloudWatch; attach the office's approved notification
destination during rollout if proactive alerts are wanted.

Rollback: disable the worker (`board_care_sync=false`) and receiver environment
flag. Keep the additive schema and historical/imported data. Do not revert to
an old frontend for post-cutover manual editing; its writes intentionally fail
closed. Normal Vault saves never call the Board and are unaffected by an outage.

## Verification

`node --import tsx --test lib/care-call-*.test.ts` exercises the actual SQL on
PGlite with a fixed future clock, authentication rejection, historical number
preservation, idempotency, stale deliveries, manual additions, override/reset,
condition calculations, unknown-existing-row protection and direct-write guards.
Run `npm test`, `npx tsc --noEmit`, and lint the changed TypeScript files as well.
