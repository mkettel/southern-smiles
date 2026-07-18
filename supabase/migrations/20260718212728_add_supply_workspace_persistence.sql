-- Persist one shared supply-ordering workspace per practice.
-- The JSON state preserves the existing catalog/draft UX while moving it off
-- individual browsers. Budget changes remain admin-only in the server action.

CREATE TABLE supply_workspaces (
  practice_id uuid PRIMARY KEY REFERENCES practices(id) ON DELETE CASCADE,
  workspace jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supply_workspaces_workspace_object
    CHECK (jsonb_typeof(workspace) = 'object')
);

ALTER TABLE supply_workspaces ENABLE ROW LEVEL SECURITY;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.is_assigned_supply_officer()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1
        FROM employee_posts ep
        JOIN posts p ON p.id = ep.post_id
        JOIN divisions d ON d.id = p.division_id
        WHERE ep.profile_id = auth.uid()
          AND ep.practice_id = get_practice_id()
          AND p.practice_id = get_practice_id()
          AND (
            (d.number = 3 AND lower(trim(p.title)) = 'supplies officer')
            OR
            (d.number = 4 AND lower(trim(p.title)) = 'dental supplies officer')
          )
      )
    );
$$;

REVOKE ALL ON FUNCTION private.is_assigned_supply_officer() FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_assigned_supply_officer() TO authenticated;

CREATE POLICY "Assigned supply users read workspace"
  ON supply_workspaces FOR SELECT
  TO authenticated
  USING (
    practice_id = get_practice_id()
    AND private.is_assigned_supply_officer()
  );

CREATE POLICY "Assigned supply users create workspace"
  ON supply_workspaces FOR INSERT
  TO authenticated
  WITH CHECK (
    practice_id = get_practice_id()
    AND updated_by = auth.uid()
    AND private.is_assigned_supply_officer()
  );

CREATE POLICY "Assigned supply users update workspace"
  ON supply_workspaces FOR UPDATE
  TO authenticated
  USING (
    practice_id = get_practice_id()
    AND private.is_assigned_supply_officer()
  )
  WITH CHECK (
    practice_id = get_practice_id()
    AND updated_by = auth.uid()
    AND private.is_assigned_supply_officer()
  );

GRANT SELECT, INSERT, UPDATE ON supply_workspaces TO authenticated;

CREATE OR REPLACE FUNCTION private.protect_supply_budget_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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
  ELSE
    NEW.workspace := jsonb_set(
      NEW.workspace,
      '{settings}',
      jsonb_build_object(
        'budget_month', '2026-07',
        'published_at', '2026-07-07',
        'published_by', 'Dr. Monzer Shakally',
        'collections_cents', 5286500,
        'routine_target_percent', 5.5,
        'office_target_percent', 2,
        'routine_baseline_cents', 301000,
        'office_baseline_cents', 108700
      ),
      true
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.protect_supply_budget_settings() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER protect_supply_budget_settings
  BEFORE INSERT OR UPDATE ON supply_workspaces
  FOR EACH ROW
  EXECUTE FUNCTION private.protect_supply_budget_settings();
