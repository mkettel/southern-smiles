-- Replace boolean is_completed with a proper status flow
CREATE TYPE request_status AS ENUM ('open', 'in_progress', 'in_review', 'completed');
ALTER TABLE requests ADD COLUMN status request_status NOT NULL DEFAULT 'open';

-- Migrate existing data
UPDATE requests SET status = 'completed' WHERE is_completed = true;
UPDATE requests SET status = 'open' WHERE is_completed = false;
