BEGIN;

ALTER TABLE public.financial_loans
  DROP CONSTRAINT IF EXISTS financial_loans_practice_id_bookkeeping_account_id_key;

DROP INDEX IF EXISTS public.idx_financial_loan_payments_transaction;
CREATE UNIQUE INDEX idx_financial_loan_payments_transaction_loan
  ON public.financial_loan_payments(financial_transaction_id, loan_id)
  WHERE financial_transaction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.post_financial_loan_allocations(
  p_practice_id uuid,
  p_transaction_id uuid,
  p_activity_kind text,
  p_allocations jsonb,
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
  imported public.financial_transactions%ROWTYPE;
  loan public.financial_loans%ROWTYPE;
  allocation_count integer;
  active_loan_count integer;
  value_cents bigint;
  principal_total bigint;
  interest_total bigint;
  fee_total bigint;
  entry_id uuid;
  next_balance bigint;
  next_balance_date date;
  transaction_bookkeeping_account_id uuid;
BEGIN
  IF p_activity_kind NOT IN ('payment', 'draw') THEN
    RAISE EXCEPTION 'Invalid loan activity';
  END IF;
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array'
    OR jsonb_array_length(p_allocations) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Add at least one loan allocation';
  END IF;

  SELECT * INTO imported
  FROM public.financial_transactions
  WHERE id = p_transaction_id
    AND practice_id = p_practice_id
    AND is_removed = false
  FOR UPDATE;
  IF NOT FOUND OR imported.account_id IS NULL OR imported.pending OR imported.amount_cents = 0 THEN
    RAISE EXCEPTION 'Transaction cannot be posted to a loan';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.accounting_transaction_links
    WHERE financial_transaction_id = imported.id
  ) THEN
    RAISE EXCEPTION 'Transaction is already posted';
  END IF;

  SELECT count(*), coalesce(sum(principal_cents), 0), coalesce(sum(interest_cents), 0), coalesce(sum(fee_cents), 0)
  INTO allocation_count, principal_total, interest_total, fee_total
  FROM jsonb_to_recordset(p_allocations) AS allocation(
    loan_id uuid,
    principal_cents bigint,
    interest_cents bigint,
    fee_cents bigint
  );
  IF allocation_count <> (
    SELECT count(DISTINCT loan_id)
    FROM jsonb_to_recordset(p_allocations) AS allocation(
      loan_id uuid,
      principal_cents bigint,
      interest_cents bigint,
      fee_cents bigint
    )
  ) THEN
    RAISE EXCEPTION 'Each loan can appear only once';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_allocations) AS allocation(
      loan_id uuid,
      principal_cents bigint,
      interest_cents bigint,
      fee_cents bigint
    )
    WHERE loan_id IS NULL OR principal_cents IS NULL OR interest_cents IS NULL OR fee_cents IS NULL
      OR principal_cents < 0 OR interest_cents < 0 OR fee_cents < 0
      OR principal_cents + interest_cents + fee_cents = 0
  ) THEN
    RAISE EXCEPTION 'Loan allocation amounts cannot be negative';
  END IF;

  value_cents := abs(imported.amount_cents);
  IF principal_total + interest_total + fee_total <> value_cents THEN
    RAISE EXCEPTION 'Loan allocations must equal the transaction amount';
  END IF;
  IF p_activity_kind = 'payment' AND imported.amount_cents < 0 THEN
    RAISE EXCEPTION 'A loan payment must be an outflow';
  END IF;
  IF p_activity_kind = 'draw' AND (
    imported.amount_cents > 0 OR interest_total <> 0 OR fee_total <> 0 OR allocation_count <> 1
  ) THEN
    RAISE EXCEPTION 'A loan draw must be one inflow with no interest or fee split';
  END IF;

  SELECT count(*) INTO active_loan_count
  FROM public.financial_loans active_loan
  JOIN jsonb_to_recordset(p_allocations) AS allocation(
    loan_id uuid,
    principal_cents bigint,
    interest_cents bigint,
    fee_cents bigint
  ) ON allocation.loan_id = active_loan.id
  WHERE active_loan.practice_id = p_practice_id
    AND active_loan.status = 'active';
  IF active_loan_count <> allocation_count THEN
    RAISE EXCEPTION 'One or more active loans were not found';
  END IF;

  PERFORM active_loan.id
  FROM public.financial_loans active_loan
  JOIN jsonb_to_recordset(p_allocations) AS allocation(
    loan_id uuid,
    principal_cents bigint,
    interest_cents bigint,
    fee_cents bigint
  ) ON allocation.loan_id = active_loan.id
  ORDER BY active_loan.id
  FOR UPDATE OF active_loan;

  IF interest_total > 0 AND NOT EXISTS (
    SELECT 1 FROM public.bookkeeping_accounts
    WHERE id = p_interest_account_id AND practice_id = p_practice_id
      AND is_active AND account_type ILIKE '%expense%'
  ) THEN
    RAISE EXCEPTION 'Choose an interest expense account';
  END IF;
  IF fee_total > 0 AND NOT EXISTS (
    SELECT 1 FROM public.bookkeeping_accounts
    WHERE id = p_fee_account_id AND practice_id = p_practice_id
      AND is_active AND account_type ILIKE '%expense%'
  ) THEN
    RAISE EXCEPTION 'Choose a fee expense account';
  END IF;

  INSERT INTO public.accounting_journal_entries (
    practice_id, entry_date, description, memo, source_transaction_id,
    source_type, transfer_kind, created_by
  ) VALUES (
    p_practice_id, imported.transaction_date, imported.name,
    NULLIF(trim(p_review_note), ''), imported.id, 'transfer',
    CASE WHEN p_activity_kind = 'draw' THEN 'line_of_credit_draw' ELSE 'loan_payment' END,
    p_reviewed_by
  ) RETURNING id INTO entry_id;

  IF p_activity_kind = 'payment' THEN
    INSERT INTO public.accounting_journal_lines (
      practice_id, journal_entry_id, financial_account_id, credit_cents
    ) VALUES (p_practice_id, entry_id, imported.account_id, value_cents);

    INSERT INTO public.accounting_journal_lines (
      practice_id, journal_entry_id, bookkeeping_account_id, debit_cents
    )
    SELECT p_practice_id, entry_id, active_loan.bookkeeping_account_id, sum(allocation.principal_cents)
    FROM public.financial_loans active_loan
    JOIN jsonb_to_recordset(p_allocations) AS allocation(
      loan_id uuid,
      principal_cents bigint,
      interest_cents bigint,
      fee_cents bigint
    ) ON allocation.loan_id = active_loan.id
    WHERE allocation.principal_cents > 0
    GROUP BY active_loan.bookkeeping_account_id;

    IF interest_total > 0 THEN
      INSERT INTO public.accounting_journal_lines (
        practice_id, journal_entry_id, bookkeeping_account_id, debit_cents
      ) VALUES (p_practice_id, entry_id, p_interest_account_id, interest_total);
    END IF;
    IF fee_total > 0 THEN
      INSERT INTO public.accounting_journal_lines (
        practice_id, journal_entry_id, bookkeeping_account_id, debit_cents
      ) VALUES (p_practice_id, entry_id, p_fee_account_id, fee_total);
    END IF;
  ELSE
    INSERT INTO public.accounting_journal_lines (
      practice_id, journal_entry_id, financial_account_id, debit_cents
    ) VALUES (p_practice_id, entry_id, imported.account_id, value_cents);
    INSERT INTO public.accounting_journal_lines (
      practice_id, journal_entry_id, bookkeeping_account_id, credit_cents
    )
    SELECT p_practice_id, entry_id, active_loan.bookkeeping_account_id, allocation.principal_cents
    FROM public.financial_loans active_loan
    JOIN jsonb_to_recordset(p_allocations) AS allocation(
      loan_id uuid,
      principal_cents bigint,
      interest_cents bigint,
      fee_cents bigint
    ) ON allocation.loan_id = active_loan.id;
  END IF;

  INSERT INTO public.accounting_transaction_links (
    practice_id, financial_transaction_id, journal_entry_id
  ) VALUES (p_practice_id, imported.id, entry_id);

  INSERT INTO public.financial_loan_payments (
    practice_id, loan_id, financial_transaction_id, journal_entry_id, payment_date,
    total_cents, principal_cents, interest_cents, fee_cents, balance_after_cents,
    activity_kind, source, notes, created_by
  )
  SELECT p_practice_id, allocation.loan_id, imported.id, entry_id, imported.transaction_date,
    allocation.principal_cents + allocation.interest_cents + allocation.fee_cents,
    allocation.principal_cents, allocation.interest_cents, allocation.fee_cents, NULL,
    p_activity_kind, 'bookkeeping', NULLIF(trim(p_review_note), ''), p_reviewed_by
  FROM jsonb_to_recordset(p_allocations) AS allocation(
    loan_id uuid,
    principal_cents bigint,
    interest_cents bigint,
    fee_cents bigint
  );

  FOR loan IN
    SELECT active_loan.*
    FROM public.financial_loans active_loan
    JOIN jsonb_to_recordset(p_allocations) AS allocation(
      loan_id uuid,
      principal_cents bigint,
      interest_cents bigint,
      fee_cents bigint
    ) ON allocation.loan_id = active_loan.id
  LOOP
    UPDATE public.financial_loan_payments
    SET balance_after_cents = NULL
    WHERE loan_id = loan.id AND payment_date <= loan.balance_anchor_date;

    WITH ordered AS (
      SELECT payment.id,
        greatest(0, loan.balance_anchor_cents + sum(
          CASE WHEN payment.activity_kind = 'draw' THEN payment.principal_cents ELSE -payment.principal_cents END
        ) OVER (ORDER BY payment.payment_date, payment.created_at, payment.id)) AS balance_after
      FROM public.financial_loan_payments payment
      WHERE payment.loan_id = loan.id AND payment.payment_date > loan.balance_anchor_date
    )
    UPDATE public.financial_loan_payments payment
    SET balance_after_cents = ordered.balance_after
    FROM ordered
    WHERE payment.id = ordered.id;

    SELECT coalesce(payment.balance_after_cents, loan.balance_anchor_cents),
      coalesce(payment.payment_date, loan.balance_anchor_date)
    INTO next_balance, next_balance_date
    FROM (SELECT 1) seed
    LEFT JOIN LATERAL (
      SELECT payment_date, balance_after_cents
      FROM public.financial_loan_payments
      WHERE loan_id = loan.id AND payment_date > loan.balance_anchor_date
      ORDER BY payment_date DESC, created_at DESC, id DESC
      LIMIT 1
    ) payment ON true;

    UPDATE public.financial_loans
    SET current_balance_cents = next_balance,
      balance_as_of_date = next_balance_date,
      status = CASE WHEN next_balance = 0 THEN 'paid_off' ELSE status END,
      updated_by = p_reviewed_by,
      updated_at = now()
    WHERE id = loan.id;
  END LOOP;

  SELECT CASE WHEN count(DISTINCT active_loan.bookkeeping_account_id) = 1
    THEN min(active_loan.bookkeeping_account_id::text)::uuid ELSE NULL END
  INTO transaction_bookkeeping_account_id
  FROM public.financial_loans active_loan
  JOIN jsonb_to_recordset(p_allocations) AS allocation(
    loan_id uuid,
    principal_cents bigint,
    interest_cents bigint,
    fee_cents bigint
  ) ON allocation.loan_id = active_loan.id;

  UPDATE public.financial_transactions
  SET bookkeeping_category = NULL,
    bookkeeping_account_id = transaction_bookkeeping_account_id,
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

