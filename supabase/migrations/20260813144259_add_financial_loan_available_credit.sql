alter table public.financial_loans
  add column available_credit_cents bigint
  check (available_credit_cents is null or available_credit_cents >= 0);

comment on column public.financial_loans.available_credit_cents is
  'Optional lender-reported available credit. Overrides limit minus balance for facilities whose outstanding balance includes fees or pending amounts.';
