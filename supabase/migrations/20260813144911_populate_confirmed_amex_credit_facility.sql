update public.financial_loans
set credit_limit_cents = 2340000,
    available_credit_cents = 190000,
    current_balance_cents = 2154208,
    balance_as_of_date = date '2026-08-13',
    scheduled_payment_cents = 246608,
    payment_frequency = 'monthly',
    interest_method = 'revolving',
    next_payment_date = date '2026-08-18',
    terms_status = 'partial',
    notes = 'American Express Business Line of Credit. Lender reported a $23,400 credit line, $1,900 available, and $21,542.08 outstanding as of Aug 13, 2026. Minimum due is $2,466.08 on Aug 18, 2026; next statement date is Aug 28, 2026. APR still needs confirmation.',
    updated_at = now()
where practice_id = (select id from public.practices where slug = 'ssmiles')
  and name = 'Amex line of credit'
  and lender_name = 'American Express';
