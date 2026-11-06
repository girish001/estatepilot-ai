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

// Sliding-window rate limiters for login and public enquiry endpoints
const loginIpBuckets = new Map<string, { count: number; resetAt: number }>();
const publicEnquiryIpBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  bucketMap: Map<string, { count: number; resetAt: number }>,
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const current = bucketMap.get(key);
  if (!current || current.resetAt <= now) {
    bucketMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    };
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function checkLoginRateLimit(ip: string) {
  return checkRateLimit(loginIpBuckets, ip, 10, 15 * 60 * 1000);
}

export function checkPublicEnquiryRateLimit(ip: string) {
  return checkRateLimit(publicEnquiryIpBuckets, ip, 15, 10 * 60 * 1000);
}

export function resetRateLimitsForTests() {
  loginIpBuckets.clear();
  publicEnquiryIpBuckets.clear();
}

/**
 * Hashes a password using scrypt with a 16-byte random salt.
 */
export function hashPassword(password: string): string {
  if (!password || password.length < 10) {
    throw new Error("Password must be at least 10 characters long.");
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

export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 10) {
    return "Password must be at least 10 characters long.";
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include at least one uppercase letter, one lowercase letter, and one digit.";
  }
  return null;
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
        id, email, full_name, password_hash, role, executive_display_name, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, TRUE)
      RETURNING id, email, full_name, role, executive_display_name, is_active, last_login_at, created_at`,
      [
        userId,
        cleanEmail,
        params.fullName.trim(),
        passwordHash,
        params.role,
        params.executiveDisplayName?.trim() || null
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
     WHERE s.token_hash = $1`,
    [tokenHash]
  );

  if (res.rowCount === 0) return null;
  const row = res.rows[0];
  if (row.revoked_at || !row.is_active) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

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
 * Revokes an active session on logout.
 */
export async function revokeSessionByRequest(request: Request): Promise<void> {
  const session = await getSessionFromRequest(request);
  if (!session) return;

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
}

/**
 * Enforces authentication and role-based access control (RBAC) + CSRF protection on server APIs.
 */
export async function requireRole(
  request: Request,
  allowedRoles: AdminRole[],
  options: { requireCsrf?: boolean } = {}
): Promise<
  | { authorized: true; session: AuthenticatedSession }
  | { authorized: false; response: NextResponse }
> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          success: false,
          code: "UNAUTHENTICATED",
          message: "Authentication is required to access this administrative resource."
        },
        { status: 401 }
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
    });

    return {
      authorized: false,
      response: NextResponse.json(
        {
          success: false,
          code: "FORBIDDEN",
          message: `Insufficient permissions. Required role: ${allowedRoles.join(" or ")}. Your role: ${session.user.role}.`
        },
        { status: 403 }
      )
    };
  }

  const isMutating = ["POST", "PATCH", "PUT", "DELETE"].includes(request.method.toUpperCase());
  if ((options.requireCsrf ?? isMutating) && isMutating) {
    const headerCsrf = request.headers.get("x-csrf-token");
    if (!headerCsrf || headerCsrf !== session.csrfToken) {
      return {
        authorized: false,
        response: NextResponse.json(
          {
            success: false,
            code: "CSRF_INVALID",
            message: "Invalid or missing CSRF security token (x-csrf-token)."
          },
          { status: 403 }
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
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}
