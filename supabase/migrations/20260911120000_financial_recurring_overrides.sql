-- Per-practice confirm/dismiss decisions for locally detected recurring
-- streams (bills and subscriptions). Detection itself is computed from
-- financial_transactions at read time; only the override is stored.
-- Access goes through server actions with the service role, matching the
-- other financial tables.

CREATE TABLE IF NOT EXISTS financial_recurring_overrides (
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  stream_key text NOT NULL CHECK (char_length(stream_key) BETWEEN 1 AND 200),
  status text NOT NULL CHECK (status IN ('confirmed', 'dismissed')),
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (practice_id, stream_key)
);

ALTER TABLE financial_recurring_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financial_recurring_overrides FROM anon, authenticated;
