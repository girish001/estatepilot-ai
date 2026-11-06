-- EstatePilot AI initial PostgreSQL schema (001_estatepilot_schema.sql).
-- Apply ONLY inside the isolated estatepilot_ai database after dedicated
-- least-privilege roles (estatepilot_migrator, estatepilot_app) are provisioned.
-- This migration does NOT touch any Aurelia TimeFlow database or schema.
BEGIN;

CREATE SCHEMA IF NOT EXISTS estatepilot;

-- 1. Migration Version Tracking
CREATE TABLE IF NOT EXISTS estatepilot.schema_migrations (
  version TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by TEXT NOT NULL DEFAULT CURRENT_USER
);

-- 2. Verified Property Inventory & Brochure Store
CREATE TABLE IF NOT EXISTS estatepilot.properties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('PLOT','INDEPENDENT_HOUSE','FLAT','VILLA')),
  location TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  approved_rate_per_sqft NUMERIC(14,2) NOT NULL CHECK (approved_rate_per_sqft >= 0),
  availability_status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (
    availability_status IN ('AVAILABLE','FEW_UNITS_LEFT','SOLD_OUT')
  ),
  verified_by TEXT NOT NULL DEFAULT 'Pending Operational Verification',
  verified_at TIMESTAMPTZ,
  record JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS estatepilot_properties_category_idx
  ON estatepilot.properties (category);
CREATE INDEX IF NOT EXISTS estatepilot_properties_verified_idx
  ON estatepilot.properties (is_verified);
CREATE INDEX IF NOT EXISTS estatepilot_properties_city_idx
  ON estatepilot.properties (city);
CREATE INDEX IF NOT EXISTS estatepilot_properties_created_at_idx
  ON estatepilot.properties (created_at DESC);

-- 3. Customer Enquiries & Leads Pipeline (Zero-Budget Profiling Enforced)
CREATE TABLE IF NOT EXISTS estatepilot.leads (
  id TEXT PRIMARY KEY,
  reference_number TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  source TEXT NOT NULL DEFAULT 'PUBLIC_WEBSITE',
  status TEXT NOT NULL CHECK (status IN (
    'NEW','CONTACTED','INTERESTED','CALLBACK_SCHEDULED',
    'SITE_VISIT_SCHEDULED','SITE_VISITED','CONVERTED','LOST','DO_NOT_CONTACT'
  )),
  property_type TEXT NOT NULL CHECK (property_type IN ('PLOT','INDEPENDENT_HOUSE','FLAT','VILLA')),
  preferred_location TEXT NOT NULL DEFAULT 'Bangalore',
  preferred_language TEXT NOT NULL CHECK (preferred_language IN ('English','Kannada','Telugu','Hindi')),
  assigned_executive TEXT NOT NULL DEFAULT 'Rajesh Sharma (Senior Property Specialist)',
  consent_granted BOOLEAN NOT NULL DEFAULT FALSE CHECK (consent_granted = TRUE),
  consent_captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_action_at TIMESTAMPTZ,
  record JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS estatepilot_leads_status_idx ON estatepilot.leads (status);
CREATE INDEX IF NOT EXISTS estatepilot_leads_phone_idx ON estatepilot.leads (phone);
CREATE INDEX IF NOT EXISTS estatepilot_leads_category_idx ON estatepilot.leads (property_type);
CREATE INDEX IF NOT EXISTS estatepilot_leads_language_idx ON estatepilot.leads (preferred_language);
CREATE INDEX IF NOT EXISTS estatepilot_leads_executive_idx ON estatepilot.leads (assigned_executive);
CREATE INDEX IF NOT EXISTS estatepilot_leads_next_action_idx ON estatepilot.leads (next_action_at);
CREATE INDEX IF NOT EXISTS estatepilot_leads_created_at_idx ON estatepilot.leads (created_at DESC);

-- 4. Site Visits & Walkthroughs
CREATE TABLE IF NOT EXISTS estatepilot.site_visits (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'SCHEDULED','CONFIRMED','COMPLETED','RESCHEDULED','CANCELLED','NO_SHOW'
  )),
  assigned_executive TEXT NOT NULL,
  record JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS estatepilot_site_visits_status_idx
  ON estatepilot.site_visits (status, scheduled_at);
CREATE INDEX IF NOT EXISTS estatepilot_site_visits_executive_idx
  ON estatepilot.site_visits (assigned_executive);

-- 5. AI Voice Call Logs
CREATE TABLE IF NOT EXISTS estatepilot.calls (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  room_id TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('English','Kannada','Telugu','Hindi')),
  status TEXT NOT NULL CHECK (status IN ('COMPLETED','MISSED','ESCALATED_TO_HUMAN')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  record JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS estatepilot_calls_started_at_idx
  ON estatepilot.calls (started_at DESC);

-- 6. Admin Users & Role-Based Access Control (RBAC)
CREATE TABLE IF NOT EXISTS estatepilot.admin_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN','ADMIN','MANAGER','EXECUTIVE')),
  executive_display_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS estatepilot_admin_users_role_idx
  ON estatepilot.admin_users (role);

-- 7. HTTP-Only Authenticated Sessions
CREATE TABLE IF NOT EXISTS estatepilot.admin_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES estatepilot.admin_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS estatepilot_admin_sessions_user_idx
  ON estatepilot.admin_sessions (user_id);
CREATE INDEX IF NOT EXISTS estatepilot_admin_sessions_expires_idx
  ON estatepilot.admin_sessions (expires_at);

-- 8. Append-Only Compliance & Security Audit Log
CREATE TABLE IF NOT EXISTS estatepilot.audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'LEAD','PROPERTY','CONSENT','SITE_VISIT','CALL','AUTH','USER','REPORT'
  )),
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT,
  actor_role TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS estatepilot_audit_entity_idx
  ON estatepilot.audit_events (entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS estatepilot_audit_occurred_idx
  ON estatepilot.audit_events (occurred_at DESC);

COMMIT;
