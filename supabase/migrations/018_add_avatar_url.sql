-- Add avatar columns to profiles for user profile pictures
ALTER TABLE profiles ADD COLUMN avatar_url text;
ALTER TABLE profiles ADD COLUMN avatar_color text DEFAULT '#6b7280';

-- Allow users to update their own profile (name, username, avatar)
-- WITH CHECK prevents escalation: role, practice_id, email, is_active must remain unchanged
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT p.role FROM profiles p WHERE p.id = auth.uid())
    AND practice_id = (SELECT p.practice_id FROM profiles p WHERE p.id = auth.uid())
    AND email = (SELECT p.email FROM profiles p WHERE p.id = auth.uid())
    AND is_active = (SELECT p.is_active FROM profiles p WHERE p.id = auth.uid())
  );
