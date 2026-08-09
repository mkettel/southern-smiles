-- ============================================================
-- Double-entry accounting journal
-- ============================================================

BEGIN;

CREATE TABLE accounting_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  description text NOT NULL CHECK (char_length(trim(description)) BETWEEN 1 AND 1000),
  memo text CHECK (memo IS NULL OR char_length(memo) <= 1000),
  source_transaction_id uuid REFERENCES financial_transactions(id) ON DELETE SET NULL,
  source_type text NOT NULL
    CHECK (source_type IN ('bank_transaction', 'transfer', 'opening_balance', 'manual')),
  transfer_kind text
    CHECK (transfer_kind IS NULL OR transfer_kind IN (
      'internal', 'credit_card_payment', 'line_of_credit_draw', 'loan_payment'
    )),
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'voided')),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (source_type = 'transfer' AND transfer_kind IS NOT NULL)
    OR (source_type <> 'transfer' AND transfer_kind IS NULL)
  )
);

CREATE TABLE accounting_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  journal_entry_id uuid NOT NULL REFERENCES accounting_journal_entries(id) ON DELETE CASCADE,
  financial_account_id uuid REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  bookkeeping_account_id uuid REFERENCES bookkeeping_accounts(id) ON DELETE RESTRICT,
  debit_cents bigint NOT NULL DEFAULT 0 CHECK (debit_cents >= 0),
  credit_cents bigint NOT NULL DEFAULT 0 CHECK (credit_cents >= 0),
  memo text CHECK (memo IS NULL OR char_length(memo) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((financial_account_id IS NOT NULL) <> (bookkeeping_account_id IS NOT NULL)),
  CHECK ((debit_cents > 0) <> (credit_cents > 0))
);

CREATE TABLE accounting_transaction_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  financial_transaction_id uuid NOT NULL REFERENCES financial_transactions(id) ON DELETE CASCADE,
  journal_entry_id uuid NOT NULL REFERENCES accounting_journal_entries(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (financial_transaction_id)
);

CREATE INDEX idx_accounting_journal_entries_practice_date
  ON accounting_journal_entries(practice_id, entry_date DESC)
  WHERE status = 'posted';
CREATE UNIQUE INDEX idx_accounting_journal_entries_source_transaction
  ON accounting_journal_entries(source_transaction_id)
  WHERE source_transaction_id IS NOT NULL;
CREATE INDEX idx_accounting_journal_lines_entry
  ON accounting_journal_lines(journal_entry_id);
CREATE INDEX idx_accounting_journal_lines_financial_account
  ON accounting_journal_lines(financial_account_id, journal_entry_id)
  WHERE financial_account_id IS NOT NULL;
CREATE INDEX idx_accounting_journal_lines_bookkeeping_account
  ON accounting_journal_lines(bookkeeping_account_id, journal_entry_id)
  WHERE bookkeeping_account_id IS NOT NULL;
CREATE INDEX idx_accounting_transaction_links_entry
  ON accounting_transaction_links(journal_entry_id);

ALTER TABLE accounting_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_transaction_links ENABLE ROW LEVEL SECURITY;

-- Ledger access stays behind admin-verified server actions.
REVOKE ALL ON accounting_journal_entries FROM anon, authenticated;
REVOKE ALL ON accounting_journal_lines FROM anon, authenticated;
REVOKE ALL ON accounting_transaction_links FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting_journal_entries TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting_journal_lines TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting_transaction_links TO service_role;

CREATE OR REPLACE FUNCTION verify_accounting_journal_entry_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  target_entry_id uuid := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
  line_count integer;
  total_debits bigint;
  total_credits bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM accounting_journal_entries WHERE id = target_entry_id) THEN
    RETURN NULL;
  END IF;

  SELECT count(*), COALESCE(sum(debit_cents), 0), COALESCE(sum(credit_cents), 0)
    INTO line_count, total_debits, total_credits
  FROM accounting_journal_lines
  WHERE journal_entry_id = target_entry_id;

  IF line_count < 2 OR total_debits <> total_credits THEN
    RAISE EXCEPTION 'Journal entry % is not balanced', target_entry_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER accounting_journal_entry_must_balance
