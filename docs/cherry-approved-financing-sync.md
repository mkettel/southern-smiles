# Cherry Approved Financing Sync

## Goal

Automatically update the Division 2 `Approved Financing` stat from Cherry approvals so staff do not re-enter the same weekly total by hand.

## Preferred Path: Cherry API

Cherry Support confirmed that the Partner API is not self-service yet. A draft email has been prepared for Peyton Pelham asking for read-only, aggregate-only access.

Requested API shape:

- Date range input, such as the current dashboard week.
- Aggregate approved-financing amount only.
- No patient names, phone numbers, or patient-level records required.

If approved, the app should fetch the weekly total server-side, then upsert the active Division 2 dollar stat named `Approved Financing` for the selected week.

## Recommended Fallback: Dedicated Cherry Approval Gmail

Cherry sends approval emails with stable amount language:

- Subject examples:
  - `{Patient} has been approved for $10,000 at Southern Smiles`
  - `{Patient} is approved for purchases up to $7,500 at Southern Smiles`
- Body field:
  - `Total Available`
  - `$10,000`

The parser in `lib/cherry-financing.ts` intentionally stores only:

- source email id
- received timestamp
- approved amount in cents

It does not need to store patient names, mobile numbers, or email body text.

To avoid giving Survival Board broad access to Monzer's main Gmail account, use
a dedicated Gmail inbox that only receives forwarded Cherry approval emails.

Recommended mailbox shape:

- Create a standalone Gmail account such as `southernsmiles.cherry@gmail.com`.
- In Monzer's main Gmail, keep the existing filter:
  - `from:(support@withcherry.com) subject:(approved for)`
  - apply label `Cherry/Approvals`
- Add forwarding on that filter to the dedicated Cherry Gmail account.
- Connect Survival Board only to the dedicated Cherry Gmail account.

This means even if the Gmail API authorization is broad, the authorized mailbox
contains only Cherry approval messages rather than the practice owner's full
personal/work inbox.

## Email Integration Options

Use one of these wiring options when Matt is ready to make this live:

1. Dedicated Gmail API polling
   - Add Google OAuth/API access for the dedicated Cherry Gmail account only.
   - Search messages from `support@withcherry.com` matching Cherry approval subjects.
   - Deduplicate by Gmail message id.
   - Parse each matching email with `parseCherryApprovalEmail`.

2. Dedicated inbound email service
   - Forward Cherry approval emails to an inbound address owned by the app.
   - The inbound webhook calls the same parser.
   - This is cleaner operationally if the team wants to avoid giving the app Gmail mailbox access.

3. Manual import fallback
   - Admin pastes raw Cherry approval email text into a protected admin tool.
   - The parser extracts the amount and updates the weekly total.
   - This is least automated, but it can be useful while API/inbound email access is being approved.

## Stat Update Behavior

Once approvals are parsed, the app should:

1. Sum parsed approvals whose received date falls inside the selected dashboard week.
2. Find the active dollar stat named `Approved Financing` under Division 2.
3. Upsert `stat_entries` for `(stat_id, week_start)`.
4. Revalidate `/dashboard`, `/stats`, and the affected stat detail page.
5. Remove `Approved Financing` from manual entry once the automated path is active.

## Important Caveat

Some Cherry emails include a marketing line such as “could have been approved for more on the Growth Plan.” The parser must use `Total Available` first so the stat reflects the actual approved amount, not the higher marketing amount.
