BEGIN;

ALTER TABLE financial_loans
  ADD COLUMN past_due_cents bigint CHECK (past_due_cents IS NULL OR past_due_cents >= 0),
  ADD COLUMN days_past_due integer CHECK (days_past_due IS NULL OR days_past_due >= 0);

UPDATE financial_loans AS loan
SET current_balance_cents = 7632875,
    balance_as_of_date = DATE '2026-08-13',
    scheduled_payment_cents = 126575,
    payment_frequency = 'semimonthly',
    annual_interest_rate = 9.99,
    originated_on = DATE '2025-05-13',
    maturity_date = DATE '2029-05-13',
    next_payment_date = DATE '2026-07-13',
    past_due_cents = 335417,
    days_past_due = 30,
    terms_status = 'verified',
    notes = 'Management program financing. Lender portal confirmed a $100,000 original loan, 9.99% interest rate, 48-month term, and $76,328.75 principal balance on Aug 13, 2026. Account was 30 days past due with $3,354.17 past due.'
FROM practices AS practice
WHERE loan.practice_id = practice.id
  AND practice.slug = 'ssmiles'
  AND loan.name = 'Fundation Group 475608';

UPDATE financial_loans AS loan
SET current_balance_cents = 2277553,
    balance_as_of_date = DATE '2026-08-13',
    scheduled_payment_cents = 74357,
    payment_frequency = 'semimonthly',
    annual_interest_rate = 5.99,
    originated_on = DATE '2025-10-24',
    maturity_date = DATE '2027-10-24',
    next_payment_date = DATE '2026-07-09',
    past_due_cents = 197045,
    days_past_due = 34,
    terms_status = 'verified',
    notes = 'Management program financing. Exact Quantum Lending Solutions schedule loaded. Lender portal confirmed a $22,775.53 principal balance on Aug 13, 2026. Account was 34 days past due with $1,970.45 past due.'
FROM practices AS practice
WHERE loan.practice_id = practice.id
  AND practice.slug = 'ssmiles'
  AND loan.name = 'Fundation Group 10020573';

UPDATE financial_loans AS loan
SET current_balance_cents = 3630344,
    balance_as_of_date = DATE '2026-08-13',
    scheduled_payment_cents = 161988,
    payment_frequency = 'monthly',
    annual_interest_rate = 9.74,
    maturity_date = DATE '2028-06-20',
    next_payment_date = DATE '2026-09-20',
    past_due_cents = 0,
    days_past_due = 0,
    terms_status = 'verified',
    notes = 'Security First proceed-finance loan. Online banking confirmed a $36,303.44 current balance, 9.74% interest rate, and Jun 20, 2028 maturity on Aug 13, 2026. Last payment was $1,619.88 on May 20, 2026; no amount was due for Sep 20, 2026.'
FROM practices AS practice
WHERE loan.practice_id = practice.id
  AND practice.slug = 'ssmiles'
  AND loan.name = 'Security First loan';

COMMIT;