AFTER INSERT OR UPDATE OR DELETE ON accounting_journal_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION verify_accounting_journal_entry_balance();

CREATE OR REPLACE FUNCTION post_categorized_financial_transaction(
  p_practice_id uuid,
  p_transaction_id uuid,
  p_bookkeeping_account_id uuid,
  p_review_note text,
  p_reviewed_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  imported financial_transactions%ROWTYPE;
  entry_id uuid;
  value_cents bigint;
  linked_source_type text;
BEGIN
  SELECT * INTO imported
  FROM financial_transactions
  WHERE id = p_transaction_id
    AND practice_id = p_practice_id
    AND is_removed = false
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF imported.account_id IS NULL THEN RAISE EXCEPTION 'Transaction has no financial account'; END IF;
  IF imported.pending THEN RAISE EXCEPTION 'Pending transactions cannot be posted'; END IF;
  IF imported.amount_cents = 0 THEN RAISE EXCEPTION 'Zero-value transactions cannot be posted'; END IF;

  PERFORM 1 FROM financial_accounts
  WHERE id = imported.account_id AND practice_id = p_practice_id
    AND is_active = true AND included_in_bookkeeping = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Financial account is not included in bookkeeping'; END IF;

  PERFORM 1 FROM bookkeeping_accounts
  WHERE id = p_bookkeeping_account_id AND practice_id = p_practice_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bookkeeping account not found'; END IF;

  SELECT entry.id, entry.source_type INTO entry_id, linked_source_type
  FROM accounting_transaction_links link
  JOIN accounting_journal_entries entry ON entry.id = link.journal_entry_id
  WHERE link.financial_transaction_id = imported.id;

  IF entry_id IS NOT NULL THEN
    IF linked_source_type <> 'bank_transaction' OR (
      SELECT count(*) FROM accounting_transaction_links WHERE journal_entry_id = entry_id
    ) <> 1 THEN
      RAISE EXCEPTION 'Remove the existing transfer match before categorizing this transaction';
    END IF;
    DELETE FROM accounting_journal_entries WHERE id = entry_id;
  END IF;

  INSERT INTO accounting_journal_entries (
    practice_id, entry_date, description, memo, source_transaction_id, source_type, created_by
  ) VALUES (
    p_practice_id, imported.transaction_date, imported.name, NULLIF(trim(p_review_note), ''),
    imported.id, 'bank_transaction', p_reviewed_by
  ) RETURNING id INTO entry_id;

  value_cents := abs(imported.amount_cents);
  IF imported.amount_cents > 0 THEN
    INSERT INTO accounting_journal_lines (
      practice_id, journal_entry_id, bookkeeping_account_id, debit_cents
    ) VALUES (p_practice_id, entry_id, p_bookkeeping_account_id, value_cents);
    INSERT INTO accounting_journal_lines (
      practice_id, journal_entry_id, financial_account_id, credit_cents
    ) VALUES (p_practice_id, entry_id, imported.account_id, value_cents);
  ELSE
    INSERT INTO accounting_journal_lines (
      practice_id, journal_entry_id, financial_account_id, debit_cents
    ) VALUES (p_practice_id, entry_id, imported.account_id, value_cents);
    INSERT INTO accounting_journal_lines (
      practice_id, journal_entry_id, bookkeeping_account_id, credit_cents
    ) VALUES (p_practice_id, entry_id, p_bookkeeping_account_id, value_cents);
  END IF;

  INSERT INTO accounting_transaction_links (
    practice_id, financial_transaction_id, journal_entry_id
  ) VALUES (p_practice_id, imported.id, entry_id);

  UPDATE financial_transactions SET
    bookkeeping_category = NULL,
    bookkeeping_account_id = p_bookkeeping_account_id,
    category_source = 'manual',
    review_status = 'reviewed',
    review_note = NULLIF(trim(p_review_note), ''),
    reviewed_by = p_reviewed_by,
    reviewed_at = now(),
    updated_at = now()
  WHERE id = imported.id;

  RETURN entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION post_financial_transfer(
  p_practice_id uuid,
  p_transaction_id uuid,
  p_other_financial_account_id uuid,
  p_matched_transaction_id uuid,
  p_transfer_kind text,
  p_review_note text,
  p_reviewed_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  imported financial_transactions%ROWTYPE;
  matched financial_transactions%ROWTYPE;
  entry_id uuid;
  value_cents bigint;
BEGIN
  IF p_transfer_kind NOT IN ('internal', 'credit_card_payment', 'line_of_credit_draw', 'loan_payment') THEN
    RAISE EXCEPTION 'Invalid transfer kind';
  END IF;

  SELECT * INTO imported
  FROM financial_transactions
  WHERE id = p_transaction_id AND practice_id = p_practice_id AND is_removed = false
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF imported.account_id IS NULL OR imported.pending THEN
    RAISE EXCEPTION 'Transaction cannot be posted as a transfer';
  END IF;
  IF imported.amount_cents = 0 THEN RAISE EXCEPTION 'Zero-value transactions cannot be posted'; END IF;
  IF imported.account_id = p_other_financial_account_id THEN
    RAISE EXCEPTION 'Choose a different account';
  END IF;

  PERFORM 1 FROM financial_accounts
  WHERE id = p_other_financial_account_id AND practice_id = p_practice_id
    AND is_active = true AND included_in_bookkeeping = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Other financial account is not included in bookkeeping'; END IF;

  IF EXISTS (
    SELECT 1 FROM accounting_transaction_links WHERE financial_transaction_id = imported.id
  ) THEN RAISE EXCEPTION 'Transaction is already posted'; END IF;

  IF p_matched_transaction_id IS NOT NULL THEN
    SELECT * INTO matched
    FROM financial_transactions
    WHERE id = p_matched_transaction_id AND practice_id = p_practice_id AND is_removed = false
    FOR UPDATE;
    IF NOT FOUND OR matched.account_id <> p_other_financial_account_id
      OR matched.amount_cents <> -imported.amount_cents THEN
      RAISE EXCEPTION 'The selected transaction is not a matching transfer';
    END IF;
    IF abs(matched.transaction_date - imported.transaction_date) > 7 THEN
      RAISE EXCEPTION 'Matching transfer must be within seven days';
    END IF;
    IF EXISTS (
      SELECT 1 FROM accounting_transaction_links WHERE financial_transaction_id = matched.id
    ) THEN RAISE EXCEPTION 'Matching transaction is already posted'; END IF;
  END IF;

  INSERT INTO accounting_journal_entries (
    practice_id, entry_date, description, memo, source_transaction_id, source_type, transfer_kind, created_by
  ) VALUES (
    p_practice_id, imported.transaction_date, imported.name, NULLIF(trim(p_review_note), ''),
    imported.id, 'transfer', p_transfer_kind, p_reviewed_by
  ) RETURNING id INTO entry_id;

  value_cents := abs(imported.amount_cents);
  IF imported.amount_cents > 0 THEN
    INSERT INTO accounting_journal_lines (
      practice_id, journal_entry_id, financial_account_id, credit_cents
    ) VALUES (p_practice_id, entry_id, imported.account_id, value_cents);
    INSERT INTO accounting_journal_lines (
      practice_id, journal_entry_id, financial_account_id, debit_cents
    ) VALUES (p_practice_id, entry_id, p_other_financial_account_id, value_cents);
  ELSE
    INSERT INTO accounting_journal_lines (
      practice_id, journal_entry_id, financial_account_id, debit_cents
    ) VALUES (p_practice_id, entry_id, imported.account_id, value_cents);
    INSERT INTO accounting_journal_lines (
      practice_id, journal_entry_id, financial_account_id, credit_cents
    ) VALUES (p_practice_id, entry_id, p_other_financial_account_id, value_cents);
  END IF;

  INSERT INTO accounting_transaction_links (
    practice_id, financial_transaction_id, journal_entry_id
  ) VALUES (p_practice_id, imported.id, entry_id);
  IF p_matched_transaction_id IS NOT NULL THEN
    INSERT INTO accounting_transaction_links (
      practice_id, financial_transaction_id, journal_entry_id
    ) VALUES (p_practice_id, p_matched_transaction_id, entry_id);
  END IF;

  UPDATE financial_transactions SET
    bookkeeping_category = NULL,
    bookkeeping_account_id = NULL,
    category_source = NULL,
    review_status = 'reviewed',
    review_note = NULLIF(trim(p_review_note), ''),
    reviewed_by = p_reviewed_by,
    reviewed_at = now(),
    updated_at = now()
  WHERE id = imported.id OR id = p_matched_transaction_id;

  RETURN entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION exclude_financial_transaction(
  p_practice_id uuid,
  p_transaction_id uuid,
  p_review_note text,
  p_reviewed_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  entry_id uuid;
BEGIN
  SELECT link.journal_entry_id INTO entry_id
  FROM accounting_transaction_links link
  WHERE link.financial_transaction_id = p_transaction_id
    AND link.practice_id = p_practice_id;

  IF entry_id IS NOT NULL AND (
    SELECT count(*) FROM accounting_transaction_links WHERE journal_entry_id = entry_id
  ) > 1 THEN
    RAISE EXCEPTION 'Remove the transfer match before excluding this transaction';
  END IF;
  IF entry_id IS NOT NULL THEN
    DELETE FROM accounting_journal_entries WHERE id = entry_id AND practice_id = p_practice_id;
  END IF;

  UPDATE financial_transactions SET
    bookkeeping_category = NULL,
    bookkeeping_account_id = NULL,
    category_source = NULL,
    review_status = 'excluded',
    review_note = NULLIF(trim(p_review_note), ''),
    reviewed_by = p_reviewed_by,
    reviewed_at = now(),
    updated_at = now()
  WHERE id = p_transaction_id AND practice_id = p_practice_id AND is_removed = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION verify_accounting_journal_entry_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION post_categorized_financial_transaction(uuid, uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION post_financial_transfer(uuid, uuid, uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION exclude_financial_transaction(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION post_categorized_financial_transaction(uuid, uuid, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION post_financial_transfer(uuid, uuid, uuid, uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION exclude_financial_transaction(uuid, uuid, text, uuid) TO service_role;

-- Preserve every existing approved classification as a balanced journal.
INSERT INTO accounting_journal_entries (
  practice_id, entry_date, description, memo, source_transaction_id,
  source_type, created_by, posted_at
)
SELECT transaction.practice_id, transaction.transaction_date,
  transaction.name, transaction.review_note, transaction.id,
  'bank_transaction', transaction.reviewed_by,
  COALESCE(transaction.reviewed_at, transaction.updated_at, now())
FROM financial_transactions transaction
WHERE transaction.review_status = 'reviewed'
  AND transaction.bookkeeping_account_id IS NOT NULL
  AND transaction.account_id IS NOT NULL
  AND transaction.is_removed = false
  AND transaction.pending = false
  AND transaction.amount_cents <> 0;

INSERT INTO accounting_journal_lines (
  practice_id, journal_entry_id, bookkeeping_account_id, debit_cents, credit_cents
)
SELECT transaction.practice_id, entry.id, transaction.bookkeeping_account_id,
  CASE WHEN transaction.amount_cents > 0 THEN abs(transaction.amount_cents) ELSE 0 END,
  CASE WHEN transaction.amount_cents < 0 THEN abs(transaction.amount_cents) ELSE 0 END
FROM accounting_journal_entries entry
JOIN financial_transactions transaction ON transaction.id = entry.source_transaction_id
WHERE entry.source_type = 'bank_transaction';

INSERT INTO accounting_journal_lines (
  practice_id, journal_entry_id, financial_account_id, debit_cents, credit_cents
)
SELECT transaction.practice_id, entry.id, transaction.account_id,
  CASE WHEN transaction.amount_cents < 0 THEN abs(transaction.amount_cents) ELSE 0 END,
  CASE WHEN transaction.amount_cents > 0 THEN abs(transaction.amount_cents) ELSE 0 END
FROM accounting_journal_entries entry
JOIN financial_transactions transaction ON transaction.id = entry.source_transaction_id
WHERE entry.source_type = 'bank_transaction';

INSERT INTO accounting_transaction_links (
  practice_id, financial_transaction_id, journal_entry_id
)
SELECT transaction.practice_id, transaction.id, entry.id
FROM accounting_journal_entries entry
JOIN financial_transactions transaction ON transaction.id = entry.source_transaction_id
WHERE entry.source_type = 'bank_transaction';

COMMIT;