REVOKE ALL ON FUNCTION public.post_financial_loan_allocations(
  uuid, uuid, text, jsonb, uuid, uuid, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_financial_loan_allocations(
  uuid, uuid, text, jsonb, uuid, uuid, text, uuid
) TO service_role;

-- American Express issues a separate installment loan for every BLOC draw,
-- while collecting all scheduled installments in one ACH debit.
WITH target AS (
  SELECT loan.id, loan.practice_id, loan.bookkeeping_account_id
  FROM public.financial_loans loan
  JOIN public.practices practice ON practice.id = loan.practice_id
  WHERE practice.slug = 'ssmiles' AND loan.name = 'Amex line of credit'
)
UPDATE public.financial_loans loan
SET name = 'Amex BLOC loan 3141136',
  loan_type = 'term_loan',
  account_reference = '3141136',
  original_principal_cents = 1800000,
  current_balance_cents = 1234560,
  balance_as_of_date = DATE '2026-09-01',
  balance_anchor_cents = 1234560,
  balance_anchor_date = DATE '2026-09-01',
  scheduled_payment_cents = 184560,
  payment_frequency = 'monthly',
  annual_interest_rate = 26.83,
  interest_method = 'fixed_fee',
  originated_on = DATE '2026-04-16',
  maturity_date = DATE '2027-04-18',
  next_payment_date = DATE '2026-09-18',
  terms_status = 'verified',
  credit_limit_cents = NULL,
  available_credit_cents = NULL,
  notes = 'American Express Business Line of Credit installment loan 3141136. Original draw $18,000; 12 monthly installments; total contractual loan fees $2,667.60; comparison APR 26.83%. Lender-reported outstanding balance $12,345.60 on Sep 1, 2026 is preserved as the balance snapshot. The shared BLOC facility had a $23,400 limit.',
  updated_at = now()
FROM target
WHERE loan.id = target.id;

WITH target AS (
  SELECT loan.practice_id, loan.bookkeeping_account_id
  FROM public.financial_loans loan
  JOIN public.practices practice ON practice.id = loan.practice_id
  WHERE practice.slug = 'ssmiles' AND loan.account_reference = '3141136'
)
INSERT INTO public.financial_loans (
  practice_id, bookkeeping_account_id, name, lender_name, loan_type,
  account_reference, original_principal_cents, current_balance_cents,
  balance_as_of_date, scheduled_payment_cents, payment_frequency,
  annual_interest_rate, interest_method, originated_on, maturity_date,
  next_payment_date, status, terms_status, is_personal, source, notes,
  balance_anchor_cents, balance_anchor_date
)
SELECT target.practice_id, target.bookkeeping_account_id,
  'Amex BLOC loan 3151323', 'American Express', 'term_loan',
  '3151323', 830000, 723536, DATE '2026-09-01', 62048, 'monthly',
  25.91, 'fixed_fee', DATE '2026-04-30', DATE '2027-11-18',
  DATE '2026-09-18', 'active', 'verified', false, 'manual',
  'American Express Business Line of Credit installment loan 3151323. Original draw $8,300; 18 monthly installments; total contractual loan fees $1,845.09; comparison APR 25.91%. Lender-reported outstanding balance $7,235.36 on Sep 1, 2026 is preserved as the balance snapshot.',
  723536, DATE '2026-09-01'
FROM target
WHERE NOT EXISTS (
  SELECT 1 FROM public.financial_loans existing
  WHERE existing.practice_id = target.practice_id
    AND existing.account_reference = '3151323'
);

DELETE FROM public.financial_loan_schedule_entries schedule
USING public.financial_loans loan, public.practices practice
WHERE schedule.loan_id = loan.id
  AND loan.practice_id = practice.id
  AND practice.slug = 'ssmiles'
  AND loan.account_reference IN ('3141136', '3151323');

WITH target AS (
  SELECT loan.id AS loan_id, loan.practice_id
  FROM public.financial_loans loan
  JOIN public.practices practice ON practice.id = loan.practice_id
  WHERE practice.slug = 'ssmiles' AND loan.account_reference = '3141136'
), schedule AS (
  SELECT payment_number,
    (DATE '2026-05-18' + ((payment_number - 1) || ' months')::interval)::date AS due_date,
    CASE WHEN payment_number <= 6 THEN 184560 ELSE 159900 END AS payment_cents,
    150000 AS principal_cents,
    CASE WHEN payment_number <= 6 THEN 34560 ELSE 9900 END AS fee_cents,
    1800000 - payment_number * 150000 AS balance_after_cents
  FROM generate_series(1, 12) payment_number
)
INSERT INTO public.financial_loan_schedule_entries (
  practice_id, loan_id, payment_number, due_date, payment_cents,
  principal_cents, interest_cents, fee_cents, balance_after_cents, source_document
)
SELECT target.practice_id, target.loan_id, schedule.payment_number, schedule.due_date,
  schedule.payment_cents, schedule.principal_cents, 0, schedule.fee_cents,
  schedule.balance_after_cents, 'American Express Loan Agreement 3141136, Apr 16 2026'
FROM target CROSS JOIN schedule;

WITH target AS (
  SELECT loan.id AS loan_id, loan.practice_id
  FROM public.financial_loans loan
  JOIN public.practices practice ON practice.id = loan.practice_id
  WHERE practice.slug = 'ssmiles' AND loan.account_reference = '3151323'
), schedule AS (
  SELECT payment_number,
    (DATE '2026-06-18' + ((payment_number - 1) || ' months')::interval)::date AS due_date,
    CASE WHEN payment_number <= 9 THEN 62048 WHEN payment_number < 18 THEN 50677 ELSE 50661 END AS payment_cents,
    CASE WHEN payment_number < 18 THEN 46112 ELSE 46096 END AS principal_cents,
    CASE WHEN payment_number <= 9 THEN 15936 ELSE 4565 END AS fee_cents,
    greatest(0, 830000 - least(payment_number, 17) * 46112 - CASE WHEN payment_number = 18 THEN 46096 ELSE 0 END) AS balance_after_cents
  FROM generate_series(1, 18) payment_number
)
INSERT INTO public.financial_loan_schedule_entries (
  practice_id, loan_id, payment_number, due_date, payment_cents,
  principal_cents, interest_cents, fee_cents, balance_after_cents, source_document
)
SELECT target.practice_id, target.loan_id, schedule.payment_number, schedule.due_date,
  schedule.payment_cents, schedule.principal_cents, 0, schedule.fee_cents,
  schedule.balance_after_cents, 'American Express Loan Agreement 3151323, Apr 30 2026'
FROM target CROSS JOIN schedule;

DO $$
DECLARE
  v_practice_id uuid;
  first_loan_id uuid;
  second_loan_id uuid;
  fee_account_id uuid;
  transaction_id uuid;
BEGIN
  SELECT id INTO STRICT v_practice_id FROM public.practices WHERE slug = 'ssmiles';
  SELECT id INTO STRICT first_loan_id FROM public.financial_loans
    WHERE practice_id = v_practice_id AND account_reference = '3141136';
  SELECT id INTO STRICT second_loan_id FROM public.financial_loans
    WHERE practice_id = v_practice_id AND account_reference = '3151323';
  SELECT id INTO STRICT fee_account_id FROM public.bookkeeping_accounts
    WHERE practice_id = v_practice_id AND name = 'Interest Expense' AND is_active;

  SELECT id INTO STRICT transaction_id FROM public.financial_transactions
    WHERE practice_id = v_practice_id AND transaction_date = DATE '2026-04-17'
      AND amount_cents = -1800000 AND pending = false AND is_removed = false
      AND concat_ws(' ', name, merchant_name, original_description) ILIKE '%american express%loan%';
  PERFORM public.post_financial_loan_allocations(v_practice_id, transaction_id, 'draw',
    jsonb_build_array(jsonb_build_object('loan_id', first_loan_id, 'principal_cents', 1800000, 'interest_cents', 0, 'fee_cents', 0)),
    NULL, NULL, 'Amex BLOC draw 3141136', NULL);

  SELECT id INTO STRICT transaction_id FROM public.financial_transactions
    WHERE practice_id = v_practice_id AND transaction_date = DATE '2026-04-30'
      AND amount_cents = -830000 AND pending = false AND is_removed = false
      AND concat_ws(' ', name, merchant_name, original_description) ILIKE '%american express%loan%';
  PERFORM public.post_financial_loan_allocations(v_practice_id, transaction_id, 'draw',
    jsonb_build_array(jsonb_build_object('loan_id', second_loan_id, 'principal_cents', 830000, 'interest_cents', 0, 'fee_cents', 0)),
    NULL, NULL, 'Amex BLOC draw 3151323', NULL);

  SELECT id INTO STRICT transaction_id FROM public.financial_transactions
    WHERE practice_id = v_practice_id AND transaction_date = DATE '2026-05-20'
      AND amount_cents = 184560 AND pending = false AND is_removed = false
      AND concat_ws(' ', name, merchant_name, original_description) ILIKE '%american express%loan%';
  PERFORM public.post_financial_loan_allocations(v_practice_id, transaction_id, 'payment',
    jsonb_build_array(jsonb_build_object('loan_id', first_loan_id, 'principal_cents', 150000, 'interest_cents', 0, 'fee_cents', 34560)),
    NULL, fee_account_id, 'Amex BLOC scheduled payment', NULL);

  FOR transaction_id IN
    SELECT id FROM public.financial_transactions
    WHERE practice_id = v_practice_id
      AND transaction_date IN (DATE '2026-06-22', DATE '2026-07-20', DATE '2026-08-19')
      AND amount_cents = 246608 AND pending = false AND is_removed = false
      AND concat_ws(' ', name, merchant_name, original_description) ILIKE '%american express%loan%'
    ORDER BY transaction_date
  LOOP
    PERFORM public.post_financial_loan_allocations(v_practice_id, transaction_id, 'payment',
      jsonb_build_array(
        jsonb_build_object('loan_id', first_loan_id, 'principal_cents', 150000, 'interest_cents', 0, 'fee_cents', 34560),
        jsonb_build_object('loan_id', second_loan_id, 'principal_cents', 46112, 'interest_cents', 0, 'fee_cents', 15936)
      ), NULL, fee_account_id, 'Amex BLOC payment allocated across loans 3141136 and 3151323', NULL);
  END LOOP;
END;
$$;

COMMIT;
