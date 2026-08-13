ALTER TABLE financial_loans
  ADD COLUMN credit_limit_cents bigint
    CHECK (credit_limit_cents IS NULL OR credit_limit_cents > 0);

COMMENT ON COLUMN financial_loans.credit_limit_cents IS
  'Maximum borrowing capacity for revolving lines of credit. Null when the limit is unknown or not applicable.';
