-- Practice settings table (single row per practice for now)
CREATE TABLE practice_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'My Practice',
  short_name text,
  tagline text,
  logo_url text,
  primary_color text DEFAULT '#0a0a0a',
  address text,
  phone text,
  website text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE practice_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read practice_settings"
  ON practice_settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can update practice_settings"
  ON practice_settings FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can insert practice_settings"
  ON practice_settings FOR INSERT WITH CHECK (is_admin());

-- Seed with Southern Smiles data
INSERT INTO practice_settings (name, short_name, tagline, primary_color)
VALUES ('Southern Smiles', 'Southern Smiles', 'Weekly performance tracking', '#0a0a0a');
