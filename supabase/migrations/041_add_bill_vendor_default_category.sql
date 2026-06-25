-- ============================================================
-- Migration 041: Vendor default bill categories
-- ============================================================

ALTER TABLE bill_vendors
  ADD COLUMN IF NOT EXISTS default_category text NOT NULL DEFAULT 'Miscellaneous';

ALTER TABLE bill_vendors
  DROP CONSTRAINT IF EXISTS bill_vendors_default_category_check;

ALTER TABLE bill_vendors
  ADD CONSTRAINT bill_vendors_default_category_check CHECK (
    default_category IN (
      'Rent',
      'Equipment Loans',
      'Marketing',
      'Lab Fees',
      'Dental Supplies',
      'Software',
      'Utilities',
      'Insurance',
      'Professional Services',
      'Miscellaneous'
    )
  );

UPDATE bill_vendors
SET default_category = CASE
  WHEN name IN ('Glidewell Lab', 'Peak Dental Design') THEN 'Lab Fees'
  WHEN name = 'Renew Digital' THEN 'Equipment Loans'
  ELSE default_category
END
WHERE default_category = 'Miscellaneous';
