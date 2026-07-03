# Cherry Approved Financing Sync

## What This Builds

Cherry approvals now have a source-of-truth import path for the Division 2
`Approved Financing` stat.

The app can:

- parse Cherry approval emails
- store one de-identified approval row per Cherry/Gmail message
- dedupe retries by message id
- sum approvals by dashboard week
- sync the weekly total into the active Division 2 dollar stat named
  `Approved Financing`
- hide `Approved Financing` from manual Stats entry

The app intentionally does not store patient names, phone numbers, raw email
bodies, or Cherry account credentials.

## Database

Apply:

```sql
supabase/migrations/042_add_cherry_financing_approvals.sql
```

This creates `cherry_financing_approvals` with:

- `practice_id`
- `source = 'cherry_email'`
- `source_message_id`
- `approved_at`
- `week_start`
- `amount_cents`
- optional importing profile

The unique key on `(practice_id, source, source_message_id)` prevents duplicate
forwarded emails from double-counting.

## Admin Manual Import

Admins can use:

```text
/admin/cherry-financing
```

Paste:

- Cherry email subject
- received date/time
- optional message id
- Cherry email body

The parser prefers the body field:

```text
Total Available
$10,000
```

If that field is missing, it falls back to the approval amount in the subject.
This avoids accidentally using the higher Growth Plan marketing amount. The
subject and body are parsed only during import; they are not stored.

## Webhook Endpoint

For Gmail Apps Script, Zapier, Make, or an inbound email provider, call:

```text
POST /api/cherry/approvals
```

Required header:

```text
x-cherry-webhook-secret: <CHERRY_EMAIL_WEBHOOK_SECRET>
```

Required Vercel/Supabase app env var:

```text
CHERRY_EMAIL_WEBHOOK_SECRET=<long random secret>
CHERRY_EMAIL_WEBHOOK_PRACTICE_ID=<practice uuid>
```

Payload:

```json
{
  "messageId": "gmail-message-id-or-inbound-provider-id",
  "subject": "Patient has been approved for $10,000 at Southern Smiles",
  "body": "Total Available\n$10,000\n...",
  "receivedAt": "2026-07-02T15:30:00.000Z"
}
```

If `receivedAt` is omitted, the server uses the import time. `messageId` is
required so retries do not duplicate approvals. The webhook does not accept a
caller-provided practice id; production should set
`CHERRY_EMAIL_WEBHOOK_PRACTICE_ID` so forwarded emails always land in the
intended practice.

## Dedicated Gmail Fallback

Because Cherry Partner API access is not available immediately, use a dedicated
Gmail inbox for approval notifications.

Recommended flow:

1. Create a standalone Gmail account for Cherry approval forwarding.
2. In Monzer's main Gmail, filter Cherry approval emails and forward only those
   messages to the dedicated mailbox.
3. Use a small Gmail Apps Script or automation provider on that dedicated mailbox
   to call `/api/cherry/approvals`.
4. Never connect Survival Board to Monzer's full main Gmail account.

Suggested Gmail filter:

```text
from:(support@withcherry.com) subject:(approved for)
```

## Stat Behavior

When an approval imports successfully:

1. The email is parsed.
2. The approval row is upserted by message id.
3. The weekly total for that approval's week is recalculated.
4. The next existing `Approved Financing` stat week is refreshed so its
   previous value stays accurate when older approvals are imported later.
5. The Division 2 `Approved Financing` stat entry is upserted.
6. Dashboard, Stats, and stat detail pages are revalidated.

Manual stat entry for `Approved Financing` is blocked because the source of
truth is now the Cherry import log.
