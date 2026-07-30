-- ============================================================
-- Derived Owner stat: Total Outflow
-- ============================================================

ALTER TABLE stats
  ADD COLUMN IF NOT EXISTS formula_source_stat_ids uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE stats DROP CONSTRAINT IF EXISTS stats_weekly_formula_check;
ALTER TABLE stats ADD CONSTRAINT stats_weekly_formula_check CHECK (
  weekly_formula IN (
    'sum',
    'average',
    'manual',
    'collections_per_staff',
    'ratio_of_sums',
    'sum_of_weekly_totals'
  )
);

CREATE INDEX IF NOT EXISTS idx_stats_formula_source_stat_ids
  ON stats USING gin (formula_source_stat_ids);

WITH source_sets AS (
  SELECT
    practice_id,
    array_agg(
      id ORDER BY CASE lower(name)
        WHEN 'bulk mail out' THEN 1
        WHEN 'personalized letters' THEN 2
        WHEN 'pending tx list calls' THEN 3
        WHEN 'care calls' THEN 4
        WHEN 'pending np calls' THEN 5
      END
    ) AS source_ids
  FROM stats
  WHERE lower(name) IN (
    'bulk mail out',
    'personalized letters',
    'pending tx list calls',
    'care calls',
    'pending np calls'
  )
    AND is_active = true
  GROUP BY practice_id
  HAVING count(DISTINCT lower(name)) = 5
),
owner_posts AS (
  SELECT DISTINCT ON (post.practice_id)
    post.practice_id,
    post.id AS post_id
  FROM posts post
  JOIN divisions division ON division.id = post.division_id
  WHERE lower(post.title) = 'owner'
     OR lower(division.name) = 'owner'
  ORDER BY post.practice_id, (lower(post.title) = 'owner') DESC, post.created_at
)
INSERT INTO stats (
  practice_id,
  name,
  abbreviation,
  description,
  stat_type,
  good_direction,
  post_id,
  display_order,
  is_active,
  is_private,
  daily_tracking_enabled,
  weekly_formula,
  formula_source_stat_ids
)
SELECT
  sources.practice_id,
  'Total Outflow',
  'Outflow',
  'BMO + personalized letters + pending treatment calls + care calls + pending new-patient calls.',
  'count',
  'up',
  owner.post_id,
  COALESCE((
    SELECT max(existing.display_order) + 1
    FROM stats existing
    WHERE existing.post_id = owner.post_id
  ), 1),
  true,
  false,
  false,
  'sum_of_weekly_totals',
  sources.source_ids
FROM source_sets sources
JOIN owner_posts owner ON owner.practice_id = sources.practice_id
WHERE NOT EXISTS (
  SELECT 1
  FROM stats existing
  WHERE existing.practice_id = sources.practice_id
    AND lower(existing.name) = 'total outflow'
);

UPDATE stats target
SET weekly_formula = 'sum_of_weekly_totals',
    daily_tracking_enabled = false,
    formula_source_stat_ids = sources.source_ids,
    updated_at = now()
FROM (
  SELECT
    practice_id,
    array_agg(
      id ORDER BY CASE lower(name)
        WHEN 'bulk mail out' THEN 1
        WHEN 'personalized letters' THEN 2
        WHEN 'pending tx list calls' THEN 3
        WHEN 'care calls' THEN 4
        WHEN 'pending np calls' THEN 5
      END
    ) AS source_ids
  FROM stats
  WHERE lower(name) IN (
    'bulk mail out',
    'personalized letters',
    'pending tx list calls',
    'care calls',
    'pending np calls'
  )
    AND is_active = true
  GROUP BY practice_id
  HAVING count(DISTINCT lower(name)) = 5
) sources
WHERE lower(target.name) = 'total outflow'
  AND target.practice_id = sources.practice_id;

