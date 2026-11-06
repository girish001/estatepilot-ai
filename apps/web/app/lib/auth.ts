import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { dbQuery, withTransaction, recordAuditEvent, type DbClient } from "./db";

export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "EXECUTIVE";

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  executiveDisplayName: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuthenticatedSession {
  sessionId: string;
  csrfToken: string;
  expiresAt: string;
  user: AdminUser;
}

export const SESSION_COOKIE_NAME = "ep_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Normalizes an executive's display name (e.g. "Suresh Kumar (Kannada Language Specialist)" -> "suresh kumar")
 * for exact, wildcard-safe identity matching across SQL and application layers.
 */
export function normalizeExecutiveIdentity(value: string | null | undefined): string {
  if (!value || typeof value !== "string") return "";
  return value.split(" (")[0].trim().toLowerCase();
}

/**
 * Constant-time string comparison using SHA-256 digests to prevent timing side-channels.
 */
export function constantTimeStringEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length === 0 || b.length === 0) {
    return false;
  }
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(digestA, digestB) && a.length === b.length;
}

/**
 * Distributed PostgreSQL-backed sliding/fixed-window rate limiter stored in estatepilot.rate_limit_buckets.
 * Replaces process-local in-memory Maps so rate limits hold across serverless/container instances.
 * Strictly fails closed: if the database or rate_limit_buckets table is unavailable, throws an error
 * so callers return HTTP 503 instead of bypassing rate limits.
 */
export async function consumeRateLimitBucket(
  bucketKey: string,
  maxRequests: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterSeconds: number; requestCount: number }> {
  const safeWindowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  const res = await dbQuery<{ request_count: number; retry_after_seconds: number }>(
    `INSERT INTO estatepilot.rate_limit_buckets (
       bucket_key, request_count, window_started_at, expires_at
     ) VALUES (
       $1, 1, NOW(), NOW() + ($2 || ' seconds')::interval
     )
     ON CONFLICT (bucket_key) DO UPDATE
       SET request_count = CASE
             WHEN estatepilot.rate_limit_buckets.expires_at <= NOW() THEN 1
             ELSE estatepilot.rate_limit_buckets.request_count + 1
           END,
           window_started_at = CASE
             WHEN estatepilot.rate_limit_buckets.expires_at <= NOW() THEN NOW()
             ELSE estatepilot.rate_limit_buckets.window_started_at
           END,
           expires_at = CASE
             WHEN estatepilot.rate_limit_buckets.expires_at <= NOW()
               THEN NOW() + ($2 || ' seconds')::interval
             ELSE estatepilot.rate_limit_buckets.expires_at
           END
     RETURNING
       request_count,
       GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expires_at - NOW()))))::int AS retry_after_seconds`,
    [bucketKey, String(safeWindowSeconds)]
  );

  // Opportunistically prune expired rate-limit rows after primary bucket update succeeds
  await dbQuery(
    `DELETE FROM estatepilot.rate_limit_buckets WHERE expires_at <= NOW() AND bucket_key <> $1`,
    [bucketKey]
  ).catch(() => {});

  const row = res.rows[0];
  const count = Number(row?.request_count ?? 1);
  const retryAfterSeconds = Number(row?.retry_after_seconds ?? safeWindowSeconds);

  return {
    allowed: count <= maxRequests,
    retryAfterSeconds: count <= maxRequests ? 0 : retryAfterSeconds,
    requestCount: count
  };
}

export function buildRateLimitUnavailableResponse(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      code: "SERVICE_UNAVAILABLE",
      message: "Service temporarily unavailable. Please try again shortly."
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" }
    }
  );
}

export async function checkLoginRateLimit(ip: string): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
}> {
  return consumeRateLimitBucket(`login_ip:${ip}`, 10, 15 * 60 * 1000);
}

export async function checkPublicEnquiryRateLimit(ip: string): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
}> {
  return consumeRateLimitBucket(`enquiry_ip:${ip}`, 15, 10 * 60 * 1000);
}

export async function checkAiChatRateLimit(ip: string): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
}> {
  return consumeRateLimitBucket(`aichat_ip:${ip}`, 30, 5 * 60 * 1000);
}

export async function checkWebrtcRoomRateLimit(ip: string): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
}> {
  return consumeRateLimitBucket(`webrtc_ip:${ip}`, 15, 10 * 60 * 1000);
}

export async function resetRateLimitsForTests(): Promise<void> {
  await dbQuery("DELETE FROM estatepilot.rate_limit_buckets").catch(() => {});
}

