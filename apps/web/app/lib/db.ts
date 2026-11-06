import { Pool, type PoolClient } from "pg";
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

interface EmbeddedPgLike {
  exec(sql: string): Promise<unknown>;
  query<T = QueryResultRow>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; affectedRows?: number }>;
  transaction<R>(
    fn: (tx: {
      query<T = QueryResultRow>(
        sql: string,
        params?: unknown[]
      ): Promise<{ rows: T[]; affectedRows?: number }>;
    }) => Promise<R>
  ): Promise<R>;
  close(): Promise<void>;
}

const FORBIDDEN_DB_PATTERNS = [/aurelia/i, /timeflow/i, /^postgres$/i, /^template/i];
const FORBIDDEN_MASTER_USERS = new Set([
  "postgres",
  "rdsadmin",
  "master",
  "admin",
  "aurelia_admin",
  "timeflow_admin"
]);

export const EXPECTED_MIGRATION_VERSION = "001_estatepilot_schema.sql";

let pgPool: Pool | null = null;
let pgliteInstance: EmbeddedPgLike | null = null;
let verifiedSchemaCache: {
  mode: "rds-postgres" | "dev-pglite";
  migrationVersion: string;
  checksum: string;
} | null = null;

/**
 * Redacts phone numbers, emails, database credentials, and secrets from log messages to prevent PII leakage.
 */
export function redactPII(input: string): string {
  return input
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgresql://[REDACTED_DB_URL]")
    .replace(/(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g, "+91******REDACTED")
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL_REDACTED]")
    .replace(/(password|secret|token|ep_session|x-csrf-token|x-bootstrap-token)=([^\s&;]+)/gi, "$1=[REDACTED]");
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

export function getExpectedMigrationChecksum(): string | null {
  try {
    const migrationPath = resolveMigrationPath();
    const sqlContent = readFileSync(migrationPath, "utf-8");
    return createHash("sha256").update(sqlContent).digest("hex");
  } catch {
    return null;
  }
}

export function invalidateVerifiedSchemaCache(): void {
  verifiedSchemaCache = null;
}

/**
 * Validates that a PostgreSQL connection URL targets the isolated estatepilot_ai database,
 * never connects to Aurelia TimeFlow or master accounts, requires estatepilot_migrator for
 * migrations, and requires estatepilot_app for application runtime.
 */
export function assertSafeDatabaseUrl(
  connectionString: string,
  options: { allowMigratorRole?: boolean } = {}
): {
  database: string;
  username: string;
  hostname: string;
} {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(connectionString);
  } catch {
    throw new Error("CRITICAL SAFETY BLOCK: Invalid DATABASE_URL format.");
  }

  const dbName = parsedUrl.pathname.replace(/^\//, "");
  const dbUser = decodeURIComponent(parsedUrl.username || "");
  const lowerUser = dbUser.toLowerCase();

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

  if (FORBIDDEN_MASTER_USERS.has(lowerUser)) {
    throw new Error(
      `CRITICAL SAFETY BLOCK: Forbidden master database user "${dbUser}". Use dedicated least-privilege role "estatepilot_app".`
    );
  }

  const isMigrationMode = options.allowMigratorRole === true;
  if (isMigrationMode) {
    if (lowerUser !== "estatepilot_migrator") {
      throw new Error(
        `CRITICAL SAFETY BLOCK: Schema migration execution requires dedicated migration role "estatepilot_migrator" (got "${dbUser}").`
      );
    }
  } else {
    if (lowerUser === "estatepilot_migrator") {
      throw new Error(
        `CRITICAL SAFETY BLOCK: Migration role "estatepilot_migrator" is forbidden for application runtime connections. Use "estatepilot_app".`
      );
    }
    if (lowerUser !== "estatepilot_app") {
      throw new Error(
        `CRITICAL SAFETY BLOCK: Application runtime must connect exclusively as least-privilege role "estatepilot_app" (got "${dbUser}").`
      );
    }
  }

  return {
    database: dbName,
    username: dbUser,
    hostname: parsedUrl.hostname
  };
}

/**
 * Resolves PostgreSQL TLS configuration and prevents disabling certificate verification in production.
 */
export function resolveDatabaseSslConfig(hostname: string): false | { rejectUnauthorized: boolean; ca?: string } {
  const isProd = process.env.NODE_ENV === "production";
  const rejectUnauthEnv = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;

  if (isProd && rejectUnauthEnv === "false") {
    throw new Error(
      "CRITICAL SAFETY BLOCK: TLS certificate verification (DATABASE_SSL_REJECT_UNAUTHORIZED) cannot be disabled in production."
    );
  }

  const ca = process.env.DATABASE_SSL_CA
    ? process.env.DATABASE_SSL_CA.replace(/\\n/g, "\n")
    : undefined;

  if (isProd) {
    return {
      rejectUnauthorized: true,
      ...(ca ? { ca } : {})
    };
  }

  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
  if (isLocalhost && rejectUnauthEnv === "false") {
    return false;
  }

  return {
    rejectUnauthorized: rejectUnauthEnv !== "false",
    ...(ca ? { ca } : {})
  };
}

export function isUsingExternalPostgres(): boolean {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return false;
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.ESTATEPILOT_DEV_SERVER === "true" &&
    raw === "postgresql://postgres:postgres@localhost:5432/estatepilot"
  ) {
    return false;
  }
  return true;
}

