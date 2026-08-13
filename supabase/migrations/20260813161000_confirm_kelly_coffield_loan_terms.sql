BEGIN;

UPDATE financial_loans AS loan
SET original_principal_cents = 5000000,
    annual_interest_rate = 0,
    interest_method = 'interest_free',
    terms_status = 'verified',
    notes = 'Interest-free related-party loan with an original principal of $50,000. QuickBooks shows a $16,500 principal payment in January 2026.'
FROM practices AS practice
WHERE loan.practice_id = practice.id
  AND practice.slug = 'ssmiles'
  AND loan.name = 'Kelly Coffield loan';

COMMIT;
