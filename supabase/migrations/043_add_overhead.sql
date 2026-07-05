-- ============================================================
-- Migration 043: Overhead modeling
-- ============================================================

CREATE TABLE IF NOT EXISTS overhead_settings (
  practice_id uuid PRIMARY KEY REFERENCES practices(id) ON DELETE CASCADE,
  operatories_count integer NOT NULL DEFAULT 4 CHECK (operatories_count >= 1 AND operatories_count <= 100),
  days_per_week numeric(4,2) NOT NULL DEFAULT 5 CHECK (days_per_week > 0 AND days_per_week <= 7),
  clinical_hours_per_day numeric(5,2) NOT NULL DEFAULT 8 CHECK (clinical_hours_per_day > 0 AND clinical_hours_per_day <= 24),
  weeks_per_month numeric(5,2) NOT NULL DEFAULT 4.33 CHECK (weeks_per_month > 0 AND weeks_per_month <= 6),
  utilization_percent numeric(5,2) NOT NULL DEFAULT 85 CHECK (utilization_percent > 0 AND utilization_percent <= 100),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS overhead_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 160),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS overhead_categories_practice_name_key
  ON overhead_categories(practice_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_overhead_categories_practice_order
  ON overhead_categories(practice_id, display_order, name);

CREATE TABLE IF NOT EXISTS overhead_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES overhead_categories(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 200),
  monthly_cost_cents integer NOT NULL CHECK (monthly_cost_cents >= 0),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_overhead_items_practice_category
  ON overhead_items(practice_id, category_id, display_order, name);

ALTER TABLE overhead_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE overhead_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE overhead_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read overhead settings" ON overhead_settings;
CREATE POLICY "Admins read overhead settings"
  ON overhead_settings FOR SELECT
  USING (practice_id = get_practice_id() AND is_admin());

DROP POLICY IF EXISTS "Admins create overhead settings" ON overhead_settings;
CREATE POLICY "Admins create overhead settings"
  ON overhead_settings FOR INSERT
  WITH CHECK (practice_id = get_practice_id() AND is_admin());

DROP POLICY IF EXISTS "Admins update overhead settings" ON overhead_settings;
CREATE POLICY "Admins update overhead settings"
  ON overhead_settings FOR UPDATE
  USING (practice_id = get_practice_id() AND is_admin());

DROP POLICY IF EXISTS "Admins delete overhead settings" ON overhead_settings;
CREATE POLICY "Admins delete overhead settings"
  ON overhead_settings FOR DELETE
  USING (practice_id = get_practice_id() AND is_admin());

DROP POLICY IF EXISTS "Admins read overhead categories" ON overhead_categories;
CREATE POLICY "Admins read overhead categories"
  ON overhead_categories FOR SELECT
  USING (practice_id = get_practice_id() AND is_admin());

DROP POLICY IF EXISTS "Admins create overhead categories" ON overhead_categories;
CREATE POLICY "Admins create overhead categories"
  ON overhead_categories FOR INSERT
  WITH CHECK (practice_id = get_practice_id() AND is_admin());

DROP POLICY IF EXISTS "Admins update overhead categories" ON overhead_categories;
CREATE POLICY "Admins update overhead categories"
  ON overhead_categories FOR UPDATE
  USING (practice_id = get_practice_id() AND is_admin());

DROP POLICY IF EXISTS "Admins delete overhead categories" ON overhead_categories;
CREATE POLICY "Admins delete overhead categories"
  ON overhead_categories FOR DELETE
  USING (practice_id = get_practice_id() AND is_admin());

DROP POLICY IF EXISTS "Admins read overhead items" ON overhead_items;
CREATE POLICY "Admins read overhead items"
  ON overhead_items FOR SELECT
  USING (practice_id = get_practice_id() AND is_admin());

DROP POLICY IF EXISTS "Admins create overhead items" ON overhead_items;
CREATE POLICY "Admins create overhead items"
  ON overhead_items FOR INSERT
  WITH CHECK (practice_id = get_practice_id() AND is_admin());

DROP POLICY IF EXISTS "Admins update overhead items" ON overhead_items;
CREATE POLICY "Admins update overhead items"
  ON overhead_items FOR UPDATE
  USING (practice_id = get_practice_id() AND is_admin());

DROP POLICY IF EXISTS "Admins delete overhead items" ON overhead_items;
CREATE POLICY "Admins delete overhead items"
  ON overhead_items FOR DELETE
  USING (practice_id = get_practice_id() AND is_admin());

INSERT INTO overhead_settings (practice_id)
SELECT id
FROM practices
ON CONFLICT (practice_id) DO NOTHING;
