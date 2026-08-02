-- Preserve supply budget settings per calendar month inside the shared
-- workspace. The legacy settings object remains the selected month for
-- compatibility with existing budget/stat calculations.

UPDATE supply_workspaces
SET workspace = jsonb_set(
  workspace,
  '{budget_settings_by_month}',
  jsonb_build_object(
    '2026-07',
    jsonb_build_object(
      'budget_month', '2026-07',
      'published_at', '2026-07-07',
      'published_by', 'Dr. Monzer Shakally',
      'collections_cents', 5286500,
      'routine_target_percent', 5.5,
      'office_target_percent', 2,
      'routine_baseline_cents', 301000,
      'office_baseline_cents', 108700
    )
  )
  || COALESCE(workspace->'budget_settings_by_month', '{}'::jsonb)
  || CASE
    WHEN workspace->'settings'->>'budget_month' ~ '^\d{4}-\d{2}$'
      THEN jsonb_build_object(
        workspace->'settings'->>'budget_month',
        workspace->'settings'
      )
    ELSE '{}'::jsonb
  END,
  true
)
WHERE jsonb_typeof(workspace) = 'object';

CREATE OR REPLACE FUNCTION private.protect_supply_budget_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  default_settings jsonb := jsonb_build_object(
    'budget_month', '2026-07',
    'published_at', '2026-07-07',
    'published_by', 'Dr. Monzer Shakally',
    'collections_cents', 5286500,
    'routine_target_percent', 5.5,
    'office_target_percent', 2,
    'routine_baseline_cents', 301000,
    'office_baseline_cents', 108700
  );
BEGIN
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.workspace := jsonb_set(
      NEW.workspace,
      '{settings}',
      COALESCE(OLD.workspace->'settings', '{}'::jsonb),
      true
    );
    NEW.workspace := jsonb_set(
      NEW.workspace,
      '{budget_settings_by_month}',
      COALESCE(OLD.workspace->'budget_settings_by_month', '{}'::jsonb),
      true
    );
  ELSE
    NEW.workspace := jsonb_set(NEW.workspace, '{settings}', default_settings, true);
    NEW.workspace := jsonb_set(
      NEW.workspace,
      '{budget_settings_by_month}',
      jsonb_build_object('2026-07', default_settings),
      true
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.protect_supply_budget_settings()
  FROM PUBLIC, anon, authenticated;
