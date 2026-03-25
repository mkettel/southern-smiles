-- ============================================================
-- PHASE 2A: Multi-Tenancy Foundation
-- Adds practice_id to all tables, updates RLS policies
-- ============================================================

-- Step 1: Rename practice_settings → practices
ALTER TABLE practice_settings RENAME TO practices;
ALTER TABLE practices ADD COLUMN IF NOT EXISTS slug text UNIQUE;
ALTER TABLE practices ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
UPDATE practices SET slug = 'southern-smiles' WHERE slug IS NULL;

-- Store the Southern Smiles practice ID for backfilling
DO $$
DECLARE
  ss_practice_id uuid;
BEGIN
  SELECT id INTO ss_practice_id FROM practices LIMIT 1;

  -- Step 2: Add practice_id to all tables (nullable first, then backfill, then NOT NULL)

  -- profiles
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES practices(id);
  UPDATE profiles SET practice_id = ss_practice_id WHERE practice_id IS NULL;
  ALTER TABLE profiles ALTER COLUMN practice_id SET NOT NULL;

  -- divisions
  ALTER TABLE divisions ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES practices(id);
  UPDATE divisions SET practice_id = ss_practice_id WHERE practice_id IS NULL;
  ALTER TABLE divisions ALTER COLUMN practice_id SET NOT NULL;

  -- posts
  ALTER TABLE posts ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES practices(id);
  UPDATE posts SET practice_id = ss_practice_id WHERE practice_id IS NULL;
  ALTER TABLE posts ALTER COLUMN practice_id SET NOT NULL;

  -- stats
  ALTER TABLE stats ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES practices(id);
  UPDATE stats SET practice_id = ss_practice_id WHERE practice_id IS NULL;
  ALTER TABLE stats ALTER COLUMN practice_id SET NOT NULL;

  -- stat_entries
  ALTER TABLE stat_entries ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES practices(id);
  UPDATE stat_entries SET practice_id = ss_practice_id WHERE practice_id IS NULL;
  ALTER TABLE stat_entries ALTER COLUMN practice_id SET NOT NULL;

  -- employee_posts
  ALTER TABLE employee_posts ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES practices(id);
  UPDATE employee_posts SET practice_id = ss_practice_id WHERE practice_id IS NULL;
  ALTER TABLE employee_posts ALTER COLUMN practice_id SET NOT NULL;

  -- oic_log
  ALTER TABLE oic_log ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES practices(id);
  UPDATE oic_log SET practice_id = ss_practice_id WHERE practice_id IS NULL;
  ALTER TABLE oic_log ALTER COLUMN practice_id SET NOT NULL;

  -- requests
  ALTER TABLE requests ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES practices(id);
  UPDATE requests SET practice_id = ss_practice_id WHERE practice_id IS NULL;
  ALTER TABLE requests ALTER COLUMN practice_id SET NOT NULL;

  -- request_comments
  ALTER TABLE request_comments ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES practices(id);
  UPDATE request_comments SET practice_id = ss_practice_id WHERE practice_id IS NULL;
  ALTER TABLE request_comments ALTER COLUMN practice_id SET NOT NULL;

  -- request_last_seen
  ALTER TABLE request_last_seen ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES practices(id);
  UPDATE request_last_seen SET practice_id = ss_practice_id WHERE practice_id IS NULL;
  ALTER TABLE request_last_seen ALTER COLUMN practice_id SET NOT NULL;

  RAISE NOTICE 'Backfilled all tables with practice_id: %', ss_practice_id;
END $$;

-- Step 3: Add indexes for practice_id lookups
CREATE INDEX IF NOT EXISTS idx_profiles_practice ON profiles(practice_id);
CREATE INDEX IF NOT EXISTS idx_divisions_practice ON divisions(practice_id);
CREATE INDEX IF NOT EXISTS idx_posts_practice ON posts(practice_id);
CREATE INDEX IF NOT EXISTS idx_stats_practice ON stats(practice_id);
CREATE INDEX IF NOT EXISTS idx_stat_entries_practice ON stat_entries(practice_id);
CREATE INDEX IF NOT EXISTS idx_employee_posts_practice ON employee_posts(practice_id);
CREATE INDEX IF NOT EXISTS idx_oic_log_practice ON oic_log(practice_id);
CREATE INDEX IF NOT EXISTS idx_requests_practice ON requests(practice_id);
CREATE INDEX IF NOT EXISTS idx_request_comments_practice ON request_comments(practice_id);
CREATE INDEX IF NOT EXISTS idx_request_last_seen_practice ON request_last_seen(practice_id);

-- Step 4: Create get_practice_id() helper function
CREATE OR REPLACE FUNCTION get_practice_id()
RETURNS uuid AS $$
  SELECT practice_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Step 5: Update all RLS policies to scope by practice_id

