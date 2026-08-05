ALTER TABLE bookkeeping_vendor_rules
  ADD COLUMN IF NOT EXISTS match_type text NOT NULL DEFAULT 'exact'
    CHECK (match_type IN ('exact', 'contains'));

INSERT INTO bookkeeping_vendor_rules (
  practice_id,
  normalized_vendor,
  match_type,
  bookkeeping_account_id,
  source,
  sample_count,
  confidence,
  updated_at
)
SELECT
  account.practice_id,
  'mobile deposit',
  'contains',
  account.id,
  'review',
  1,
  1,
  now()
FROM bookkeeping_accounts AS account
WHERE lower(trim(account.name)) = 'fee for service income'
  AND account.is_active = true
ON CONFLICT (practice_id, normalized_vendor) DO UPDATE
SET match_type = 'contains',
    bookkeeping_account_id = EXCLUDED.bookkeeping_account_id,
    source = 'review',
    confidence = 1,
    updated_at = now();

UPDATE financial_transactions AS transaction
SET bookkeeping_account_id = account.id,
    category_source = 'vendor_rule',
    updated_at = now()
FROM bookkeeping_accounts AS account
WHERE transaction.practice_id = account.practice_id
  AND lower(trim(account.name)) = 'fee for service income'
  AND account.is_active = true
  AND transaction.review_status = 'pending'
  AND transaction.is_removed = false
  AND (
    lower(coalesce(transaction.name, '')) LIKE '%mobile deposit%'
    OR lower(coalesce(transaction.original_description, '')) LIKE '%mobile deposit%'
    OR lower(coalesce(transaction.merchant_name, '')) LIKE '%mobile deposit%'
    OR lower(coalesce(transaction.counterparty_name, '')) LIKE '%mobile deposit%'
  );
