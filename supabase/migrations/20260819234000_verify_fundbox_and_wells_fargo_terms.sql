-- Record lender-confirmed revolving credit and fixed-fee advance terms.

update public.financial_loans as loan
set
  annual_interest_rate = 14.2500,
  current_balance_cents = 364296,
  available_credit_cents = 1635704,
  balance_as_of_date = date '2026-08-17',
  balance_anchor_cents = 364296,
  balance_anchor_date = date '2026-08-17',
  terms_status = 'verified',
  notes = 'Wells Fargo Business Line Credit ending 5483. The Aug 17, 2026 statement reports a $20,000 credit line, $3,642.96 balance, 14.250% variable annual interest rate for purchases and cash advances, and $43.81 periodic finance charges on a $3,620.30 average daily cash-advance balance. The statement shows $0 transaction finance charges. No maturity date applies to this revolving line.',
  updated_at = now()
from public.practices as practice
where loan.practice_id = practice.id
  and practice.slug = 'ssmiles'
  and loan.name = 'MasterCard line of credit'
  and loan.account_reference = '5483';

update public.financial_loans as loan
set
  original_principal_cents = 1900000,
  current_balance_cents = 1606228,
  credit_limit_cents = 2280000,
  available_credit_cents = 673772,
  balance_as_of_date = date '2026-08-19',
  balance_anchor_cents = 1606228,
  balance_anchor_date = date '2026-08-19',
  scheduled_payment_cents = 46873,
  payment_frequency = 'weekly',
  interest_method = 'fixed_fee',
  originated_on = date '2026-05-14',
  maturity_date = date '2027-05-18',
  next_payment_date = date '2026-08-25',
  terms_status = 'verified',
  notes = 'Fundbox Direct Draw no. 6166945802: $19,000 drawn May 14, 2026 on a 52-week fixed-fee repayment plan at $468.73 weekly, ending May 18, 2027. On Aug 19, 2026, Fundbox showed 39 of 52 payments remaining, $6,737.72 available on the $22,800 line, and an early-payoff debit of $16,041.39 scheduled for Aug 25 if elected. Keeping the original plan would total $18,280.47 over the remaining 39 payments; paying the quoted balance early would avoid $2,239.08 of remaining scheduled charges. Contract uses fixed fees rather than a stated APR.',
  updated_at = now()
from public.practices as practice
where loan.practice_id = practice.id
  and practice.slug = 'ssmiles'
  and loan.name = 'Fundbox advance'
  and loan.lender_name = 'Fundbox';
