-- Track when each user last viewed the requests page
CREATE TABLE request_last_seen (
  profile_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE request_last_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own last_seen"
  ON request_last_seen FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "Users can upsert own last_seen"
  ON request_last_seen FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Users can update own last_seen"
  ON request_last_seen FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "Admins can read all last_seen"
  ON request_last_seen FOR SELECT USING (is_admin());

-- Add updated_at to requests to track latest activity (status change, new comment)
ALTER TABLE requests ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
