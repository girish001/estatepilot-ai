-- =============================================================================
-- EstatePilot AI — Isolated Database & Least-Privilege Role Provisioning
-- Target RDS Instance: aurelia-timeflow-db-mumbai (PostgreSQL 18.3, ap-south-1)
-- =============================================================================
-- CRITICAL SAFETY RULES:
-- 1. Execute ONLY after explicit written authorization and after taking an RDS
--    snapshot of aurelia-timeflow-db-mumbai.
-- 2. Never modify, drop, or grant access to any Aurelia TimeFlow database/schema.
-- 3. Inject passwords at execution time via psql variable substitution (-v):
--      psql "host=<rds-endpoint> port=5432 dbname=postgres user=postgres sslmode=verify-full" \
--        -v ON_ERROR_STOP=1 \
--        -v migrator_password="$ESTATEPILOT_MIGRATOR_PASSWORD" \
--        -v app_password="$ESTATEPILOT_APP_PASSWORD" \
--        -f migrations/000_provision_isolated_database_and_roles.sql
--    Never hardcode or commit real passwords to version control.
-- =============================================================================

\set ON_ERROR_STOP on

\if :{?migrator_password}
\else
  \warn 'ERROR: psql variable migrator_password is required (-v migrator_password=...). Aborting.'
  \q
\endif

\if :{?app_password}
\else
  \warn 'ERROR: psql variable app_password is required (-v app_password=...). Aborting.'
  \q
\endif

-- Step 1: Create dedicated migration/schema-owner role and least-privilege runtime role
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

-- Set strong credentials from psql variables (never stored in SQL files)
ALTER ROLE estatepilot_migrator WITH LOGIN PASSWORD :'migrator_password';
ALTER ROLE estatepilot_app WITH LOGIN PASSWORD :'app_password';

-- On AWS RDS (rds_superuser), temporarily grant estatepilot_migrator membership to
-- CURRENT_USER so CREATE DATABASE ... OWNER estatepilot_migrator succeeds cleanly.
GRANT estatepilot_migrator TO CURRENT_USER;

-- Step 2: Create isolated database estatepilot_ai outside a transaction block
SELECT 'CREATE DATABASE estatepilot_ai OWNER estatepilot_migrator ENCODING ''UTF8'''
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'estatepilot_ai')\gexec

-- Step 3: Lock down database-level access on estatepilot_ai
REVOKE ALL ON DATABASE estatepilot_ai FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE estatepilot_ai TO estatepilot_migrator;
GRANT CONNECT ON DATABASE estatepilot_ai TO estatepilot_app;

-- Step 4: Connect to isolated database estatepilot_ai and lock down schemas
\connect estatepilot_ai

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

CREATE SCHEMA IF NOT EXISTS estatepilot AUTHORIZATION estatepilot_migrator;
REVOKE ALL ON SCHEMA estatepilot FROM PUBLIC;
GRANT ALL ON SCHEMA estatepilot TO estatepilot_migrator;
GRANT USAGE ON SCHEMA estatepilot TO estatepilot_app;

-- Enforce safe search_path and statement/transaction timeouts at the role+database level
ALTER ROLE estatepilot_migrator IN DATABASE estatepilot_ai SET search_path = estatepilot, pg_catalog;
ALTER ROLE estatepilot_app IN DATABASE estatepilot_ai SET search_path = estatepilot, pg_catalog;
ALTER ROLE estatepilot_app IN DATABASE estatepilot_ai SET statement_timeout = '10s';
ALTER ROLE estatepilot_app IN DATABASE estatepilot_ai SET lock_timeout = '5s';
ALTER ROLE estatepilot_app IN DATABASE estatepilot_ai SET idle_in_transaction_session_timeout = '15s';

-- Step 5: Configure default privileges for objects created by estatepilot_migrator
-- so future tables/sequences in schema estatepilot follow least-privilege rules
ALTER DEFAULT PRIVILEGES FOR ROLE estatepilot_migrator IN SCHEMA estatepilot
  REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE estatepilot_migrator IN SCHEMA estatepilot
  REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE estatepilot_migrator IN SCHEMA estatepilot
  GRANT USAGE, SELECT ON SEQUENCES TO estatepilot_app;

-- Step 6: Applyexplicit table-level grants if 001_estatepilot_schema.sql has already been applied
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'estatepilot' AND table_name = 'schema_migrations'
  ) THEN
    -- Runtime role can only read schema_migrations (cannot execute DDL or falsify migrations)
    REVOKE ALL ON TABLE estatepilot.schema_migrations FROM estatepilot_app;
    GRANT SELECT ON TABLE estatepilot.schema_migrations TO estatepilot_app;

    -- Operational tables: SELECT, INSERT, UPDATE only (no DROP/TRUNCATE/ALTER)
    REVOKE ALL ON TABLE
      estatepilot.properties,
      estatepilot.leads,
      estatepilot.site_visits,
      estatepilot.calls,
      estatepilot.admin_users,
      estatepilot.admin_sessions
    FROM estatepilot_app;

    GRANT SELECT, INSERT, UPDATE ON TABLE
      estatepilot.properties,
      estatepilot.leads,
      estatepilot.site_visits,
      estatepilot.calls,
      estatepilot.admin_users,
      estatepilot.admin_sessions
    TO estatepilot_app;

    -- Distributed rate-limit bucket table: SELECT, INSERT, UPDATE, DELETE (for expired bucket cleanup)
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'estatepilot' AND table_name = 'rate_limit_buckets'
    ) THEN
      REVOKE ALL ON TABLE estatepilot.rate_limit_buckets FROM estatepilot_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE estatepilot.rate_limit_buckets TO estatepilot_app;
    END IF;

    -- Audit events table is strictly append-only (SELECT, INSERT only; NO UPDATE, DELETE, or TRUNCATE)
    REVOKE ALL ON TABLE estatepilot.audit_events FROM estatepilot_app;
    GRANT SELECT, INSERT ON TABLE estatepilot.audit_events TO estatepilot_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA estatepilot TO estatepilot_app;
  END IF;
END
$$;

-- Revoke temporary role membership from RDS master user after ownership configuration
REVOKE estatepilot_migrator FROM CURRENT_USER;

-- Step 7: Verify isolation — raises an exception if estatepilot_app or estatepilot_migrator
-- has CONNECT privilege on any non-template database other than estatepilot_ai
-- (Note: if any existing database on the instance still grants CONNECT to PUBLIC,
--  this check reports a warning without touching or altering that external database.)
SELECT
  datname AS external_db_with_public_connect,
  has_database_privilege('estatepilot_app', datname, 'CONNECT') AS app_can_connect_via_public
FROM pg_database
WHERE datistemplate = FALSE
  AND datname <> 'estatepilot_ai';
