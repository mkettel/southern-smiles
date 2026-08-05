-- ============================================================
-- QuickBooks-style chart of accounts and learned vendor rules
-- ============================================================

CREATE TABLE IF NOT EXISTS bookkeeping_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  external_source text NOT NULL DEFAULT 'manual'
    CHECK (external_source IN ('quickbooks', 'manual')),
  external_id text,
  account_number text,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 200),
  account_type text NOT NULL CHECK (char_length(trim(account_type)) BETWEEN 1 AND 100),
  detail_type text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookkeeping_accounts_practice_name
  ON bookkeeping_accounts(practice_id, lower(name));

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookkeeping_accounts_external_id
  ON bookkeeping_accounts(practice_id, external_source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookkeeping_accounts_practice_type
  ON bookkeeping_accounts(practice_id, account_type, name)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS bookkeeping_vendor_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  normalized_vendor text NOT NULL
    CHECK (char_length(trim(normalized_vendor)) BETWEEN 2 AND 300),
  bookkeeping_account_id uuid NOT NULL
    REFERENCES bookkeeping_accounts(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'review'
    CHECK (source IN ('quickbooks_history', 'review')),
  sample_count integer NOT NULL DEFAULT 1 CHECK (sample_count > 0),
  confidence numeric(5, 4) NOT NULL DEFAULT 1
    CHECK (confidence >= 0 AND confidence <= 1),
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookkeeping_vendor_rules_practice_vendor_key
    UNIQUE (practice_id, normalized_vendor)
);

CREATE INDEX IF NOT EXISTS idx_bookkeeping_vendor_rules_account
  ON bookkeeping_vendor_rules(bookkeeping_account_id);

ALTER TABLE financial_transactions
  ADD COLUMN IF NOT EXISTS bookkeeping_account_id uuid
    REFERENCES bookkeeping_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_source text
    CHECK (category_source IS NULL OR category_source IN ('vendor_rule', 'manual'));

CREATE INDEX IF NOT EXISTS idx_financial_transactions_bookkeeping_account
  ON financial_transactions(bookkeeping_account_id, transaction_date DESC)
  WHERE is_removed = false;

ALTER TABLE bookkeeping_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookkeeping_vendor_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read bookkeeping accounts" ON bookkeeping_accounts;
DROP POLICY IF EXISTS "Admins create bookkeeping accounts" ON bookkeeping_accounts;
DROP POLICY IF EXISTS "Admins update bookkeeping accounts" ON bookkeeping_accounts;
DROP POLICY IF EXISTS "Admins delete bookkeeping accounts" ON bookkeeping_accounts;

CREATE POLICY "Admins read bookkeeping accounts"
  ON bookkeeping_accounts FOR SELECT TO authenticated
  USING (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins create bookkeeping accounts"
  ON bookkeeping_accounts FOR INSERT TO authenticated
  WITH CHECK (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins update bookkeeping accounts"
  ON bookkeeping_accounts FOR UPDATE TO authenticated
  USING (practice_id = get_practice_id() AND is_admin())
  WITH CHECK (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins delete bookkeeping accounts"
  ON bookkeeping_accounts FOR DELETE TO authenticated
  USING (practice_id = get_practice_id() AND is_admin());

DROP POLICY IF EXISTS "Admins read bookkeeping vendor rules" ON bookkeeping_vendor_rules;
DROP POLICY IF EXISTS "Admins create bookkeeping vendor rules" ON bookkeeping_vendor_rules;
DROP POLICY IF EXISTS "Admins update bookkeeping vendor rules" ON bookkeeping_vendor_rules;
DROP POLICY IF EXISTS "Admins delete bookkeeping vendor rules" ON bookkeeping_vendor_rules;

CREATE POLICY "Admins read bookkeeping vendor rules"
  ON bookkeeping_vendor_rules FOR SELECT TO authenticated
  USING (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins create bookkeeping vendor rules"
  ON bookkeeping_vendor_rules FOR INSERT TO authenticated
  WITH CHECK (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins update bookkeeping vendor rules"
  ON bookkeeping_vendor_rules FOR UPDATE TO authenticated
  USING (practice_id = get_practice_id() AND is_admin())
  WITH CHECK (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins delete bookkeeping vendor rules"
  ON bookkeeping_vendor_rules FOR DELETE TO authenticated
  USING (practice_id = get_practice_id() AND is_admin());

-- Financial bookkeeping data is only read or changed through admin-verified
-- server actions that use the service-role client.
REVOKE ALL ON bookkeeping_accounts FROM anon, authenticated;
REVOKE ALL ON bookkeeping_vendor_rules FROM anon, authenticated;
