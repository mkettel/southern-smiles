-- User-defined account labels remain separate from Plaid's synced account name.

ALTER TABLE financial_accounts
  ADD COLUMN IF NOT EXISTS nickname text
  CHECK (
    nickname IS NULL
    OR char_length(trim(nickname)) BETWEEN 1 AND 80
  );
