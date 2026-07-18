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

## Implemented Path: Signed Inbound Email Webhook

The app accepts Resend `email.received` events at:

```text
POST /api/webhooks/resend/cherry
```

The route verifies the Resend/Svix signature before retrieving the email. It
then requires the configured recipient and Cherry sender, parses the approval,
and calls the atomic `record_cherry_approval_event` database function.

The webhook reuses the existing `cherry_financing_approvals` ledger and stores only:

- provider event id
- source message id
- received timestamp
- reporting week
- approved amount in cents

It does not store the email body, patient name, phone number, or email address.
Duplicate webhook deliveries are ignored by practice and source message id, so
manual imports and automated receipts always roll into the same weekly total.

Apply `supabase/migrations/046_add_cherry_approval_webhook.sql` after the
existing Cherry approvals migration.

Required production environment variables:

```text
RESEND_API_KEY=
RESEND_CHERRY_WEBHOOK_SECRET=
CHERRY_INBOUND_RECIPIENT=
```

Optional overrides:

```text
CHERRY_APPROVAL_SENDER=support@withcherry.com
CHERRY_PRACTICE_SLUG=ssmiles
CHERRY_AUTOMATION_START_WEEK=2026-07-20
```

Resend setup:

1. Create or choose a receiving address in Resend. A managed Resend receiving
   address is sufficient initially; a custom receiving subdomain can be added
   later.
2. Create a webhook for the `email.received` event pointing to
   `https://ssmiles.survivalboard.org/api/webhooks/resend/cherry`.
3. Copy the webhook signing secret and API key into the Vercel production
   variables above.
4. In the Gmail account that receives Cherry approvals, add the Resend address
   as a forwarding address and confirm it.
5. Forward only messages matching:
   `from:(support@withcherry.com) subject:(approved for)`.
6. Send one known test approval and confirm that the current week's Approved
   Financing total changes once, even if the webhook is replayed.

## Reporting Cutoff

Approved Financing uses a Phoenix-time Friday cutoff:

- Monday through Friday before 4:00 PM counts toward that Friday.
- Friday at 4:00 PM or later and all weekend approvals count toward the
  following Friday.
- Automation begins with the week starting July 20, 2026. Earlier manual
  history, including the July 10 and July 17 totals, cannot be changed by the
  webhook.

## Email Format

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

## Alternative Integration Options

The signed inbound webhook above is the current implementation. These remain
possible alternatives:

1. Dedicated Gmail API polling
   - Add Google OAuth/API access for the dedicated Cherry Gmail account only.
   - Search messages from `support@withcherry.com` matching Cherry approval subjects.
   - Deduplicate by Gmail message id.
   - Parse each matching email with `parseCherryApprovalEmail`.

2. Manual import fallback
   - Admin pastes raw Cherry approval email text into a protected admin tool.
   - The parser extracts the amount and updates the weekly total.
   - This is least automated, but it can be useful while API/inbound email access is being approved.

## Stat Update Behavior

Once approvals are parsed, the app should:

1. Sum parsed approvals using the Friday 4:00 PM Phoenix cutoff.
2. Find the active dollar stat named `Approved Financing` under Division 2.
3. Upsert `stat_entries` for `(stat_id, week_start)`.
4. Revalidate `/dashboard`, `/stats`, and the affected stat detail page.
5. Keep manual override available to an admin for corrections. New webhook
   events update the calculated value without overwriting an active manual
   override.

## Important Caveat

Some Cherry emails include a marketing line such as “could have been approved for more on the Growth Plan.” The parser must use `Total Available` first so the stat reflects the actual approved amount, not the higher marketing amount.
