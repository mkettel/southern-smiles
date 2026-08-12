CREATE TABLE member_module_access (
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module_key text NOT NULL CHECK (module_key IN (
    'operations',
    'stats',
    'tasks',
    'oic_log',
    'org_board',
    'command_center',
    'budgeting',
    'procedure_costs',
    'supply_management',
    'bills',
    'financial',
    'approved_financing',
    'patient_surveys',
    'export_analyze',
    'team_access'
  )),
  enabled boolean NOT NULL DEFAULT true,
  granted_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (practice_id, profile_id, module_key)
);

CREATE INDEX idx_member_module_access_profile
  ON member_module_access(profile_id, module_key)
  WHERE enabled = true;

ALTER TABLE member_module_access ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON member_module_access TO authenticated;

CREATE POLICY "Members read their own module access"
  ON member_module_access FOR SELECT
  TO authenticated
  USING (
    practice_id = (SELECT get_practice_id())
    AND profile_id = (SELECT auth.uid())
  );
