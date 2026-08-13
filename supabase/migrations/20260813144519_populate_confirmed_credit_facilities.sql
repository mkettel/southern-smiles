update public.financial_loans
set credit_limit_cents = 2000000,
    available_credit_cents = 1640000,
    current_balance_cents = 359915,
    balance_as_of_date = date '2026-08-12',
    scheduled_payment_cents = null,
    payment_frequency = 'irregular',
    interest_method = 'revolving',
    terms_status = 'partial',
    notes = 'Wells Fargo Business Line Credit ending 5483. Lender reported a $20,000 credit line, $3,599.15 outstanding, and $16,400 available as of Aug 12, 2026. No payment was due Aug 11, 2026; APR still needs confirmation.',
    updated_at = now()
where practice_id = (select id from public.practices where slug = 'ssmiles')
  and name = 'MasterCard line of credit'
  and lender_name = 'Wells Fargo'
  and account_reference = '5483';

update public.financial_loans
set loan_type = 'line_of_credit',
    original_principal_cents = null,
    credit_limit_cents = 2280000,
    available_credit_cents = 649291,
    current_balance_cents = 1874941,
    balance_as_of_date = date '2026-08-13',
    scheduled_payment_cents = 46873,
    payment_frequency = 'weekly',
    interest_method = 'revolving',
    maturity_date = date '2027-05-18',
    next_payment_date = date '2026-08-18',
    terms_status = 'partial',
    notes = 'Fundbox Direct Draw revolving facility. $22,800 limit and $6,492.91 lender-reported available credit. Active $19,000 draw has $18,749.41 outstanding including $2,687.13 in fees, 40 of 52 payments remaining, and a $468.73 weekly debit. Draw ends May 18, 2027.',
    updated_at = now()
where practice_id = (select id from public.practices where slug = 'ssmiles')
  and name = 'Fundbox advance'
  and lender_name = 'Fundbox';