export function assertNoPersistentAdminPasswordInProd(): void {
  if (process.env.NODE_ENV === "production") {
    if (
      process.env.ADMIN_PASSWORD?.trim() ||
      process.env.NEXT_PUBLIC_ADMIN_PASSWORD?.trim() ||
      process.env.NEXT_PUBLIC_ADMIN_BOOTSTRAP_TOKEN?.trim()
    ) {
      throw new Error(
        "SECURITY_CONFIG_ERROR: Permanent admin passwords or NEXT_PUBLIC_ bootstrap secrets must never be stored in production runtime environment configuration."
      );
    }
  }
}

export function validatePasswordStrength(password: string): string | null {
  if (!password || typeof password !== "string" || password.length < 10) {
    return "Password must be at least 10 characters long.";
  }
  if (password.length > 128) {
    return "Password must not exceed 128 characters.";
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include at least one uppercase letter, one lowercase letter, and one digit.";
  }
  return null;
}

/**
 * Hashes a password using scrypt with a 16-byte random salt after validating strength.
 */
export function hashPassword(password: string): string {
  const validationError = validatePasswordStrength(password);
  if (validationError) {
    throw new Error(validationError);
  }
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt$${salt}$${derivedKey}`;
}

/**
 * Constant-time verification of a password against a stored scrypt hash.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    if (!password || password.length > 128) return false;
    const parts = storedHash.split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    const [, salt, keyHex] = parts;
    const expectedBuffer = Buffer.from(keyHex, "hex");
    const derivedBuffer = scryptSync(password, salt, expectedBuffer.length, { N: 16384, r: 8, p: 1 });
    if (expectedBuffer.length !== derivedBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, derivedBuffer);
  } catch {
    return false;
  }
}

export function hashSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function extractCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k === name) return decodeURIComponent(v);
  }
  return null;
}

export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "127.0.0.1";
}

export async function getAdminUserCount(): Promise<number> {
  const res = await dbQuery<{ cnt: string | number }>(
    "SELECT COUNT(*)::int AS cnt FROM estatepilot.admin_users"
  );
  return Number(res.rows[0]?.cnt ?? 0);
}

export const countAdminUsers = getAdminUserCount;

/**
 * Validates the first-admin bootstrap token on a fail-closed basis.
 * If ADMIN_BOOTSTRAP_TOKEN is not configured or shorter than 16 chars, bootstrap is disabled.
 */
export function verifyBootstrapTokenOrThrow(providedToken: unknown): void {
  assertNoPersistentAdminPasswordInProd();
  const configuredToken = process.env.ADMIN_BOOTSTRAP_TOKEN?.trim() || "";
  if (configuredToken.length < 16) {
    throw new Error(
      "BOOTSTRAP_DISABLED: ADMIN_BOOTSTRAP_TOKEN is not configured on the server (minimum 16 characters required). First-admin bootstrap is disabled."
    );
  }
  if (typeof providedToken !== "string" || !constantTimeStringEqual(providedToken.trim(), configuredToken)) {
    throw new Error(
      "INVALID_BOOTSTRAP_TOKEN: Valid ADMIN_BOOTSTRAP_TOKEN is required to provision the first Super Admin."
    );
  }
}

/**
 * Concurrency-safe first SUPER_ADMIN provisioning.
 * Acquires an exclusive table lock on estatepilot.admin_users inside a transaction and relies on
 * the unique partial index estatepilot_single_bootstrap_admin_idx so concurrent requests cannot
 * create multiple bootstrap admins.
 */
export async function bootstrapFirstSuperAdmin(params: {
  email: string;
  fullName: string;
  password: string;
  bootstrapToken: unknown;
  ipAddress?: string;
}): Promise<AdminUser> {
  verifyBootstrapTokenOrThrow(params.bootstrapToken);

  const cleanEmail = params.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error("A valid email address is required.");
  }
  if (!params.fullName || params.fullName.trim().length < 2) {
    throw new Error("Full name is required.");
  }

  const passwordHash = hashPassword(params.password);
  const userId = `usr-${randomBytes(8).toString("hex")}`;

  try {
    return await withTransaction(async (tx: DbClient) => {
      // Serialize concurrent bootstrap transactions via exclusive table lock
      await tx.query("LOCK TABLE estatepilot.admin_users IN EXCLUSIVE MODE");

      const countRes = await tx.query<{ cnt: number }>(
        "SELECT COUNT(*)::int AS cnt FROM estatepilot.admin_users"
      );
      if (Number(countRes.rows[0]?.cnt ?? 0) > 0) {
        throw new Error(
          "ALREADY_PROVISIONED: Initial Super Admin has already been provisioned. Please sign in or ask a Super Admin to create your account."
        );
      }

      const insertRes = await tx.query<{
        id: string;
        email: string;
        full_name: string;
        role: AdminRole;
        executive_display_name: string | null;
        is_active: boolean;
        last_login_at: string | null;
        created_at: string;
      }>(
        `INSERT INTO estatepilot.admin_users (
          id, email, full_name, password_hash, role, executive_display_name, is_bootstrap_admin, is_active
        ) VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', NULL, TRUE, TRUE)
        RETURNING id, email, full_name, role, executive_display_name, is_active, last_login_at, created_at`,
        [userId, cleanEmail, params.fullName.trim(), passwordHash]
      );

      const row = insertRes.rows[0];
      await recordAuditEvent(tx, {
        entityType: "USER",
        entityId: row.id,
        action: "BOOTSTRAP_SUPER_ADMIN_CREATED",
        actorId: row.id,
        actorRole: "SUPER_ADMIN",
        details: {
          ipAddress: params.ipAddress ?? null
        }
      });

      return {
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        role: row.role,
        executiveDisplayName: row.executive_display_name,
        isActive: row.is_active,
        lastLoginAt: row.last_login_at,
        createdAt: row.created_at
      };
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    const msg = err instanceof Error ? err.message : String(err);
    if (code === "23505" || msg.includes("estatepilot_single_bootstrap_admin_idx")) {
      throw new Error(
        "ALREADY_PROVISIONED: Initial Super Admin has already been provisioned by a concurrent request."
      );
    }
    throw err;
  }
}

/**
 * Creates a new admin user inside a transaction and logs an audit event.
 */
export async function createAdminUser(params: {
  email: string;
  fullName: string;
  password: string;
  role: AdminRole;
  executiveDisplayName?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
}): Promise<AdminUser> {
  const cleanEmail = params.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error("A valid email address is required.");
  }
  if (!params.fullName || params.fullName.trim().length < 2) {
    throw new Error("Full name is required.");
  }
  if (!["SUPER_ADMIN", "ADMIN", "MANAGER", "EXECUTIVE"].includes(params.role)) {
    throw new Error("Invalid role specified.");
  }

  const trimmedExecScope = params.executiveDisplayName?.trim() || null;
  if (params.role === "EXECUTIVE" && (!trimmedExecScope || normalizeExecutiveIdentity(trimmedExecScope).length < 2)) {
    throw new Error("EXECUTIVE role requires a non-empty executiveDisplayName scope.");
  }

  const passwordHash = hashPassword(params.password);
  const userId = `usr-${randomBytes(8).toString("hex")}`;

  return withTransaction(async (tx: DbClient) => {
    const existing = await tx.query<{ id: string }>(
      "SELECT id FROM estatepilot.admin_users WHERE email = $1",
      [cleanEmail]
    );
    if (existing.rowCount > 0) {
      throw new Error("An admin user with this email already exists.");
    }

    const insertRes = await tx.query<{
      id: string;
      email: string;
      full_name: string;
      role: AdminRole;
      executive_display_name: string | null;
      is_active: boolean;
      last_login_at: string | null;
      created_at: string;
    }>(
      `INSERT INTO estatepilot.admin_users (
        id, email, full_name, password_hash, role, executive_display_name, is_bootstrap_admin, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, FALSE, TRUE)
      RETURNING id, email, full_name, role, executive_display_name, is_active, last_login_at, created_at`,
      [
        userId,
        cleanEmail,
        params.fullName.trim(),
        passwordHash,
        params.role,
        trimmedExecScope
      ]
    );

    const row = insertRes.rows[0];
    await recordAuditEvent(tx, {
      entityType: "USER",
      entityId: row.id,
      action: "ADMIN_USER_CREATED",
      actorId: params.actorId ?? row.id,
      actorRole: params.actorRole ?? params.role,
      details: {
        role: row.role,
        executiveDisplayName: row.executive_display_name
      }
    });

    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      executiveDisplayName: row.executive_display_name,
      isActive: row.is_active,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at
    };
  });
}

/**
 * Authenticates an admin user by email & password and creates a new HTTP-only session.
 */
export async function authenticateAdmin(params: {
  email: string;
  password: string;
  ipAddress: string;
  userAgent: string;
}): Promise<{
  session: AuthenticatedSession;
  rawSessionToken: string;
}> {
  const cleanEmail = params.email.trim().toLowerCase();

  const userRes = await dbQuery<{
    id: string;
    email: string;
    full_name: string;
    password_hash: string;
    role: AdminRole;
    executive_display_name: string | null;
    is_active: boolean;
    failed_login_attempts: number;
    locked_until: string | null;
    last_login_at: string | null;
    created_at: string;
  }>(
    `SELECT id, email, full_name, password_hash, role, executive_display_name,
            is_active, failed_login_attempts, locked_until, last_login_at, created_at
     FROM estatepilot.admin_users
     WHERE email = $1`,
    [cleanEmail]
  );

  if (userRes.rowCount === 0) {
    await recordAuditEvent(null, {
      entityType: "AUTH",
      entityId: "anonymous",
      action: "LOGIN_FAILED_UNKNOWN_USER",
      details: { ipAddress: params.ipAddress }
    });
    throw new Error("Invalid email or password.");
  }

  const userRow = userRes.rows[0];
  if (!userRow.is_active) {
    await recordAuditEvent(null, {
      entityType: "AUTH",
      entityId: userRow.id,
      action: "LOGIN_BLOCKED_INACTIVE_USER",
      details: { ipAddress: params.ipAddress }
    });
    throw new Error("This account has been deactivated. Contact a Super Admin.");
  }

  if (userRow.locked_until && new Date(userRow.locked_until).getTime() > Date.now()) {
    await recordAuditEvent(null, {
      entityType: "AUTH",
      entityId: userRow.id,
      action: "LOGIN_BLOCKED_ACCOUNT_LOCKED",
      details: { ipAddress: params.ipAddress, lockedUntil: userRow.locked_until }
    });
    throw new Error("Account is temporarily locked due to multiple failed login attempts. Try again later.");
  }

  const isPasswordValid = verifyPassword(params.password, userRow.password_hash);
  if (!isPasswordValid) {
    const nextAttempts = (userRow.failed_login_attempts || 0) + 1;
    const lockUntil =
      nextAttempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString()
        : null;

    await dbQuery(
      `UPDATE estatepilot.admin_users
       SET failed_login_attempts = $1, locked_until = $2, updated_at = NOW()
       WHERE id = $3`,
      [nextAttempts, lockUntil, userRow.id]
    );

    await recordAuditEvent(null, {
      entityType: "AUTH",
      entityId: userRow.id,
      action: "LOGIN_FAILED_BAD_PASSWORD",
      details: { failedAttempts: nextAttempts, locked: Boolean(lockUntil), ipAddress: params.ipAddress }
    });

    throw new Error("Invalid email or password.");
  }

  const rawSessionToken = randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(rawSessionToken);
  const csrfToken = randomBytes(24).toString("hex");
  const sessionId = `sess-${randomBytes(8).toString("hex")}`;
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await withTransaction(async (tx) => {
    await tx.query(
      `UPDATE estatepilot.admin_users
       SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [userRow.id]
    );

    await tx.query(
      `INSERT INTO estatepilot.admin_sessions (
        id, user_id, token_hash, csrf_token, ip_address, user_agent, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [sessionId, userRow.id, tokenHash, csrfToken, params.ipAddress, params.userAgent, expiresAt]
    );

    await recordAuditEvent(tx, {
      entityType: "AUTH",
      entityId: userRow.id,
      action: "LOGIN_SUCCESS",
      actorId: userRow.id,
      actorRole: userRow.role,
      details: { sessionId, ipAddress: params.ipAddress }
    });
  });

  return {
    rawSessionToken,
    session: {
      sessionId,
      csrfToken,
      expiresAt,
      user: {
        id: userRow.id,
        email: userRow.email,
        fullName: userRow.full_name,
        role: userRow.role,
        executiveDisplayName: userRow.executive_display_name,
        isActive: userRow.is_active,
        lastLoginAt: new Date().toISOString(),
        createdAt: userRow.created_at
      }
    }
  };
}

/**
 * Resolves and validates the current session from the request's HTTP-only cookie.
 */
export async function getSessionFromRequest(request: Request): Promise<AuthenticatedSession | null> {
  const cookieHeader = request.headers.get("cookie");
  const rawToken = extractCookieValue(cookieHeader, SESSION_COOKIE_NAME);
  if (!rawToken) return null;

  const tokenHash = hashSessionToken(rawToken);
  const res = await dbQuery<{
    session_id: string;
    csrf_token: string;
    expires_at: string;
    revoked_at: string | null;
    user_id: string;
    email: string;
    full_name: string;
    role: AdminRole;
    executive_display_name: string | null;
    is_active: boolean;
    last_login_at: string | null;
    created_at: string;
  }>(
    `SELECT s.id AS session_id, s.csrf_token, s.expires_at, s.revoked_at,
            u.id AS user_id, u.email, u.full_name, u.role, u.executive_display_name,
            u.is_active, u.last_login_at, u.created_at
     FROM estatepilot.admin_sessions s
     INNER JOIN estatepilot.admin_users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
       AND u.is_active = TRUE`,
    [tokenHash]
  );

  if (res.rowCount === 0) return null;
  const row = res.rows[0];

  return {
    sessionId: row.session_id,
    csrfToken: row.csrf_token,
    expiresAt: row.expires_at,
    user: {
      id: row.user_id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      executiveDisplayName: row.executive_display_name,
      isActive: row.is_active,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at
    }
  };
}

/**
 * Revokes an active session on logout after validating CSRF token if provided or required.
 */
export async function revokeSessionByRequest(
  request: Request,
  options: { requireCsrf?: boolean } = {}
): Promise<{ revoked: boolean; csrfError?: boolean }> {
  const session = await getSessionFromRequest(request);
  if (!session) return { revoked: false };

  if (options.requireCsrf) {
    const headerCsrf = request.headers.get("x-csrf-token") || "";
    if (!constantTimeStringEqual(headerCsrf, session.csrfToken)) {
      return { revoked: false, csrfError: true };
    }
  }

  await withTransaction(async (tx) => {
    await tx.query(
      "UPDATE estatepilot.admin_sessions SET revoked_at = NOW() WHERE id = $1",
      [session.sessionId]
    );
    await recordAuditEvent(tx, {
      entityType: "AUTH",
      entityId: session.user.id,
      action: "LOGOUT",
      actorId: session.user.id,
      actorRole: session.user.role,
      details: { sessionId: session.sessionId }
    });
  });

  return { revoked: true };
}

/**
 * Enforces authentication and role-based access control (RBAC) + constant-time CSRF protection on server APIs.
 */
export async function requireRole(
  request: Request,
  allowedRoles: AdminRole[],
  options: { requireCsrf?: boolean } = {}
): Promise<
  | { authorized: true; session: AuthenticatedSession }
  | { authorized: false; response: NextResponse }
> {
  let session: AuthenticatedSession | null = null;
  try {
    session = await getSessionFromRequest(request);
  } catch {
    return {
      authorized: false,
      response: buildRateLimitUnavailableResponse()
    };
  }

  if (!session) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          success: false,
          code: "UNAUTHENTICATED",
          message: "Authentication is required to access this administrative resource."
        },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      )
    };
  }

  if (!allowedRoles.includes(session.user.role)) {
    await recordAuditEvent(null, {
      entityType: "AUTH",
      entityId: session.user.id,
      action: "RBAC_ACCESS_DENIED",
      actorId: session.user.id,
      actorRole: session.user.role,
      details: { requiredRoles: allowedRoles, method: request.method }
    }).catch(() => {});

    return {
      authorized: false,
      response: NextResponse.json(
        {
          success: false,
          code: "FORBIDDEN",
          message: `Insufficient permissions. Required role: ${allowedRoles.join(" or ")}. Your role: ${session.user.role}.`
        },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      )
    };
  }

  const isMutating = ["POST", "PATCH", "PUT", "DELETE"].includes(request.method.toUpperCase());
  if ((options.requireCsrf ?? isMutating) && isMutating) {
    const headerCsrf = request.headers.get("x-csrf-token") || "";
    if (!constantTimeStringEqual(headerCsrf, session.csrfToken)) {
      await recordAuditEvent(null, {
        entityType: "AUTH",
        entityId: session.user.id,
        action: "CSRF_VALIDATION_FAILED",
        actorId: session.user.id,
        actorRole: session.user.role,
        details: { method: request.method }
      });

      return {
        authorized: false,
        response: NextResponse.json(
          {
            success: false,
            code: "CSRF_INVALID",
            message: "Invalid or missing CSRF security token (x-csrf-token)."
          },
          { status: 403, headers: { "Cache-Control": "no-store" } }
        )
      };
    }
  }

  return { authorized: true, session };
}

export function buildSessionCookieHeader(rawToken: string): string {
  const isProd = process.env.NODE_ENV === "production";
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${isProd ? "; Secure" : ""}`;
}

export function buildClearSessionCookieHeader(): string {
  const isProd = process.env.NODE_ENV === "production";
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${isProd ? "; Secure" : ""}`;
}
