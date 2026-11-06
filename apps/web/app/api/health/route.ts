import { NextResponse } from "next/server";
import { assertNoPersistentAdminPasswordInProd } from "../../lib/auth";
import {
  EXPECTED_MIGRATION_VERSION,
  dbQuery,
  redactPII,
  verifySchemaReady
} from "../../lib/db";

export const dynamic = "force-dynamic";

/**
 * Health and Readiness Endpoint (PRIORITY 5)
 * Implements four separate subsystem checks:
 *   1. Application liveness (checks.liveness)
 *   2. PostgreSQL connectivity (checks.database)
 *   3. Required schema migration version & SHA-256 checksum (checks.migrations)
 *   4. Authentication & rate-limiter subsystem readiness (checks.auth)
 *
 * Security Rules:
 *   - Never exposes database endpoint, username, SQL errors, credentials, or PII in public responses.
 *   - Never reports full readiness (HTTP 200 ready: true) if PostgreSQL, migrations, or auth subsystem is unavailable.
 *   - Supports ?probe=liveness for container liveness probes while default GET /api/health enforces full readiness.
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  const probeType = request?.url
    ? new URL(request.url).searchParams.get("probe") || "readiness"
    : "readiness";

  const checks = {
    liveness: {
      status: "ok" as const,
      live: true
    },
    database: {
      status: "unavailable" as "ok" | "unavailable",
      connected: false,
      mode: null as "rds-postgres" | "dev-pglite" | null,
      latencyMs: null as number | null
    },
    migrations: {
      status: "unavailable" as "ok" | "unavailable",
      ready: false,
      requiredVersion: EXPECTED_MIGRATION_VERSION,
      appliedVersion: null as string | null,
      checksumValid: false
    },
    auth: {
      status: "unavailable" as "ok" | "unavailable",
      ready: false,
      provisioned: false,
      rateLimiterReady: false
    }
  };

  if (probeType === "liveness") {
    return NextResponse.json(
      {
        status: "alive",
        live: true,
        service: "estatepilot-web",
        framework: "Next.js 15 SSR",
        region: process.env.AWS_REGION || "ap-south-1",
        checks: {
          liveness: checks.liveness
        },
        timestamp: new Date().toISOString()
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    // Check 3 & 2: Verify schema migration version, SHA-256 checksum, and PostgreSQL connectivity
    const migrationInfo = await verifySchemaReady();
    checks.migrations = {
      status: "ok",
      ready: true,
      requiredVersion: EXPECTED_MIGRATION_VERSION,
      appliedVersion: migrationInfo.migrationVersion,
      checksumValid: true
    };

    // Check 2 & 4: Verify PostgreSQL query execution and Auth/Rate-Limit tables readiness
    const countsRes = await dbQuery<{
      properties_count: number;
      verified_properties_count: number;
      leads_count: number;
      admin_users_count: number;
      active_sessions_count: number;
      rate_limit_buckets_count: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM estatepilot.properties) AS properties_count,
         (SELECT COUNT(*)::int FROM estatepilot.properties WHERE is_verified = TRUE) AS verified_properties_count,
         (SELECT COUNT(*)::int FROM estatepilot.leads) AS leads_count,
         (SELECT COUNT(*)::int FROM estatepilot.admin_users) AS admin_users_count,
         (SELECT COUNT(*)::int FROM estatepilot.admin_sessions WHERE revoked_at IS NULL AND expires_at > NOW()) AS active_sessions_count,
         (SELECT COUNT(*)::int FROM estatepilot.rate_limit_buckets) AS rate_limit_buckets_count`
    );

    const latencyMs = Date.now() - startedAt;
    const row = countsRes.rows[0];
    const adminUsersCount = Number(row?.admin_users_count ?? 0);

    checks.database = {
      status: "ok",
      connected: true,
      mode: migrationInfo.mode,
      latencyMs
    };

    // Check 4: Verify auth configuration safety (no persistent admin passwords in prod) and auth tables
    assertNoPersistentAdminPasswordInProd();
    checks.auth = {
      status: "ok",
      ready: true,
      provisioned: adminUsersCount > 0,
      rateLimiterReady: Number(row?.rate_limit_buckets_count ?? 0) >= 0
    };

    return NextResponse.json(
      {
        status: "ok",
        live: true,
        ready: true,
        service: "estatepilot-web",
        framework: "Next.js 15 SSR",
        region: process.env.AWS_REGION || "ap-south-1",
        checks,
        database: {
          connected: true,
          mode: migrationInfo.mode,
          schema: "estatepilot",
          migrationVersion: migrationInfo.migrationVersion,
          latencyMs,
          counts: {
            properties: Number(row?.properties_count ?? 0),
            verifiedProperties: Number(row?.verified_properties_count ?? 0),
            leads: Number(row?.leads_count ?? 0),
            adminUsers: adminUsersCount
          }
        },
        timestamp: new Date().toISOString()
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const rawMsg = error instanceof Error ? error.message : "Health check failed";
    // Log redacted diagnostic details strictly server-side; never expose SQL errors, hostnames, or credentials publicly
    console.error("[GET /api/health Readiness Check Failed]:", redactPII(rawMsg));

    const failureCategory = rawMsg.includes("SCHEMA_NOT_MIGRATED") || rawMsg.includes("SCHEMA_CHECKSUM_MISMATCH")
      ? "SCHEMA_MIGRATION_NOT_READY"
      : rawMsg.includes("SECURITY_CONFIG_ERROR")
      ? "AUTH_CONFIGURATION_INVALID"
      : "DATABASE_UNAVAILABLE";

    return NextResponse.json(
      {
        status: "degraded",
        live: true,
        ready: false,
        reason: failureCategory,
        service: "estatepilot-web",
        framework: "Next.js 15 SSR",
        region: process.env.AWS_REGION || "ap-south-1",
        checks,
        database: {
          connected: checks.database.connected,
          status: "unavailable"
        },
        timestamp: new Date().toISOString()
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
