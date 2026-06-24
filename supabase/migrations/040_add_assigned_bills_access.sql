-- ============================================================
-- Migration 040: Assigned Bills access
-- ============================================================

CREATE OR REPLACE FUNCTION is_assigned_bills_officer()
RETURNS boolean AS $$
  SELECT
    is_admin()
    OR EXISTS (
      SELECT 1
      FROM employee_posts ep
      JOIN posts p ON p.id = ep.post_id
      JOIN divisions d ON d.id = p.division_id
      WHERE ep.profile_id = auth.uid()
        AND ep.practice_id = get_practice_id()
        AND p.practice_id = get_practice_id()
        AND d.number = 3
        AND lower(trim(p.title)) = 'bills payment officer'
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS "Admins read bill vendors" ON bill_vendors;
DROP POLICY IF EXISTS "Admins create bill vendors" ON bill_vendors;
DROP POLICY IF EXISTS "Admins update bill vendors" ON bill_vendors;
DROP POLICY IF EXISTS "Admins delete bill vendors" ON bill_vendors;
DROP POLICY IF EXISTS "Admins read bills" ON bills;
DROP POLICY IF EXISTS "Admins create bills" ON bills;
DROP POLICY IF EXISTS "Admins update bills" ON bills;
DROP POLICY IF EXISTS "Admins delete bills" ON bills;

CREATE POLICY "Assigned bills users read bill vendors"
  ON bill_vendors FOR SELECT
  USING (practice_id = get_practice_id() AND is_assigned_bills_officer());

CREATE POLICY "Assigned bills users create bill vendors"
  ON bill_vendors FOR INSERT
  WITH CHECK (practice_id = get_practice_id() AND is_assigned_bills_officer());

CREATE POLICY "Assigned bills users update bill vendors"
  ON bill_vendors FOR UPDATE
  USING (practice_id = get_practice_id() AND is_assigned_bills_officer())
  WITH CHECK (practice_id = get_practice_id() AND is_assigned_bills_officer());

CREATE POLICY "Assigned bills users delete bill vendors"
  ON bill_vendors FOR DELETE
  USING (practice_id = get_practice_id() AND is_assigned_bills_officer());

CREATE POLICY "Assigned bills users read bills"
  ON bills FOR SELECT
  USING (practice_id = get_practice_id() AND is_assigned_bills_officer());

CREATE POLICY "Assigned bills users create bills"
  ON bills FOR INSERT
  WITH CHECK (practice_id = get_practice_id() AND is_assigned_bills_officer());

CREATE POLICY "Assigned bills users update bills"
  ON bills FOR UPDATE
  USING (practice_id = get_practice_id() AND is_assigned_bills_officer())
  WITH CHECK (practice_id = get_practice_id() AND is_assigned_bills_officer());

CREATE POLICY "Assigned bills users delete bills"
  ON bills FOR DELETE
  USING (practice_id = get_practice_id() AND is_assigned_bills_officer());
