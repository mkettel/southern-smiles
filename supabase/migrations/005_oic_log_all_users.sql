-- Allow all authenticated users to create OIC log entries
-- Admins retain edit/delete control
DROP POLICY IF EXISTS "Admins can insert oic_log" ON oic_log;
CREATE POLICY "Authenticated can insert oic_log"
  ON oic_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
