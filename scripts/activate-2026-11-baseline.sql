-- Operator-only, after stage-quickbooks-baseline.ts has verified the document readback.
-- Change only the reporting source. Never import historical lines into the Board journal.
DO $$
DECLARE
  practice constant uuid := '4410400a-84eb-4984-a7f9-68661bdb5213';
  previous constant text := 'c53e863cac6b161bf59777c3393dbce51634349f307eacba5896c58b6c2b7954';
  replacement constant text := '05efe4cacde621daaa6f7b19431e71b8d690b4f9a6e1b3650365bf4a00164bbf';
  active_hash text;
BEGIN
  LOCK TABLE public.accounting_source_baselines IN SHARE ROW EXCLUSIVE MODE;
  SELECT source_sha256 INTO STRICT active_hash FROM public.accounting_source_baselines
    WHERE practice_id = practice AND is_active;
  IF active_hash NOT IN (previous, replacement) THEN RAISE EXCEPTION 'Unexpected active baseline'; END IF;
  IF NOT EXISTS (SELECT FROM public.accounting_source_baselines
    WHERE practice_id = practice AND source_sha256 = replacement
      AND document->>'from' = '2026-01-01' AND document->>'through' = '2026-08-31'
      AND document->>'expectedEntryCount' = '1777' AND document->>'expectedLineCount' = '3899')
    THEN RAISE EXCEPTION 'Verified replacement is missing'; END IF;
  IF active_hash = previous THEN
    UPDATE public.accounting_source_baselines SET is_active = false
      WHERE practice_id = practice AND source_sha256 = previous;
    UPDATE public.accounting_source_baselines SET is_active = true
      WHERE practice_id = practice AND source_sha256 = replacement;
  END IF;
  SELECT source_sha256 INTO STRICT active_hash FROM public.accounting_source_baselines
    WHERE practice_id = practice AND is_active;
  IF active_hash <> replacement THEN RAISE EXCEPTION 'Activation failed'; END IF;
END $$;
