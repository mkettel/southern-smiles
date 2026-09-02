BEGIN;

-- Preserve the lender/bookkeeper balance snapshot as an immutable baseline.
-- Posted bank activity is then replayed only when it occurs after that snapshot.
ALTER TABLE financial_loans
  ADD COLUMN balance_anchor_cents bigint,
  ADD COLUMN balance_anchor_date date;

UPDATE financial_loans
SET balance_anchor_cents = current_balance_cents,
    balance_anchor_date = balance_as_of_date;

ALTER TABLE financial_loans
  ALTER COLUMN balance_anchor_cents SET NOT NULL,
  ALTER COLUMN balance_anchor_date SET NOT NULL,
  ADD CONSTRAINT financial_loans_balance_anchor_nonnegative
    CHECK (balance_anchor_cents >= 0);

UPDATE financial_loans AS loan
SET interest_method = 'amortizing',
    annual_interest_rate = 8.99,
    originated_on = DATE '2024-04-03',
    maturity_date = DATE '2027-04-09',
    terms_status = 'verified',
    notes = 'Personal American Express installment loan paid by the business. The signed agreement confirms $30,000 principal, 8.99% fixed interest, 8.98% APR, 35 payments of $953.86, and a final $946.69 payment due Apr 9, 2027.'
FROM practices AS practice
WHERE loan.practice_id = practice.id
  AND practice.slug = 'ssmiles'
  AND loan.name = 'AMEX personal loan';

UPDATE financial_loans AS loan
SET loan_type = 'merchant_advance',
    interest_method = 'fixed_fee',
    original_principal_cents = 1900000,
    maturity_date = NULL,
    terms_status = 'partial',
    notes = 'Fundbox direct draw of $19,000 on May 14, 2026. Observed weekly debits are $468.73, split as $244.81 principal and $223.92 fee. Fundbox did not provide a contractual total schedule, so future activity remains transaction-history driven.'
FROM practices AS practice
WHERE loan.practice_id = practice.id
  AND practice.slug = 'ssmiles'
  AND loan.name = 'Fundbox advance';

DELETE FROM financial_loan_schedule_entries AS schedule
USING financial_loans AS loan, practices AS practice
WHERE schedule.loan_id = loan.id
  AND loan.practice_id = practice.id
  AND practice.slug = 'ssmiles'
  AND loan.name IN ('3D x-ray', 'Fundation Group 475608', 'Security First loan', 'AMEX personal loan', 'Mazda CX-5', 'Fundbox advance');

-- EverBank 3D X-ray: 36 monthly payments, 3.99% fixed APR.
WITH RECURSIVE target AS (
  SELECT loan.id AS loan_id, loan.practice_id
  FROM financial_loans loan JOIN practices practice ON practice.id = loan.practice_id
  WHERE practice.slug = 'ssmiles' AND loan.name = '3D x-ray'
), schedule AS (
  SELECT 1 AS payment_number, DATE '2024-09-21' AS due_date, 3672183::bigint AS opening_cents
  UNION ALL
  SELECT payment_number + 1, (due_date + INTERVAL '1 month')::date,
    greatest(0, opening_cents - least(opening_cents, 108401 - round(opening_cents * 0.0399 / 12.0)::bigint))
  FROM schedule WHERE payment_number < 36
), rows AS (
  SELECT payment_number, due_date, opening_cents,
    round(opening_cents * 0.0399 / 12.0)::bigint AS interest_cents
  FROM schedule
)
INSERT INTO financial_loan_schedule_entries (
  practice_id, loan_id, payment_number, due_date, payment_cents,
  principal_cents, interest_cents, fee_cents, balance_after_cents, source_document
)
SELECT target.practice_id, target.loan_id, rows.payment_number, rows.due_date,
  least(108401, rows.opening_cents + rows.interest_cents),
  least(rows.opening_cents, 108401 - rows.interest_cents), rows.interest_cents, 0,
  greatest(0, rows.opening_cents - least(rows.opening_cents, 108401 - rows.interest_cents)),
  'EverBank EFA amortization schedule from bookkeeper workbook'
FROM target CROSS JOIN rows;

