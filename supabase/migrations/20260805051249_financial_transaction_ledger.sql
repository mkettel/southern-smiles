-- ============================================================
-- Financial transaction ledger and review workflow
-- ============================================================

ALTER TABLE financial_connections
  ADD COLUMN IF NOT EXISTS transactions_cursor text,
  ADD COLUMN IF NOT EXISTS transactions_status text NOT NULL DEFAULT 'not_enabled'
    CHECK (transactions_status IN ('not_enabled', 'pending', 'ready', 'error')),
  ADD COLUMN IF NOT EXISTS transactions_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS transactions_last_error text
    CHECK (
      transactions_last_error IS NULL
      OR char_length(transactions_last_error) <= 1000
    );

CREATE TABLE IF NOT EXISTS financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES financial_connections(id) ON DELETE CASCADE,
  account_id uuid REFERENCES financial_accounts(id) ON DELETE SET NULL,
  provider_account_id text NOT NULL
    CHECK (char_length(trim(provider_account_id)) BETWEEN 1 AND 300),
  provider_transaction_id text NOT NULL
    CHECK (char_length(trim(provider_transaction_id)) BETWEEN 1 AND 300),
  pending_transaction_id text,
  transaction_date date NOT NULL,
  authorized_date date,
  transaction_datetime timestamptz,
  authorized_datetime timestamptz,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 1000),
  merchant_name text,
  original_description text,
  amount_cents bigint NOT NULL,
  currency_code text NOT NULL DEFAULT 'USD'
    CHECK (char_length(currency_code) BETWEEN 3 AND 12),
  pending boolean NOT NULL DEFAULT false,
  payment_channel text,
  website text,
  logo_url text,
  merchant_entity_id text,
  counterparty_name text,
  plaid_category_primary text,
  plaid_category_detailed text,
  plaid_category_confidence text,
  bookkeeping_category text
    CHECK (
      bookkeeping_category IS NULL
      OR char_length(trim(bookkeeping_category)) BETWEEN 1 AND 100
    ),
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'reviewed', 'excluded')),
  review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 1000),
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  is_removed boolean NOT NULL DEFAULT false,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_transactions_provider_key
    UNIQUE (connection_id, provider_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_financial_transactions_practice_date
  ON financial_transactions(practice_id, transaction_date DESC, created_at DESC)
  WHERE is_removed = false;

CREATE INDEX IF NOT EXISTS idx_financial_transactions_practice_review
  ON financial_transactions(practice_id, review_status, transaction_date DESC)
  WHERE is_removed = false;

CREATE INDEX IF NOT EXISTS idx_financial_transactions_account_date
  ON financial_transactions(account_id, transaction_date DESC)
  WHERE is_removed = false;

ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read financial transactions" ON financial_transactions;
DROP POLICY IF EXISTS "Admins create financial transactions" ON financial_transactions;
DROP POLICY IF EXISTS "Admins update financial transactions" ON financial_transactions;
DROP POLICY IF EXISTS "Admins delete financial transactions" ON financial_transactions;

CREATE POLICY "Admins read financial transactions"
  ON financial_transactions FOR SELECT TO authenticated
  USING (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins create financial transactions"
  ON financial_transactions FOR INSERT TO authenticated
  WITH CHECK (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins update financial transactions"
  ON financial_transactions FOR UPDATE TO authenticated
  USING (practice_id = get_practice_id() AND is_admin())
  WITH CHECK (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins delete financial transactions"
  ON financial_transactions FOR DELETE TO authenticated
  USING (practice_id = get_practice_id() AND is_admin());

-- Financial data remains server-only. Authenticated admin actions verify the
-- current practice and role before using the service-role client.
REVOKE ALL ON financial_transactions FROM anon, authenticated;
