BEGIN;

-- Reconcile harmless cent-level residuals into the final interest component
-- while preserving the lender's stated payment amount.
WITH final_rows AS (
  SELECT schedule.id, schedule.balance_after_cents
  FROM financial_loan_schedule_entries schedule
  JOIN financial_loans loan ON loan.id = schedule.loan_id
  JOIN practices practice ON practice.id = loan.practice_id
  WHERE practice.slug = 'ssmiles'
    AND loan.name IN ('3D x-ray', 'Fundation Group 475608')
    AND schedule.payment_number = (
      SELECT max(other.payment_number)
      FROM financial_loan_schedule_entries other
      WHERE other.loan_id = schedule.loan_id
    )
)
UPDATE financial_loan_schedule_entries schedule
SET principal_cents = schedule.principal_cents + final_rows.balance_after_cents,
    interest_cents = schedule.interest_cents - final_rows.balance_after_cents,
    balance_after_cents = 0
FROM final_rows
WHERE schedule.id = final_rows.id;

-- Rebuild the Amex schedule using the monthly rate implied by the signed
-- disclosure's exact cash flows. This removes the rounding residual while
-- retaining all 35 regular payments and the disclosed final payment.
DELETE FROM financial_loan_schedule_entries schedule
USING financial_loans loan, practices practice
WHERE schedule.loan_id = loan.id
  AND loan.practice_id = practice.id
  AND practice.slug = 'ssmiles'
  AND loan.name = 'AMEX personal loan';

WITH RECURSIVE target AS (
  SELECT loan.id AS loan_id, loan.practice_id
  FROM financial_loans loan JOIN practices practice ON practice.id = loan.practice_id
  WHERE practice.slug = 'ssmiles' AND loan.name = 'AMEX personal loan'
), schedule AS (
  SELECT 1 AS payment_number, DATE '2024-05-09' AS due_date, 3000000::bigint AS opening_cents
  UNION ALL
  SELECT payment_number + 1, (due_date + INTERVAL '1 month')::date,
    greatest(0, opening_cents - least(opening_cents,
      (CASE WHEN payment_number = 35 THEN 94669 ELSE 95386 END) - round(opening_cents * 0.00748175)::bigint))
  FROM schedule WHERE payment_number < 36
), rows AS (
  SELECT payment_number, due_date, opening_cents,
    CASE WHEN payment_number = 36 THEN 94669 ELSE 95386 END AS disclosed_payment_cents,
    round(opening_cents * 0.00748175)::bigint AS interest_cents
  FROM schedule
)
INSERT INTO financial_loan_schedule_entries (
  practice_id, loan_id, payment_number, due_date, payment_cents,
  principal_cents, interest_cents, fee_cents, balance_after_cents, source_document
)
SELECT target.practice_id, target.loan_id, rows.payment_number, rows.due_date,
  rows.disclosed_payment_cents,
  least(rows.opening_cents, rows.disclosed_payment_cents - rows.interest_cents), rows.interest_cents, 0,
  greatest(0, rows.opening_cents - least(rows.opening_cents, rows.disclosed_payment_cents - rows.interest_cents)),
  'American Express personal loan agreement and federal disclosure'
FROM target CROSS JOIN rows;

-- Keep the Mazda projection bounded by the verified maturity date. The final
-- projected row is a transparent balloon rather than silently extending it.
DELETE FROM financial_loan_schedule_entries schedule
USING financial_loans loan, practices practice
WHERE schedule.loan_id = loan.id
  AND loan.practice_id = practice.id
  AND practice.slug = 'ssmiles'
  AND loan.name = 'Mazda CX-5'
  AND schedule.due_date > loan.maturity_date;

UPDATE financial_loan_schedule_entries schedule
SET payment_cents = schedule.principal_cents + schedule.balance_after_cents + schedule.interest_cents,
    principal_cents = schedule.principal_cents + schedule.balance_after_cents,
    balance_after_cents = 0,
    source_document = 'Projected remaining schedule from verified Mazda CX-5 terms and Aug 15, 2026 balance; final row is projected balloon at recorded maturity'
FROM financial_loans loan, practices practice
WHERE schedule.loan_id = loan.id
  AND loan.practice_id = practice.id
  AND practice.slug = 'ssmiles'
  AND loan.name = 'Mazda CX-5'
  AND schedule.due_date = loan.maturity_date;

COMMIT;
