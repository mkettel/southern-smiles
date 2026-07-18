-- ============================================================
-- Migration 046: Cherry approved-financing webhook writer
-- Extends the existing de-identified approval ledger for signed webhooks.
-- Patient-identifying email content is intentionally not persisted.
-- ============================================================

ALTER TABLE cherry_financing_approvals
  ADD COLUMN IF NOT EXISTS provider_event_id text CHECK (
    provider_event_id IS NULL OR char_length(provider_event_id) BETWEEN 1 AND 998
  );

GRANT SELECT, INSERT, UPDATE ON TABLE cherry_financing_approvals TO service_role;

CREATE OR REPLACE FUNCTION record_cherry_approval_event(
  p_practice_slug text,
  p_source_message_id text,
  p_provider_event_id text,
  p_approved_at timestamptz,
  p_week_start date,
  p_amount_cents bigint,
  p_automation_start_week date DEFAULT DATE '2026-07-20'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_practice_id uuid;
  v_stat_id uuid;
  v_post_id uuid;
  v_profile_id uuid;
  v_good_direction good_direction;
  v_total_cents bigint;
  v_total numeric(12, 2);
  v_previous numeric(12, 2);
  v_percent_change numeric(8, 4);
  v_effective_change numeric;
  v_condition condition_name;
  v_inserted integer;
BEGIN
  IF p_week_start < p_automation_start_week THEN
    RAISE EXCEPTION 'Cherry automation cannot modify weeks before %', p_automation_start_week;
  END IF;

  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Cherry approval amount must be positive';
  END IF;

  SELECT id INTO v_practice_id
  FROM practices
  WHERE slug = p_practice_slug;

  IF v_practice_id IS NULL THEN
    RAISE EXCEPTION 'Practice not found for slug %', p_practice_slug;
  END IF;

  SELECT s.id, s.post_id, s.good_direction
  INTO v_stat_id, v_post_id, v_good_direction
  FROM stats s
  JOIN posts post ON post.id = s.post_id
  JOIN divisions division ON division.id = post.division_id
  WHERE s.practice_id = v_practice_id
    AND lower(s.name) = 'approved financing'
    AND s.stat_type = 'dollar'
    AND s.is_active = true
    AND division.number = 2
  ORDER BY s.updated_at DESC NULLS LAST, s.id
  LIMIT 1;

  IF v_stat_id IS NULL THEN
    RAISE EXCEPTION 'Active Approved Financing dollar stat not found';
  END IF;

  SELECT ep.profile_id INTO v_profile_id
  FROM employee_posts ep
  JOIN profiles profile ON profile.id = ep.profile_id
  WHERE ep.practice_id = v_practice_id
    AND ep.post_id = v_post_id
    AND profile.is_active = true
  ORDER BY ep.assigned_at DESC NULLS LAST, ep.id
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Approved Financing stat has no active assigned owner';
  END IF;

  -- Serialize one stat/week so simultaneous webhook deliveries cannot publish
  -- an older partial total after a newer complete total.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_stat_id::text || ':' || p_week_start::text, 0));

  INSERT INTO cherry_financing_approvals (
    practice_id,
    source,
    source_message_id,
    provider_event_id,
    approved_at,
    week_start,
    amount_cents,
    imported_by,
    updated_at
  ) VALUES (
    v_practice_id,
    'cherry_email',
    p_source_message_id,
    p_provider_event_id,
    p_approved_at,
    p_week_start,
    p_amount_cents,
    NULL,
    now()
  )
  ON CONFLICT (practice_id, source, source_message_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT coalesce(sum(amount_cents), 0)
  INTO v_total_cents
  FROM cherry_financing_approvals
  WHERE practice_id = v_practice_id
    AND week_start = p_week_start;

  v_total := round(v_total_cents::numeric / 100, 2);

  SELECT value INTO v_previous
  FROM stat_entries
  WHERE stat_id = v_stat_id
    AND week_start < p_week_start
  ORDER BY week_start DESC
  LIMIT 1;

  IF v_previous IS NULL THEN
    v_percent_change := 0;
    v_condition := 'non_existence';
  ELSIF v_previous = 0 THEN
    IF v_total = 0 THEN
      v_percent_change := 0;
      v_condition := 'normal';
    ELSE
      v_percent_change := 100;
      v_condition := CASE
        WHEN v_good_direction = 'up' THEN 'power'::condition_name
        ELSE 'non_existence'::condition_name
      END;
    END IF;
  ELSE
    v_percent_change := round(((v_total - v_previous) / abs(v_previous)) * 100, 2);
    v_effective_change := CASE
      WHEN v_good_direction = 'down' THEN -v_percent_change
      ELSE v_percent_change
    END;
    v_condition := CASE
      WHEN v_effective_change > 50 THEN 'power'::condition_name
      WHEN v_effective_change > 20 THEN 'affluence'::condition_name
      WHEN v_effective_change > 0 THEN 'normal'::condition_name
      WHEN v_effective_change >= -15 THEN 'emergency'::condition_name
      WHEN v_effective_change >= -40 THEN 'danger'::condition_name
      ELSE 'non_existence'::condition_name
    END;
  END IF;

  INSERT INTO stat_entries (
    stat_id,
    profile_id,
    practice_id,
    week_start,
    value,
    calculated_value,
    is_manual_override,
    previous_value,
    percent_change,
    auto_condition,
    self_condition,
    final_condition,
    updated_by,
    submitted_at,
    updated_at
  ) VALUES (
    v_stat_id,
    v_profile_id,
    v_practice_id,
    p_week_start,
    v_total,
    v_total,
    false,
    v_previous,
    v_percent_change,
    v_condition,
    v_condition,
    v_condition,
    NULL,
    now(),
    now()
  )
  ON CONFLICT (stat_id, week_start) DO UPDATE SET
    profile_id = EXCLUDED.profile_id,
    value = CASE
      WHEN stat_entries.is_manual_override THEN stat_entries.value
      ELSE EXCLUDED.value
    END,
    calculated_value = EXCLUDED.calculated_value,
    previous_value = EXCLUDED.previous_value,
    percent_change = EXCLUDED.percent_change,
    auto_condition = EXCLUDED.auto_condition,
    self_condition = coalesce(stat_entries.self_condition, EXCLUDED.self_condition),
    final_condition = coalesce(stat_entries.final_condition, EXCLUDED.final_condition),
    updated_by = NULL,
    submitted_at = EXCLUDED.submitted_at,
    updated_at = EXCLUDED.updated_at;

  RETURN jsonb_build_object(
    'inserted', v_inserted = 1,
    'stat_id', v_stat_id,
    'week_start', p_week_start,
    'approved_total_cents', v_total_cents
  );
END;
$$;

REVOKE ALL ON FUNCTION record_cherry_approval_event(
  text, text, text, timestamptz, date, bigint, date
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_cherry_approval_event(
  text, text, text, timestamptz, date, bigint, date
) TO service_role;
