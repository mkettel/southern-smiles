BEGIN;
ALTER FUNCTION public.auto_post_named_card_payments(uuid) RENAME TO post_named_card_pairs;

-- Preserve the deployed sync entry point, including its retry behavior.
CREATE FUNCTION public.auto_post_named_card_payments(p_practice_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  n integer;
  pair record;
BEGIN
  n := public.post_named_card_pairs(p_practice_id);
  IF NOT EXISTS (SELECT FROM practices WHERE id=p_practice_id AND slug='ssmiles') THEN RETURN n; END IF;
  FOR pair IN
    WITH legs AS (
      SELECT t.*, a.mask, a.account_type, a.account_subtype, a.included_in_bookkeeping, a.is_active,
        m[1] AS direction, m[2] AS other_mask, m[3] AS ref, m[4] AS bank_date,
        count(*) OVER (PARTITION BY m[3]) AS copies
      FROM financial_transactions t
      JOIN financial_accounts a ON a.id=t.account_id AND a.practice_id=t.practice_id
      CROSS JOIN LATERAL regexp_match(upper(trim(coalesce(nullif(t.original_description,''),t.name))),
        '^ONLINE TRANSFER (TO|FROM) DR[.] MONZER SHAKALLY, DDS LLC BUSINESS (?:CHECKING|MARKET RATE SAVINGS) X+([0-9]{4}) REF #([A-Z0-9]+) ON ([0-9]{2}/[0-9]{2}/[0-9]{2})$') AS m
      WHERE t.practice_id=p_practice_id AND NOT t.is_removed
    ), eligible AS (
      SELECT * FROM legs WHERE copies=2 AND included_in_bookkeeping AND is_active
        AND account_type='depository' AND account_subtype IN ('checking','savings','money market')
        AND transaction_date >= DATE '2026-11-01' AND NOT pending AND review_status='pending'
    )
    SELECT d.id AS debit,c.id AS receipt,c.account_id AS destination
    FROM eligible d JOIN eligible c ON c.ref=d.ref AND c.bank_date=d.bank_date
      AND c.transaction_date=d.transaction_date AND c.currency_code=d.currency_code
      AND d.other_mask=c.mask AND c.other_mask=d.mask AND c.mask<>d.mask
      AND d.amount_cents=-c.amount_cents AND d.amount_cents>0
    JOIN financial_transactions dt ON dt.id=d.id AND dt.updated_at=d.updated_at AND dt.review_status='pending'
    JOIN financial_transactions ct ON ct.id=c.id AND ct.updated_at=c.updated_at AND ct.review_status='pending'
    WHERE d.direction='TO' AND c.direction='FROM'
      AND NOT EXISTS (SELECT FROM accounting_transaction_links WHERE financial_transaction_id IN (d.id,c.id))
      AND NOT EXISTS (SELECT FROM accounting_journal_entries WHERE source_transaction_id IN (d.id,c.id))
    ORDER BY dt.id FOR UPDATE OF dt,ct SKIP LOCKED
  LOOP
    PERFORM post_financial_transfer(p_practice_id,pair.debit,pair.destination,pair.receipt,
      'internal','Auto-approved: shared bank reference and reciprocal practice accounts',NULL);
    n := n+1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.auto_post_named_card_payments(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_post_named_card_payments(uuid) TO service_role;
COMMIT;
