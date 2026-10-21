# Recurring-bill decision storage

Apply `supabase/migrations/20260911120000_financial_recurring_overrides.sql`
when provisioning the database. The migration explicitly grants only SELECT,
INSERT, UPDATE and DELETE on `financial_recurring_overrides` to `service_role`.
It enables row-level security and revokes direct access from `anon` and
`authenticated`. Do not replace this with grants on every table or enable
automatic exposure of future tables.

The backend checks workspace/module access and practice membership before
reading or changing decisions. Detection is computed separately; this table
stores confirm/dismiss choices, with deletion resetting a choice to detected.

Supabase's October 30, 2026 change removes implicit grants for newly created
public tables. Existing tables keep their current grants. The explicit grant
ensures fresh installations and database rebuilds do not depend on the old
defaults. No production reset is needed.

This is a correction to the original setup migration, not an automatically
applied upgrade for databases where that migration has already run. If an
existing environment lacks these privileges, review and apply only the same
table-scoped service-role grant there. Do not replay or reset the full database.

Regression test: `node --import tsx --test lib/recurring-permissions.test.ts`.
The test uses isolated in-memory PostgreSQL with and without legacy grants,
checks real read/upsert/delete operations, checks replay preserves data, and
verifies public/signed-in roles remain blocked. It does not contact production.

Reference: https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
