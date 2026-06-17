-- ============================================================
-- Migration 037: Bills tracking
-- ============================================================

CREATE TABLE bill_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 160),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  is_misc boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX bill_vendors_practice_name_key
  ON bill_vendors(practice_id, lower(name));

CREATE UNIQUE INDEX bill_vendors_one_misc_per_practice
  ON bill_vendors(practice_id)
  WHERE is_misc;

CREATE INDEX idx_bill_vendors_practice
  ON bill_vendors(practice_id, name);

CREATE TABLE bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES bill_vendors(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (
    category IN (
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
  ),
  invoice_date date NOT NULL,
  due_date date NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 4000),
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid')),
  paid_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bills_paid_date_matches_status CHECK (
    (status = 'unpaid' AND paid_date IS NULL)
    OR (status = 'paid' AND paid_date IS NOT NULL)
  )
);

CREATE INDEX idx_bills_practice_status_due
  ON bills(practice_id, status, due_date);

CREATE INDEX idx_bills_vendor
  ON bills(vendor_id);

CREATE INDEX idx_bills_practice_category
  ON bills(practice_id, category);

ALTER TABLE bill_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read bill vendors"
  ON bill_vendors FOR SELECT
  USING (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins create bill vendors"
  ON bill_vendors FOR INSERT
  WITH CHECK (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins update bill vendors"
  ON bill_vendors FOR UPDATE
  USING (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins delete bill vendors"
  ON bill_vendors FOR DELETE
  USING (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins read bills"
  ON bills FOR SELECT
  USING (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins create bills"
  ON bills FOR INSERT
  WITH CHECK (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins update bills"
  ON bills FOR UPDATE
  USING (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins delete bills"
  ON bills FOR DELETE
  USING (practice_id = get_practice_id() AND is_admin());

INSERT INTO bill_vendors (practice_id, name, is_misc)
SELECT id, 'Miscellaneous', true
FROM practices
ON CONFLICT DO NOTHING;

INSERT INTO bill_vendors (practice_id, name, is_misc)
SELECT practices.id, vendors.name, false
FROM practices
CROSS JOIN (
  VALUES
    ('Glidewell Lab'),
    ('MSG'),
    ('Peak Dental Design'),
    ('Renew Digital')
) AS vendors(name)
ON CONFLICT DO NOTHING;