/**
 * Determines whether local non-production PGlite is explicitly permitted.
 * Strictly returns false in production (NODE_ENV === "production").
 */
export function isDevPglitePermitted(): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  if (process.env.ESTATEPILOT_REQUIRE_EXTERNAL_DB === "true") {
    return false;
  }
  return process.env.ALLOW_DEV_PGLITE === "true";
}

function getExternalPool(options: { allowMigratorRole?: boolean } = {}): Pool {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      "PRODUCTION_DB_REQUIRED: DATABASE_URL is not configured. Configure PostgreSQL connection to isolated database estatepilot_ai."
    );
  }

  const parsed = assertSafeDatabaseUrl(connectionString, options);
  const sslConfig = resolveDatabaseSslConfig(parsed.hostname);

  if (pgPool) return pgPool;

  pgPool = new Pool({
    connectionString,
    max: Math.min(Math.max(Number(process.env.DB_POOL_MAX || 10), 2), 20),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    statement_timeout: 10_000,
    ssl: sslConfig
  });

  pgPool.on("error", (err) => {
    console.error("[EstatePilot DB Pool Error]:", redactPII(err.message));
  });

  return pgPool;
}

async function getDevEmbeddedPGlite(): Promise<EmbeddedPgLike> {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "PRODUCTION_DB_REQUIRED: PGlite is strictly forbidden in production (NODE_ENV=production). Configure DATABASE_URL pointing to estatepilot_ai."
    );
  }
  if (!isDevPglitePermitted()) {
    throw new Error(
      "PRODUCTION_DB_REQUIRED: DATABASE_URL is not configured and ALLOW_DEV_PGLITE is not enabled. Ephemeral PGlite persistence is disabled."
    );
  }
  if (!pgliteInstance) {
    const pkgName = ["@electric-sql", "pglite"].join("/");
    const mod = (await import(/* webpackIgnore: true */ pkgName)) as {
      PGlite: new () => EmbeddedPgLike;
    };
    const instance = new mod.PGlite();
    if (process.env.ESTATEPILOT_DEV_SERVER === "true") {
      const migrationPath = resolveMigrationPath();
      const sqlContent = readFileSync(migrationPath, "utf-8");
      const checksum = createHash("sha256").update(sqlContent).digest("hex");
      await instance.exec(sqlContent);
      await instance.query(
        `INSERT INTO estatepilot.schema_migrations (version, checksum)
         VALUES ($1, $2)
         ON CONFLICT (version) DO UPDATE
           SET checksum = EXCLUDED.checksum,
               applied_at = NOW()`,
        [EXPECTED_MIGRATION_VERSION, checksum]
      );
    }
    pgliteInstance = instance;
  }
  return pgliteInstance;
}

/**
 * Executes database schema migrations (migrations/001_estatepilot_schema.sql).
 * Strictly forbidden during normal application runtime; requires ALLOW_SCHEMA_MIGRATION="true".
 */
export async function runSchemaMigrations(): Promise<{
  mode: "rds-postgres" | "dev-pglite";
  migrationVersion: string;
  checksum: string;
}> {
  if (process.env.ALLOW_SCHEMA_MIGRATION !== "true") {
    throw new Error(
      "MIGRATION_FORBIDDEN_AT_RUNTIME: Application runtime is not permitted to execute database schema migrations. Run `ALLOW_SCHEMA_MIGRATION=true npm run db:migrate` using estatepilot_migrator."
    );
  }

  const migrationPath = resolveMigrationPath();
  const sqlContent = readFileSync(migrationPath, "utf-8");
  const checksum = createHash("sha256").update(sqlContent).digest("hex");

  if (isUsingExternalPostgres()) {
    const pool = getExternalPool({ allowMigratorRole: true });
    const client = await pool.connect();
    try {
      const dbCheck = await client.query<{ db: string; usr: string }>(
        "SELECT current_database() AS db, current_user AS usr"
      );
      const currentDb = dbCheck.rows[0]?.db || "";
      if (FORBIDDEN_DB_PATTERNS.some((p) => p.test(currentDb))) {
        throw new Error(`CRITICAL SAFETY BLOCK: Connected database "${currentDb}" is forbidden.`);
      }

      await client.query(sqlContent);
      await client.query(
        `INSERT INTO estatepilot.schema_migrations (version, checksum)
         VALUES ($1, $2)
         ON CONFLICT (version) DO UPDATE
           SET checksum = EXCLUDED.checksum,
               applied_at = NOW(),
               applied_by = CURRENT_USER`,
        [EXPECTED_MIGRATION_VERSION, checksum]
      );
    } finally {
      client.release();
    }

    verifiedSchemaCache = {
      mode: "rds-postgres",
      migrationVersion: EXPECTED_MIGRATION_VERSION,
      checksum
    };
    return verifiedSchemaCache;
  }

  const pg = await getDevEmbeddedPGlite();
  await pg.exec(sqlContent);
  await pg.query(
    `INSERT INTO estatepilot.schema_migrations (version, checksum)
     VALUES ($1, $2)
     ON CONFLICT (version) DO UPDATE
       SET checksum = EXCLUDED.checksum,
           applied_at = NOW()`,
    [EXPECTED_MIGRATION_VERSION, checksum]
  );

  verifiedSchemaCache = {
    mode: "dev-pglite",
    migrationVersion: EXPECTED_MIGRATION_VERSION,
    checksum
  };
  return verifiedSchemaCache;
}

