-- ============================================================
-- Migration 042: Cherry approved financing imports
-- ============================================================
-- Stores de-identified Cherry approval events used to calculate the weekly
-- Approved Financing stat. Raw email bodies and patient identity are not stored.

CREATE TABLE IF NOT EXISTS cherry_financing_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'cherry_email' CHECK (source IN ('cherry_email')),
  source_message_id text NOT NULL CHECK (char_length(trim(source_message_id)) BETWEEN 1 AND 300),
  approved_at timestamptz NOT NULL,
  week_start date NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  imported_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cherry_financing_approvals_message_key UNIQUE (practice_id, source, source_message_id)
);

CREATE INDEX IF NOT EXISTS idx_cherry_financing_approvals_practice_week
  ON cherry_financing_approvals(practice_id, week_start DESC);

CREATE INDEX IF NOT EXISTS idx_cherry_financing_approvals_approved_at
  ON cherry_financing_approvals(practice_id, approved_at DESC);

ALTER TABLE cherry_financing_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read cherry financing approvals" ON cherry_financing_approvals;
DROP POLICY IF EXISTS "Admins create cherry financing approvals" ON cherry_financing_approvals;
DROP POLICY IF EXISTS "Admins update cherry financing approvals" ON cherry_financing_approvals;
DROP POLICY IF EXISTS "Admins delete cherry financing approvals" ON cherry_financing_approvals;

CREATE POLICY "Admins read cherry financing approvals"
  ON cherry_financing_approvals FOR SELECT
  USING (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins create cherry financing approvals"
  ON cherry_financing_approvals FOR INSERT
  WITH CHECK (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins update cherry financing approvals"
  ON cherry_financing_approvals FOR UPDATE
  USING (practice_id = get_practice_id() AND is_admin())
  WITH CHECK (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins delete cherry financing approvals"
  ON cherry_financing_approvals FOR DELETE
  USING (practice_id = get_practice_id() AND is_admin());
