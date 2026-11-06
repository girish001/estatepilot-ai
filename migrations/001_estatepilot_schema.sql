-- EstatePilot AI initial PostgreSQL schema.
-- Apply ONLY after a dedicated estatepilot_ai database and least-privilege
-- application role have been provisioned in the existing Mumbai RDS instance.
-- This migration does not touch Aurelia TimeFlow objects.
BEGIN;

CREATE SCHEMA IF NOT EXISTS estatepilot;

CREATE TABLE IF NOT EXISTS estatepilot.properties (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('PLOT','INDEPENDENT_HOUSE','FLAT','VILLA')),
  city TEXT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  approved_rate_per_sqft NUMERIC(14,2) NOT NULL CHECK (approved_rate_per_sqft >= 0),
  record JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS estatepilot_properties_category_idx
  ON estatepilot.properties (category);
CREATE INDEX IF NOT EXISTS estatepilot_properties_verified_idx
  ON estatepilot.properties (is_verified);

CREATE TABLE IF NOT EXISTS estatepilot.leads (
  id TEXT PRIMARY KEY,
  reference_number TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'NEW','CONTACTED','INTERESTED','CALLBACK_SCHEDULED',
    'SITE_VISIT_SCHEDULED','SITE_VISITED','CONVERTED','LOST','DO_NOT_CONTACT'
  )),
  property_type TEXT NOT NULL CHECK (property_type IN ('PLOT','INDEPENDENT_HOUSE','FLAT','VILLA')),
  preferred_language TEXT NOT NULL CHECK (preferred_language IN ('English','Kannada','Telugu','Hindi')),
  consent_granted BOOLEAN NOT NULL DEFAULT FALSE,
  consent_captured_at TIMESTAMPTZ,
  next_action_at TIMESTAMPTZ,
  record JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS estatepilot_leads_status_idx ON estatepilot.leads (status);
CREATE INDEX IF NOT EXISTS estatepilot_leads_phone_idx ON estatepilot.leads (phone);
CREATE INDEX IF NOT EXISTS estatepilot_leads_next_action_idx ON estatepilot.leads (next_action_at);
CREATE INDEX IF NOT EXISTS estatepilot_leads_created_at_idx ON estatepilot.leads (created_at DESC);

CREATE TABLE IF NOT EXISTS estatepilot.audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('LEAD','PROPERTY','CONSENT','SITE_VISIT','CALL')),
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS estatepilot_audit_entity_idx
  ON estatepilot.audit_events (entity_type, entity_id, occurred_at DESC);

COMMIT;
