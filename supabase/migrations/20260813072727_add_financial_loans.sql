BEGIN;

CREATE TABLE financial_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  bookkeeping_account_id uuid NOT NULL REFERENCES bookkeeping_accounts(id) ON DELETE RESTRICT,
  linked_financial_account_id uuid REFERENCES financial_accounts(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 200),
  lender_name text NOT NULL CHECK (char_length(trim(lender_name)) BETWEEN 1 AND 200),
  loan_type text NOT NULL CHECK (loan_type IN (
    'term_loan', 'line_of_credit', 'equipment', 'vehicle',
    'related_party', 'merchant_advance', 'other'
  )),
  account_reference text,
  original_principal_cents bigint CHECK (original_principal_cents IS NULL OR original_principal_cents >= 0),
  current_balance_cents bigint NOT NULL DEFAULT 0 CHECK (current_balance_cents >= 0),
  balance_as_of_date date NOT NULL DEFAULT CURRENT_DATE,
  scheduled_payment_cents bigint CHECK (scheduled_payment_cents IS NULL OR scheduled_payment_cents > 0),
  payment_frequency text CHECK (payment_frequency IS NULL OR payment_frequency IN (
    'weekly', 'biweekly', 'semimonthly', 'monthly', 'irregular'
  )),
  annual_interest_rate numeric(8, 5) CHECK (
    annual_interest_rate IS NULL OR (annual_interest_rate >= 0 AND annual_interest_rate <= 100)
  ),
  interest_method text NOT NULL DEFAULT 'unknown' CHECK (interest_method IN (
    'amortizing', 'fixed_fee', 'interest_free', 'revolving', 'unknown'
  )),
  originated_on date,
  maturity_date date,
  next_payment_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid_off', 'archived')),
  terms_status text NOT NULL DEFAULT 'needs_terms' CHECK (terms_status IN ('verified', 'partial', 'needs_terms')),
  is_personal boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'quickbooks_browser')),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_id, bookkeeping_account_id)
);

CREATE TABLE financial_loan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  loan_id uuid NOT NULL REFERENCES financial_loans(id) ON DELETE CASCADE,
  financial_transaction_id uuid REFERENCES financial_transactions(id) ON DELETE SET NULL,
  journal_entry_id uuid REFERENCES accounting_journal_entries(id) ON DELETE SET NULL,
  payment_date date NOT NULL,
  total_cents bigint NOT NULL CHECK (total_cents > 0),
  principal_cents bigint NOT NULL DEFAULT 0 CHECK (principal_cents >= 0),
  interest_cents bigint NOT NULL DEFAULT 0 CHECK (interest_cents >= 0),
  fee_cents bigint NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  balance_after_cents bigint CHECK (balance_after_cents IS NULL OR balance_after_cents >= 0),
  activity_kind text NOT NULL DEFAULT 'payment' CHECK (activity_kind IN ('payment', 'draw', 'adjustment')),
  source text NOT NULL DEFAULT 'bookkeeping' CHECK (source IN ('bookkeeping', 'quickbooks_browser', 'manual')),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (principal_cents + interest_cents + fee_cents = total_cents)
);

CREATE UNIQUE INDEX idx_financial_loan_payments_transaction
  ON financial_loan_payments(financial_transaction_id)
  WHERE financial_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX idx_financial_loan_payments_import
  ON financial_loan_payments(loan_id, payment_date, total_cents, source)
  WHERE source = 'quickbooks_browser';
CREATE INDEX idx_financial_loans_practice_status
  ON financial_loans(practice_id, status, name);
CREATE INDEX idx_financial_loan_payments_loan_date
  ON financial_loan_payments(loan_id, payment_date DESC);

ALTER TABLE financial_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_loan_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financial_loans FROM anon, authenticated;
REVOKE ALL ON financial_loan_payments FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_loans TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_loan_payments TO service_role;

