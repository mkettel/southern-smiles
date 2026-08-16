BEGIN;

UPDATE financial_loans AS loan
SET current_balance_cents = 691361,
    balance_as_of_date = DATE '2026-08-15',
    scheduled_payment_cents = 95386,
    payment_frequency = 'monthly',
    maturity_date = DATE '2027-04-09',
    terms_status = 'partial',
    notes = 'Personal American Express loan paid by the business. Bookkeeper amortization workbook confirms a $6,913.61 balance, $953.86 monthly payment, and Apr 9, 2027 maturity; APR still needs confirmation.'
FROM practices AS practice
WHERE loan.practice_id = practice.id
  AND practice.slug = 'ssmiles'
  AND loan.name = 'AMEX personal loan';

UPDATE financial_loans AS loan
SET original_principal_cents = 5000000,
    current_balance_cents = 2690000,
    balance_as_of_date = DATE '2026-08-15',
    scheduled_payment_cents = 330000,
    payment_frequency = 'monthly',
    annual_interest_rate = 0,
    interest_method = 'interest_free',
    next_payment_date = NULL,
    maturity_date = NULL,
    terms_status = 'verified',
    notes = 'Interest-free related-party loan with an original principal of $50,000 and a current balance of $26,900. Normal payments are $3,300 monthly. A three-month payment pause is in effect, with payments restarting in December 2026 and expected payoff in August 2027; exact monthly due day is intentionally unspecified.'
FROM practices AS practice
WHERE loan.practice_id = practice.id
  AND practice.slug = 'ssmiles'
  AND loan.name = 'Kelly Coffield loan';

UPDATE financial_loans AS loan
SET lender_name = 'Capital One',
    original_principal_cents = 1700000,
    current_balance_cents = 1605418,
    balance_as_of_date = DATE '2026-08-15',
    scheduled_payment_cents = 40543,
    payment_frequency = 'monthly',
    annual_interest_rate = 6.79,
    interest_method = 'amortizing',
    originated_on = DATE '2026-03-06',
    maturity_date = DATE '2029-12-06',
    terms_status = 'verified',
    notes = 'Current Mazda CX-5 financing is separate from the closed Mazda Miata loan. Bookkeeper workbook confirms $17,000 original principal, 6.79% APR, $405.43 scheduled monthly payment, and projected Dec 6, 2029 payoff after the recorded early extra payments.'
FROM practices AS practice
WHERE loan.practice_id = practice.id
  AND practice.slug = 'ssmiles'
  AND loan.name = 'Mazda CX-5';

UPDATE financial_loans AS loan
SET original_principal_cents = 3672183,
    current_balance_cents = 1376954,
    balance_as_of_date = DATE '2026-07-21',
    scheduled_payment_cents = 108401,
    payment_frequency = 'monthly',
    annual_interest_rate = 3.99,
    interest_method = 'amortizing',
    originated_on = DATE '2024-08-21',
    maturity_date = DATE '2027-08-21',
    next_payment_date = DATE '2026-08-21',
    terms_status = 'verified',
    notes = 'EverBank 3D X-ray equipment financing. Bookkeeper amortization workbook confirms $36,721.83 original principal, 3.99% APR, $1,084.01 monthly payment, and Aug 21, 2027 maturity.'
FROM practices AS practice
WHERE loan.practice_id = practice.id
  AND practice.slug = 'ssmiles'
  AND loan.name = '3D x-ray';

UPDATE financial_loans AS loan
SET notes = 'Closed Mazda Miata financing. This $33,151.75 vehicle loan is separate from the active $17,000 Mazda CX-5 loan.'
FROM practices AS practice
WHERE loan.practice_id = practice.id
  AND practice.slug = 'ssmiles'
  AND loan.name = 'Mazda closed loan';

COMMIT;