/**
 * Read-only runtime verification that the required schema migration has already been applied.
 * Never executes CREATE/ALTER DDL or INSERTs into schema_migrations.
 */
export async function verifySchemaReady(): Promise<{
  mode: "rds-postgres" | "dev-pglite";
  migrationVersion: string;
  checksum: string;
}> {
  if (verifiedSchemaCache) {
    return verifiedSchemaCache;
  }

  const checkSql = `
    SELECT version, checksum
    FROM estatepilot.schema_migrations
    WHERE version = $1
    LIMIT 1
  `;

  const expectedChecksum = getExpectedMigrationChecksum();

  try {
    if (isUsingExternalPostgres()) {
      const pool = getExternalPool({ allowMigratorRole: false });
      const res = await pool.query<{ version: string; checksum: string }>(checkSql, [
        EXPECTED_MIGRATION_VERSION
      ]);
      if ((res.rowCount ?? res.rows.length) === 0) {
        throw new Error(
          `SCHEMA_NOT_MIGRATED: Required migration "${EXPECTED_MIGRATION_VERSION}" has not been applied to estatepilot_ai.`
        );
      }
      const row = res.rows[0];
      if (expectedChecksum && row.checksum !== expectedChecksum) {
        throw new Error(
          `SCHEMA_CHECKSUM_MISMATCH: Applied migration "${row.version}" checksum (${row.checksum}) does not match expected checksum (${expectedChecksum}).`
        );
      }
      verifiedSchemaCache = {
        mode: "rds-postgres",
        migrationVersion: row.version,
        checksum: row.checksum
      };
      return verifiedSchemaCache;
    }

    const pg = await getDevEmbeddedPGlite();
    const res = await pg.query<{ version: string; checksum: string }>(checkSql, [
      EXPECTED_MIGRATION_VERSION
    ]);
    if (res.rows.length === 0) {
      throw new Error(
        `SCHEMA_NOT_MIGRATED: Required migration "${EXPECTED_MIGRATION_VERSION}" has not been applied. Run runSchemaMigrations() first.`
      );
    }
    const row = res.rows[0];
    if (expectedChecksum && row.checksum !== expectedChecksum) {
      throw new Error(
        `SCHEMA_CHECKSUM_MISMATCH: Applied migration "${row.version}" checksum (${row.checksum}) does not match expected checksum (${expectedChecksum}).`
      );
    }
    verifiedSchemaCache = {
      mode: "dev-pglite",
      migrationVersion: row.version,
      checksum: row.checksum
    };
    return verifiedSchemaCache;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("does not exist") || msg.includes("SCHEMA_NOT_MIGRATED")) {
      throw new Error(
        `SCHEMA_NOT_MIGRATED: Database schema "${EXPECTED_MIGRATION_VERSION}" is not initialized. Application runtime cannot run migrations; run "ALLOW_SCHEMA_MIGRATION=true npm run db:migrate" first.`
      );
    }
    throw err;
  }
}

/**
 * Executes a parameterized SQL query against PostgreSQL after read-only schema verification.
 */
export async function dbQuery<T = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<DbQueryResult<T>> {
  await verifySchemaReady();

  if (isUsingExternalPostgres()) {
    const pool = getExternalPool({ allowMigratorRole: false });
    const res = await pool.query(sql, params);
    return {
      rows: res.rows as T[],
      rowCount: res.rowCount ?? res.rows.length
    };
  }

  const pg = await getDevEmbeddedPGlite();
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
  await verifySchemaReady();

  if (isUsingExternalPostgres()) {
    const pool = getExternalPool({ allowMigratorRole: false });
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

  const pg = await getDevEmbeddedPGlite();
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
 * Read-only health check of PostgreSQL connectivity, schema migration version, and table counts.
 */
export async function checkDatabaseHealth() {
  const startedAt = Date.now();
  const mig = await verifySchemaReady();
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
  verifiedSchemaCache = null;
}
