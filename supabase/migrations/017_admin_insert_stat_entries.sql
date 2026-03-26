-- Fix: Allow admins to insert stat entries for other users
-- Migration 013 dropped the "Admins can insert entries" policy but didn't recreate it

CREATE POLICY "Admins can insert practice entries"
  ON stat_entries
  FOR INSERT
  WITH CHECK (practice_id = get_practice_id() AND is_admin());