-- Fundation account 475608: exact schedule continuation begins with the first
-- fully visible lender row and uses the lender's semimonthly periodic rate.
WITH RECURSIVE target AS (
  SELECT loan.id AS loan_id, loan.practice_id
  FROM financial_loans loan JOIN practices practice ON practice.id = loan.practice_id
  WHERE practice.slug = 'ssmiles' AND loan.name = 'Fundation Group 475608'
), schedule AS (
  SELECT 3 AS payment_number, DATE '2025-06-28' AS due_date, 9829746::bigint AS opening_cents
  UNION ALL
  SELECT payment_number + 1,
    CASE WHEN extract(day FROM due_date) = 28
      THEN (date_trunc('month', due_date) + INTERVAL '1 month 12 days')::date
      ELSE (date_trunc('month', due_date) + INTERVAL '27 days')::date END,
    greatest(0, opening_cents - least(opening_cents, 126575 - round(opening_cents * 0.0999 / 24.0)::bigint))
  FROM schedule WHERE opening_cents > 0 AND payment_number < 96
), rows AS (
  SELECT payment_number, due_date, opening_cents,
    round(opening_cents * 0.0999 / 24.0)::bigint AS interest_cents
  FROM schedule WHERE opening_cents > 0
)
INSERT INTO financial_loan_schedule_entries (
  practice_id, loan_id, payment_number, due_date, payment_cents,
  principal_cents, interest_cents, fee_cents, balance_after_cents, source_document
)
SELECT target.practice_id, target.loan_id, rows.payment_number, rows.due_date,
  least(126575, rows.opening_cents + rows.interest_cents),
  least(rows.opening_cents, 126575 - rows.interest_cents), rows.interest_cents, 0,
  greatest(0, rows.opening_cents - least(rows.opening_cents, 126575 - rows.interest_cents)),
  'Quantum Lending Solutions amortization schedule supplied by bookkeeper'
FROM target CROSS JOIN rows;

-- Security First uses actual days over a 365-day year.
WITH RECURSIVE target AS (
  SELECT loan.id AS loan_id, loan.practice_id
  FROM financial_loans loan JOIN practices practice ON practice.id = loan.practice_id
  WHERE practice.slug = 'ssmiles' AND loan.name = 'Security First loan'
), schedule AS (
  SELECT 1 AS payment_number, DATE '2025-09-20' AS prior_date,
    DATE '2025-10-20' AS due_date, 4654143::bigint AS opening_cents
  UNION ALL
  SELECT payment_number + 1, due_date, (due_date + INTERVAL '1 month')::date,
    greatest(0, opening_cents - least(opening_cents,
      161988 - round(opening_cents * 0.0974 * (due_date - prior_date) / 365.0)::bigint))
  FROM schedule WHERE payment_number < 33
), rows AS (
  SELECT payment_number, due_date, opening_cents,
    round(opening_cents * 0.0974 * (due_date - prior_date) / 365.0)::bigint AS interest_cents
  FROM schedule
)
INSERT INTO financial_loan_schedule_entries (
  practice_id, loan_id, payment_number, due_date, payment_cents,
  principal_cents, interest_cents, fee_cents, balance_after_cents, source_document
)
SELECT target.practice_id, target.loan_id, rows.payment_number, rows.due_date,
  least(161988, rows.opening_cents + rows.interest_cents),
  least(rows.opening_cents, 161988 - rows.interest_cents), rows.interest_cents, 0,
  greatest(0, rows.opening_cents - least(rows.opening_cents, 161988 - rows.interest_cents)),
  'Security First amortization schedule supplied by bookkeeper'
FROM target CROSS JOIN rows;

