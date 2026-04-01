-- ============================================================
-- Migration 020: Org Board Hierarchy
-- Adds departments and sections tables to support the full
-- Hubbard Management org board: Division → Department → Section
-- Also adds executive, vfp, color columns to divisions.
--
-- SAFETY: This migration is purely additive.
--   - No existing tables are altered (no FK changes)
--   - No existing rows are modified
--   - No data is seeded (admin populates via UI)
--   - stat_entries, stats, posts, employee_posts are untouched
-- ============================================================

-- Step 1: Add new columns to divisions
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS executive text;
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS vfp text;
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#6b7280';

-- Step 2: Create departments table
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  director text,
  division_id uuid NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  display_order int NOT NULL DEFAULT 0,
  practice_id uuid NOT NULL REFERENCES practices(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_departments_practice ON departments(practice_id);
CREATE INDEX IF NOT EXISTS idx_departments_division ON departments(division_id);

-- Step 3: Create sections table
CREATE TABLE IF NOT EXISTS sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  assignee text,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  post_id uuid REFERENCES posts(id) ON DELETE SET NULL,
  responsibilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  display_order int NOT NULL DEFAULT 0,
  practice_id uuid NOT NULL REFERENCES practices(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sections_practice ON sections(practice_id);
CREATE INDEX IF NOT EXISTS idx_sections_department ON sections(department_id);
CREATE INDEX IF NOT EXISTS idx_sections_post ON sections(post_id);

-- Step 4: RLS policies for departments
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read practice departments" ON departments FOR SELECT
  USING (practice_id = get_practice_id());
CREATE POLICY "Admins can insert practice departments" ON departments FOR INSERT
  WITH CHECK (practice_id = get_practice_id() AND is_admin());
CREATE POLICY "Admins can update practice departments" ON departments FOR UPDATE
  USING (practice_id = get_practice_id() AND is_admin());
CREATE POLICY "Admins can delete practice departments" ON departments FOR DELETE
  USING (practice_id = get_practice_id() AND is_admin());

-- Step 5: RLS policies for sections
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read practice sections" ON sections FOR SELECT
  USING (practice_id = get_practice_id());
CREATE POLICY "Admins can insert practice sections" ON sections FOR INSERT
  WITH CHECK (practice_id = get_practice_id() AND is_admin());
CREATE POLICY "Admins can update practice sections" ON sections FOR UPDATE
  USING (practice_id = get_practice_id() AND is_admin());
CREATE POLICY "Admins can delete practice sections" ON sections FOR DELETE
  USING (practice_id = get_practice_id() AND is_admin());
