-- ============================================================
-- Migration 045: Track new-patient bookings separately from arrivals
-- ============================================================

ALTER TABLE stats
  ADD COLUMN IF NOT EXISTS formula_effective_from date;

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
  weekly_formula
)
SELECT
  conversion.practice_id,
  'New Patient Bookings',
  'NP Bookings',
  'New reaches who agreed to schedule, regardless of the appointment date.',
  'count',
  'up',
  conversion.post_id,
  1,
  true,
  conversion.is_private,
  true,
  'sum'
FROM stats conversion
WHERE lower(conversion.name) = 'conversion rate'
  AND NOT EXISTS (
    SELECT 1
    FROM stats existing
    WHERE existing.practice_id = conversion.practice_id
      AND existing.post_id = conversion.post_id
      AND lower(existing.name) = 'new patient bookings'
  );

UPDATE stats conversion
SET weekly_formula = 'ratio_of_sums',
    formula_source_stat_id = bookings.id,
    formula_denominator_stat_id = reaches.id,
    formula_effective_from = '2026-07-20',
    display_order = 4,
    updated_at = now()
FROM stats bookings, stats reaches
WHERE lower(conversion.name) = 'conversion rate'
  AND lower(bookings.name) = 'new patient bookings'
  AND lower(reaches.name) = 'new reaches'
  AND conversion.practice_id = bookings.practice_id
  AND conversion.practice_id = reaches.practice_id
  AND conversion.post_id = bookings.post_id
  AND conversion.post_id = reaches.post_id;

-- Historical Conversion Rate entries are intentionally left unchanged.
-- The bookings-based formula begins with the week of July 20, 2026.
