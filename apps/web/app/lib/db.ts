import { Pool, type PoolClient } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export interface QueryResultRow {
  [column: string]: any;
}

export interface DbQueryResult<T = QueryResultRow> {
  rows: T[];
  rowCount: number;
}

export interface DbClient {
  query<T = QueryResultRow>(sql: string, params?: unknown[]): Promise<DbQueryResult<T>>;
}

const FORBIDDEN_DB_PATTERNS = [/aurelia/i, /timeflow/i];
const FORBIDDEN_MASTER_USERS = new Set(["postgres", "rdsadmin", "aurelia_admin", "timeflow_admin"]);

let pgPool: Pool | null = null;
let pgliteInstance: PGlite | null = null;
let migrationAppliedPromise: Promise<void> | null = null;

/**
 * Redacts phone numbers, emails, and secrets from log messages to prevent PII leakage.
 */
export function redactPII(input: string): string {
  return input
    .replace(/(\+?91)?[6-9]\d{9}/g, "+91******REDACTED")
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL_REDACTED]")
    .replace(/(password|secret|token)=([^\s&]+)/gi, "$1=[REDACTED]");
}

function resolveMigrationPath(): string {
  const candidates = [
    resolve(process.cwd(), "migrations/001_estatepilot_schema.sql"),
    resolve(process.cwd(), "../../migrations/001_estatepilot_schema.sql")
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error("Migration file migrations/001_estatepilot_schema.sql not found.");
}

function getExternalPool(): Pool {
  if (pgPool) return pgPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const parsedUrl = new URL(connectionString);
  const dbName = parsedUrl.pathname.replace(/^\//, "");
  const dbUser = decodeURIComponent(parsedUrl.username || "");

  for (const pattern of FORBIDDEN_DB_PATTERNS) {
    if (pattern.test(dbName)) {
      throw new Error(
        `CRITICAL SAFETY BLOCK: Refusing to connect to forbidden database "${dbName}". EstatePilot AI must only connect to isolated database "estatepilot_ai".`
      );
    }
  }

  const expectedDb = process.env.EXPECTED_DB_NAME || "estatepilot_ai";
  if (dbName !== expectedDb) {
    throw new Error(
      `CRITICAL SAFETY BLOCK: Database name "${dbName}" does not match expected isolated database "${expectedDb}".`
    );
  }

  if (FORBIDDEN_MASTER_USERS.has(dbUser.toLowerCase()) && process.env.ALLOW_MASTER_DB_USER !== "true") {
    throw new Error(
      `CRITICAL SAFETY BLOCK: Refusing to use master/admin database account "${dbUser}" for application runtime connections. Use "estatepilot_app".`
    );
  }

  const isLocalhost =
    parsedUrl.hostname === "localhost" ||
    parsedUrl.hostname === "127.0.0.1" ||
    process.env.DB_SSL_MODE === "disable";

  pgPool = new Pool({
    connectionString,
    max: Math.min(Math.max(Number(process.env.DB_POOL_MAX || 10), 2), 20),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    statement_timeout: 10_000,
    ssl: isLocalhost
      ? false
      : {
          rejectUnauthorized: true,
          ca: process.env.DB_SSL_CA ? process.env.DB_SSL_CA.replace(/\\n/g, "\n") : undefined
        }
  });

  pgPool.on("error", (err) => {
    console.error("[EstatePilot DB Pool Error]:", redactPII(err.message));
  });

  return pgPool;
}

async function getEmbeddedPGlite(): Promise<PGlite> {
  if (process.env.ESTATEPILOT_REQUIRE_EXTERNAL_DB === "true") {
    throw new Error(
      "ESTATEPILOT_REQUIRE_EXTERNAL_DB is enabled, but DATABASE_URL is not configured."
    );
  }
  if (!pgliteInstance) {
    pgliteInstance = new PGlite();
  }
  return pgliteInstance;
}

export function isUsingExternalPostgres(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Applies migrations/001_estatepilot_schema.sql idempotently and records version checksum.
 */
export async function ensureSchemaMigrated(): Promise<{
  mode: "rds-postgres" | "embedded-postgres";
  migrationVersion: string;
  checksum: string;
}> {
  const migrationPath = resolveMigrationPath();
  const sqlContent = readFileSync(migrationPath, "utf-8");
  const checksum = createHash("sha256").update(sqlContent).digest("hex");
  const version = "001_estatepilot_schema.sql";

  if (!migrationAppliedPromise) {
    migrationAppliedPromise = (async () => {
      try {
        if (isUsingExternalPostgres()) {
          const pool = getExternalPool();
          const client = await pool.connect();
          try {
            const dbCheck = await client.query<{ db: string; usr: string }>(
              "SELECT current_database() AS db, current_user AS usr"
            );
            const currentDb = dbCheck.rows[0]?.db || "";
            if (FORBIDDEN_DB_PATTERNS.some((p) => p.test(currentDb))) {
              throw new Error(`Safety block: connected database "${currentDb}" is forbidden.`);
            }

            await client.query(sqlContent);
            await client.query(
              `INSERT INTO estatepilot.schema_migrations (version, checksum)
               VALUES ($1, $2)
               ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum`,
              [version, checksum]
            );
          } finally {
            client.release();
          }
        } else {
          const pg = await getEmbeddedPGlite();
          await pg.exec(sqlContent);
          await pg.query(
            `INSERT INTO estatepilot.schema_migrations (version, checksum)
             VALUES ($1, $2)
             ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum`,
            [version, checksum]
          );
        }
      } catch (err) {
        migrationAppliedPromise = null;
        throw err;
      }
    })();
  }

  await migrationAppliedPromise;
  return {
    mode: isUsingExternalPostgres() ? "rds-postgres" : "embedded-postgres",
    migrationVersion: version,
    checksum
  };
}

/**
 * Executes a parameterized SQL query against PostgreSQL.
 */
export async function dbQuery<T = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<DbQueryResult<T>> {
  await ensureSchemaMigrated();

  if (isUsingExternalPostgres()) {
    const pool = getExternalPool();
    const res = await pool.query(sql, params);
    return {
      rows: res.rows as T[],
      rowCount: res.rowCount ?? res.rows.length
    };
  }

  const pg = await getEmbeddedPGlite();
  const res = await pg.query<T>(sql, params);
  return {
    rows: res.rows,
    rowCount: res.rows.length || res.affectedRows || 0
  };
}

/**
 * Executes a callback inside an atomic PostgreSQL transaction (BEGIN ... COMMIT / ROLLBACK).
 */
export async function withTransaction<R>(fn: (client: DbClient) => Promise<R>): Promise<R> {
  await ensureSchemaMigrated();

  if (isUsingExternalPostgres()) {
    const pool = getExternalPool();
    const client: PoolClient = await pool.connect();
    try {
      await client.query("BEGIN");
      const wrappedClient: DbClient = {
        async query<T = QueryResultRow>(sql: string, params: unknown[] = []) {
          const res = await client.query(sql, params);
          return {
            rows: res.rows as T[],
            rowCount: res.rowCount ?? res.rows.length
          };
        }
      };
      const result = await fn(wrappedClient);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  const pg = await getEmbeddedPGlite();
  return pg.transaction(async (tx) => {
    const wrappedClient: DbClient = {
      async query<T = QueryResultRow>(sql: string, params: unknown[] = []) {
        const res = await tx.query<T>(sql, params);
        return {
          rows: res.rows,
          rowCount: res.rows.length || res.affectedRows || 0
        };
      }
    };
    return fn(wrappedClient);
  });
}

/**
 * Records an append-only compliance/security audit event in estatepilot.audit_events.
 */
export async function recordAuditEvent(
  clientOrNull: DbClient | null,
  params: {
    entityType: "LEAD" | "PROPERTY" | "CONSENT" | "SITE_VISIT" | "CALL" | "AUTH" | "USER" | "REPORT";
    entityId: string;
    action: string;
    actorId?: string | null;
    actorRole?: string | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  const sql = `
    INSERT INTO estatepilot.audit_events (entity_type, entity_id, action, actor_id, actor_role, details)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
  `;
  const values = [
    params.entityType,
    params.entityId,
    params.action,
    params.actorId ?? null,
    params.actorRole ?? null,
    JSON.stringify(params.details ?? {})
  ];

  if (clientOrNull) {
    await clientOrNull.query(sql, values);
  } else {
    await dbQuery(sql, values);
  }
}

/**
 * Validates that a PostgreSQL connection URL targets the isolated estatepilot_ai database
 * and does not use a forbidden database (Aurelia TimeFlow / postgres) or RDS master account.
 */
export function assertSafeDatabaseUrl(connectionString: string): {
  database: string;
  username: string;
  hostname: string;
} {
  const parsedUrl = new URL(connectionString);
  const dbName = parsedUrl.pathname.replace(/^\//, "");
  const dbUser = decodeURIComponent(parsedUrl.username || "");

  for (const pattern of FORBIDDEN_DB_PATTERNS) {
    if (pattern.test(dbName)) {
      throw new Error(
        `CRITICAL SAFETY BLOCK: Forbidden target database "${dbName}". EstatePilot AI must only connect to isolated database "estatepilot_ai".`
      );
    }
  }

  const expectedDb = process.env.EXPECTED_DB_NAME || "estatepilot_ai";
  if (dbName !== expectedDb) {
    throw new Error(
      `CRITICAL SAFETY BLOCK: Forbidden target database "${dbName}" (expected "${expectedDb}").`
    );
  }

  if (FORBIDDEN_MASTER_USERS.has(dbUser.toLowerCase()) && process.env.ALLOW_MASTER_DB_USER !== "true") {
    throw new Error(
      `CRITICAL SAFETY BLOCK: Forbidden master database user "${dbUser}". Use dedicated least-privilege role "estatepilot_app".`
    );
  }

  return {
    database: dbName,
    username: dbUser,
    hostname: parsedUrl.hostname
  };
}

/**
 * Checks PostgreSQL connectivity, schema migration version, and table counts.
 */
export async function checkDatabaseHealth() {
  const startedAt = Date.now();
  const mig = await ensureSchemaMigrated();
  const counts = await dbQuery<{
    properties: number;
    verified_properties: number;
    leads: number;
    admin_users: number;
    audit_events: number;
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM estatepilot.properties) AS properties,
       (SELECT COUNT(*)::int FROM estatepilot.properties WHERE is_verified = TRUE) AS verified_properties,
       (SELECT COUNT(*)::int FROM estatepilot.leads) AS leads,
       (SELECT COUNT(*)::int FROM estatepilot.admin_users) AS admin_users,
       (SELECT COUNT(*)::int FROM estatepilot.audit_events) AS audit_events`
  );
  const row = counts.rows[0];
  return {
    healthy: true,
    mode: mig.mode,
    migrationVersion: mig.migrationVersion,
    checksum: mig.checksum,
    latencyMs: Date.now() - startedAt,
    tables: {
      properties: Number(row?.properties ?? 0),
      verifiedProperties: Number(row?.verified_properties ?? 0),
      leads: Number(row?.leads ?? 0),
      adminUsers: Number(row?.admin_users ?? 0),
      auditEvents: Number(row?.audit_events ?? 0)
    }
  };
}

/**
 * Gracefully closes database connections for CLI scripts and test runners.
 */
export async function closeDatabaseConnections(): Promise<void> {
  if (pgPool) {
    await pgPool.end().catch(() => {});
    pgPool = null;
  }
  if (pgliteInstance) {
    await pgliteInstance.close().catch(() => {});
    pgliteInstance = null;
  }
  migrationAppliedPromise = null;
}
