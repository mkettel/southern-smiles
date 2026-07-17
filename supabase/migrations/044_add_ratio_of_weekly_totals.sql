-- ============================================================
-- Migration 044: Derived weekly ratios
-- ============================================================

ALTER TABLE stats
  ADD COLUMN IF NOT EXISTS formula_denominator_stat_id uuid
    REFERENCES stats(id) ON DELETE SET NULL;

ALTER TABLE stats DROP CONSTRAINT IF EXISTS stats_weekly_formula_check;
ALTER TABLE stats ADD CONSTRAINT stats_weekly_formula_check CHECK (
  weekly_formula IN ('sum', 'average', 'manual', 'collections_per_staff', 'ratio_of_sums')
);

UPDATE stats target
SET weekly_formula = 'ratio_of_sums',
    formula_source_stat_id = numerator.id,
    formula_denominator_stat_id = denominator.id,
    daily_tracking_enabled = true,
    updated_at = now()
FROM stats numerator, stats denominator
WHERE lower(target.name) = 'conversion rate'
  AND lower(numerator.name) = 'new patients'
  AND lower(denominator.name) = 'new reaches'
  AND target.practice_id = numerator.practice_id
  AND target.practice_id = denominator.practice_id
  AND target.post_id = numerator.post_id
  AND target.post_id = denominator.post_id;

-- Correct existing calculated weekly values without overwriting a deliberate
-- manual override. Future source edits are recalculated by the application.
WITH numerator_totals AS (
  SELECT
    target.id AS stat_id,
    daily.week_start,
    sum(daily.value) AS total
  FROM stats target
  JOIN daily_stat_entries daily
    ON daily.stat_id = target.formula_source_stat_id
  WHERE target.weekly_formula = 'ratio_of_sums'
  GROUP BY target.id, daily.week_start
),
denominator_totals AS (
  SELECT
    target.id AS stat_id,
    daily.week_start,
    sum(daily.value) AS total
  FROM stats target
  JOIN daily_stat_entries daily
    ON daily.stat_id = target.formula_denominator_stat_id
  WHERE target.weekly_formula = 'ratio_of_sums'
  GROUP BY target.id, daily.week_start
),
weekly_ratios AS (
  SELECT
    numerator.stat_id,
    numerator.week_start,
    round((numerator.total / denominator.total) * 100, 2) AS value
  FROM numerator_totals numerator
  JOIN denominator_totals denominator
    ON denominator.stat_id = numerator.stat_id
   AND denominator.week_start = numerator.week_start
  WHERE denominator.total > 0
)
UPDATE stat_entries entry
SET calculated_value = ratios.value,
    value = CASE WHEN entry.is_manual_override THEN entry.value ELSE ratios.value END,
    updated_at = now()
FROM weekly_ratios ratios
WHERE entry.stat_id = ratios.stat_id
  AND entry.week_start = ratios.week_start;

CREATE INDEX IF NOT EXISTS idx_stats_formula_denominator
  ON stats(formula_denominator_stat_id)
  WHERE formula_denominator_stat_id IS NOT NULL;
