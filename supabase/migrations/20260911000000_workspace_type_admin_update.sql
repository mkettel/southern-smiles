-- Let practice admins change their own workspace type / plan from Settings.
-- Requires 20260811043558_workspace_entitlements.sql.

GRANT INSERT, UPDATE ON practice_product_settings TO authenticated;

DROP POLICY IF EXISTS "Admins can insert own product settings" ON practice_product_settings;
CREATE POLICY "Admins can insert own product settings"
  ON practice_product_settings FOR INSERT
  TO authenticated
  WITH CHECK (practice_id = (SELECT get_practice_id()) AND (SELECT is_admin()));

DROP POLICY IF EXISTS "Admins can update own product settings" ON practice_product_settings;
CREATE POLICY "Admins can update own product settings"
  ON practice_product_settings FOR UPDATE
  TO authenticated
  USING (practice_id = (SELECT get_practice_id()) AND (SELECT is_admin()))
  WITH CHECK (practice_id = (SELECT get_practice_id()) AND (SELECT is_admin()));
