-- =============================================================================
-- EstatePilot AI — Isolated Database & Least-Privilege Role Provisioning
-- Target RDS Instance: aurelia-timeflow-db-mumbai (PostgreSQL 18.3, ap-south-1)
-- =============================================================================
-- CRITICAL SAFETY RULES:
-- 1. Execute ONLY after explicit written authorization.
-- 2. Never modify, drop, or grant access to any Aurelia TimeFlow database/schema.
-- 3. Replace <MIGRATOR_STRONG_PASSWORD> and <APP_STRONG_PASSWORD> at runtime via
--    psql variable substitution (\set) from AWS Secrets Manager / SSM.
--    Never commit real passwords to version control.
-- =============================================================================

-- Step 1: Create dedicated migration/admin role and least-privilege runtime role
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'estatepilot_migrator') THEN
    CREATE ROLE estatepilot_migrator WITH
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      CONNECTION LIMIT 5;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'estatepilot_app') THEN
    CREATE ROLE estatepilot_app WITH
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      CONNECTION LIMIT 20;
  END IF;
END
$$;

-- Passwords must be injected at execution time via psql -v:
-- ALTER ROLE estatepilot_migrator WITH PASSWORD :'migrator_password';
-- ALTER ROLE estatepilot_app WITH PASSWORD :'app_password';

-- Step 2: Create isolated database estatepilot_ai (run outside transaction block in psql)
-- SELECT 'CREATE DATABASE estatepilot_ai OWNER estatepilot_migrator ENCODING ''UTF8'''
-- WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'estatepilot_ai')\gexec

-- Step 3: Lock down database-level access so PUBLIC cannot connect to estatepilot_ai,
-- and estatepilot_app / estatepilot_migrator can ONLY connect to estatepilot_ai.
REVOKE ALL ON DATABASE estatepilot_ai FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE estatepilot_ai TO estatepilot_migrator;
GRANT CONNECT ON DATABASE estatepilot_ai TO estatepilot_app;

-- Step 4: Connect to estatepilot_ai (\connect estatepilot_ai) and lock down public schema
-- REVOKE ALL ON SCHEMA public FROM PUBLIC;
-- CREATE SCHEMA IF NOT EXISTS estatepilot AUTHORIZATION estatepilot_migrator;
-- ALTER ROLE estatepilot_app IN DATABASE estatepilot_ai SET search_path = estatepilot;
-- ALTER ROLE estatepilot_migrator IN DATABASE estatepilot_ai SET search_path = estatepilot;
-- ALTER ROLE estatepilot_app IN DATABASE estatepilot_ai SET statement_timeout = '10s';
-- ALTER ROLE estatepilot_app IN DATABASE estatepilot_ai SET idle_in_transaction_session_timeout = '15s';

-- Step 5: After applying migrations/001_estatepilot_schema.sql as estatepilot_migrator,
-- grant least-privilege table permissions to estatepilot_app:
-- GRANT USAGE ON SCHEMA estatepilot TO estatepilot_app;
-- GRANT SELECT ON estatepilot.schema_migrations TO estatepilot_app;
-- GRANT SELECT, INSERT, UPDATE ON
--   estatepilot.properties,
--   estatepilot.leads,
--   estatepilot.site_visits,
--   estatepilot.calls,
--   estatepilot.admin_users,
--   estatepilot.admin_sessions
-- TO estatepilot_app;
-- -- Audit log is strictly append-only (SELECT, INSERT only; NO UPDATE or DELETE):
-- GRANT SELECT, INSERT ON estatepilot.audit_events TO estatepilot_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA estatepilot TO estatepilot_app;

-- Step 6: Isolation verification query (must return 0 rows for non-estatepilot databases)
-- SELECT datname
-- FROM pg_database
-- WHERE datistemplate = false
--   AND datname NOT IN ('estatepilot_ai')
--   AND has_database_privilege('estatepilot_app', datname, 'CONNECT');
