-- ============================================================
-- Migration 039: Unified daily and weekly stat tracking
-- Stat values belong to the stat/date or stat/week. profile_id is retained
-- as an audit field identifying the most recent editor.
-- ============================================================

ALTER TABLE stats
  ADD COLUMN IF NOT EXISTS daily_tracking_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS weekly_formula text NOT NULL DEFAULT 'sum',
  ADD COLUMN IF NOT EXISTS formula_source_stat_id uuid REFERENCES stats(id) ON DELETE SET NULL;

ALTER TABLE stats DROP CONSTRAINT IF EXISTS stats_weekly_formula_check;
ALTER TABLE stats ADD CONSTRAINT stats_weekly_formula_check CHECK (
  weekly_formula IN ('sum', 'average', 'manual', 'collections_per_staff')
);

UPDATE stats SET weekly_formula = 'average' WHERE stat_type = 'percentage';
UPDATE stats SET weekly_formula = 'manual' WHERE lower(name) = 'accounts receivable';
UPDATE stats target
SET weekly_formula = 'collections_per_staff',
    formula_source_stat_id = source.id
FROM stats source
WHERE lower(target.name) = 'collections/staff'
  AND lower(source.name) = 'collections'
  AND target.practice_id = source.practice_id;

ALTER TABLE stat_entries
  ADD COLUMN IF NOT EXISTS calculated_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS is_manual_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- The old model allowed one row per employee. Preserve the dashboard's prior
-- behavior by folding contributor values into the newest canonical row.
WITH grouped AS (
  SELECT
    stat_id,
    week_start,
    sum(value) AS total_value,
    (array_agg(id ORDER BY updated_at DESC NULLS LAST, submitted_at DESC NULLS LAST, id))[1] AS keeper_id
  FROM stat_entries
  GROUP BY stat_id, week_start
  HAVING count(*) > 1
)
UPDATE stat_entries entry
SET value = grouped.total_value,
    calculated_value = grouped.total_value
FROM grouped
WHERE entry.id = grouped.keeper_id;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY stat_id, week_start
    ORDER BY updated_at DESC NULLS LAST, submitted_at DESC NULLS LAST, id
  ) AS row_number
  FROM stat_entries
)
DELETE FROM stat_entries
WHERE id IN (SELECT id FROM ranked WHERE row_number > 1);

UPDATE stat_entries
SET calculated_value = value
WHERE calculated_value IS NULL;

ALTER TABLE stat_entries DROP CONSTRAINT IF EXISTS stat_entries_stat_profile_week_key;
ALTER TABLE stat_entries DROP CONSTRAINT IF EXISTS stat_entries_stat_id_profile_id_week_start_key;
ALTER TABLE stat_entries DROP CONSTRAINT IF EXISTS stat_entries_stat_id_week_start_key;
ALTER TABLE stat_entries ADD CONSTRAINT stat_entries_stat_week_key UNIQUE (stat_id, week_start);

CREATE TABLE IF NOT EXISTS daily_stat_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  stat_id uuid NOT NULL REFERENCES stats(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  entry_date date NOT NULL,
  week_start date NOT NULL,
  input_value numeric CHECK (input_value IS NULL OR input_value >= 0),
  value numeric CHECK (value IS NULL OR value >= 0),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_stat_entries_one_per_day UNIQUE (stat_id, entry_date)
);

ALTER TABLE daily_stat_entries ADD COLUMN IF NOT EXISTS input_value numeric;
ALTER TABLE daily_stat_entries ALTER COLUMN value DROP NOT NULL;
ALTER TABLE daily_stat_entries DROP CONSTRAINT IF EXISTS daily_stat_entries_one_per_day;
ALTER TABLE daily_stat_entries DROP CONSTRAINT IF EXISTS daily_stat_entries_stat_id_profile_id_entry_date_key;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY stat_id, entry_date ORDER BY updated_at DESC, id
  ) AS row_number
  FROM daily_stat_entries
)
DELETE FROM daily_stat_entries
WHERE id IN (SELECT id FROM ranked WHERE row_number > 1);

ALTER TABLE daily_stat_entries
  ADD CONSTRAINT daily_stat_entries_one_per_day UNIQUE (stat_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_daily_stat_entries_week
  ON daily_stat_entries(week_start, stat_id);
CREATE INDEX IF NOT EXISTS idx_daily_stat_entries_practice_date
  ON daily_stat_entries(practice_id, entry_date DESC);

ALTER TABLE daily_stat_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own daily stat entries" ON daily_stat_entries;
DROP POLICY IF EXISTS "Users create own daily stat entries" ON daily_stat_entries;
DROP POLICY IF EXISTS "Users update own daily stat entries" ON daily_stat_entries;
DROP POLICY IF EXISTS "Admins read daily stat entries" ON daily_stat_entries;
DROP POLICY IF EXISTS "Admins create daily stat entries" ON daily_stat_entries;
DROP POLICY IF EXISTS "Admins update daily stat entries" ON daily_stat_entries;
DROP POLICY IF EXISTS "Admins delete daily stat entries" ON daily_stat_entries;
DROP POLICY IF EXISTS "Practice users read daily stat entries" ON daily_stat_entries;
DROP POLICY IF EXISTS "Assigned users create daily stat entries" ON daily_stat_entries;
DROP POLICY IF EXISTS "Assigned users update daily stat entries" ON daily_stat_entries;

CREATE POLICY "Practice users read daily stat entries"
  ON daily_stat_entries FOR SELECT
  USING (practice_id = get_practice_id());

CREATE POLICY "Assigned users create daily stat entries"
  ON daily_stat_entries FOR INSERT
  WITH CHECK (
    practice_id = get_practice_id()
    AND profile_id = auth.uid()
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM stats s
        JOIN employee_posts ep ON ep.post_id = s.post_id
        WHERE s.id = daily_stat_entries.stat_id AND ep.profile_id = auth.uid()
      )
    )
  );

CREATE POLICY "Assigned users update daily stat entries"
  ON daily_stat_entries FOR UPDATE
  USING (
    practice_id = get_practice_id()
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM stats s
        JOIN employee_posts ep ON ep.post_id = s.post_id
        WHERE s.id = daily_stat_entries.stat_id AND ep.profile_id = auth.uid()
      )
    )
  )
  WITH CHECK (practice_id = get_practice_id());

CREATE POLICY "Admins delete daily stat entries"
  ON daily_stat_entries FOR DELETE
  USING (practice_id = get_practice_id() AND is_admin());

-- Weekly rows follow the same assignment-based ownership model.
DROP POLICY IF EXISTS "Users can insert own practice entries" ON stat_entries;
DROP POLICY IF EXISTS "Users can update own practice entries" ON stat_entries;
DROP POLICY IF EXISTS "Assigned users insert practice entries" ON stat_entries;
DROP POLICY IF EXISTS "Assigned users update practice entries" ON stat_entries;
CREATE POLICY "Assigned users insert practice entries"
  ON stat_entries FOR INSERT
  WITH CHECK (
    practice_id = get_practice_id()
    AND profile_id = auth.uid()
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM stats s
        JOIN employee_posts ep ON ep.post_id = s.post_id
        WHERE s.id = stat_entries.stat_id AND ep.profile_id = auth.uid()
      )
    )
  );
CREATE POLICY "Assigned users update practice entries"
  ON stat_entries FOR UPDATE
  USING (
    practice_id = get_practice_id()
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM stats s
        JOIN employee_posts ep ON ep.post_id = s.post_id
        WHERE s.id = stat_entries.stat_id AND ep.profile_id = auth.uid()
      )
    )
  )
  WITH CHECK (practice_id = get_practice_id());