-- Amex disclosure cash flows imply a 0.7481718961% monthly rate and reconcile
-- exactly to the disclosed 35 regular payments plus the final payment.
WITH RECURSIVE target AS (
  SELECT loan.id AS loan_id, loan.practice_id
  FROM financial_loans loan JOIN practices practice ON practice.id = loan.practice_id
  WHERE practice.slug = 'ssmiles' AND loan.name = 'AMEX personal loan'
), schedule AS (
  SELECT 1 AS payment_number, DATE '2024-05-09' AS due_date, 3000000::bigint AS opening_cents
  UNION ALL
  SELECT payment_number + 1, (due_date + INTERVAL '1 month')::date,
    greatest(0, opening_cents - least(opening_cents,
      (CASE WHEN payment_number = 35 THEN 94669 ELSE 95386 END) - round(opening_cents * 0.007481718960976491)::bigint))
  FROM schedule WHERE payment_number < 36
), rows AS (
  SELECT payment_number, due_date, opening_cents,
    CASE WHEN payment_number = 36 THEN 94669 ELSE 95386 END AS disclosed_payment_cents,
    round(opening_cents * 0.007481718960976491)::bigint AS interest_cents
  FROM schedule
)
INSERT INTO financial_loan_schedule_entries (
  practice_id, loan_id, payment_number, due_date, payment_cents,
  principal_cents, interest_cents, fee_cents, balance_after_cents, source_document
)
SELECT target.practice_id, target.loan_id, rows.payment_number, rows.due_date,
  least(rows.disclosed_payment_cents, rows.opening_cents + rows.interest_cents),
  least(rows.opening_cents, rows.disclosed_payment_cents - rows.interest_cents), rows.interest_cents, 0,
  greatest(0, rows.opening_cents - least(rows.opening_cents, rows.disclosed_payment_cents - rows.interest_cents)),
  'American Express personal loan agreement and federal disclosure'
FROM target CROSS JOIN rows;

-- Current Mazda balance is authoritative; future rows are projections from
-- that snapshot because the prior Miata financing was a separate closed loan.
WITH RECURSIVE target AS (
  SELECT loan.id AS loan_id, loan.practice_id
  FROM financial_loans loan JOIN practices practice ON practice.id = loan.practice_id
  WHERE practice.slug = 'ssmiles' AND loan.name = 'Mazda CX-5'
), schedule AS (
  SELECT 1 AS payment_number, DATE '2026-09-06' AS due_date, 1605418::bigint AS opening_cents
  UNION ALL
  SELECT payment_number + 1, (due_date + INTERVAL '1 month')::date,
    greatest(0, opening_cents - least(opening_cents, 40543 - round(opening_cents * 0.0679 / 12.0)::bigint))
  FROM schedule WHERE opening_cents > 0 AND payment_number < 48
), rows AS (
  SELECT payment_number, due_date, opening_cents,
    round(opening_cents * 0.0679 / 12.0)::bigint AS interest_cents
  FROM schedule WHERE opening_cents > 0
)
INSERT INTO financial_loan_schedule_entries (
  practice_id, loan_id, payment_number, due_date, payment_cents,
  principal_cents, interest_cents, fee_cents, balance_after_cents, source_document
)
SELECT target.practice_id, target.loan_id, rows.payment_number, rows.due_date,
  least(40543, rows.opening_cents + rows.interest_cents),
  least(rows.opening_cents, 40543 - rows.interest_cents), rows.interest_cents, 0,
  greatest(0, rows.opening_cents - least(rows.opening_cents, 40543 - rows.interest_cents)),
  'Projected remaining schedule from verified Mazda CX-5 terms and Aug 15, 2026 balance'
FROM target CROSS JOIN rows;

-- Observed Fundbox history is deliberately loaded as a split template, not as
-- a contractual forecast.
WITH target AS (
  SELECT loan.id AS loan_id, loan.practice_id
  FROM financial_loans loan JOIN practices practice ON practice.id = loan.practice_id
  WHERE practice.slug = 'ssmiles' AND loan.name = 'Fundbox advance'
), dates(payment_number, due_date) AS (
  VALUES (1, DATE '2026-05-27'), (2, DATE '2026-06-03'), (3, DATE '2026-06-10'),
    (4, DATE '2026-06-17'), (5, DATE '2026-06-24'), (6, DATE '2026-07-01'),
    (7, DATE '2026-07-08'), (8, DATE '2026-07-15'), (9, DATE '2026-07-22'),
    (10, DATE '2026-07-29'), (11, DATE '2026-08-05'), (12, DATE '2026-08-12')
)
INSERT INTO financial_loan_schedule_entries (
  practice_id, loan_id, payment_number, due_date, payment_cents,
  principal_cents, interest_cents, fee_cents, balance_after_cents, source_document
)
SELECT target.practice_id, target.loan_id, dates.payment_number, dates.due_date,
  46873, 24481, 0, 22392, 1900000 - dates.payment_number * 24481,
  'Fundbox transaction history exported Aug 19, 2026'
