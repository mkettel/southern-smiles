-- ============================================================
-- Read-only financial connections and credit-card debt tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS financial_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'plaid' CHECK (provider = 'plaid'),
  provider_item_id text NOT NULL CHECK (char_length(trim(provider_item_id)) BETWEEN 1 AND 300),
  access_token_ciphertext text NOT NULL CHECK (char_length(access_token_ciphertext) > 20),
  institution_id text,
  institution_name text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'reconnect_required', 'error', 'disconnected')),
  consent_expiration_time timestamptz,
  last_synced_at timestamptz,
  last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 1000),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_connections_item_key
    UNIQUE (practice_id, provider, provider_item_id)
);

CREATE TABLE IF NOT EXISTS financial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES financial_connections(id) ON DELETE CASCADE,
  provider_account_id text NOT NULL
    CHECK (char_length(trim(provider_account_id)) BETWEEN 1 AND 300),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 300),
  official_name text,
  mask text CHECK (mask IS NULL OR char_length(mask) <= 12),
  account_type text NOT NULL DEFAULT 'credit',
  account_subtype text,
  currency_code text NOT NULL DEFAULT 'USD' CHECK (char_length(currency_code) = 3),
  current_balance_cents bigint,
  available_balance_cents bigint,
  credit_limit_cents bigint,
  minimum_payment_cents bigint,
  next_payment_due_date date,
  included_in_total boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  balance_updated_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_accounts_provider_key
    UNIQUE (connection_id, provider_account_id)
);

CREATE TABLE IF NOT EXISTS financial_balance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES financial_accounts(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  balance_cents bigint NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_balance_snapshots_account_day_key
    UNIQUE (account_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_financial_connections_practice_status
  ON financial_connections(practice_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_accounts_practice_active
  ON financial_accounts(practice_id, is_active, included_in_total);

CREATE INDEX IF NOT EXISTS idx_financial_accounts_connection
  ON financial_accounts(connection_id, is_active);

CREATE INDEX IF NOT EXISTS idx_financial_balance_snapshots_practice_date
  ON financial_balance_snapshots(practice_id, snapshot_date DESC);

ALTER TABLE financial_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_balance_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read financial connections" ON financial_connections;
DROP POLICY IF EXISTS "Admins create financial connections" ON financial_connections;
DROP POLICY IF EXISTS "Admins update financial connections" ON financial_connections;
DROP POLICY IF EXISTS "Admins delete financial connections" ON financial_connections;

CREATE POLICY "Admins read financial connections"
  ON financial_connections FOR SELECT TO authenticated
  USING (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins create financial connections"
  ON financial_connections FOR INSERT TO authenticated
  WITH CHECK (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins update financial connections"
  ON financial_connections FOR UPDATE TO authenticated
  USING (practice_id = get_practice_id() AND is_admin())
  WITH CHECK (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins delete financial connections"
  ON financial_connections FOR DELETE TO authenticated
  USING (practice_id = get_practice_id() AND is_admin());

DROP POLICY IF EXISTS "Admins read financial accounts" ON financial_accounts;
DROP POLICY IF EXISTS "Admins create financial accounts" ON financial_accounts;
DROP POLICY IF EXISTS "Admins update financial accounts" ON financial_accounts;
DROP POLICY IF EXISTS "Admins delete financial accounts" ON financial_accounts;

CREATE POLICY "Admins read financial accounts"
  ON financial_accounts FOR SELECT TO authenticated
  USING (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins create financial accounts"
  ON financial_accounts FOR INSERT TO authenticated
  WITH CHECK (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins update financial accounts"
  ON financial_accounts FOR UPDATE TO authenticated
  USING (practice_id = get_practice_id() AND is_admin())
  WITH CHECK (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins delete financial accounts"
  ON financial_accounts FOR DELETE TO authenticated
  USING (practice_id = get_practice_id() AND is_admin());

DROP POLICY IF EXISTS "Admins read financial balance snapshots" ON financial_balance_snapshots;
DROP POLICY IF EXISTS "Admins create financial balance snapshots" ON financial_balance_snapshots;
DROP POLICY IF EXISTS "Admins update financial balance snapshots" ON financial_balance_snapshots;
DROP POLICY IF EXISTS "Admins delete financial balance snapshots" ON financial_balance_snapshots;

CREATE POLICY "Admins read financial balance snapshots"
  ON financial_balance_snapshots FOR SELECT TO authenticated
  USING (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins create financial balance snapshots"
  ON financial_balance_snapshots FOR INSERT TO authenticated
  WITH CHECK (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins update financial balance snapshots"
  ON financial_balance_snapshots FOR UPDATE TO authenticated
  USING (practice_id = get_practice_id() AND is_admin())
  WITH CHECK (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins delete financial balance snapshots"
  ON financial_balance_snapshots FOR DELETE TO authenticated
  USING (practice_id = get_practice_id() AND is_admin());

-- These tables are intentionally server-only. The service-role client is used
-- by authenticated admin actions after the user's practice and role are checked.
REVOKE ALL ON financial_connections FROM anon, authenticated;
REVOKE ALL ON financial_accounts FROM anon, authenticated;
REVOKE ALL ON financial_balance_snapshots FROM anon, authenticated;

WITH owner_posts AS (
  SELECT DISTINCT ON (post.practice_id)
    post.practice_id,
    post.id AS post_id
  FROM posts post
  JOIN divisions division ON division.id = post.division_id
  WHERE lower(trim(post.title)) = 'owner'
     OR lower(trim(division.name)) = 'owner'
  ORDER BY
    post.practice_id,
    (lower(trim(post.title)) = 'owner') DESC,
    post.created_at
)
INSERT INTO stats (
  practice_id,
  name,
  abbreviation,
  description,
  stat_type,
  good_direction,
  post_id,
  display_order,
  is_active,
  is_private,
  daily_tracking_enabled,
  weekly_formula
)
SELECT
  owner.practice_id,
  'Total Credit Card Debt',
  'CC Debt',
  'Current balances owed across the credit cards included in Financial Connections.',
  'dollar',
  'down',
  owner.post_id,
  COALESCE((
    SELECT max(existing.display_order) + 1
    FROM stats existing
    WHERE existing.post_id = owner.post_id
  ), 1),
  true,
  true,
  false,
  'manual'
FROM owner_posts owner
WHERE NOT EXISTS (
  SELECT 1
  FROM stats existing
  WHERE existing.practice_id = owner.practice_id
    AND lower(trim(existing.name)) = 'total credit card debt'
);
