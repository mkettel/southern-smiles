BEGIN;

-- Match the destination, not a reference number, a generic issuer, or a
-- description on the card alone. Unrecognized bank formats stay in review.
CREATE FUNCTION public.auto_post_named_card_payments(p_practice_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  pair record;
  posted integer := 0;
  -- October was already reviewed. Never back-post before the November rollout.
  starts_on constant date := date '2026-11-01';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM practices WHERE id = p_practice_id AND slug = 'ssmiles') THEN
    RETURN 0;
  END IF;
  FOR pair IN
    WITH cards AS (
      SELECT id, mask, name, official_name, included_in_bookkeeping, count(*) OVER (PARTITION BY mask) AS mask_count
      FROM financial_accounts
      WHERE practice_id = p_practice_id AND is_active AND account_type = 'credit'
        AND account_subtype = 'credit card' AND mask ~ '^[0-9]{4}$'
    ), candidates AS (
      SELECT d.id AS debit, c.id AS receipt, card.id AS destination,
        count(*) OVER (PARTITION BY d.id) AS receipts,
        count(*) OVER (PARTITION BY c.id) AS debits,
        d.updated_at AS debit_version, c.updated_at AS receipt_version
      FROM financial_transactions d
      JOIN financial_accounts a ON a.id = d.account_id AND a.practice_id = p_practice_id
        AND a.is_active AND a.included_in_bookkeeping
        AND a.account_type = 'depository' AND a.account_subtype = 'checking'
      CROSS JOIN LATERAL regexp_match(upper(coalesce(nullif(trim(d.original_description), ''), trim(d.name))),
        '^(?:ONLINE TRANSFER(?: REF #[A-Z0-9]+)? TO |(?:ONLINE )?PAYMENT TO )([A-Z0-9 &-]{1,80} CARD) +(?:X+|[*]+|ENDING (?:IN )?)([0-9]{4})(?: ON [0-9]{2}/[0-9]{2}/[0-9]{2,4})?$') AS named(parts)
      JOIN cards card ON card.mask_count = 1 AND card.included_in_bookkeeping AND card.mask = parts[2]
        AND parts[1] IN (
          regexp_replace(upper(trim(card.name)), ' +[.X*]*[0-9]{4}$', ''),
          regexp_replace(upper(trim(card.official_name)), ' +[.X*]*[0-9]{4}$', '')
        )
      JOIN financial_transactions c ON c.practice_id = p_practice_id AND c.account_id = card.id
        AND c.amount_cents = -d.amount_cents AND c.currency_code = d.currency_code
        AND c.transaction_date BETWEEN d.transaction_date - 5 AND d.transaction_date + 5
        AND upper(trim(coalesce(nullif(trim(c.original_description), ''), c.name)))
          ~ '^(?:(?:ONLINE|INTERNET|AUTOMATIC|AUTOPAY) )?PAYMENT (?:THANK YOU|RECEIVED)$'
      WHERE d.practice_id = p_practice_id AND d.amount_cents > 0
        AND NOT d.is_removed AND NOT c.is_removed AND d.transaction_date >= starts_on - 5
        AND (SELECT count(*) FROM generate_series(1, abs(c.transaction_date - d.transaction_date)) AS days(n)
             WHERE extract(isodow FROM least(c.transaction_date, d.transaction_date) + n) <= 5) <= 3
    )
    -- Count contenders before filtering by review status: a reviewed or
    -- pending lookalike must not make an ambiguous pair look unique.
    SELECT d.id AS debit, c.id AS receipt, k.destination
    FROM candidates k JOIN financial_transactions d ON d.id = k.debit
      JOIN financial_transactions c ON c.id = k.receipt
    WHERE k.receipts = 1 AND k.debits = 1
      AND d.updated_at = k.debit_version AND c.updated_at = k.receipt_version
      AND least(d.transaction_date, c.transaction_date) >= starts_on
      AND NOT d.pending AND NOT c.pending
      AND d.review_status = 'pending' AND c.review_status = 'pending'
      AND NOT EXISTS (SELECT 1 FROM accounting_transaction_links l
                      WHERE l.financial_transaction_id IN (d.id, c.id))
      AND NOT EXISTS (SELECT 1 FROM accounting_journal_entries e
                      WHERE e.source_transaction_id IN (d.id, c.id))
    ORDER BY d.id FOR UPDATE OF d,c SKIP LOCKED
  LOOP
    PERFORM post_financial_transfer(p_practice_id, pair.debit, pair.destination, pair.receipt,
      'credit_card_payment', 'Auto-approved: named destination card and unique matching payment', NULL);
    posted := posted + 1;
  END LOOP;
  RETURN posted;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_post_named_card_payments(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_post_named_card_payments(uuid) TO service_role;

COMMIT;