FROM target CROSS JOIN dates;

CREATE OR REPLACE FUNCTION post_financial_loan_transaction(
  p_practice_id uuid, p_transaction_id uuid, p_loan_id uuid, p_activity_kind text,
  p_principal_cents bigint, p_interest_cents bigint, p_fee_cents bigint,
  p_interest_account_id uuid, p_fee_account_id uuid, p_review_note text, p_reviewed_by uuid
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
  payment_id uuid;
  value_cents bigint;
  next_balance bigint;
  next_balance_date date;
BEGIN
  IF p_activity_kind NOT IN ('payment', 'draw') THEN RAISE EXCEPTION 'Invalid loan activity'; END IF;
  IF p_principal_cents < 0 OR p_interest_cents < 0 OR p_fee_cents < 0 THEN RAISE EXCEPTION 'Loan split amounts cannot be negative'; END IF;
  SELECT * INTO imported FROM financial_transactions WHERE id = p_transaction_id AND practice_id = p_practice_id AND is_removed = false FOR UPDATE;
  IF NOT FOUND OR imported.account_id IS NULL OR imported.pending OR imported.amount_cents = 0 THEN RAISE EXCEPTION 'Transaction cannot be posted to a loan'; END IF;
  SELECT * INTO loan FROM financial_loans WHERE id = p_loan_id AND practice_id = p_practice_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active loan not found'; END IF;
  IF EXISTS (SELECT 1 FROM accounting_transaction_links WHERE financial_transaction_id = imported.id) THEN RAISE EXCEPTION 'Transaction is already posted'; END IF;
  value_cents := abs(imported.amount_cents);
  IF p_principal_cents + p_interest_cents + p_fee_cents <> value_cents THEN RAISE EXCEPTION 'Principal, interest, and fees must equal the transaction amount'; END IF;
  IF p_activity_kind = 'payment' AND imported.amount_cents < 0 THEN RAISE EXCEPTION 'A loan payment must be an outflow'; END IF;
  IF p_activity_kind = 'draw' AND (imported.amount_cents > 0 OR p_interest_cents <> 0 OR p_fee_cents <> 0) THEN RAISE EXCEPTION 'A loan draw must be an inflow with no interest or fee split'; END IF;
  IF p_interest_cents > 0 AND NOT EXISTS (SELECT 1 FROM bookkeeping_accounts WHERE id = p_interest_account_id AND practice_id = p_practice_id AND is_active AND account_type ILIKE '%expense%') THEN RAISE EXCEPTION 'Choose an interest expense account'; END IF;
  IF p_fee_cents > 0 AND NOT EXISTS (SELECT 1 FROM bookkeeping_accounts WHERE id = p_fee_account_id AND practice_id = p_practice_id AND is_active AND account_type ILIKE '%expense%') THEN RAISE EXCEPTION 'Choose a fee expense account'; END IF;

  INSERT INTO accounting_journal_entries (practice_id, entry_date, description, memo, source_transaction_id, source_type, transfer_kind, created_by)
  VALUES (p_practice_id, imported.transaction_date, imported.name, NULLIF(trim(p_review_note), ''), imported.id, 'transfer',
    CASE WHEN p_activity_kind = 'draw' THEN 'line_of_credit_draw' ELSE 'loan_payment' END, p_reviewed_by)
  RETURNING id INTO entry_id;
  IF p_activity_kind = 'payment' THEN
    INSERT INTO accounting_journal_lines (practice_id, journal_entry_id, financial_account_id, credit_cents) VALUES (p_practice_id, entry_id, imported.account_id, value_cents);
    IF p_principal_cents > 0 THEN INSERT INTO accounting_journal_lines (practice_id, journal_entry_id, bookkeeping_account_id, debit_cents) VALUES (p_practice_id, entry_id, loan.bookkeeping_account_id, p_principal_cents); END IF;
    IF p_interest_cents > 0 THEN INSERT INTO accounting_journal_lines (practice_id, journal_entry_id, bookkeeping_account_id, debit_cents) VALUES (p_practice_id, entry_id, p_interest_account_id, p_interest_cents); END IF;
    IF p_fee_cents > 0 THEN INSERT INTO accounting_journal_lines (practice_id, journal_entry_id, bookkeeping_account_id, debit_cents) VALUES (p_practice_id, entry_id, p_fee_account_id, p_fee_cents); END IF;
  ELSE
    INSERT INTO accounting_journal_lines (practice_id, journal_entry_id, financial_account_id, debit_cents) VALUES (p_practice_id, entry_id, imported.account_id, value_cents);
    INSERT INTO accounting_journal_lines (practice_id, journal_entry_id, bookkeeping_account_id, credit_cents) VALUES (p_practice_id, entry_id, loan.bookkeeping_account_id, p_principal_cents);
  END IF;
  INSERT INTO accounting_transaction_links (practice_id, financial_transaction_id, journal_entry_id) VALUES (p_practice_id, imported.id, entry_id);
  INSERT INTO financial_loan_payments (practice_id, loan_id, financial_transaction_id, journal_entry_id, payment_date, total_cents, principal_cents, interest_cents, fee_cents, balance_after_cents, activity_kind, source, notes, created_by)
  VALUES (p_practice_id, loan.id, imported.id, entry_id, imported.transaction_date, value_cents, p_principal_cents, p_interest_cents, p_fee_cents, NULL, p_activity_kind, 'bookkeeping', NULLIF(trim(p_review_note), ''), p_reviewed_by)
  RETURNING id INTO payment_id;

  UPDATE financial_loan_payments SET balance_after_cents = NULL
  WHERE loan_id = loan.id AND payment_date <= loan.balance_anchor_date;
  WITH ordered AS (
    SELECT payment.id,
      greatest(0, loan.balance_anchor_cents + sum(CASE WHEN payment.activity_kind = 'draw' THEN payment.principal_cents ELSE -payment.principal_cents END)
        OVER (ORDER BY payment.payment_date, payment.created_at, payment.id)) AS balance_after
    FROM financial_loan_payments payment
    WHERE payment.loan_id = loan.id AND payment.payment_date > loan.balance_anchor_date
  )
  UPDATE financial_loan_payments payment SET balance_after_cents = ordered.balance_after
  FROM ordered WHERE payment.id = ordered.id;
  SELECT coalesce(payment.balance_after_cents, loan.balance_anchor_cents), coalesce(payment.payment_date, loan.balance_anchor_date)
  INTO next_balance, next_balance_date
  FROM (SELECT 1) seed
  LEFT JOIN LATERAL (
    SELECT payment_date, balance_after_cents FROM financial_loan_payments
    WHERE loan_id = loan.id AND payment_date > loan.balance_anchor_date
    ORDER BY payment_date DESC, created_at DESC, id DESC LIMIT 1
  ) payment ON true;
  UPDATE financial_loans SET current_balance_cents = next_balance, balance_as_of_date = next_balance_date,
    status = CASE WHEN next_balance = 0 THEN 'paid_off' ELSE status END,
    updated_by = p_reviewed_by, updated_at = now() WHERE id = loan.id;
  UPDATE financial_transactions SET bookkeeping_category = NULL, bookkeeping_account_id = loan.bookkeeping_account_id,
    category_source = 'manual', review_status = 'reviewed', review_note = NULLIF(trim(p_review_note), ''),
    reviewed_by = p_reviewed_by, reviewed_at = now(), updated_at = now() WHERE id = imported.id;
  RETURN entry_id;
END;
$$;

REVOKE ALL ON FUNCTION post_financial_loan_transaction(uuid, uuid, uuid, text, bigint, bigint, bigint, uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION post_financial_loan_transaction(uuid, uuid, uuid, text, bigint, bigint, bigint, uuid, uuid, text, uuid) TO service_role;

COMMIT;
