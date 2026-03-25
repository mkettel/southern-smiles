-- Track who invited each user
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES profiles(id);
