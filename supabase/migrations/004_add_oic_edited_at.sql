-- Add edited_at column to track when OIC log entries are manually edited
ALTER TABLE oic_log ADD COLUMN edited_at timestamptz;
