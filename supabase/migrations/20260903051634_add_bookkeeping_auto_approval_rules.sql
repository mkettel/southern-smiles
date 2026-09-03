CREATE TABLE bookkeeping_auto_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  financial_account_id uuid NOT NULL REFERENCES financial_accounts(id) ON DELETE CASCADE,
  transaction_fingerprint text NOT NULL
    CHECK (char_length(trim(transaction_fingerprint)) BETWEEN 8 AND 300),
  direction text NOT NULL CHECK (direction IN ('outflow', 'inflow')),
  bookkeeping_account_id uuid NOT NULL REFERENCES bookkeeping_accounts(id) ON DELETE CASCADE,
  confirmation_count integer NOT NULL DEFAULT 1 CHECK (confirmation_count > 0),
  is_enabled boolean NOT NULL DEFAULT false,
  last_confirmed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookkeeping_auto_rules_match_key UNIQUE (
    practice_id,
    financial_account_id,
    transaction_fingerprint,
    direction
  )
);

CREATE INDEX idx_bookkeeping_auto_rules_enabled
  ON bookkeeping_auto_rules(practice_id, financial_account_id, direction)
  WHERE is_enabled = true;

ALTER TABLE bookkeeping_auto_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read bookkeeping auto rules"
  ON bookkeeping_auto_rules FOR SELECT TO authenticated
  USING (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins update bookkeeping auto rules"
  ON bookkeeping_auto_rules FOR UPDATE TO authenticated
  USING (practice_id = get_practice_id() AND is_admin())
  WITH CHECK (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins delete bookkeeping auto rules"
  ON bookkeeping_auto_rules FOR DELETE TO authenticated
  USING (practice_id = get_practice_id() AND is_admin());

REVOKE ALL ON bookkeeping_auto_rules FROM anon, authenticated;

CREATE OR REPLACE FUNCTION confirm_bookkeeping_auto_rule(
  p_practice_id uuid,
  p_financial_account_id uuid,
  p_transaction_fingerprint text,
  p_direction text,
  p_bookkeeping_account_id uuid,
  p_confirmed_by uuid
)
RETURNS TABLE (confirmation_count integer, is_enabled boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  existing bookkeeping_auto_rules%ROWTYPE;
  next_count integer;
BEGIN
  IF char_length(trim(p_transaction_fingerprint)) NOT BETWEEN 8 AND 300 THEN
    RAISE EXCEPTION 'Invalid transaction fingerprint';
  END IF;
  IF p_direction NOT IN ('outflow', 'inflow') THEN
    RAISE EXCEPTION 'Invalid transaction direction';
  END IF;

  PERFORM 1 FROM financial_accounts
  WHERE id = p_financial_account_id AND practice_id = p_practice_id
    AND is_active = true AND included_in_bookkeeping = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Financial account is not included in bookkeeping'; END IF;

  PERFORM 1 FROM bookkeeping_accounts
  WHERE id = p_bookkeeping_account_id AND practice_id = p_practice_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bookkeeping account not found'; END IF;

  SELECT * INTO existing
  FROM bookkeeping_auto_rules
  WHERE practice_id = p_practice_id
    AND financial_account_id = p_financial_account_id
    AND transaction_fingerprint = p_transaction_fingerprint
    AND direction = p_direction
  FOR UPDATE;

  IF FOUND AND existing.bookkeeping_account_id = p_bookkeeping_account_id THEN
    next_count := existing.confirmation_count + 1;
  ELSE
    next_count := 1;
  END IF;

  INSERT INTO bookkeeping_auto_rules (
    practice_id,
    financial_account_id,
    transaction_fingerprint,
    direction,
    bookkeeping_account_id,
    confirmation_count,
    is_enabled,
    last_confirmed_by,
    updated_at
  ) VALUES (
    p_practice_id,
    p_financial_account_id,
    p_transaction_fingerprint,
    p_direction,
    p_bookkeeping_account_id,
    next_count,
    next_count >= 3,
    p_confirmed_by,
    now()
  )
  ON CONFLICT (
    practice_id,
    financial_account_id,
    transaction_fingerprint,
    direction
  ) DO UPDATE SET
    bookkeeping_account_id = EXCLUDED.bookkeeping_account_id,
    confirmation_count = EXCLUDED.confirmation_count,
    is_enabled = EXCLUDED.is_enabled,
    last_confirmed_by = EXCLUDED.last_confirmed_by,
    updated_at = now();

  RETURN QUERY SELECT next_count, next_count >= 3;
END;
$$;

REVOKE ALL ON FUNCTION confirm_bookkeeping_auto_rule(uuid, uuid, text, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION confirm_bookkeeping_auto_rule(uuid, uuid, text, text, uuid, uuid)
  TO service_role;
