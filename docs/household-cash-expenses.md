# Household cash expenses

## Rollout

Apply `20260917060000_household_cash_expenses.sql` through the project's normal
database migration process, then deploy the app. The migration is additive and
does not alter bank imports, journal entries, or balances. Existing reports
continue to work before the migration; the cash form shows a setup message.

Only authenticated, active household members with Financial module access can
read or change cash entries via server actions. Tables are server-only, with
RLS enabled and no anonymous/authenticated table grants. Tenant IDs and author
IDs are derived from the session, not the form. Triggers enforce category and
author ownership and atomically append a snapshot for every revision.

## Behavior

- Finances > Add expense opens cash entry, corrections, void/restore, and history.
- Entries count in household Overview and Spending, including Cash-only filtering.
- Manual cash is not a bank account and has no asserted balance.
- It does not participate in bank sync, automatic categorization, or recurring detection.
- Cash entries are managed on their own page, not the bank Transactions review queue.
- Existing Budget planned amounts are unchanged; this records actual spending.
- History displays the latest 100 revisions; all revisions remain in the database.
- No real household expenses are seeded by the migration or the preview.

## Verification

`node --import tsx --test lib/household-cash.test.ts lib/household-spending.test.ts lib/household-finance.test.ts lib/recurring-detection.test.ts`

The cash tests run the migration in isolated PGlite PostgreSQL, including role
permissions, tenant checks, audit snapshots, stale-update rejection, and duplicate
ID protection. The development-only `/household-cash-preview` uses in-memory
sample data and does not call production save actions.
