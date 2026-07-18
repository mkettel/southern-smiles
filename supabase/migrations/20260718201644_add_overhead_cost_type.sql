-- Separate fixed and variable overhead line items.
-- Existing items remain fixed so current totals and procedure costs do not change.

ALTER TABLE overhead_items
  ADD COLUMN cost_type text NOT NULL DEFAULT 'fixed'
  CHECK (cost_type IN ('fixed', 'variable'));

CREATE INDEX idx_overhead_items_practice_cost_type
  ON overhead_items(practice_id, cost_type)
  WHERE is_active = true;