-- Seed a calculated history from the five existing weekly stat streams.
WITH weekly_totals AS (
  SELECT
    target.id AS stat_id,
    target.practice_id,
    entry.week_start,
    sum(entry.value) AS value
  FROM stats target
  JOIN stat_entries entry
    ON entry.stat_id = ANY(target.formula_source_stat_ids)
  WHERE target.weekly_formula = 'sum_of_weekly_totals'
  GROUP BY target.id, target.practice_id, entry.week_start
),
with_previous AS (
  SELECT
    totals.*,
    lag(value) OVER (PARTITION BY stat_id ORDER BY week_start) AS previous_value
  FROM weekly_totals totals
),
with_profile AS (
  SELECT
    weekly.*,
    COALESCE(
      (
        SELECT assignment.profile_id
        FROM stats target
        JOIN employee_posts assignment ON assignment.post_id = target.post_id
        WHERE target.id = weekly.stat_id
        ORDER BY assignment.assigned_at
        LIMIT 1
      ),
      (
        SELECT profile.id
        FROM profiles profile
        WHERE profile.practice_id = weekly.practice_id
          AND profile.role = 'admin'
        ORDER BY profile.created_at
        LIMIT 1
      )
    ) AS profile_id
  FROM with_previous weekly
)
INSERT INTO stat_entries (
  stat_id,
  profile_id,
  practice_id,
  week_start,
  value,
  calculated_value,
  previous_value,
  percent_change,
  auto_condition,
  self_condition,
  submitted_at,
  updated_at
)
SELECT
  stat_id,
  profile_id,
  practice_id,
  week_start,
  value,
  value,
  previous_value,
  CASE
    WHEN previous_value IS NULL THEN 0
    WHEN previous_value = 0 AND value > 0 THEN 100
    WHEN previous_value = 0 THEN 0
    ELSE round(((value - previous_value) / abs(previous_value)) * 100, 2)
  END,
  CASE
    WHEN previous_value IS NULL THEN 'non_existence'::condition_name
    WHEN previous_value = 0 AND value > 0 THEN 'power'::condition_name
    WHEN previous_value = 0 THEN 'normal'::condition_name
    WHEN ((value - previous_value) / abs(previous_value)) * 100 > 50 THEN 'power'::condition_name
    WHEN ((value - previous_value) / abs(previous_value)) * 100 > 20 THEN 'affluence'::condition_name
    WHEN ((value - previous_value) / abs(previous_value)) * 100 > 0 THEN 'normal'::condition_name
    WHEN ((value - previous_value) / abs(previous_value)) * 100 >= -15 THEN 'emergency'::condition_name
    WHEN ((value - previous_value) / abs(previous_value)) * 100 >= -40 THEN 'danger'::condition_name
    ELSE 'non_existence'::condition_name
  END,
  CASE
    WHEN previous_value IS NULL THEN 'non_existence'::condition_name
    WHEN previous_value = 0 AND value > 0 THEN 'power'::condition_name
    WHEN previous_value = 0 THEN 'normal'::condition_name
    WHEN ((value - previous_value) / abs(previous_value)) * 100 > 50 THEN 'power'::condition_name
    WHEN ((value - previous_value) / abs(previous_value)) * 100 > 20 THEN 'affluence'::condition_name
    WHEN ((value - previous_value) / abs(previous_value)) * 100 > 0 THEN 'normal'::condition_name
    WHEN ((value - previous_value) / abs(previous_value)) * 100 >= -15 THEN 'emergency'::condition_name
    WHEN ((value - previous_value) / abs(previous_value)) * 100 >= -40 THEN 'danger'::condition_name
    ELSE 'non_existence'::condition_name
  END,
  now(),
  now()
FROM with_profile
WHERE profile_id IS NOT NULL
ON CONFLICT (stat_id, week_start) DO UPDATE
SET calculated_value = EXCLUDED.calculated_value,
    value = CASE
      WHEN stat_entries.is_manual_override THEN stat_entries.value
      ELSE EXCLUDED.value
    END,
    previous_value = EXCLUDED.previous_value,
    percent_change = EXCLUDED.percent_change,
    auto_condition = EXCLUDED.auto_condition,
    updated_at = now();