CREATE OR REPLACE FUNCTION post_financial_loan_transaction(
  p_practice_id uuid,
  p_transaction_id uuid,
  p_loan_id uuid,
  p_activity_kind text,
  p_principal_cents bigint,
  p_interest_cents bigint,
  p_fee_cents bigint,
  p_interest_account_id uuid,
  p_fee_account_id uuid,
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
  loan financial_loans%ROWTYPE;
  entry_id uuid;
  value_cents bigint;
  next_balance bigint;
BEGIN
  IF p_activity_kind NOT IN ('payment', 'draw') THEN RAISE EXCEPTION 'Invalid loan activity'; END IF;
  IF p_principal_cents < 0 OR p_interest_cents < 0 OR p_fee_cents < 0 THEN
    RAISE EXCEPTION 'Loan split amounts cannot be negative';
  END IF;

  SELECT * INTO imported FROM financial_transactions
  WHERE id = p_transaction_id AND practice_id = p_practice_id AND is_removed = false
  FOR UPDATE;
  IF NOT FOUND OR imported.account_id IS NULL OR imported.pending OR imported.amount_cents = 0 THEN
    RAISE EXCEPTION 'Transaction cannot be posted to a loan';
  END IF;

  SELECT * INTO loan FROM financial_loans
  WHERE id = p_loan_id AND practice_id = p_practice_id AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active loan not found'; END IF;
  IF EXISTS (SELECT 1 FROM accounting_transaction_links WHERE financial_transaction_id = imported.id) THEN
    RAISE EXCEPTION 'Transaction is already posted';
  END IF;

  value_cents := abs(imported.amount_cents);
  IF p_principal_cents + p_interest_cents + p_fee_cents <> value_cents THEN
    RAISE EXCEPTION 'Principal, interest, and fees must equal the transaction amount';
  END IF;
  IF p_activity_kind = 'payment' AND imported.amount_cents < 0 THEN
    RAISE EXCEPTION 'A loan payment must be an outflow';
  END IF;
  IF p_activity_kind = 'draw' AND (imported.amount_cents > 0 OR p_interest_cents <> 0 OR p_fee_cents <> 0) THEN
    RAISE EXCEPTION 'A loan draw must be an inflow with no interest or fee split';
  END IF;
  IF p_interest_cents > 0 THEN
    PERFORM 1 FROM bookkeeping_accounts
    WHERE id = p_interest_account_id AND practice_id = p_practice_id AND is_active = true
      AND account_type ILIKE '%expense%';
    IF NOT FOUND THEN RAISE EXCEPTION 'Choose an interest expense account'; END IF;
  END IF;
  IF p_fee_cents > 0 THEN
    PERFORM 1 FROM bookkeeping_accounts
    WHERE id = p_fee_account_id AND practice_id = p_practice_id AND is_active = true
      AND account_type ILIKE '%expense%';
    IF NOT FOUND THEN RAISE EXCEPTION 'Choose a fee expense account'; END IF;
  END IF;

  INSERT INTO accounting_journal_entries (
    practice_id, entry_date, description, memo, source_transaction_id,
    source_type, transfer_kind, created_by
  ) VALUES (
    p_practice_id, imported.transaction_date, imported.name,
    NULLIF(trim(p_review_note), ''), imported.id, 'transfer',
    CASE WHEN p_activity_kind = 'draw' THEN 'line_of_credit_draw' ELSE 'loan_payment' END,
    p_reviewed_by
  ) RETURNING id INTO entry_id;

  IF p_activity_kind = 'payment' THEN
    INSERT INTO accounting_journal_lines (practice_id, journal_entry_id, financial_account_id, credit_cents)
      VALUES (p_practice_id, entry_id, imported.account_id, value_cents);
    IF p_principal_cents > 0 THEN
      INSERT INTO accounting_journal_lines (practice_id, journal_entry_id, bookkeeping_account_id, debit_cents)
        VALUES (p_practice_id, entry_id, loan.bookkeeping_account_id, p_principal_cents);
    END IF;
    IF p_interest_cents > 0 THEN
      INSERT INTO accounting_journal_lines (practice_id, journal_entry_id, bookkeeping_account_id, debit_cents)
        VALUES (p_practice_id, entry_id, p_interest_account_id, p_interest_cents);
    END IF;
    IF p_fee_cents > 0 THEN
      INSERT INTO accounting_journal_lines (practice_id, journal_entry_id, bookkeeping_account_id, debit_cents)
        VALUES (p_practice_id, entry_id, p_fee_account_id, p_fee_cents);
    END IF;
    next_balance := greatest(0, loan.current_balance_cents - p_principal_cents);
  ELSE
    INSERT INTO accounting_journal_lines (practice_id, journal_entry_id, financial_account_id, debit_cents)
      VALUES (p_practice_id, entry_id, imported.account_id, value_cents);
    INSERT INTO accounting_journal_lines (practice_id, journal_entry_id, bookkeeping_account_id, credit_cents)
      VALUES (p_practice_id, entry_id, loan.bookkeeping_account_id, p_principal_cents);
    next_balance := loan.current_balance_cents + p_principal_cents;
  END IF;

  INSERT INTO accounting_transaction_links (practice_id, financial_transaction_id, journal_entry_id)
    VALUES (p_practice_id, imported.id, entry_id);
  INSERT INTO financial_loan_payments (
    practice_id, loan_id, financial_transaction_id, journal_entry_id, payment_date,
    total_cents, principal_cents, interest_cents, fee_cents, balance_after_cents,
    activity_kind, source, notes, created_by
  ) VALUES (
    p_practice_id, loan.id, imported.id, entry_id, imported.transaction_date,
    value_cents, p_principal_cents, p_interest_cents, p_fee_cents, next_balance,
    p_activity_kind, 'bookkeeping', NULLIF(trim(p_review_note), ''), p_reviewed_by
  );
  UPDATE financial_loans SET current_balance_cents = next_balance,
    balance_as_of_date = imported.transaction_date,
    status = CASE WHEN next_balance = 0 THEN 'paid_off' ELSE status END,
    updated_by = p_reviewed_by, updated_at = now()
  WHERE id = loan.id;
  UPDATE financial_transactions SET bookkeeping_category = NULL,
    bookkeeping_account_id = loan.bookkeeping_account_id, category_source = 'manual',
    review_status = 'reviewed', review_note = NULLIF(trim(p_review_note), ''),
    reviewed_by = p_reviewed_by, reviewed_at = now(), updated_at = now()
  WHERE id = imported.id;
  RETURN entry_id;
END;
$$;

REVOKE ALL ON FUNCTION post_financial_loan_transaction(
  uuid, uuid, uuid, text, bigint, bigint, bigint, uuid, uuid, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION post_financial_loan_transaction(
  uuid, uuid, uuid, text, bigint, bigint, bigint, uuid, uuid, text, uuid
) TO service_role;

-- Seed only the Southern Smiles organization. Values are verified read-only
-- snapshots from its QuickBooks registers on 2026-08-13.
WITH target AS (SELECT id FROM practices WHERE slug = 'ssmiles'),
seed(name, lender, account_name, loan_type, reference, original_cents, balance_cents,
  payment_cents, frequency, method, originated_on, status, terms_status, is_personal, notes) AS (
  VALUES
  ('AMEX personal loan', 'American Express', 'Loan - AMEX ($953.86) (personal)', 'term_loan', NULL, 3000000, 680155, 95386, 'monthly', 'unknown', DATE '2024-04-03', 'active', 'needs_terms', true, 'QuickBooks register shows recent $953.86 payments; APR and maturity need confirmation.'),
  ('Amex line of credit', 'American Express', 'Loan - Amex LOC', 'line_of_credit', NULL, NULL, 2002720, 246608, 'monthly', 'revolving', NULL, 'active', 'needs_terms', false, 'Revolving draws and payments; credit limit, APR, and statement terms need confirmation.'),
  ('Intraoral scanner', 'EverBank', 'Loan - EverBank - Intraoral Scanner ($498.45)', 'equipment', 'AC-BUND20478295', 1714000, 735942, 49845, 'monthly', 'amortizing', DATE '2024-05-17', 'active', 'partial', false, 'Recent principal and interest splits reconstructed from QuickBooks.'),
  ('3D x-ray', 'EverBank', 'Loan - EverBank 3D x-ray ($1084.01)', 'equipment', 'AC-BUND20483370', 3672183, 1376954, 108401, 'monthly', 'amortizing', DATE '2024-08-21', 'active', 'partial', false, 'Recent principal and interest splits reconstructed from QuickBooks.'),
  ('Kelly Coffield loan', 'Kelly Coffield', 'Loan - from Kelly Coffield (father in law - no interest)', 'related_party', NULL, 5000000, 3350000, NULL, 'irregular', 'interest_free', DATE '2024-09-12', 'active', 'verified', false, 'No-interest related-party loan; QuickBooks shows a $16,500 principal payment in January 2026.'),
  ('Fundation Group 475608', 'Fundation Group', 'Loan - Fundation Group ($1265.75)', 'term_loan', '475608', 10000000, 7451024, 126575, 'semimonthly', 'amortizing', DATE '2025-05-28', 'active', 'partial', false, 'Management program financing; recent principal split reconstructed from QuickBooks.'),
  ('Fundation Group 10020573', 'Fundation Group', 'Loan - Fundation Group ($743.57)', 'term_loan', '10020573', 3359700, 2283817, 37179, 'semimonthly', 'amortizing', DATE '2025-11-01', 'active', 'partial', false, 'Current bank payments are $371.79; QuickBooks account label reflects an older $743.57 amount.'),
  ('Fundbox advance', 'Fundbox', 'Loan - Fundbox', 'merchant_advance', NULL, 1900000, 1431270, 46873, 'weekly', 'fixed_fee', DATE '2026-05-15', 'active', 'needs_terms', false, 'QuickBooks records weekly payments as principal; fixed financing fee terms need confirmation.'),
  ('Mazda CX-5', 'Bank of America', 'Loan - Mazda CX-5 ($250)', 'vehicle', 'CKF499598706POS', 1700000, 1400000, 25000, 'biweekly', 'unknown', DATE '2026-01-31', 'active', 'needs_terms', false, 'QuickBooks records $250 biweekly payments; APR and maturity need confirmation.'),
  ('Security First loan', 'Security First', 'Loan - Security First ($1619.43)', 'term_loan', NULL, 5000000, 3630343, 161988, 'monthly', 'amortizing', DATE '2025-07-20', 'active', 'partial', false, 'Recent principal and interest splits reconstructed from QuickBooks; account label payment differs by $0.45.'),
  ('Dental Practice Loan', 'Unknown', '2500 Dental Practice Loan', 'term_loan', '2500', NULL, 0, NULL, NULL, 'unknown', NULL, 'paid_off', 'needs_terms', false, 'Closed in QuickBooks.'),
  ('Mazda closed loan', 'Mazda', 'Loan - Mazda ($540.68)', 'vehicle', NULL, NULL, 0, 54068, 'monthly', 'unknown', NULL, 'paid_off', 'needs_terms', false, 'Closed in QuickBooks.'),
  ('MasterCard line of credit', 'Wells Fargo', 'MasterCard LOC (5483)', 'line_of_credit', '5483', NULL, 359915, NULL, 'irregular', 'revolving', NULL, 'active', 'needs_terms', false, 'Connected line of credit; limit, APR, and payment terms need confirmation.')
)
INSERT INTO financial_loans (
  practice_id, bookkeeping_account_id, linked_financial_account_id, name, lender_name,
  loan_type, account_reference, original_principal_cents, current_balance_cents,
  balance_as_of_date, scheduled_payment_cents, payment_frequency, interest_method,
  originated_on, status, terms_status, is_personal, source, notes
)
SELECT target.id, account.id,
  CASE WHEN seed.reference = '5483' THEN (
    SELECT fa.id FROM financial_accounts fa
    WHERE fa.practice_id = target.id AND fa.mask = '5483' LIMIT 1
  ) END,
  seed.name, seed.lender, seed.loan_type, seed.reference, seed.original_cents,
  seed.balance_cents, DATE '2026-08-13', seed.payment_cents, seed.frequency,
  seed.method, seed.originated_on, seed.status, seed.terms_status, seed.is_personal,
  'quickbooks_browser', seed.notes
FROM seed CROSS JOIN target
JOIN bookkeeping_accounts account ON account.practice_id = target.id
  AND (
    lower(account.name) = lower(seed.account_name)
    OR concat_ws(' ', account.account_number, account.name) = seed.account_name
  )
ON CONFLICT (practice_id, bookkeeping_account_id) DO NOTHING;

WITH payment_seed(loan_name, payment_date, total_cents, principal_cents, interest_cents, balance_after_cents, notes) AS (
  VALUES
  ('Intraoral scanner', DATE '2026-07-17', 49845, 48309, 1536, 735942, 'Split reconstructed from QuickBooks register.'),
  ('3D x-ray', DATE '2026-07-21', 108401, 103479, 4922, 1376954, 'Split reconstructed from QuickBooks register.'),
  ('Fundation Group 475608', DATE '2026-07-28', 126575, 47716, 78859, 7451024, 'Split reconstructed from QuickBooks register.'),
  ('Fundation Group 10020573', DATE '2026-07-24', 37179, 34414, 2765, 2283817, 'Split reconstructed from QuickBooks register.'),
  ('Security First loan', DATE '2026-05-20', 161988, 131870, 30118, 3630343, 'Split reconstructed from QuickBooks register.'),
  ('Kelly Coffield loan', DATE '2026-01-31', 1650000, 1650000, 0, 3350000, 'Principal payment recorded in QuickBooks as paid personally.')
)
INSERT INTO financial_loan_payments (
  practice_id, loan_id, payment_date, total_cents, principal_cents, interest_cents,
  fee_cents, balance_after_cents, activity_kind, source, notes
)
SELECT loan.practice_id, loan.id, seed.payment_date, seed.total_cents,
  seed.principal_cents, seed.interest_cents, 0, seed.balance_after_cents,
  'payment', 'quickbooks_browser', seed.notes
FROM payment_seed seed
JOIN financial_loans loan ON loan.name = seed.loan_name
JOIN practices practice ON practice.id = loan.practice_id AND practice.slug = 'ssmiles'
ON CONFLICT DO NOTHING;

COMMIT;
