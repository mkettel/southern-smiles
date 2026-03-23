-- Allow all authenticated users to read all stat entries
-- (employees can see the full team dashboard, not just their own stats)
-- Write policies remain unchanged (employees can only insert/update their own)
DROP POLICY IF EXISTS "Users can read own entries" ON stat_entries;
CREATE POLICY "Authenticated can read all entries"
  ON stat_entries FOR SELECT USING (auth.uid() IS NOT NULL);