-- PRACTICES table
DROP POLICY IF EXISTS "Authenticated can read practice_settings" ON practices;
DROP POLICY IF EXISTS "Admins can update practice_settings" ON practices;
DROP POLICY IF EXISTS "Admins can insert practice_settings" ON practices;
CREATE POLICY "Users can read own practice" ON practices FOR SELECT USING (id = get_practice_id());
CREATE POLICY "Admins can update own practice" ON practices FOR UPDATE USING (id = get_practice_id() AND is_admin());
-- Practice creation will be handled via service role key in signup flow
-- No public INSERT policy — only the server can create practices

-- PROFILES
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;
CREATE POLICY "Users can read practice profiles" ON profiles FOR SELECT USING (practice_id = get_practice_id());
CREATE POLICY "Admins can insert practice profiles" ON profiles FOR INSERT WITH CHECK (practice_id = get_practice_id() AND is_admin());
CREATE POLICY "Admins can update practice profiles" ON profiles FOR UPDATE USING (practice_id = get_practice_id() AND is_admin());
CREATE POLICY "Admins can delete practice profiles" ON profiles FOR DELETE USING (practice_id = get_practice_id() AND is_admin());
-- Allow self-read always (for profile lookup during auth)
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT USING (id = auth.uid());

-- DIVISIONS
DROP POLICY IF EXISTS "Authenticated can read divisions" ON divisions;
DROP POLICY IF EXISTS "Admins can insert divisions" ON divisions;
DROP POLICY IF EXISTS "Admins can update divisions" ON divisions;
DROP POLICY IF EXISTS "Admins can delete divisions" ON divisions;
CREATE POLICY "Users can read practice divisions" ON divisions FOR SELECT USING (practice_id = get_practice_id());
CREATE POLICY "Admins can insert practice divisions" ON divisions FOR INSERT WITH CHECK (practice_id = get_practice_id() AND is_admin());
CREATE POLICY "Admins can update practice divisions" ON divisions FOR UPDATE USING (practice_id = get_practice_id() AND is_admin());
CREATE POLICY "Admins can delete practice divisions" ON divisions FOR DELETE USING (practice_id = get_practice_id() AND is_admin());

-- POSTS
DROP POLICY IF EXISTS "Authenticated can read posts" ON posts;
DROP POLICY IF EXISTS "Admins can insert posts" ON posts;
DROP POLICY IF EXISTS "Admins can update posts" ON posts;
DROP POLICY IF EXISTS "Admins can delete posts" ON posts;
CREATE POLICY "Users can read practice posts" ON posts FOR SELECT USING (practice_id = get_practice_id());
CREATE POLICY "Admins can insert practice posts" ON posts FOR INSERT WITH CHECK (practice_id = get_practice_id() AND is_admin());
CREATE POLICY "Admins can update practice posts" ON posts FOR UPDATE USING (practice_id = get_practice_id() AND is_admin());
CREATE POLICY "Admins can delete practice posts" ON posts FOR DELETE USING (practice_id = get_practice_id() AND is_admin());

-- EMPLOYEE_POSTS
DROP POLICY IF EXISTS "Users can read own assignments" ON employee_posts;
DROP POLICY IF EXISTS "Admins can read all assignments" ON employee_posts;
DROP POLICY IF EXISTS "Admins can insert assignments" ON employee_posts;
DROP POLICY IF EXISTS "Admins can update assignments" ON employee_posts;
DROP POLICY IF EXISTS "Admins can delete assignments" ON employee_posts;
CREATE POLICY "Users can read practice assignments" ON employee_posts FOR SELECT USING (practice_id = get_practice_id());
CREATE POLICY "Admins can insert practice assignments" ON employee_posts FOR INSERT WITH CHECK (practice_id = get_practice_id() AND is_admin());
CREATE POLICY "Admins can update practice assignments" ON employee_posts FOR UPDATE USING (practice_id = get_practice_id() AND is_admin());
CREATE POLICY "Admins can delete practice assignments" ON employee_posts FOR DELETE USING (practice_id = get_practice_id() AND is_admin());

-- STATS
DROP POLICY IF EXISTS "Authenticated can read stats" ON stats;
DROP POLICY IF EXISTS "Admins can insert stats" ON stats;
DROP POLICY IF EXISTS "Admins can update stats" ON stats;
DROP POLICY IF EXISTS "Admins can delete stats" ON stats;
CREATE POLICY "Users can read practice stats" ON stats FOR SELECT USING (practice_id = get_practice_id());
CREATE POLICY "Admins can insert practice stats" ON stats FOR INSERT WITH CHECK (practice_id = get_practice_id() AND is_admin());
CREATE POLICY "Admins can update practice stats" ON stats FOR UPDATE USING (practice_id = get_practice_id() AND is_admin());
CREATE POLICY "Admins can delete practice stats" ON stats FOR DELETE USING (practice_id = get_practice_id() AND is_admin());

