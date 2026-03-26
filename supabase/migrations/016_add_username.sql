-- Add username column to profiles for username-based login
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username text;

-- Unique constraint scoped to practice (different practices can have same username)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_practice
  ON profiles(practice_id, lower(username))
  WHERE username IS NOT NULL;
