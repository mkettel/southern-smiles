<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Household finance is shared by two people with different workflows

`app/(app)/admin/financial/**`, `lib/household-*.ts`, `lib/recurring-detection.ts`,
and `components/financial/household-*.tsx` serve two household workspaces at once:

- **Shakally Personal Household** categorizes every transaction by hand through
  the bookkeeping review flow, so its rows carry a `bookkeeping_account_id`.
- **Kettelkamp** never opens the review flow and relies on Plaid's
  `plaid_category_primary` for every breakdown.

Before changing how these views group, label, filter, or which views exist,
read `docs/household-finance.md`. The short version: an assigned chart account
wins, everything else falls back to the Plaid category, and neither side's
views get removed to simplify the other's. The tests named in that doc lock
this in; if one fails, the change breaks the other person's dashboard.
