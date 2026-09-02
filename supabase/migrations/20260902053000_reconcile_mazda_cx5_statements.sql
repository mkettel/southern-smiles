BEGIN;

-- Reset the loan to its lender-reported opening balance before posting the
-- historical bank withdrawals through the normal bookkeeping workflow.
UPDATE public.financial_loans AS loan
SET lender_name = 'Bank of America',
    account_reference = '0617',
    original_principal_cents = 1700000,
    current_balance_cents = 1700000,
    balance_as_of_date = DATE '2026-02-03',
    balance_anchor_cents = 1700000,
    balance_anchor_date = DATE '2026-02-03',
    scheduled_payment_cents = 40543,
    payment_frequency = 'monthly',
    annual_interest_rate = 6.79,
    interest_method = 'amortizing',
    originated_on = DATE '2026-02-03',
    maturity_date = DATE '2030-02-06',
    next_payment_date = DATE '2026-11-06',
    past_due_cents = 0,
    days_past_due = 0,
    terms_status = 'verified',
    notes = 'Bank of America automobile loan ending 0617 for the 2021 Mazda CX-5. Statements confirm $17,000 original principal, 6.79% simple interest, 48 months, and a $405.43 contractual monthly payment. The borrower pays $250 every two weeks, which Bank of America applies to accrued interest and principal and treats as paid-ahead activity. Principal balance was $14,096.74 after the Aug 27, 2026 payment; the next contractual payment was advanced to Nov 6, 2026.',
    updated_at = now()
FROM public.practices AS practice
WHERE loan.practice_id = practice.id
  AND practice.slug = 'ssmiles'
  AND loan.name = 'Mazda CX-5';

DO $$
DECLARE
  v_practice_id uuid;
  v_loan_id uuid;
  v_interest_account_id uuid;
  payment record;
BEGIN
  SELECT practice.id, loan.id
  INTO v_practice_id, v_loan_id
  FROM public.practices AS practice
  JOIN public.financial_loans AS loan ON loan.practice_id = practice.id
  WHERE practice.slug = 'ssmiles'
    AND loan.name = 'Mazda CX-5';

  SELECT account.id
  INTO v_interest_account_id
  FROM public.bookkeeping_accounts AS account
  WHERE account.practice_id = v_practice_id
    AND account.is_active
    AND account.name = 'Interest Expense'
  LIMIT 1;

  IF v_practice_id IS NULL OR v_loan_id IS NULL OR v_interest_account_id IS NULL THEN
    RAISE EXCEPTION 'Mazda CX-5 loan or Interest Expense account not found';
  END IF;

  FOR payment IN
    WITH reported(bank_date, effective_date, principal_cents, interest_cents, balance_after_cents) AS (
      VALUES
        (DATE '2026-02-27', DATE '2026-02-26', 18043::bigint, 6957::bigint, 1681957::bigint),
        (DATE '2026-03-13', DATE '2026-03-12', 20620, 4380, 1661337),
        (DATE '2026-03-27', DATE '2026-03-26', 20673, 4327, 1640664),
        (DATE '2026-04-10', DATE '2026-04-09', 20727, 4273, 1619937),
        (DATE '2026-04-24', DATE '2026-04-23', 20781, 4219, 1599156),
        (DATE '2026-05-08', DATE '2026-05-07', 20835, 4165, 1578321),
        (DATE '2026-05-22', DATE '2026-05-21', 20890, 4110, 1557431),
        (DATE '2026-06-05', DATE '2026-06-04', 20943, 4057, 1536488),
        (DATE '2026-06-22', DATE '2026-06-18', 20999, 4001, 1515489),
        (DATE '2026-07-03', DATE '2026-07-02', 21053, 3947, 1494436),
        (DATE '2026-07-17', DATE '2026-07-16', 21108, 3892, 1473328),
        (DATE '2026-07-31', DATE '2026-07-30', 21163, 3837, 1452165),
        (DATE '2026-08-14', DATE '2026-08-13', 21218, 3782, 1430947),
        (DATE '2026-08-28', DATE '2026-08-27', 21273, 3727, 1409674)
    )
    SELECT transaction.id AS transaction_id, reported.*
    FROM reported
    JOIN public.financial_transactions AS transaction
      ON transaction.practice_id = v_practice_id
     AND transaction.transaction_date = reported.bank_date
     AND transaction.amount_cents = 25000
     AND transaction.is_removed = false
     AND transaction.pending = false
     AND upper(coalesce(transaction.original_description, '')) LIKE '%BANK OF AMERICA%ONLINE PMT%'
     AND upper(coalesce(transaction.original_description, '')) LIKE '%CKF499598706%'
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.accounting_transaction_links AS link
      WHERE link.financial_transaction_id = transaction.id
    )
    ORDER BY reported.effective_date
  LOOP
    PERFORM public.post_financial_loan_transaction(
      v_practice_id,
      payment.transaction_id,
      v_loan_id,
      'payment',
      payment.principal_cents,
      payment.interest_cents,
      0,
      v_interest_account_id,
      NULL,
      'Bank of America statement split; lender effective date ' || payment.effective_date,
      NULL
    );

    UPDATE public.financial_loan_payments
    SET payment_date = payment.effective_date,
        balance_after_cents = payment.balance_after_cents,
        notes = 'Exact principal and finance-charge split from Bank of America statement.'
    WHERE financial_transaction_id = payment.transaction_id
      AND financial_loan_payments.loan_id = v_loan_id;
  END LOOP;
