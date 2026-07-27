-- ============================================================
-- Migration 048: Supply invoice extraction and reconciliation
-- ============================================================

ALTER TABLE supply_invoice_events
  ADD COLUMN IF NOT EXISTS extraction jsonb,
  ADD COLUMN IF NOT EXISTS extracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS extraction_model text,
  ADD COLUMN IF NOT EXISTS review_draft jsonb,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_changes jsonb,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE supply_invoice_events
  DROP CONSTRAINT IF EXISTS supply_invoice_events_extraction_object,
  ADD CONSTRAINT supply_invoice_events_extraction_object
    CHECK (extraction IS NULL OR jsonb_typeof(extraction) = 'object'),
  DROP CONSTRAINT IF EXISTS supply_invoice_events_review_draft_object,
  ADD CONSTRAINT supply_invoice_events_review_draft_object
    CHECK (review_draft IS NULL OR jsonb_typeof(review_draft) = 'object'),
  DROP CONSTRAINT IF EXISTS supply_invoice_events_approved_changes_array,
  ADD CONSTRAINT supply_invoice_events_approved_changes_array
    CHECK (approved_changes IS NULL OR jsonb_typeof(approved_changes) = 'array'),
  DROP CONSTRAINT IF EXISTS supply_invoice_events_rejection_reason_length,
  ADD CONSTRAINT supply_invoice_events_rejection_reason_length
    CHECK (
      rejection_reason IS NULL
      OR char_length(rejection_reason) BETWEEN 1 AND 2000
    );

CREATE OR REPLACE FUNCTION reconcile_supply_invoice(
  p_event_id uuid,
  p_expected_event_updated_at timestamptz,
  p_expected_workspace_updated_at timestamptz,
  p_workspace jsonb,
  p_review_draft jsonb,
  p_approved_changes jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_practice_id uuid;
  v_event_practice_id uuid;
  v_event_status text;
  v_rows integer;
BEGIN
  IF v_user_id IS NULL OR NOT is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  v_practice_id := get_practice_id();
  SELECT practice_id, status
    INTO v_event_practice_id, v_event_status
  FROM supply_invoice_events
  WHERE id = p_event_id
  FOR UPDATE;

  IF v_event_practice_id IS NULL OR v_event_practice_id <> v_practice_id THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;
  IF v_event_status IN ('reconciled', 'rejected') THEN
    RAISE EXCEPTION 'Invoice is already closed';
  END IF;
  IF jsonb_typeof(p_workspace) <> 'object'
     OR jsonb_typeof(p_review_draft) <> 'object'
     OR jsonb_typeof(p_approved_changes) <> 'array' THEN
    RAISE EXCEPTION 'Invalid reconciliation payload';
  END IF;

  UPDATE supply_workspaces
  SET workspace = p_workspace,
      updated_by = v_user_id,
      updated_at = now()
  WHERE practice_id = v_practice_id
    AND updated_at = p_expected_workspace_updated_at;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Supply catalog changed while this invoice was open';
  END IF;

  UPDATE supply_invoice_events
  SET status = 'reconciled',
      status_reason = 'approved_price_updates',
      review_draft = p_review_draft,
      approved_changes = p_approved_changes,
      reviewed_by = v_user_id,
      reviewed_at = now(),
      rejection_reason = NULL,
      updated_at = now()
  WHERE id = p_event_id
    AND practice_id = v_practice_id
    AND updated_at = p_expected_event_updated_at;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Invoice changed while this review was open';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION reconcile_supply_invoice(
  uuid, timestamptz, timestamptz, jsonb, jsonb, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reconcile_supply_invoice(
  uuid, timestamptz, timestamptz, jsonb, jsonb, jsonb
) TO authenticated;
