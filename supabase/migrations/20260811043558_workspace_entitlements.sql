CREATE TABLE IF NOT EXISTS practice_product_settings (
  practice_id uuid PRIMARY KEY REFERENCES practices(id) ON DELETE CASCADE,
  workspace_type text NOT NULL DEFAULT 'dental_practice'
    CHECK (workspace_type IN ('dental_practice', 'household', 'general_business')),
  plan_key text NOT NULL DEFAULT 'legacy'
    CHECK (plan_key IN ('legacy', 'dental_core', 'dental_growth', 'household', 'business_core')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS practice_module_overrides (
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  enabled boolean NOT NULL,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (practice_id, module_key)
);

INSERT INTO practice_product_settings (practice_id)
SELECT id FROM practices
ON CONFLICT (practice_id) DO NOTHING;

UPDATE practice_product_settings product
SET workspace_type = 'household', plan_key = 'household', updated_at = now()
FROM practices practice
WHERE practice.id = product.practice_id
  AND lower(practice.name) LIKE '%household%'
  AND product.plan_key = 'legacy';

CREATE OR REPLACE FUNCTION create_default_practice_product_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO practice_product_settings (practice_id)
  VALUES (NEW.id)
  ON CONFLICT (practice_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_default_practice_product_settings() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_default_practice_product_settings() FROM anon, authenticated;

DROP TRIGGER IF EXISTS create_practice_product_settings ON practices;
CREATE TRIGGER create_practice_product_settings
AFTER INSERT ON practices
FOR EACH ROW EXECUTE FUNCTION create_default_practice_product_settings();

ALTER TABLE practice_product_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_module_overrides ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON practice_product_settings TO authenticated;
GRANT SELECT ON practice_module_overrides TO authenticated;

CREATE POLICY "Members can read own product settings"
  ON practice_product_settings FOR SELECT
  TO authenticated
  USING (practice_id = (SELECT get_practice_id()));

CREATE POLICY "Members can read own module overrides"
  ON practice_module_overrides FOR SELECT
  TO authenticated
  USING (practice_id = (SELECT get_practice_id()));

CREATE INDEX IF NOT EXISTS idx_practice_module_overrides_practice
  ON practice_module_overrides(practice_id);
