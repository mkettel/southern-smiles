-- ============================================================
-- Migration 049: Supply invoice extraction usage and cost
-- ============================================================

ALTER TABLE supply_invoice_events
  ADD COLUMN IF NOT EXISTS extraction_usage jsonb;

ALTER TABLE supply_invoice_events
  DROP CONSTRAINT IF EXISTS supply_invoice_events_extraction_usage_object,
  ADD CONSTRAINT supply_invoice_events_extraction_usage_object
    CHECK (
      extraction_usage IS NULL
      OR jsonb_typeof(extraction_usage) = 'object'
    );
