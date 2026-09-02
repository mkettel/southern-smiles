BEGIN;

UPDATE financial_loans AS loan
SET lender_name = 'Bank of America',
    notes = 'Current Mazda CX-5 financing is separate from the closed Mazda Miata loan. The lender is Bank of America, confirmed by account reference CKF499598706POS and the observed Bank of America payment history. The bookkeeper workbook records $17,000 original principal, 6.79% APR, $405.43 scheduled monthly payment, and projected Dec 6, 2029 payoff after the recorded early extra payments.',
    updated_at = now()
FROM practices AS practice
WHERE loan.practice_id = practice.id
  AND practice.slug = 'ssmiles'
  AND loan.name = 'Mazda CX-5';

COMMIT;