-- STAT_ENTRIES
DROP POLICY IF EXISTS "Users can read own entries" ON stat_entries;
DROP POLICY IF EXISTS "Users can insert own entries" ON stat_entries;
DROP POLICY IF EXISTS "Users can update own entries" ON stat_entries;
DROP POLICY IF EXISTS "Admins can read all entries" ON stat_entries;
DROP POLICY IF EXISTS "Admins can insert entries" ON stat_entries;
DROP POLICY IF EXISTS "Admins can update entries" ON stat_entries;
DROP POLICY IF EXISTS "Admins can delete entries" ON stat_entries;
DROP POLICY IF EXISTS "Authenticated can read all entries" ON stat_entries;
CREATE POLICY "Users can read practice entries" ON stat_entries FOR SELECT USING (practice_id = get_practice_id());
CREATE POLICY "Users can insert own practice entries" ON stat_entries FOR INSERT WITH CHECK (practice_id = get_practice_id() AND profile_id = auth.uid());
CREATE POLICY "Users can update own practice entries" ON stat_entries FOR UPDATE USING (practice_id = get_practice_id() AND (profile_id = auth.uid() OR is_admin()));
CREATE POLICY "Admins can delete practice entries" ON stat_entries FOR DELETE USING (practice_id = get_practice_id() AND is_admin());

-- OIC_LOG
DROP POLICY IF EXISTS "Authenticated can read oic_log" ON oic_log;
DROP POLICY IF EXISTS "Authenticated can insert oic_log" ON oic_log;
DROP POLICY IF EXISTS "Admins can insert oic_log" ON oic_log;
DROP POLICY IF EXISTS "Admins can update oic_log" ON oic_log;
DROP POLICY IF EXISTS "Admins can delete oic_log" ON oic_log;
CREATE POLICY "Users can read practice oic_log" ON oic_log FOR SELECT USING (practice_id = get_practice_id());
CREATE POLICY "Users can insert practice oic_log" ON oic_log FOR INSERT WITH CHECK (practice_id = get_practice_id());
CREATE POLICY "Admins can update practice oic_log" ON oic_log FOR UPDATE USING (practice_id = get_practice_id() AND is_admin());
CREATE POLICY "Admins can delete practice oic_log" ON oic_log FOR DELETE USING (practice_id = get_practice_id() AND is_admin());

-- REQUESTS
DROP POLICY IF EXISTS "Admins can read requests" ON requests;
DROP POLICY IF EXISTS "Admins can insert requests" ON requests;
DROP POLICY IF EXISTS "Admins can update requests" ON requests;
DROP POLICY IF EXISTS "Admins can delete requests" ON requests;
CREATE POLICY "Admins can read practice requests" ON requests FOR SELECT USING (practice_id = get_practice_id() AND is_admin());
CREATE POLICY "Admins can insert practice requests" ON requests FOR INSERT WITH CHECK (practice_id = get_practice_id() AND is_admin());
CREATE POLICY "Admins can update practice requests" ON requests FOR UPDATE USING (practice_id = get_practice_id() AND is_admin());
CREATE POLICY "Admins can delete practice requests" ON requests FOR DELETE USING (practice_id = get_practice_id() AND is_admin());

-- REQUEST_COMMENTS
DROP POLICY IF EXISTS "Admins can read comments" ON request_comments;
DROP POLICY IF EXISTS "Admins can insert comments" ON request_comments;
DROP POLICY IF EXISTS "Admins can delete comments" ON request_comments;
CREATE POLICY "Admins can read practice comments" ON request_comments FOR SELECT USING (practice_id = get_practice_id() AND is_admin());
CREATE POLICY "Admins can insert practice comments" ON request_comments FOR INSERT WITH CHECK (practice_id = get_practice_id() AND is_admin());
CREATE POLICY "Admins can delete practice comments" ON request_comments FOR DELETE USING (practice_id = get_practice_id() AND is_admin());

-- REQUEST_LAST_SEEN
-- Fix: PK was profile_id only, but multi-tenancy needs composite key
ALTER TABLE request_last_seen DROP CONSTRAINT IF EXISTS request_last_seen_pkey;
ALTER TABLE request_last_seen ADD PRIMARY KEY (profile_id, practice_id);

DROP POLICY IF EXISTS "Users can read own last_seen" ON request_last_seen;
DROP POLICY IF EXISTS "Users can upsert own last_seen" ON request_last_seen;
DROP POLICY IF EXISTS "Users can update own last_seen" ON request_last_seen;
DROP POLICY IF EXISTS "Admins can read all last_seen" ON request_last_seen;
CREATE POLICY "Users can read own last_seen" ON request_last_seen FOR SELECT USING (profile_id = auth.uid() AND practice_id = get_practice_id());
CREATE POLICY "Users can insert own last_seen" ON request_last_seen FOR INSERT WITH CHECK (profile_id = auth.uid() AND practice_id = get_practice_id());
CREATE POLICY "Users can update own last_seen" ON request_last_seen FOR UPDATE USING (profile_id = auth.uid() AND practice_id = get_practice_id());

-- Step 6: Update auth trigger to include practice_id
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, practice_id)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'employee'),
    (new.raw_user_meta_data->>'practice_id')::uuid
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
