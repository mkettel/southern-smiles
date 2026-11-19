# New Reaches rollout

New Reaches begins November 16, 2026. Earlier records remain manual.
The Vault exports unique first qualifying NP Call Log contacts, excluding wrong
office/lead, employment inquiries, and archived records. No patient identifiers
are transmitted to the Board.

## Manual controls

- Daily additional new reaches are saved separately from the Vault count.
- A weekly override with a reason survives all later imports.
- Reset restores the calculated weekly sum; it does not erase additions.
- Conversion Rate uses the reported New Reaches denominator, including overrides.
- Existing manual days or unexplained weekly totals halt import for review;
  they are never silently counted as extra contacts or overwritten.

## Deployment order

1. Apply the schedule migration and then the manual-adjustments migration.
   The schedule migration was already applied to production before its UI release.
   Its premature date-only guard was temporarily relaxed on November 19.
   Do not reapply it by itself.
2. Deploy the Board receiver and manual controls together (PR 94).
3. Deploy Vault PR 102 via the production workflow, preserving other flags.
4. Invoke the sync function; compare exported daily counts with new_reach_sync_days,
   daily_stat_entries and the weekly sum. Invoke twice to verify no double counting.
5. Verify EventBridge schedules: Mon-Thu 16:45, Friday 15:45 and 20:00 Phoenix.

The additive migration leaves manual saves possible for a week until it gains
managed data. Old browser builds cannot change numeric managed rows afterward.
Both RPCs require service_role; server actions separately check the signed-in
user, and the adjustment RPC checks tenant, active profile and assignment/admin.

## Verification

Run scripts/test-new-reaches-sync.sql with the new migration in a single
BEGIN/ROLLBACK transaction. It intentionally refuses to run once real reaches
occupy its fixture dates. Do not commit fixture values.
Coverage: additions and edits, duplicate/older snapshots, decreasing corrected
counts, weekly overrides and reset, conversion recalculation, unauthorized actors,
pre-cutover rejection, and blocking direct writes to managed totals.
