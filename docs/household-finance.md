# Household finance: two workflows, one codebase

The household workspace type is used by two people who categorize money
differently. Both are first-class. Changes that help one must not blank the
other's dashboards, which is exactly what happened in September 2026 when
grouping switched to chart accounts only and one workspace collapsed into a
single "Uncategorized" row.

## Who does what

| Workspace | How categories get assigned | What the views must show |
|---|---|---|
| Shakally Personal Household | Reviews transactions in `/admin/financial-transactions` and assigns each to a chart account (`bookkeeping_account_id`) | Its own chart-account names |
| Kettelkamp | Never opens the review flow; every row keeps `bookkeeping_account_id = null` | Plaid's `plaid_category_primary`, humanized (Food & drink, Travel, …) |

A workspace can also be in between: some rows assigned, most not. It must see
both kinds of category side by side, never "Uncategorized" for the unassigned
majority.

## The rule

`lib/household-categories.ts` is the only place category resolution lives.
Every household view (Overview, Spending, recurring detection) goes through
`categoryKeyOf` and `householdCategoryLabel`:

1. Assigned chart account (`bookkeeping_account_id` with a resolved label) wins.
2. Otherwise the Plaid primary category, labeled by `categoryLabel`.
3. `UNCATEGORIZED` only when neither exists.

Do not change this to "assigned only" or "Plaid only". If you need a third
source (manual cash expenses, rules, AI categorization), add it as a step in
this function and extend the tests below.

## Other invariants

- **Transfers and card payments are never spending.** `isTransferTransaction`
  in `lib/household-finance.ts` excludes `TRANSFER_*`, `LOAN_DISBURSEMENTS`,
  and `LOAN_PAYMENTS` whose detailed category is
  `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT`. Some banks report a credit card payment
  that way; counting it doubles the card's purchases.
- **Income is only the `INCOME` category.** Loan draws and transfers in are not
  income.
- **Spending views keep all five chart types**: Donut, Ranked, By month,
  Heatmap, Pace. By month and Heatmap may hide on single-month ranges; do not
  remove them. Pace locks the range to "This month" by design.
- **"This month" compares against the same days of last month**, not the
  trailing days before the 1st.
- **Category colors follow the category, not its rank.** Slots are assigned
  once over the whole dataset (`assignCategorySlots`); a filter must never
  repaint a category.
- **Recurring detection** clusters a merchant's charges by amount before
  looking for cadence, so an insurer billing two policies or a subscription
  with usage charges becomes separate streams. Stream keys are the merchant
  key alone when there is one cluster, so existing confirm/dismiss overrides
  in `financial_recurring_overrides` survive.

## Tests that guard this

Run them with `npx tsx --test lib/*.test.ts` (the `npm test` glob does not
expand on Node 20).

- `lib/household-spending.test.ts`: "assigned chart accounts override bank
  labels and unassigned rows fall back to bank categories", the color-slot
  test, the pace test, the range test
- `lib/household-finance.test.ts`: transfer exclusion, credit card payments
  labeled as loan payments, category labels
- `lib/recurring-detection.test.ts`: amount clustering, transfer exclusion,
  assigned-label test

If one of these fails after your change, the change breaks the other
workspace. Fix the change, not the test.

## Previews

`/household-finance-preview` and `/household-spending-preview` render the
real components on fixtures from `lib/household-preview-fixtures.tsx`, mixing
assigned and unassigned rows. Use them to check both workflows without a
login. They are dev-only and bypass auth via `lib/supabase/middleware.ts`.

## Coordination

Both people merge to `main` directly. When a change touches the files listed
in `AGENTS.md`, say so in the PR description and mention which workflow you
verified. A one-line heads-up to the other person avoids a round of
surprise fixes.
