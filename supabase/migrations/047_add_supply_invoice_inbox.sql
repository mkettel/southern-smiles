-- ============================================================
-- Migration 047: Review-only supply invoice inbox
-- ============================================================

CREATE TABLE IF NOT EXISTS supply_invoice_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'resend_inbound'
    CHECK (source = 'resend_inbound'),
  provider_event_id text CHECK (
    provider_event_id IS NULL OR char_length(provider_event_id) BETWEEN 1 AND 998
  ),
  resend_email_id text NOT NULL
    CHECK (char_length(resend_email_id) BETWEEN 1 AND 998),
  source_message_id text NOT NULL
    CHECK (char_length(source_message_id) BETWEEN 1 AND 998),
  vendor_key text NOT NULL
    CHECK (char_length(vendor_key) BETWEEN 1 AND 80),
  vendor_name text NOT NULL
    CHECK (char_length(vendor_name) BETWEEN 1 AND 160),
  from_address text NOT NULL
    CHECK (char_length(from_address) BETWEEN 3 AND 320),
  subject text NOT NULL DEFAULT ''
    CHECK (char_length(subject) <= 500),
  received_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'needs_review'
    CHECK (status IN (
      'needs_review',
      'exact_match',
      'possible_match',
      'new_catalog_item',
      'duplicate',
      'reconciled',
      'rejected',
      'parser_error'
    )),
  status_reason text CHECK (
    status_reason IS NULL OR char_length(status_reason) <= 500
  ),
  has_supported_attachment boolean NOT NULL DEFAULT false,
  attachment_count integer NOT NULL DEFAULT 0
    CHECK (attachment_count BETWEEN 0 AND 20),
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(attachments) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supply_invoice_events_email_unique
    UNIQUE (practice_id, resend_email_id),
  CONSTRAINT supply_invoice_events_message_unique
    UNIQUE (practice_id, source_message_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS supply_invoice_events_provider_event_key
  ON supply_invoice_events(provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_supply_invoice_events_practice_status_received
  ON supply_invoice_events(practice_id, status, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_supply_invoice_events_vendor_received
  ON supply_invoice_events(practice_id, vendor_key, received_at DESC);

ALTER TABLE supply_invoice_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read supply invoices"
  ON supply_invoice_events FOR SELECT
  TO authenticated
  USING (practice_id = get_practice_id() AND is_admin());

CREATE POLICY "Admins update supply invoices"
  ON supply_invoice_events FOR UPDATE
  TO authenticated
  USING (practice_id = get_practice_id() AND is_admin())
  WITH CHECK (practice_id = get_practice_id() AND is_admin());

REVOKE ALL ON TABLE supply_invoice_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE supply_invoice_events TO service_role;
GRANT SELECT, UPDATE ON TABLE supply_invoice_events TO authenticated;
