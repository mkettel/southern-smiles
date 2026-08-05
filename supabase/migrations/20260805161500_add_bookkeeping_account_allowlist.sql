-- ============================================================
-- Account-level allowlist for Plaid bookkeeping transactions
-- ============================================================

ALTER TABLE financial_accounts
  ADD COLUMN IF NOT EXISTS included_in_bookkeeping boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_financial_accounts_bookkeeping
  ON financial_accounts(practice_id, included_in_bookkeeping, is_active);