END;
$$;

-- The statements are authoritative. Reconcile the final principal balance and
-- retain the original balance anchor so later posted payments roll forward.
UPDATE public.financial_loans AS loan
SET current_balance_cents = 1409674,
    balance_as_of_date = DATE '2026-08-27',
    updated_at = now()
FROM public.practices AS practice
WHERE loan.practice_id = practice.id
  AND practice.slug = 'ssmiles'
  AND loan.name = 'Mazda CX-5';

DELETE FROM public.financial_loan_schedule_entries AS schedule
USING public.financial_loans AS loan, public.practices AS practice
WHERE schedule.loan_id = loan.id
  AND loan.practice_id = practice.id
  AND practice.slug = 'ssmiles'
  AND loan.name = 'Mazda CX-5';

WITH target AS (
  SELECT loan.practice_id, loan.id AS loan_id
  FROM public.financial_loans AS loan
  JOIN public.practices AS practice ON practice.id = loan.practice_id
  WHERE practice.slug = 'ssmiles'
    AND loan.name = 'Mazda CX-5'
),
reported(payment_number, due_date, principal_cents, interest_cents, balance_after_cents) AS (
  VALUES
    (1, DATE '2026-02-26', 18043::bigint, 6957::bigint, 1681957::bigint),
    (2, DATE '2026-03-12', 20620, 4380, 1661337),
    (3, DATE '2026-03-26', 20673, 4327, 1640664),
    (4, DATE '2026-04-09', 20727, 4273, 1619937),
    (5, DATE '2026-04-23', 20781, 4219, 1599156),
    (6, DATE '2026-05-07', 20835, 4165, 1578321),
    (7, DATE '2026-05-21', 20890, 4110, 1557431),
    (8, DATE '2026-06-04', 20943, 4057, 1536488),
    (9, DATE '2026-06-18', 20999, 4001, 1515489),
    (10, DATE '2026-07-02', 21053, 3947, 1494436),
    (11, DATE '2026-07-16', 21108, 3892, 1473328),
    (12, DATE '2026-07-30', 21163, 3837, 1452165),
    (13, DATE '2026-08-13', 21218, 3782, 1430947),
    (14, DATE '2026-08-27', 21273, 3727, 1409674)
)
INSERT INTO public.financial_loan_schedule_entries (
  practice_id, loan_id, payment_number, due_date, payment_cents,
  principal_cents, interest_cents, fee_cents, balance_after_cents, source_document
)
SELECT target.practice_id, target.loan_id, reported.payment_number, reported.due_date,
  25000, reported.principal_cents, reported.interest_cents, 0,
  reported.balance_after_cents, 'Bank of America Mazda CX-5 monthly statements, Feb-Aug 2026'
FROM target CROSS JOIN reported;

-- Forecast the borrower's established $250 biweekly pattern using daily simple
-- interest. These rows are suggestions only; lender statements remain final.
WITH RECURSIVE target AS (
  SELECT loan.practice_id, loan.id AS loan_id
  FROM public.financial_loans AS loan
  JOIN public.practices AS practice ON practice.id = loan.practice_id
  WHERE practice.slug = 'ssmiles'
    AND loan.name = 'Mazda CX-5'
),
projection AS (
  SELECT 15 AS payment_number, DATE '2026-09-10' AS due_date, 1409674::bigint AS opening_cents
  UNION ALL
  SELECT projection.payment_number + 1,
    projection.due_date + 14,
    greatest(0, projection.opening_cents - least(
      projection.opening_cents,
      least(25000, projection.opening_cents + round(projection.opening_cents * 0.0679 * 14.0 / 365.0)::bigint)
        - round(projection.opening_cents * 0.0679 * 14.0 / 365.0)::bigint
    ))
  FROM projection
  WHERE projection.opening_cents > 0
    AND projection.payment_number < 120
),
rows AS (
  SELECT payment_number, due_date, opening_cents,
    round(opening_cents * 0.0679 * 14.0 / 365.0)::bigint AS interest_cents
  FROM projection
  WHERE opening_cents > 0
)
INSERT INTO public.financial_loan_schedule_entries (
  practice_id, loan_id, payment_number, due_date, payment_cents,
  principal_cents, interest_cents, fee_cents, balance_after_cents, source_document
)
SELECT target.practice_id, target.loan_id, rows.payment_number, rows.due_date,
  least(25000, rows.opening_cents + rows.interest_cents),
  least(rows.opening_cents, least(25000, rows.opening_cents + rows.interest_cents) - rows.interest_cents),
  rows.interest_cents,
  0,
  greatest(0, rows.opening_cents - least(rows.opening_cents,
    least(25000, rows.opening_cents + rows.interest_cents) - rows.interest_cents)),
  'Projected $250 biweekly payment using 6.79% daily simple interest; verify against lender statement'
FROM target CROSS JOIN rows;

COMMIT;
